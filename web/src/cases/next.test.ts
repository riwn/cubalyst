import { describe, expect, it } from 'vitest'
import { nextToLearn } from './next'

describe('nextToLearn', () => {
  it('ranks 2-look cases by the time lost against 1-look cases', () => {
    const r = nextToLearn([
      { id: 'pll-T', count: 3, avg: 5000, steps: 1 },
      { id: 'pll-Ub', count: 1, avg: 7000, steps: 1 },
      { id: 'pll-V', count: 4, avg: 13500, steps: 2 },
      { id: 'pll-E', count: 3, avg: 17500, steps: 2.3 },
      { id: 'pll-Ja', count: 1, avg: 5000, steps: 2 },
      { id: '', count: 2, avg: 30000, steps: 2 },
    ])!
    expect(r.oneLookAvg).toBe(5500)
    expect(r.cases.map((c) => c.id)).toEqual(['pll-E', 'pll-V'])
    expect(r.cases[0].loss).toBe(36000)
  })

  it('leaves out skipped cases, but keeps them in the baseline', () => {
    const rows = [
      { id: 'pll-T', count: 1, avg: 5000, steps: 1 },
      { id: 'pll-V', count: 4, avg: 13500, steps: 2 },
      { id: 'pll-E', count: 3, avg: 17500, steps: 2.3 },
    ]
    expect(nextToLearn(rows, new Set(['pll-E']))!.cases.map((c) => c.id)).toEqual(['pll-V'])
    expect(nextToLearn(rows, new Set(['pll-T']))!.oneLookAvg).toBe(5000)
  })

  it('returns null when no case is solved with one alg', () => {
    expect(nextToLearn([{ id: 'pll-V', count: 4, avg: 13500, steps: 2 }])).toBeNull()
  })
})
