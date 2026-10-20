import { cube3x3x3 } from 'cubing/puzzles'
import { describe, expect, it } from 'vitest'
import { SOLVED_FACELETS, patternToFacelets } from '../cube/facelets'
import { computeSplits, stageLevel } from './cfop'
import { splitAlg } from './notation'

const kpuzzle = await cube3x3x3.kpuzzle()
const solved = kpuzzle.defaultPattern()

const CROSS = ['F']
const F2L = splitAlg("R U R'")
const SUNE = splitAlg("R U R' U R U2 R'")
const TPERM = splitAlg("R U R' U' R' F R2 U' R' U' R U R' F'")

// 90度回転だけに分解する（実機の回転ログと同じ形）
const quarter = (moves: string[]) => moves.flatMap((m) => (m.endsWith('2') ? [m[0], m[0]] : [m]))
const timed = (moves: string[]) => moves.map((move, i) => ({ move, t: i * 100 }))

describe('stageLevel', () => {
  it('solved is level 7 for any cross color', () => {
    for (const c of ['white', 'yellow', 'green', 'blue', 'red', 'orange'] as const) {
      expect(stageLevel(SOLVED_FACELETS, c)).toBe(7)
    }
  })
  it('detects each stage with yellow (D) cross', () => {
    const f = (alg: string) => patternToFacelets(solved.applyAlg(alg))
    expect(stageLevel(f("R U R' U' R' F R2 U' R' U' R U R' F'"), 'yellow')).toBe(6) // PLLだけ残る
    expect(stageLevel(f("R U2 R' U' R U' R'"), 'yellow')).toBe(5) // OLLが残る（Sune'）
    expect(stageLevel(f("R U' R'"), 'yellow')).toBe(4) // スロット1つ崩し
    expect(stageLevel(f('F'), 'yellow')).toBe(0) // クロス崩し
    expect(stageLevel(f('U'), 'yellow')).toBe(6) // AUFだけ
  })
})

describe('computeSplits', () => {
  const solution = quarter([...CROSS, ...F2L, ...SUNE, ...TPERM])

  it('splits a constructed solve at the expected moves (yellow cross)', () => {
    const splits = computeSplits(kpuzzle, timed(solution), 'yellow')
    const summary = splits.map((s) => [s.stage, s.start_index, s.end_index, s.move_count])
    const ollEnd = 1 + F2L.length + quarter(SUNE).length
    expect(summary).toEqual([
      ['cross', 0, 1, 1],
      // F で FL スロットも戻るので f2l1〜3 は同時に揃う
      ['f2l1', 1, 1, 0],
      ['f2l2', 1, 1, 0],
      ['f2l3', 1, 1, 0],
      ['f2l4', 1, 4, 3],
      ['oll', 4, ollEnd, ollEnd - 4],
      ['pll', ollEnd, solution.length, solution.length - ollEnd],
    ])
    expect(splits[0]).toMatchObject({ start_ms: 0, end_ms: 0 })
    expect(splits[4]).toMatchObject({ start_ms: 0, end_ms: 300 })
    expect(splits[6].end_ms).toBe((solution.length - 1) * 100)
  })

  it('records OLL skip as a zero-length stage', () => {
    const moves = quarter([...F2L, ...TPERM])
    const splits = computeSplits(kpuzzle, timed(moves), 'yellow')
    const oll = splits.find((s) => s.stage === 'oll')!
    expect(oll).toMatchObject({ move_count: 0, start_index: 3, end_index: 3 })
  })

  it('always covers every move exactly once for complete solves', () => {
    const scramble = splitAlg("D2 B' R2 U' F2 L2 D' R2 U B2 R' D' F' L B' R F2 U L'")
    const moves = quarter(scramble.slice().reverse().map((m) => (m.endsWith("'") ? m[0] : m.endsWith('2') ? m : `${m}'`)))
    for (const color of ['white', 'yellow', 'green'] as const) {
      const splits = computeSplits(kpuzzle, timed(moves), color)
      expect(splits.map((s) => s.stage)).toEqual(['cross', 'f2l1', 'f2l2', 'f2l3', 'f2l4', 'oll', 'pll'])
      expect(splits.reduce((a, s) => a + s.move_count, 0)).toBe(moves.length)
      splits.forEach((s, i) => {
        expect(s.start_index).toBe(i === 0 ? 0 : splits[i - 1].end_index)
        expect(s.end_index - s.start_index).toBe(s.move_count)
      })
      expect(splits[6].end_index).toBe(moves.length)
    }
  })

  it('omits stages that were never reached', () => {
    const splits = computeSplits(kpuzzle, timed(['R']), 'yellow', solved)
    expect(splits.length).toBe(7) // 開始時点で全段階を満たしている
    const broken = computeSplits(kpuzzle, timed(['F', 'R']), 'yellow', solved)
    expect(broken.every((s) => s.end_index === 0)).toBe(true)
  })
})
