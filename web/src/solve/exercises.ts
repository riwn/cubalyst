// 出題（スクランブルと完了条件）の生成。

import { isSolved, type ExerciseSource } from './session'

/** フルソルブ：WCA準拠のランダムステートスクランブル。 */
export const fullSolveSource: ExerciseSource = async () => {
  const { randomScrambleForEvent } = await import('cubing/scramble')
  const alg = await randomScrambleForEvent('333')
  return {
    mode: 'full',
    scramble: alg.toString(),
    isGoal: isSolved,
  }
}

/** 補助付きフルソルブ：フルソルブと同じ出題で、記録の種類だけ分ける。 */
export const assistSolveSource: ExerciseSource = async () => ({ ...(await fullSolveSource()), mode: 'assist', label: '補助付きフルソルブ' })
