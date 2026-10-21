import { Alg } from 'cubing/alg'
import { cube3x3x3 } from 'cubing/puzzles'
import { describe, expect, it } from 'vitest'
import { patternToFacelets } from '../cube/facelets'
import { stageLevel } from '../solve/cfop'
import { ALT_ALGS } from './algs'
import { ALL_CASES } from './data'
import { applyNormalized, caseSignature } from './geometry'

const kpuzzle = await cube3x3x3.kpuzzle()

const caseState = (alg: string) => applyNormalized(kpuzzle, new Alg(alg).invert().toString())
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
