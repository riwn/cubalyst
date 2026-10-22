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

  it('gives arrows for every PLL case, and none for a solved or non-PLL state', () => {
    for (const c of ALL_CASES.filter((x) => x.set === 'PLL')) {
      expect(pllArrows(casePattern(kpuzzle, c.alg)).length, c.name).toBeGreaterThan(0)
    }
    expect(pllArrows('UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB')).toEqual([])
    const oll = ALL_CASES.find((x) => x.set === 'OLL')!
    expect(pllArrows(casePattern(kpuzzle, oll.alg))).toEqual([])
  })
})
