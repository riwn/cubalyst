import { describe, expect, it } from 'vitest'
import type { StageSolve } from '../api'
import { lossHints } from './hints'

const pair = (stage: string, caseMoves: number, moves: number, ms: number, recognition = 1000) => ({
  stage,
  slot: '緑・赤',
  case: { id: `f2l-${stage}`, name: `F2L ${stage}`, moves: caseMoves },
  shape: 'paired',
  ms,
  recognition_ms: recognition,
  moves,
  rewrong: false,
})

const none = () => undefined

describe('lossHints', () => {
  it('標準手順より多く回したペアを、同じ速さで標準手数を回した見込みと比べる', () => {
    // 実行 4秒で 16手、標準 8手 → 見込み 2秒、損 2秒
    const s: StageSolve = { id: 1, pairs: [pair('f2l1', 8, 16, 5000)] }
    const [h] = lossHints(s, none)
    expect(h.label).toBe('F2L 1（緑・赤）')
    expect(h.execMs).toBe(4000)
    expect(h.expectedMs).toBe(2000)
    expect(h.savedMs).toBe(2000)
    expect(h.basis).toBe('tps')
  })

  it('手数の差が小さいペアと、損が小さいものは出さない', () => {
    const s: StageSolve = { id: 1, pairs: [pair('f2l1', 8, 11, 5000), pair('f2l2', 8, 12, 1500, 1000)] }
    expect(lossHints(s, none)).toEqual([])
  })

  it('手順練習の平均があればそれを見込みにする', () => {
    const s: StageSolve = { id: 1, pairs: [pair('f2l1', 8, 16, 5000)] }
    const [h] = lossHints(s, (id) => (id === 'f2l-f2l1' ? 1500 : undefined))
    expect(h.basis).toBe('drill')
    expect(h.savedMs).toBe(2500)
  })

  it('2-look の PLL は手数に関係なく1つの手順と比べ、損の大きい順に並べる', () => {
    const s: StageSolve = {
      id: 1,
      pairs: [pair('f2l1', 8, 16, 5000)],
      pll: {
        stage: 'pll',
        ms: 9000,
        recognition_ms: 1000,
        moves: 30,
        steps: [
          { id: 'pll-V', name: 'V perm', moves: 14 },
          { id: 'pll-Ua', name: 'Ua perm', moves: 10 },
        ],
        repeated: false,
      },
    }
    const hints = lossHints(s, none)
    expect(hints.map((h) => h.stage)).toEqual(['pll', 'f2l1'])
    expect(hints[0]).toMatchObject({ label: 'PLL', multiLook: true, case: { name: 'V perm' } })
    // 8秒 × 14/30
    expect(hints[0].expectedMs).toBeCloseTo((8000 * 14) / 30)
  })

  it('判定できないケースは飛ばす', () => {
    const s: StageSolve = {
      id: 1,
      pairs: [{ ...pair('f2l1', 8, 16, 5000), case: null }],
      oll: { stage: 'oll', ms: 5000, recognition_ms: 500, moves: 20, steps: [{ id: '', name: '' }], repeated: false },
    }
    expect(lossHints(s, none)).toEqual([])
  })
})
