import { Alg } from 'cubing/alg'
import { cube3x3x3 } from 'cubing/puzzles'
import { describe, expect, it } from 'vitest'
import { patternToFacelets } from '../cube/facelets'
import { stageLevel } from '../solve/cfop'
import { algsFor, ALT_ALGS, defaultAlg, usesF } from './algs'
import { ALL_CASES } from './data'
import { applyNormalized, caseSignature, ROTATIONS } from './geometry'

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
