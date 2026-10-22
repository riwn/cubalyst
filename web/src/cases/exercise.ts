// ケースの状態とスクランブルの生成（ステップ練習・計測セッション・手順練習のモックで使う）。

import { Alg } from 'cubing/alg'
import type { KPattern, KPuzzle } from 'cubing/kpuzzle'
import { patternToFacelets } from '../cube/facelets'
import { stageLevel, type CrossColor } from '../solve/cfop'
import { formatMove, parseMove, splitAlg } from '../solve/notation'
import type { CaseSet } from './data'
import { applyNormalized, inFrame } from './geometry'


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

/**
 * from の状態から to の状態へ行く手順を作る（どちらもキューブ座標系。センターは見ない）。
 * from → to の変換 D を「完成状態から D を当てた状態」にしてソルバーに渡すと、
 * 返ってくる手順は完成状態から D への手順＝ from から to への手順になる（状態は変換として合成されるため）。
 */
export async function scrambleBetween(kpuzzle: KPuzzle, from: KPattern, to: KPattern): Promise<string> {
  const d = from.experimentalToTransformation()!.invert().applyTransformation(to.experimentalToTransformation()!)
  return scrambleFor(kpuzzle.defaultPattern().applyTransformation(d))
}
