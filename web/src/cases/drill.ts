// 手順練習（アルゴリズムドリル）。選んだ手順を何度も回し、1回ごとの時間を測る。
//
// 「手順を回したか」は回転の並びではなく、キューブの状態で判定する。
// 回すたびに「今の状態から手順の効果を取り消した状態」を求め、それが直近のどこかの時点の状態と一致すれば、
// その時点から今までを1回分とみなす。そのため、キューブが揃っていなくてもよく、手順の前に関係ない手を
// 回していてもよく、M やワイドムーブ、指の使い方の違いも問わない。
// 手順の前後のAUF（U）と、別の面で行う（y で持ち替えた）場合も正解とみなす。

import { Alg } from 'cubing/alg'
import type { KPattern, KPuzzle, KTransformation } from 'cubing/kpuzzle'
import { Emitter } from '../cube/connection'
import type { CubeStore, LoggedMove } from '../cube/store'
import { fitTimestamps } from '../cube/timestamps'
import { invertRotation, ROTATIONS } from './geometry'

const AUF = ['', 'U', 'U2', "U'"]

/** 手の時刻（PC側の記録時刻。なければ受信時刻）。 */
const timeOf = (m: LoggedMove) => m.localTimestamp ?? m.receivedAt
const Y = ['', 'y', 'y2', "y'"]

/** 手と手の間がこれ以上空いたら、それより前の手は1回分に含めない。 */
export const IDLE_RESET_MS = 3000

export type DrillAttempt = {
  /** 補正後の所要時間（最初の手から最後の手まで）。 */
  ms: number
  moves: { move: string; cube_ts: number | null; local_ts: number | null; t: number }[]
}

export type DrillEvent = { type: 'done'; attempt: DrillAttempt }

export type DrillState = {
  /** 前回の完了（または開始・中断）以降に回した手数。 */
  moveCount: number
  /** その最初の手の時刻（performance.now 基準）。 */
  startedAt: number | null
}

/** 手順の90度回転での手数の目安。 */
export function quarterLength(alg: string): number {
  return alg
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .reduce((n, m) => n + (/2/.test(m) ? 2 : 1), 0)
}

/** 角とエッジの並びと向き（センターは無視）。状態の比較キー。 */
function stateKey(p: KPattern): string {
  const d = p.patternData
  return `${d.CORNERS.pieces.join(',')}|${d.CORNERS.orientation.join(',')}|${d.EDGES.pieces.join(',')}|${d.EDGES.orientation.join(',')}`
}

/**
 * 「回し終えた状態 → 回し始める前の状態」へ戻す変換の一覧（AUF前後・y の組み合わせぶん）。
 * rotation は「キューブ自身の向き → 持ち方の向き」への持ち替え（holdRotation）。
 * 手順に M や x などが含まれて全体の向きが変わる場合は、センターが元に戻るよう持ち替えを足す。
 */
export function undoTransformations(kpuzzle: KPuzzle, alg: string, rotation: string): KTransformation[] {
  const back = invertRotation(rotation)
  const solved = kpuzzle.defaultPattern()
  const out: KTransformation[] = []
  for (const y of Y) {
    for (const pre of AUF) {
      for (const post of AUF) {
        const seq = [rotation, y, pre, alg, post, invertRotation(y), back].filter(Boolean).join(' ')
        const undo = new Alg(seq).invert().toString()
        // センターを元の位置に戻す持ち替えを探す
        const fix = ROTATIONS.find((r) => {
          const c = solved.applyAlg(`${undo} ${r}`).patternData.CENTERS.pieces
          return c.every((v, i) => v === i)
        })
        const t = kpuzzle.algToTransformation(`${undo} ${fix ?? ''}`)
        if (!out.some((o) => o.isIdentical(t))) out.push(t)
      }
    }
  }
  return out
}

/** 手順練習の判定。ストアの回転を購読し、1回回し終えるごとに done を通知する。 */
export class AlgDrill {
  readonly events = new Emitter<DrillEvent>()
  private state: DrillState = { moveCount: 0, startedAt: null }
  private listeners = new Set<() => void>()
  private unsubscribe: () => void
  private undo: KTransformation[]
  /** history[k] は moves[k] を回す前の状態のキー（history は moves より1つ長い）。 */
  private history: string[]
  private moves: LoggedMove[] = []
  private lastPattern: KPattern
  private readonly window: number

  constructor(store: CubeStore, alg: string, rotation: string) {
    const pattern = store.getSnapshot().pattern
    this.undo = undoTransformations(store.kpuzzle, new Alg(alg).toString(), rotation)
    this.lastPattern = pattern
    this.history = [stateKey(pattern)]
    const q = quarterLength(alg)
    this.window = Math.max(q * 3, q + 16)
    this.unsubscribe = store.moves.subscribe(({ move, pattern }) => this.onMove(move, pattern))
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): DrillState => this.state

  private set(patch: Partial<DrillState>) {
    this.state = { ...this.state, ...patch }
    for (const l of this.listeners) l()
  }

  dispose() {
    this.unsubscribe()
    this.listeners.clear()
  }

  /** 今の状態から数え直す。 */
  reset(pattern: KPattern = this.lastPattern) {
    this.history = [stateKey(pattern)]
    this.moves = []
    this.set({ moveCount: 0, startedAt: null })
  }

  private onMove(move: LoggedMove, pattern: KPattern) {
    const prev = this.lastPattern
    this.lastPattern = pattern
    const last = this.moves[this.moves.length - 1]
    if (last && timeOf(move) - timeOf(last) > IDLE_RESET_MS) this.reset(prev)

    this.moves.push(move)
    this.history.push(stateKey(pattern))
    // 古い手は捨てる（1回分としては長すぎる）
    while (this.moves.length > this.window) {
      this.moves.shift()
      this.history.shift()
    }
    this.set({ moveCount: this.moves.length, startedAt: this.moves[0].receivedAt })

    // 手順の効果を取り消した状態が、直近のどの時点と一致するか（一番新しい時点＝一番短い1回を採る）
    const n = this.moves.length
    let start = -1
    for (const t of this.undo) {
      const key = stateKey(pattern.applyTransformation(t))
      for (let k = n - 1; k > start; k--) {
        if (this.history[k] === key) {
          start = k
          break
        }
      }
    }
    if (start < 0) return

    const fitted = fitTimestamps(this.moves.slice(start))
    const attempt: DrillAttempt = {
      ms: Math.max(0, Math.round(fitted[fitted.length - 1]?.fittedTimestamp ?? 0)),
      moves: fitted.map((m) => ({
        move: m.move,
        cube_ts: m.cubeTimestamp,
        local_ts: m.localTimestamp,
        t: Math.round(m.fittedTimestamp),
      })),
    }
    this.reset(pattern)
    this.events.emit({ type: 'done', attempt })
  }
}
