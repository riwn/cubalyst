// 手順練習の「この形にする」。今のキューブの状態から、選んだケースの状態（その手順で揃う形）へ持っていく手順を作り、
// 回すたびに進み具合を追う。間違えたときは戻す手順を出す（ステップ練習のスクランブルと同じ仕組み）。

import { Alg } from 'cubing/alg'
import type { KPattern, KPuzzle } from 'cubing/kpuzzle'
import type { CubeStore } from '../cube/store'
import { ScrambleTracker, type ScrambleProgress } from '../solve/scramble-tracker'
import { scrambleBetween } from './exercise'
import { applyNormalized } from './geometry'

export type CaseSetupState =
  | { phase: 'generating' }
  | { phase: 'scrambling'; progress: ScrambleProgress }
  | { phase: 'done' }
  | { phase: 'error'; error: string }

/**
 * ケースの状態（キューブ座標系）。持ち方で手順を回すと揃う形＝完成状態に持ち方で手順の逆を当てた形。
 * rotation は「キューブ自身の向き → 持ち方の向き」への持ち替え（holdRotation）。最後の持ち替えは正規化で消える。
 */
export function caseSetupTarget(kpuzzle: KPuzzle, alg: string, rotation: string): KPattern {
  return applyNormalized(kpuzzle, `${rotation} ${new Alg(alg).invert().toString()}`)
}

export class CaseSetup {
  private state: CaseSetupState = { phase: 'generating' }
  private listeners = new Set<() => void>()
  private unsubscribes: (() => void)[] = []
  private tracker: ScrambleTracker | null = null
  private token = 0
  private disposed = false
  private readonly store: CubeStore
  private readonly target: KPattern

  constructor(store: CubeStore, alg: string, rotation: string) {
    this.store = store
    this.target = caseSetupTarget(store.kpuzzle, alg, rotation)
    this.unsubscribes.push(
      store.moves.subscribe(({ move, pattern }) => {
        if (this.state.phase === 'scrambling' && this.tracker) this.update(this.tracker.onMove(move.move, pattern))
      }),
      store.view.subscribe((u) => {
        // 状態が丸ごと置き換わった（揃えた・つなぎ直した）ら、今の状態から作り直す
        if (u.type === 'replace' && this.state.phase !== 'done') void this.begin()
      }),
    )
    void this.begin()
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): CaseSetupState => this.state

  private set(state: CaseSetupState) {
    this.state = state
    for (const l of this.listeners) l()
  }

  dispose() {
    this.disposed = true
    this.unsubscribes.forEach((u) => u())
    this.listeners.clear()
  }

  /** 追跡がうまくいかないときに、できたことにする。 */
  forceDone() {
    this.set({ phase: 'done' })
  }

  private update(progress: ScrambleProgress) {
    this.set(progress.complete ? { phase: 'done' } : { phase: 'scrambling', progress })
  }

  private async begin(): Promise<void> {
    const token = ++this.token
    const pattern = this.store.getSnapshot().pattern
    this.tracker = null
    this.set({ phase: 'generating' })
    let moves: string
    try {
      moves = await scrambleBetween(this.store.kpuzzle, pattern, this.target)
    } catch (err) {
      if (token === this.token) this.set({ phase: 'error', error: `手順の生成に失敗しました: ${String(err)}` })
      return
    }
    if (this.disposed || token !== this.token) return
    // 生成中に回されたら、その状態から作り直す
    if (!this.store.getSnapshot().pattern.isIdentical(pattern)) return this.begin()
    this.tracker = new ScrambleTracker(moves, pattern)
    this.update(this.tracker.progress)
  }
}
