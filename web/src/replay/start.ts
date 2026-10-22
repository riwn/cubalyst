import type { KPattern, KPuzzle } from 'cubing/kpuzzle'
import type { Solve } from '../api'
import { invert } from '../solve/notation'

/** ソルブ開始時の状態。フルソルブ（補助付きも）は完成で終わるので逆算、それ以外は完成状態からスクランブル。 */
export function solveStartPattern(kpuzzle: KPuzzle, solve: Solve): KPattern {
  const solved = kpuzzle.defaultPattern()
  const moves = solve.moves ?? []
  if (solve.mode === 'full' || solve.mode === 'assist') return solved.applyAlg(invert(moves.map((m) => m.move)).join(' '))
  return solved.applyAlg(solve.scramble)
}
