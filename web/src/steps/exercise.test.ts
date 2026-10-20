import { cube3x3x3 } from 'cubing/puzzles'
import { describe, expect, it } from 'vitest'
import { patternToFacelets } from '../cube/facelets'
import { stageLevel } from '../solve/cfop'
import { randomStandardState, stepExerciseSource, stepGoal, stepSplits, toCubeFrame } from './exercise'

const kpuzzle = await cube3x3x3.kpuzzle()

let seed = 7
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)

describe('randomStandardState', () => {
  it('produces states just before each step (yellow = standard frame)', () => {
    const levels = { f2l: [] as number[], oll: [] as number[], pll: [] as number[] }
    for (let i = 0; i < 50; i++) {
      for (const step of ['f2l', 'oll', 'pll'] as const) {
        const p = randomStandardState(kpuzzle, step, rand)
        levels[step].push(stageLevel(patternToFacelets(p), 'yellow'))
      }
    }
    // F2L：クロスだけ（スロットが偶然揃うことはある）／OLL：F2L完成で上面未完成（偶然揃うOLLスキップはまれ）／PLL：OLL完成
    expect(levels.f2l.every((l) => l >= 1 && l < 5)).toBe(true)
    expect(levels.oll.filter((l) => l === 5).length).toBeGreaterThan(45)
    expect(levels.oll.every((l) => l >= 5)).toBe(true)
    expect(levels.pll.every((l) => l >= 6)).toBe(true)
    expect(levels.pll.filter((l) => l === 6).length).toBeGreaterThan(45)
  })
})

describe('stepExerciseSource', () => {
  it('generates scrambles whose state matches the step for white cross', async () => {
    for (const step of ['cross', 'f2l', 'oll', 'pll'] as const) {
      const ex = await stepExerciseSource(kpuzzle, step, 'white')()
      const state = kpuzzle.defaultPattern().applyAlg(ex.scramble)
      expect(ex.step).toBe(step)
      expect(stepGoal(step, 'white')(state)).toBe(false)
      const level = stageLevel(patternToFacelets(state), 'white')
      if (step === 'f2l') expect(level).toBeGreaterThanOrEqual(1)
      if (step === 'oll') expect(level).toBe(5)
      if (step === 'pll') expect(level).toBe(6)
    }
  }, 60_000)

  it('toCubeFrame keeps the stage level for every cross color', async () => {
    const standard = randomStandardState(kpuzzle, 'oll', rand)
    for (const color of ['white', 'green', 'red'] as const) {
      const p = await toCubeFrame(kpuzzle, standard, color)
      expect(stageLevel(patternToFacelets(p), color)).toBe(stageLevel(patternToFacelets(standard), 'yellow'))
    }
  }, 60_000)
})

describe('stepSplits', () => {
  it('only keeps stages that were not done at the start', () => {
    // PLL練習：スクランブル＝Tパームの逆、解法＝Tパーム
    const tperm = "R U R' U' R' F R2 U' R' U' R U R' F'".split(' ')
    const inv = [...tperm].reverse().map((m) => (m.endsWith("'") ? m[0] : m.includes('2') ? m : `${m}'`))
    const quarter = tperm.flatMap((m) => (m.includes('2') ? [m[0], m[0]] : [m]))
    const splits = stepSplits(kpuzzle, 'pll', inv.join(' '), quarter.map((move, i) => ({ move, t: i * 100 })), 'yellow')
    expect(splits.map((s) => s.stage)).toEqual(['pll'])
    expect(splits[0]).toMatchObject({ start_index: 0, end_index: quarter.length, move_count: quarter.length })
  })

  it('drops stages beyond the practiced step', () => {
    // F2L練習で一気に完成まで回しても、F2Lより先（OLL/PLL）の段階は残さない
    const moves = ['F', "R U R'", "R U R' U R U2 R'"].join(' ').split(' ').flatMap((m) => (m.includes('2') ? [m[0], m[0]] : [m]))
    const inv = [...moves].reverse().map((m) => (m.endsWith("'") ? m[0] : `${m}'`))
    const splits = stepSplits(kpuzzle, 'f2l', inv.join(' '), moves.map((move, i) => ({ move, t: i * 100 })), 'yellow')
    const stages = splits.map((s) => s.stage)
    expect(stages).toContain('f2l4')
    expect(stages).not.toContain('oll')
    expect(stages).not.toContain('pll')
  })
})
