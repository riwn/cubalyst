// 計測セッション（タイマーの状態機械）。
//
//   generating → scrambling → ready → running → [保存] → generating …
//
// - scrambling: スクランブルの進捗を追跡し、目標状態に一致したら ready
//   （ステップ練習は完成状態からのスクランブルなので、揃っていなければ今の状態から同じ状態へ行く手順を作って回してもらう）
// - ready: 最初の回転で計測開始（running）
// - running: 練習の完了条件（isGoal）を満たしたら停止して保存し、次の出題へ

import type { KPattern } from 'cubing/kpuzzle'
import type { NewSolve, SolveMode } from '../api'
import type { Penalty } from './stats'
import type { LoggedMove, CubeStore } from '../cube/store'
import { fitTimestamps } from '../cube/timestamps'
import { scrambleBetween } from '../cases/exercise'
import { ScrambleTracker, type ScrambleProgress } from './scramble-tracker'

/** 1回分の出題。 */
export type Exercise = {
  mode: SolveMode
  /** スクランブル。scrambleFromSolved なら完成状態からの手順（記録にはこれを残す）。 */
  scramble: string
  caseId?: string
  step?: string
  /** 画面に出す説明（例：「OLL 21」）。 */
  label?: string
  /**
   * スクランブルが完成状態からの手順か（ステップ練習は true。始める状態が決まっている）。
   * キューブが揃っていなければ、今の状態からスクランブル後と同じ状態へ行く手順を作って回してもらう。
   * false（フルソルブ）なら、今の状態からそのまま scramble を回す。
   */
  scrambleFromSolved: boolean
  /** 計測を止める条件。 */
  isGoal: (pattern: KPattern) => boolean
}

export type ExerciseSource = () => Promise<Exercise>

export type SessionPhase = 'generating' | 'scrambling' | 'ready' | 'running'

/** WCAのインスペクション：15秒を超えたら+2、17秒を超えたらDNF。 */
export const INSPECTION_MS = 15_000
export const INSPECTION_DNF_MS = 17_000

/** インスペクション開始から最初の回転までの時間に対するペナルティ。 */
export function inspectionPenalty(elapsedMs: number): Penalty {
  if (elapsedMs > INSPECTION_DNF_MS) return 'DNF'
  if (elapsedMs > INSPECTION_MS) return '+2'
  return ''
}

export type SessionState = {
  phase: SessionPhase
  exercise: Exercise | null
  progress: ScrambleProgress | null
  /** 計測開始（最初の回転を受け取った）時刻。performance.now() 基準。 */
  startedAt: number | null
  /** 計測待ち（スクランブル完了）になった時刻。インスペクションの起点。 */
  readyAt: number | null
  /** インスペクションを使うか。 */
  inspection: boolean
  /** インスペクション超過によるペナルティ（計測開始時に確定）。 */
  inspectionPenalty: Penalty
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
    readyAt: null,
    inspection: false,
    inspectionPenalty: '',
    moveCount: 0,
    last: null,
    error: null,
  }
  private listeners = new Set<() => void>()
  private tracker: ScrambleTracker | null = null
  private solveMoves: LoggedMove[] = []
  private unsubscribes: (() => void)[] = []
  private generation = 0
  /** 今の状態からの手順の生成を、新しいものだけ有効にするための番号。 */
  private scrambleToken = 0
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

  /** インスペクションの有無を切り替える（フルソルブのみで使う）。 */
  setInspection(on: boolean) {
    if (this.state.inspection !== on) this.set({ inspection: on })
  }

  dispose() {
    this.disposed = true
    this.unsubscribes.forEach((u) => u())
    this.listeners.clear()
  }

  /** 次の出題を生成する。 */
  async next() {
    const gen = ++this.generation
    this.scrambleToken++
    this.tracker = null
    this.solveMoves = []
    this.set({
      phase: 'generating',
      exercise: null,
      progress: null,
      startedAt: null,
      readyAt: null,
      inspectionPenalty: '',
      moveCount: 0,
      error: null,
    })
    let exercise: Exercise
    try {
      exercise = await this.source()
    } catch (err) {
      if (gen === this.generation) this.set({ error: `スクランブルの生成に失敗しました: ${String(err)}` })
      return
    }
    if (this.disposed || gen !== this.generation) return
    this.set({ exercise })
    await this.beginScramble()
  }

  /** スクランブル追跡を飛ばして計測待ちにする（追跡がうまくいかないとき用）。 */
  forceReady() {
    if (this.state.phase === 'scrambling') {
      this.setReady()
    }
  }

  private setReady(patch: Partial<SessionState> = {}) {
    this.set({ ...patch, phase: 'ready', readyAt: performance.now() })
  }

  private updateScrambling(progress: ScrambleProgress) {
    if (progress.complete) this.setReady({ progress })
    else this.set({ progress, phase: 'scrambling' })
  }

  /** 計測中のソルブを破棄して次の出題へ。 */
  abort() {
    void this.next()
  }

  /** 今のキューブの状態からスクランブルの追跡を始める。 */
  private async beginScramble(): Promise<void> {
    const exercise = this.state.exercise
    if (!exercise) return
    const pattern = this.store.getSnapshot().pattern
    let scramble = exercise.scramble
    if (exercise.scrambleFromSolved && !isSolved(pattern)) {
      // 完成状態からのスクランブルで行き着く状態へ、今の状態から行く手順を作る
      const token = ++this.scrambleToken
      this.tracker = null
      this.set({ phase: 'generating', progress: null })
      const target = this.store.kpuzzle.defaultPattern().applyAlg(exercise.scramble)
      try {
        scramble = await scrambleBetween(this.store.kpuzzle, pattern, target)
      } catch (err) {
        if (token === this.scrambleToken) this.set({ error: `スクランブルの生成に失敗しました: ${String(err)}` })
        return
      }
      if (this.disposed || token !== this.scrambleToken) return
      // 生成中に回されたら、その状態から作り直す
      if (!this.store.getSnapshot().pattern.isIdentical(pattern)) return this.beginScramble()
    }
    this.tracker = new ScrambleTracker(scramble, pattern)
    this.updateScrambling(this.tracker.progress)
  }

  private handleMove(move: LoggedMove, pattern: KPattern) {
    switch (this.state.phase) {
      case 'scrambling':
        this.updateScrambling(this.tracker!.onMove(move.move, pattern))
        break
      case 'ready': {
        this.solveMoves = [move]
        const elapsed = this.state.readyAt == null ? 0 : move.receivedAt - this.state.readyAt
        this.set({
          phase: 'running',
          startedAt: move.receivedAt,
          moveCount: 1,
          inspectionPenalty: this.state.inspection ? inspectionPenalty(elapsed) : '',
        })
        this.checkGoal(pattern)
        break
      }
      case 'running':
        this.solveMoves.push(move)
        this.set({ moveCount: this.solveMoves.length })
        this.checkGoal(pattern)
        break
    }
  }

  private handleReplace(pattern: KPattern) {
    const { phase, exercise } = this.state
    if (phase === 'scrambling' && this.tracker) {
      if (exercise?.scrambleFromSolved) {
        // 目標の状態が決まっているので、今の状態から手順を作り直す
        void this.beginScramble()
      } else {
        this.updateScrambling(this.tracker.onReplace(pattern))
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
      penalty: this.state.inspectionPenalty,
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
