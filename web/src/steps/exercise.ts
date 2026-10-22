// ステップ練習の出題。段階の「直前の状態」をランダムに作り、ソルバーの解の逆をスクランブルにする。

import { KPattern, type KPuzzle } from 'cubing/kpuzzle'
import { caseStateInCubeFrame, scrambleFor } from '../cases/exercise'
import { inFrame, normalizeOrientation } from '../cases/geometry'
import { patternToFacelets } from '../cube/facelets'
import { computeSplits, stageLevel, STAGES, type CrossColor, type Split } from '../solve/cfop'
import { isSolved, type Exercise, type ExerciseSource } from '../solve/session'

export const STEPS = ['cross', 'f2l', 'oll', 'pll'] as const
export type Step = (typeof STEPS)[number]

export const STEP_LABELS: Record<Step, string> = { cross: 'Cross', f2l: 'F2L', oll: 'OLL', pll: 'PLL' }

/** 段階を完了したとみなす stageLevel。 */
const GOAL_LEVEL: Record<Step, number> = { cross: 1, f2l: 5, oll: 6, pll: 7 }

// 標準の向き（クロスD・最終層U）でのピース位置。cubing.js 3x3 の slot 番号
const U_CORNERS = [0, 1, 2, 3]
const D_CORNERS = [4, 5, 6, 7]
const U_EDGES = [0, 1, 2, 3]
const E_EDGES = [8, 9, 10, 11]

type Rand = () => number

function shuffleAt(arr: number[], positions: number[], rand: Rand) {
  const values = positions.map((p) => arr[p])
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[values[i], values[j]] = [values[j], values[i]]
  }
  positions.forEach((p, i) => (arr[p] = values[i]))
}

function randomOrientation(arr: number[], positions: number[], mod: number, rand: Rand) {
  if (positions.length === 0) return
  let sum = 0
  positions.forEach((p, i) => {
    if (i === positions.length - 1) arr[p] = (mod - (sum % mod)) % mod
    else {
      arr[p] = Math.floor(rand() * mod)
      sum += arr[p]
    }
  })
}

function parity(p: number[]): number {
  let par = 0
  const seen = p.map(() => false)
  for (let i = 0; i < p.length; i++) {
    if (seen[i]) continue
    let len = 0
    for (let j = i; !seen[j]; j = p[j]) {
      seen[j] = true
      len++
    }
    par ^= (len - 1) & 1
  }
  return par
}

/**
 * 段階の直前の状態（標準の向き）。cross はこの関数では扱わない（完全ランダム）。
 * permute/orient するピースの位置を選び、偶奇と向きの合計の制約を満たすように並べる。
 */
export function randomStandardState(kpuzzle: KPuzzle, step: Exclude<Step, 'cross'>, rand: Rand = Math.random): KPattern {
  const d = structuredClone(kpuzzle.defaultPattern().patternData)
  const corners = step === 'f2l' ? [...U_CORNERS, ...D_CORNERS] : U_CORNERS
  const edges = step === 'f2l' ? [...U_EDGES, ...E_EDGES] : U_EDGES
  shuffleAt(d.CORNERS.pieces, corners, rand)
  shuffleAt(d.EDGES.pieces, edges, rand)
  if (step !== 'pll') {
    randomOrientation(d.CORNERS.orientation, corners, 3, rand)
    randomOrientation(d.EDGES.orientation, edges, 2, rand)
  }
  if (parity(d.CORNERS.pieces) !== parity(d.EDGES.pieces)) {
    const [a, b] = edges
    ;[d.EDGES.pieces[a], d.EDGES.pieces[b]] = [d.EDGES.pieces[b], d.EDGES.pieces[a]]
  }
  return new KPattern(kpuzzle, d)
}

/** 標準の向きの状態を、クロス色に合わせてキューブ座標系へ写す。 */
export async function toCubeFrame(kpuzzle: KPuzzle, standard: KPattern, color: CrossColor): Promise<KPattern> {
  if (color === 'yellow') return standard
  // 標準の向きでの「完成状態からその状態への手順」を、持ち替えた向きで行う
  const setup = await scrambleFor(standard)
  return normalizeOrientation(kpuzzle, kpuzzle.defaultPattern().applyAlg(inFrame(setup, color)))
}

export function stepGoal(step: Step, color: CrossColor): (p: KPattern) => boolean {
  if (step === 'pll') return isSolved
  return (p) => stageLevel(patternToFacelets(p), color) >= GOAL_LEVEL[step]
}

/** step=undefined なら毎回ランダムに段階を選ぶ。 */
export function stepExerciseSource(kpuzzle: KPuzzle, step: Step | undefined, color: CrossColor): ExerciseSource {
  return async (): Promise<Exercise> => {
    const s = step ?? STEPS[Math.floor(Math.random() * STEPS.length)]
    let scramble: string
    if (s === 'cross') {
      const { randomScrambleForEvent } = await import('cubing/scramble')
      scramble = (await randomScrambleForEvent('333')).toString()
    } else {
      scramble = await scrambleFor(await toCubeFrame(kpuzzle, randomStandardState(kpuzzle, s), color))
    }
    return {
      mode: 'step',
      scramble,
      step: s,
      label: `${STEP_LABELS[s]}練習`,
      isGoal: stepGoal(s, color),
    }
  }
}

/** 覚えた手順だけの練習に使うケース（手順練習で「覚えた」と印を付けたもの）。 */
export type LearnedCase = { id: string; set: 'OLL' | 'PLL' | 'F2L'; name: string; alg: string }

/** ケースのセットに対応するステップ。 */
export const SET_STEP: Record<LearnedCase['set'], Exclude<Step, 'cross'>> = { F2L: 'f2l', OLL: 'oll', PLL: 'pll' }

const AUFS = ['', 'U', 'U2', "U'"]

/**
 * 覚えた手順だけのステップ練習。覚えたケースから1つ選び（step を指定したらそのステップのケースから）、
 * 前後の AUF もランダムにした「そのケースの状態」から始める。F2L は FR スロットの1ペアだけが崩れた状態になる。
 */
export function learnedExerciseSource(
  kpuzzle: KPuzzle,
  step: Exclude<Step, 'cross'> | undefined,
  color: CrossColor,
  cases: LearnedCase[],
  rand: () => number = Math.random,
): ExerciseSource {
  return async (): Promise<Exercise> => {
    const pool = cases.filter((c) => !step || SET_STEP[c.set] === step)
    if (pool.length === 0) throw new Error('覚えた手順がありません。手順練習で「覚えた」に印を付けてください')
    const c = pool[Math.floor(rand() * pool.length)]
    const s = SET_STEP[c.set]
    const auf = () => AUFS[Math.floor(rand() * AUFS.length)]
    const state = caseStateInCubeFrame(kpuzzle, c.alg, color, auf(), auf())
    return {
      mode: 'step',
      scramble: await scrambleFor(state),
      step: s,
      caseId: c.id,
      label: `${STEP_LABELS[s]}練習（覚えた手順）`,
      isGoal: stepGoal(s, color),
    }
  }
}

/** ステップ練習の段階区切り。開始時点ですでに満たしていた段階と、練習の目標より先の段階は除く。 */
export function stepSplits(
  kpuzzle: KPuzzle,
  step: Step,
  scramble: string,
  moves: { move: string; t: number }[],
  color: CrossColor,
): Split[] {
  const start = kpuzzle.defaultPattern().applyAlg(scramble)
  const startLevel = stageLevel(patternToFacelets(start), color)
  return computeSplits(kpuzzle, moves, color, start).filter((sp) => {
    const level = STAGES.indexOf(sp.stage) + 1
    return level > startLevel && level <= GOAL_LEVEL[step]
  })
}
