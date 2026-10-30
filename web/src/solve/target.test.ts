import { describe, expect, it } from 'vitest'
import type { Solve } from '../api'
import { STAGES, type Split } from './cfop'
import { targetPlan } from './target'

/** 各段階の時間（cross, f2l1..4, oll, pll）からソルブを作る。手数は各段階 10手。 */
function solve(ms: number[], penalty: Solve['penalty'] = ''): Solve {
  let t = 0
  const splits: Split[] = STAGES.map((stage, i) => {
    const sp = { stage, start_ms: t, end_ms: t + ms[i], move_count: 10, start_index: 0, end_index: 0 }
    t += ms[i]
    return sp
  })
  return {
    id: 0, mode: 'full', solved_at: '2026-10-30T00:00:00Z', total_ms: t, penalty,
    scramble: '', case_id: null, step: null, note: '', splits,
  }
}

describe('targetPlan', () => {
  it('速い回の配分で目標を割り振り、縮める量の割合を出す', () => {
    // 遅い回：F2L が重い（cross 4, f2l 各 8, oll 4, pll 4 = 44秒）
    const slow = Array.from({ length: 8 }, () => solve([4000, 8000, 8000, 8000, 8000, 4000, 4000]))
    // 速い回：cross 2, f2l 各 4, oll 2, pll 4 = 24秒（cross 1/12, f2l 2/3, oll 1/12, pll 1/6）
    const fast = Array.from({ length: 5 }, () => solve([2000, 4000, 4000, 4000, 4000, 2000, 4000]))
    const plan = targetPlan([...slow, ...fast, solve([1, 1, 1, 1, 1, 1, 1], 'DNF')], 36000)!
    expect(plan.count).toBe(13)
    expect(plan.fastCount).toBe(5)
    expect(plan.fastMs).toBe(24000)
    expect(plan.reached).toBe(5)
    const byGroup = Object.fromEntries(plan.rows.map((r) => [r.group, r]))
    expect(byGroup.cross.targetMs).toBeCloseTo(3000)
    expect(byGroup.f2l.targetMs).toBeCloseTo(24000)
    expect(byGroup.pll.targetMs).toBeCloseTo(6000)
    // 今の平均：f2l = (8×32 + 5×16)/13
    expect(byGroup.f2l.nowMs).toBeCloseTo((8 * 32000 + 5 * 16000) / 13)
    // pll は今の平均（約 4秒）が目標（6秒）より速いので縮めない
    expect(byGroup.pll.cutMs).toBe(0)
    expect(plan.rows.reduce((s, r) => s + r.cutShare, 0)).toBeCloseTo(1)
    expect(byGroup.f2l.neededTps).toBeCloseTo(40 / 24)
  })

  it('段階の記録がそろったソルブが無ければ null', () => {
    expect(targetPlan([], 30000)).toBeNull()
  })
})
