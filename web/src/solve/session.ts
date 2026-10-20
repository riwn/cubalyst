// 計測セッション（タイマーの状態機械）。
//
//   generating → (needSolved →) scrambling → ready → running → [保存] → generating …
//
// - scrambling: スクランブルの進捗を追跡し、目標状態に一致したら ready
// - ready: 最初の回転で計測開始（running）
// - running: 練習の完了条件（isGoal）を満たしたら停止して保存し、次の出題へ

import type { KPattern } from 'cubing/kpuzzle'
import type { NewSolve, SolveMode } from '../api'
import type { LoggedMove, CubeStore } from '../cube/store'
import { fitTimestamps } from '../cube/timestamps'
import { ScrambleTracker, type ScrambleProgress } from './scramble-tracker'

/** 1回分の出題。 */
export type Exercise = {
  mode: SolveMode
  scramble: string
  caseId?: string
  step?: string
  /** 画面に出す説明（例：「OLL 21」）。 */
  label?: string
  /** スクランブル前に完成状態である必要があるか（ケース・ステップ練習は true）。 */
  requireSolvedStart: boolean
  /** 計測を止める条件。 */
  isGoal: (pattern: KPattern) => boolean
}

export type ExerciseSource = () => Promise<Exercise>

export type SessionPhase = 'generating' | 'needSolved' | 'scrambling' | 'ready' | 'running'

export type SessionState = {
  phase: SessionPhase
  exercise: Exercise | null
  progress: ScrambleProgress | null
  /** 計測開始（最初の回転を受け取った）時刻。performance.now() 基準。 */
  startedAt: number | null
  /** 計測中の手数。 */
  moveCount: number
  /** 直前に終わったソルブ。 */
  last: NewSolve | null
  error: string | null
}

export function isSolved(pattern: KPattern): boolean {
  return pattern.experimentalIsSolved({ ignorePuzzleOrientation: true, ignoreCenterOrientation: true })
}

export class SolveSession {
  private state: SessionState = {
    phase: 'generating',
    exercise: null,
    progress: null,
    startedAt: null,
    moveCount: 0,
    last: null,
    error: null,
  }
  private listeners = new Set<() => void>()
  private tracker: ScrambleTracker | null = null
  private solveMoves: LoggedMove[] = []
  private unsubscribes: (() => void)[] = []
  private generation = 0
  private disposed = false

  private readonly store: CubeStore
  private readonly source: ExerciseSource
  private readonly onSolved: (solve: NewSolve) => void

  constructor(store: CubeStore, source: ExerciseSource, onSolved: (solve: NewSolve) => void) {
    this.store = store
    this.source = source
    this.onSolved = onSolved
    this.unsubscribes.push(
      store.moves.subscribe(({ move, pattern }) => this.handleMove(move, pattern)),
      store.view.subscribe((u) => {
        if (u.type === 'replace') this.handleReplace(u.pattern)
      }),
    )
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): SessionState => this.state

  private set(patch: Partial<SessionState>) {
    this.state = { ...this.state, ...patch }
    for (const l of this.listeners) l()
  }

  dispose() {
    this.disposed = true
    this.unsubscribes.forEach((u) => u())
    this.listeners.clear()
  }

  /** 次の出題を生成する。 */
  async next() {
    const gen = ++this.generation
    this.tracker = null
    this.solveMoves = []
    this.set({ phase: 'generating', exercise: null, progress: null, startedAt: null, moveCount: 0, error: null })
    let exercise: Exercise
    try {
      exercise = await this.source()
    } catch (err) {
      if (gen === this.generation) this.set({ error: `スクランブルの生成に失敗しました: ${String(err)}` })
      return
    }
    if (this.disposed || gen !== this.generation) return
    this.set({ exercise })
    this.beginScramble()
  }

  /** スクランブル追跡を飛ばして計測待ちにする（追跡がうまくいかないとき用）。 */
  forceReady() {
    if (this.state.phase === 'scrambling' || this.state.phase === 'needSolved') {
      this.set({ phase: 'ready' })
    }
  }

  /** 計測中のソルブを破棄して次の出題へ。 */
  abort() {
    void this.next()
  }

  private beginScramble() {
    const exercise = this.state.exercise
    if (!exercise) return
    const pattern = this.store.getSnapshot().pattern
    if (exercise.requireSolvedStart && !isSolved(pattern)) {
      this.tracker = null
      this.set({ phase: 'needSolved', progress: null })
      return
    }
    this.tracker = new ScrambleTracker(exercise.scramble, pattern)
    const progress = this.tracker.progress
    this.set({ phase: progress.complete ? 'ready' : 'scrambling', progress })
  }

  private handleMove(move: LoggedMove, pattern: KPattern) {
    switch (this.state.phase) {
      case 'needSolved':
        if (isSolved(pattern)) this.beginScramble()
        break
      case 'scrambling': {
        const progress = this.tracker!.onMove(move.move, pattern)
        this.set({ progress, phase: progress.complete ? 'ready' : 'scrambling' })
        break
      }
      case 'ready':
        this.solveMoves = [move]
        this.set({ phase: 'running', startedAt: move.receivedAt, moveCount: 1 })
        this.checkGoal(pattern)
        break
      case 'running':
        this.solveMoves.push(move)
        this.set({ moveCount: this.solveMoves.length })
        this.checkGoal(pattern)
        break
    }
  }

  private handleReplace(pattern: KPattern) {
    const { phase, exercise } = this.state
    if (phase === 'needSolved') {
      if (isSolved(pattern)) this.beginScramble()
    } else if (phase === 'scrambling' && this.tracker) {
      if (exercise?.requireSolvedStart) {
        // ケース・ステップ練習では目標状態が変わってしまうので出題し直す
        this.beginScramble()
      } else {
        const progress = this.tracker.onReplace(pattern)
        this.set({ progress, phase: progress.complete ? 'ready' : 'scrambling' })
      }
    } else if (phase === 'running') {
      this.checkGoal(pattern)
    }
  }

  private checkGoal(pattern: KPattern) {
    const exercise = this.state.exercise
    if (!exercise || !exercise.isGoal(pattern)) return
    const fitted = fitTimestamps(this.solveMoves)
    const solve: NewSolve = {
      mode: exercise.mode,
      solved_at: new Date().toISOString(),
      total_ms: Math.max(0, Math.round(fitted[fitted.length - 1]?.fittedTimestamp ?? 0)),
      penalty: '',
      scramble: exercise.scramble,
      moves: fitted.map((m) => ({
        move: m.move,
        cube_ts: m.cubeTimestamp,
        local_ts: m.localTimestamp,
        t: Math.round(m.fittedTimestamp),
      })),
      case_id: exercise.caseId ?? null,
      step: exercise.step ?? null,
      note: '',
    }
    this.set({ last: solve })
    this.onSolved(solve)
    void this.next()
  }
}
