import { Alg } from 'cubing/alg'
import { cube3x3x3 } from 'cubing/puzzles'
import { describe, expect, it } from 'vitest'
import { patternToFacelets } from '../cube/facelets'
import { stageLevel } from '../solve/cfop'
import { ALL_CASES, F2L_CASES, OLL_CASES, PLL_CASES, SET_SIZES } from './data'
import { enumerateF2LStates } from './f2l-gen'
import { applyNormalized, caseSignature } from './geometry'

const kpuzzle = await cube3x3x3.kpuzzle()

/** ケース手順の逆を完成状態に当てた「ケースの状態」（標準の向き）。 */
const caseState = (alg: string) => applyNormalized(kpuzzle, new Alg(alg).invert().toString())

const level = (alg: string) => stageLevel(patternToFacelets(caseState(alg)), 'yellow')

describe('case data', () => {
  it('has the expected number of cases with unique ids', () => {
    expect(OLL_CASES).toHaveLength(SET_SIZES.OLL)
    expect(PLL_CASES).toHaveLength(SET_SIZES.PLL)
    expect(F2L_CASES).toHaveLength(SET_SIZES.F2L)
    expect(new Set(ALL_CASES.map((c) => c.id)).size).toBe(ALL_CASES.length)
  })

  it.each(OLL_CASES.map((c) => [c.name, c.alg]))('%s keeps F2L and disorients the last layer', (_, alg) => {
    expect(level(alg)).toBe(5)
  })

  it.each(PLL_CASES.map((c) => [c.name, c.alg]))('%s keeps OLL and permutes the last layer', (_, alg) => {
    expect(level(alg)).toBe(6)
  })

  it.each(F2L_CASES.map((c) => [c.name, c.alg]))('%s keeps cross and the other three slots', (_, alg) => {
    expect(level(alg)).toBe(4)
  })

  for (const [set, cases] of [
    ['OLL', OLL_CASES],
    ['PLL', PLL_CASES],
    ['F2L', F2L_CASES],
  ] as const) {
    it(`${set} cases are pairwise distinct (up to AUF)`, () => {
      const sigs = new Map<string, string>()
      for (const c of cases) {
        const sig = caseSignature(set, caseState(c.alg))
        expect(sigs.get(sig), `${c.name} duplicates ${sigs.get(sig)}`).toBeUndefined()
        sigs.set(sig, c.name)
      }
    })
  }

  it('F2L cases cover every enumerated pair configuration', () => {
    const enumerated = new Set(enumerateF2LStates(kpuzzle).map((s) => s.key))
    const covered = new Set(F2L_CASES.map((c) => caseSignature('F2L', caseState(c.alg))))
    expect(enumerated.size).toBe(41)
    expect(covered).toEqual(enumerated)
  })
})

describe('cases migration', () => {
  it('is up to date with data.ts (run `npm run gen:cases`)', async () => {
    const { readFileSync } = await import('node:fs')
    const { casesMigrationSQL } = await import('./seed')
    const sql = readFileSync(new URL('../../../internal/db/migrations/0004_cases.sql', import.meta.url), 'utf8')
    expect(sql).toBe(casesMigrationSQL(kpuzzle))
  })
})
