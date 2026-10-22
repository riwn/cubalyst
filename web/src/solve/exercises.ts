// 出題（スクランブルと完了条件）の生成。

import { isSolved, type ExerciseSource } from './session'

/** フルソルブ：WCA準拠のランダムステートスクランブル。 */
export const fullSolveSource: ExerciseSource = async () => {
  const { randomScrambleForEvent } = await import('cubing/scramble')
  const alg = await randomScrambleForEvent('333')
  return {
    mode: 'full',
    scramble: alg.toString(),
    scrambleFromSolved: false,
    isGoal: isSolved,
  }
}
