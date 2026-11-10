import { cube3x3x3 } from 'cubing/puzzles'
import { describe, expect, it } from 'vitest'
import { faceletsToPattern, patternToFacelets, SOLVED_FACELETS } from '../cube/facelets'
import { PLL_CASES } from './data'
import { caseSignature } from './geometry'
import { addRecogResult, pickRecogCase, recogAvg, recogFacelets, recogWeight } from './recog'
import { casePattern } from './seed'

const kpuzzle = await cube3x3x3.kpuzzle()

describe('recogFacelets', () => {
  it('keeps the solved cube solved from the front', () => {
    expect(recogFacelets(SOLVED_FACELETS, 0, 0)).toBe(SOLVED_FACELETS)
  })

  it('shows the same case from every angle and AUF', () => {
    for (const c of PLL_CASES) {
      const pattern = casePattern(kpuzzle, c.alg)
      for (let turn = 0; turn < 4; turn++) {
        for (let auf = 0; auf < 4; auf++) {
          // 見る角度を戻す（側面の色を標準に戻す）と、同じ PLL になっている
          const f = recogFacelets(pattern, turn, auf)
          const back = [...f].map((ch) => ('FRBL'.includes(ch) ? 'FRBL'[('FRBL'.indexOf(ch) + 4 - turn) % 4] : ch)).join('')
          const state = faceletsToPattern(kpuzzle, back)
          expect(state, `${c.id} ${turn} ${auf}`).not.toBeNull()
          expect(caseSignature('PLL', state!)).toBe(caseSignature('PLL', faceletsToPattern(kpuzzle, pattern)!))
        }
      }
    }
  })

  it('turns the view with the lower layers', () => {
    const pattern = patternToFacelets(kpuzzle.defaultPattern().applyAlg("R U R' U' R' F R2 U' R' U' R U R' F'"))
    const f = recogFacelets(pattern, 1, 0)
    // 右の面が前に来る
    expect(f.slice(21, 27)).toBe('RRRRRR')
    expect(f.slice(18, 21)).toBe(pattern.slice(9, 12))
  })
})

describe('recog stats', () => {
  it('counts correct answers and their time', () => {
    let s = addRecogResult({}, 'pll-T', true, 1000)
    s = addRecogResult(s, 'pll-T', false, 5000)
    s = addRecogResult(s, 'pll-T', true, 2000)
    expect(s['pll-T']).toEqual({ n: 3, ok: 2, ms: 3000 })
    expect(recogAvg(s['pll-T'])).toBe(1500)
    expect(recogAvg({ n: 1, ok: 0, ms: 0 })).toBeNull()
  })

  it('weights unseen, missed and slow cases more', () => {
    const good = { n: 10, ok: 10, ms: 10000 }
    expect(recogWeight(undefined, 1000)).toBeGreaterThan(recogWeight(good, 1000))
    expect(recogWeight({ n: 10, ok: 5, ms: 5000 }, 1000)).toBeGreaterThan(recogWeight(good, 1000))
    expect(recogWeight({ n: 10, ok: 10, ms: 20000 }, 1000)).toBeGreaterThan(recogWeight(good, 1000))
  })

  it('does not pick the same case twice in a row', () => {
    const ids = ['a', 'b', 'c']
    for (const r of [0, 0.3, 0.6, 0.999]) expect(pickRecogCase(ids, {}, 'a', r)).not.toBe('a')
    expect(pickRecogCase(['a'], {}, 'a', 0.5)).toBe('a')
  })
})
