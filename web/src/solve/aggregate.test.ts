import { describe, expect, it } from 'vitest'
import type { Solve } from '../api'
import { bests, histogram, stageStats, trend } from './aggregate'
import type { Split } from './cfop'

function solve(ms: number, penalty: Solve['penalty'] = '', splits?: Split[]): Solve {
  return {
    id: 0, mode: 'full', solved_at: '2026-10-21T00:00:00Z', total_ms: ms, penalty,
    scramble: '', case_id: null, step: null, note: '', splits,
  }
}

const sp = (stage: Split['stage'], start: number, end: number, moves: number): Split => ({
  stage, start_ms: start, end_ms: end, move_count: moves, start_index: 0, end_index: 0,
})

describe('trend & bests', () => {
  it('computes rolling averages and bests', () => {
    const list = [10000, 12000, 11000, 9000, 13000, 8000].map((t) => solve(t))
    list[2] = solve(11000, 'DNF')
    const points = trend(list)
    expect(points.map((p) => p.single)).toEqual([10000, 12000, null, 9000, 13000, 8000])
    expect(points[4].ao5).toBe(11670) // 10,12,DNF,9,13 → 最良9と最悪DNFを除き (10+12+13)/3 = 11.667
    expect(points[5].ao5).toBe(11330) // 12,DNF,9,13,8 → 最良8と最悪DNFを除き (12+9+13)/3 = 11.333
    const b = bests(points)
    expect(b.single).toBe(8000)
    expect(b.dnf).toBe(1)
    expect(b.count).toBe(6)
    expect(b.ao12).toBeUndefined()
  })
})

describe('histogram', () => {
  it('bins valid times and counts DNFs separately', () => {
    const { bins, dnf, width } = histogram([10100, 10400, 11900, null, 12000])
    expect(dnf).toBe(1)
    expect(width).toBe(250)
    expect(bins[0]).toEqual({ from: 10000, to: 10250, count: 1 })
    expect(bins.reduce((a, b) => a + b.count, 0)).toBe(4)
    expect(bins[bins.length - 1]).toMatchObject({ from: 12000, count: 1 })
  })
  it('widens bins for a wide range', () => {
    expect(histogram([5000, 60000]).width).toBe(5000)
  })
  it('handles empty input', () => {
    expect(histogram([null])).toEqual({ bins: [], dnf: 1, width: 0 })
  })
})

describe('stageStats', () => {
  const full = (k: number) => [
    sp('cross', 0, 2000 * k, 8), sp('f2l1', 2000 * k, 4000 * k, 8), sp('f2l2', 4000 * k, 6000 * k, 8),
    sp('f2l3', 6000 * k, 8000 * k, 8), sp('f2l4', 8000 * k, 10000 * k, 8), sp('oll', 10000 * k, 11000 * k, 10),
    sp('pll', 11000 * k, 12000 * k, 12),
  ]
  it('averages groups and stages, ignoring DNF and partial splits', () => {
    const r = stageStats([
      solve(12000, '', full(1)),
      solve(24000, '+2', full(2)),
      solve(5000, 'DNF', full(1)),
      solve(5000, '', [sp('cross', 0, 1000, 5)]),
    ])
    expect(r.count).toBe(2)
    expect(r.groups.cross).toMatchObject({ ms: 3000, moves: 8 })
    expect(r.groups.f2l).toMatchObject({ ms: 12000, moves: 32 })
    expect(r.groups.pll!.share).toBeCloseTo(1500 / 18000)
    expect(r.stages.f2l1!.ms).toBe(3000)
    expect(r.groups.oll!.tps).toBeCloseTo(10 / 1.5)
  })
})
