import { cube3x3x3 } from 'cubing/puzzles'
import { describe, expect, it } from 'vitest'
import { ALL_CASES } from './data'
import { pllArrows } from './pll-arrows'
import { casePattern } from './seed'

const kpuzzle = await cube3x3x3.kpuzzle()
const arrowsOf = (name: string) => {
  const c = ALL_CASES.find((x) => x.set === 'PLL' && x.name === `${name} perm`)!
  return pllArrows(casePattern(kpuzzle, c.alg))
}

describe('pllArrows', () => {
  it('draws a 3-cycle as three one-way arrows', () => {
    for (const name of ['Ua', 'Ub', 'Aa', 'Ab']) {
      const arrows = arrowsOf(name)
      expect(arrows, name).toHaveLength(3)
      expect(arrows.every((a) => !a.both)).toBe(true)
      // 3本で輪になる
      const to = new Map(arrows.map((a) => [a.from, a.to]))
      const start = arrows[0].from
      expect(to.get(to.get(to.get(start)!)!)).toBe(start)
    }
  })

  it('draws swaps as two-way arrows', () => {
    expect(arrowsOf('H')).toEqual([
      expect.objectContaining({ both: true }),
      expect.objectContaining({ both: true }),
    ])
    expect(arrowsOf('T').filter((a) => a.both)).toHaveLength(2)
  })

  it('ignores the AUF at the end of the algorithm', () => {
    // 動くパーツの数（片向きの矢印は1本で1つ、入れ替えは1本で2つ）
    const moved = (name: string) => arrowsOf(name).reduce((n, a) => n + (a.both ? 2 : 1), 0)
    const expected: Record<string, number> = {
      Aa: 3, Ab: 3, E: 4, H: 4, Ua: 3, Ub: 3, Z: 4, F: 4, Ja: 4, Jb: 4, Ra: 4, Rb: 4, T: 4,
      Ga: 6, Gb: 6, Gc: 6, Gd: 6, Na: 4, Nb: 4, V: 4, Y: 4,
    }
    for (const [name, n] of Object.entries(expected)) expect(moved(name), name).toBe(n)
    // J・R・T・F・V・Y・N は、角の入れ替えとエッジの入れ替えが1組ずつ
    for (const name of ['Ja', 'Jb', 'Ra', 'Rb', 'T', 'F', 'V', 'Y', 'Na', 'Nb', 'Z']) {
      expect(arrowsOf(name).every((a) => a.both), name).toBe(true)
    }
  })

  it('gives arrows for every PLL case, and none for a solved or non-PLL state', () => {
    for (const c of ALL_CASES.filter((x) => x.set === 'PLL')) {
      expect(pllArrows(casePattern(kpuzzle, c.alg)).length, c.name).toBeGreaterThan(0)
    }
    expect(pllArrows('UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB')).toEqual([])
    const oll = ALL_CASES.find((x) => x.set === 'OLL')!
    expect(pllArrows(casePattern(kpuzzle, oll.alg))).toEqual([])
  })
})
