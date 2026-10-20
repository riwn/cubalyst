// スクランブルの進捗追跡。実機の状態を、スクランブルの各手を適用した後の状態と照合する。

import type { KPattern } from 'cubing/kpuzzle'
import { invert, parseMove, simplify, splitAlg } from './notation'

export type ScrambleProgress = {
  /** スクランブルの各手。 */
  moves: string[]
  /** 完了した手の数。 */
  done: number
  /** 次の手（moves[done]）が180度回転で、半分（90度）まで回した状態。 */
  half: boolean
  /** half のとき、残りの90度回転（R2 を R で始めたなら R）。 */
  halfRemaining: string | null
  /** 間違えた回転を戻すための手順。空なら正しい道筋の上にいる。 */
  correction: string[]
  complete: boolean
}

export class ScrambleTracker {
  private moves: string[]
  /** states[i] は i 手適用後の期待状態。 */
  private states: KPattern[]
  private done = 0
  private halfPattern: KPattern | null = null
  private halfQuarter: string | null = null
  private deviation: string[] = []

  constructor(scramble: string, start: KPattern) {
    this.moves = splitAlg(scramble)
    this.states = [start]
    for (const m of this.moves) {
      this.states.push(this.states[this.states.length - 1].applyMove(m))
    }
  }

  get target(): KPattern {
    return this.states[this.states.length - 1]
  }

  get progress(): ScrambleProgress {
    return {
      moves: this.moves,
      done: this.done,
      half: this.halfPattern != null,
      halfRemaining: this.halfPattern ? this.halfQuarter : null,
      correction: invert(this.deviation),
      complete: this.done === this.moves.length && this.deviation.length === 0,
    }
  }

  /** 実機で1手回された。pattern は回転後の状態。 */
  onMove(move: string, pattern: KPattern): ScrambleProgress {
    if (!this.match(pattern)) {
      this.deviation = simplify([...this.deviation, move])
      // 簡約で打ち消し合ったのに状態が一致しないことはないはずだが、念のため状態照合を優先する
      if (this.deviation.length === 0) this.deviation = [move]
    }
    return this.progress
  }

  /** 回転以外の理由で状態が変わった（実機との再同期など）。 */
  onReplace(pattern: KPattern): ScrambleProgress {
    if (!this.match(pattern)) {
      // 道筋から外れた状態に置き換わった。どこからでも続けられるよう、ここを起点に組み直す。
      this.moves = this.moves.slice(this.done)
      this.states = [pattern]
      for (const m of this.moves) this.states.push(this.states[this.states.length - 1].applyMove(m))
      this.done = 0
      this.halfPattern = null
      this.deviation = []
    }
    return this.progress
  }

  /** 期待状態のいずれかに一致すれば進捗を更新して true。 */
  private match(pattern: KPattern): boolean {
    const next = this.done + 1
    if (next < this.states.length && pattern.isIdentical(this.states[next])) {
      return this.advanceTo(next)
    }
    if (next < this.states.length) {
      const turn = parseMove(this.moves[this.done])
      if (turn.amount === 2) {
        const base = this.states[this.done]
        for (const quarter of [turn.face, `${turn.face}'`]) {
          const half = base.applyMove(quarter)
          if (pattern.isIdentical(half)) {
            this.halfPattern = half
            this.halfQuarter = quarter
            this.deviation = []
            return true
          }
        }
      }
    }
    if (pattern.isIdentical(this.states[this.done])) {
      this.halfPattern = null
      this.deviation = []
      return true
    }
    if (this.halfPattern && pattern.isIdentical(this.halfPattern)) {
      this.deviation = []
      return true
    }
    for (let i = 0; i < this.states.length; i++) {
      if (pattern.isIdentical(this.states[i])) return this.advanceTo(i)
    }
    return false
  }

  private advanceTo(i: number): true {
    this.done = i
    this.halfPattern = null
    this.deviation = []
    return true
  }
}
