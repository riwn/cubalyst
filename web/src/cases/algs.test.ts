import { Alg } from 'cubing/alg'
import { cube3x3x3 } from 'cubing/puzzles'
import { describe, expect, it } from 'vitest'
import { patternToFacelets } from '../cube/facelets'
import { stageLevel } from '../solve/cfop'
import { algsFor, ALT_ALGS, defaultAlg, usesF } from './algs'
import { ALL_CASES } from './data'
import { applyNormalized, caseSignature, ROTATIONS } from './geometry'
import { caseForAlg } from './seed'

const kpuzzle = await cube3x3x3.kpuzzle()

/** 手順の最後に、全体の向きを元に戻す持ち替えを足す（y を含む手順は、回し終えると向きが変わっているため）。 */
function closeRotation(alg: string): string {
  const solved = kpuzzle.defaultPattern()
  const r = ROTATIONS.find((r) => solved.applyAlg(`${alg} ${r}`).patternData.CENTERS.pieces.every((v, i) => v === i))
  return r ? `${alg} ${r}` : alg
}

const caseState = (alg: string) => applyNormalized(kpuzzle, new Alg(closeRotation(alg)).invert().toString())
const level = (alg: string) => stageLevel(patternToFacelets(caseState(alg)), 'yellow')

const rows = Object.entries(ALT_ALGS).flatMap(([id, algs]) => algs.map((alg) => [id, alg] as const))

describe('alternative algs', () => {
  it('refer to existing cases', () => {
    for (const id of Object.keys(ALT_ALGS)) expect(ALL_CASES.some((c) => c.id === id), id).toBe(true)
  })

  it.each(rows)('%s: %s solves the same case', (id, alg) => {
    const c = ALL_CASES.find((c) => c.id === id)!
    expect(caseSignature(c.set, caseState(alg))).toBe(caseSignature(c.set, caseState(c.alg)))
    expect(level(alg)).toBe(level(c.alg))
    expect(alg).not.toBe(c.alg)
  })
})

describe('diagram follows the chosen alg', () => {
  const c = (id: string) => ALL_CASES.find((x) => x.id === id)!
  // 面の上段の両端のシール（R：9・11、F：18・20）が同じ色ならヘッドライト
  const headlights = (f: string, a: number, b: number) => f[a] === f[b]

  it("draws Aa's headlights on the right for x' R2 D2 R' U' R D2 R' U R' x", () => {
    const alg = "x' R2 D2 R' U' R D2 R' U R' x"
    expect(algsFor(c('pll-Aa'))).toContain(alg)
    expect(headlights(caseForAlg(kpuzzle, { alg: c('pll-Aa').alg, pattern: '' }, alg).pattern, 9, 11)).toBe(true)
  })

  it("draws Ab's headlights in front for R B' R F2 R' B R F2 R2", () => {
    const alg = "R B' R F2 R' B R F2 R2"
    expect(algsFor(c('pll-Ab'))).toContain(alg)
    expect(headlights(caseForAlg(kpuzzle, { alg: c('pll-Ab').alg, pattern: '' }, alg).pattern, 18, 20)).toBe(true)
  })

  it('keeps the stored pattern for the standard alg', () => {
    const x = { alg: "R U R'", pattern: 'stored' }
    expect(caseForAlg(kpuzzle, x, x.alg)).toBe(x)
  })
})

describe('F2L without F', () => {
  const f2l = ALL_CASES.filter((c) => c.set === 'F2L')

  it('every F2L case has an alg without F, and it is the default', () => {
    for (const c of f2l) {
      expect(algsFor(c).some((a) => !usesF(a)), c.id).toBe(true)
      expect(usesF(defaultAlg(c)), c.id).toBe(false)
    }
  })

  it('keeps the standard alg as the default outside F2L', () => {
    const oll = ALL_CASES.find((c) => c.id === 'oll-45')!
    expect(defaultAlg(oll)).toBe(oll.alg)
  })
})
