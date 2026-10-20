// ケース練習の出題。ケースの状態を作り、ソルバーで解いた手順の逆をスクランブルにする。

import { Alg } from 'cubing/alg'
import type { KPattern, KPuzzle } from 'cubing/kpuzzle'
import { patternToFacelets } from '../cube/facelets'
import { stageLevel, type CrossColor } from '../solve/cfop'
import { formatMove, parseMove, splitAlg } from '../solve/notation'
import type { Exercise, ExerciseSource } from '../solve/session'
import type { CaseSet } from './data'
import { applyNormalized, inFrame } from './geometry'

export type PracticeCase = { id: string; set: CaseSet; name: string; alg: string }

const AUF = ['', 'U', 'U2', "U'"]
const pick = <T,>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)]

/**
 * ケースの状態（キューブ座標系）。標準の向きで「前後AUF＋手順の逆」を作り、クロス色に合わせて持ち替える。
 * pre は解く前に必要なAUF、post は解いた後に必要なAUF（PLLのみ意味がある）。
 */
export function caseStateInCubeFrame(
  kpuzzle: KPuzzle,
  alg: string,
  color: CrossColor,
  pre = '',
  post = '',
): KPattern {
  const setup = [post, new Alg(alg).invert().toString(), pre].filter(Boolean).join(' ')
  return applyNormalized(kpuzzle, inFrame(setup, color))
}

/** そのセットの完了条件。 */
export function caseGoal(set: CaseSet, color: CrossColor): (p: KPattern) => boolean {
  const need = set === 'OLL' ? 6 : set === 'PLL' ? 7 : 5
  return (p) => stageLevel(patternToFacelets(p), color) >= need
}

/** 状態からスクランブルを作る（ソルバーの解の逆）。 */
export async function scrambleFor(pattern: KPattern): Promise<string> {
  const { experimentalSolve3x3x3IgnoringCenters } = await import('cubing/search')
  const solution = await experimentalSolve3x3x3IgnoringCenters(pattern)
  // "R2'" のような表記を "R2" にそろえる
  return splitAlg(solution.invert().toString())
    .map((m) => formatMove(parseMove(m)))
    .join(' ')
}

export function caseExerciseSource(
  kpuzzle: KPuzzle,
  cases: PracticeCase[],
  color: CrossColor,
): ExerciseSource {
  return async (): Promise<Exercise> => {
    if (cases.length === 0) throw new Error('ケースが選ばれていません')
    const c = pick(cases)
    const pattern = caseStateInCubeFrame(kpuzzle, c.alg, color, pick(AUF), c.set === 'PLL' ? pick(AUF) : '')
    return {
      mode: 'case',
      scramble: await scrambleFor(pattern),
      caseId: c.id,
      label: `${c.set}（ケースは解いた後に表示）`,
      requireSolvedStart: true,
      isGoal: caseGoal(c.set, color),
    }
  }
}
