import { cube3x3x3 } from 'cubing/puzzles'
import { describe, expect, it } from 'vitest'
import { checkImport, parseAlg, splitCasePrefix } from './alg-import'
import { ALL_CASES } from './data'

const kpuzzle = await cube3x3x3.kpuzzle()

describe('parseAlg', () => {
  it.each([
    ["(R U R' U')2 R' F R F'", "R U R' U' R U R' U' R' F R F'"],
    ["Rw U R’ U′", "r U R' U'"],
    ["R2' U3 (M)", "R2 U' M"],
    ['  x （R U）  ', 'x R U'],
  ])('%s', (text, want) => {
    expect(parseAlg(text)).toEqual({ alg: want })
  })

  it.each(["R U (", 'Q', '3Rw', ''])('rejects %s', (text) => {
    expect(parseAlg(text)).toHaveProperty('error')
  })
})

describe('splitCasePrefix', () => {
  it.each([
    ["OLL 33: R U R' U'", 'oll-33', "R U R' U'"],
    ["oll-33 R U R' U'", 'oll-33', "R U R' U'"],
    ["F2L5 U R U' R'", 'f2l-5', "U R U' R'"],
    ["Aa x R' U R'", 'pll-Aa', "x R' U R'"],
    ["Aa perm: x R' U R'", 'pll-Aa', "x R' U R'"],
    ["PLL T R U R'", 'pll-T', "R U R'"],
    ["T: R U R'", 'pll-T', "R U R'"],
    ["F R U' R'", undefined, "F R U' R'"],
    ["Rw U R'", undefined, "Rw U R'"],
    ["M2 U M2", undefined, 'M2 U M2'],
  ])('%s', (line, caseId, rest) => {
    const got = splitCasePrefix(line, ALL_CASES)
    expect(got.caseId).toBe(caseId)
    expect(got.rest).toBe(rest)
  })
})

describe('checkImport', () => {
  const check = (text: string) => checkImport(kpuzzle, ALL_CASES, text)

  it('accepts an alg for the named case, written with triggers in parentheses', () => {
    const [row] = check("OLL 33: (L' U' L U) (L F' L' F)")
    // L' U' L U L F' L' F は OLL 33 の鏡写しなので、OLL 33 ではない
    expect(row.ok).toBe(false)
    const [ok] = check("OLL 33: (R U R' U') R' F R F' U2")
    expect(ok).toMatchObject({ ok: true, alg: "R U R' U' R' F R F' U2" })
    expect(ok.case?.id).toBe('oll-33')
  })

  it('finds the case when none is named', () => {
    const [row] = check("(R U R' U') R' F R2 U' R' U' R U R' F' U")
    expect(row.ok).toBe(true)
    expect(row.case?.id).toBe('pll-T')
  })

  it('says which case the alg really solves', () => {
    const [row] = check("OLL 45: R U R' U' R' F R F'")
    expect(row.ok).toBe(false)
    expect(row.message).toBe('OLL 45 ではなく OLL 33 を解く手順です')
  })

  it('rejects algs that solve nothing, or break other slots', () => {
    expect(check("OLL 21: R U R' U R U2 R'")[0].message).toBe('OLL 21 ではなく OLL 27 を解く手順です')
    expect(check('R U')[0]).toMatchObject({ ok: false, message: 'どのケースの手順か分かりません（OLL・PLL・F2L のどれも解けません）' })
    expect(check("F2L 1: R U R' U' L U")[0]).toMatchObject({ ok: false, message: 'F2L 1 を解けません' })
  })

  it('reads an alg for another F2L slot and stores it for the front right slot', () => {
    // 左手前の L' U' L は、右手前の R U R'（F2L 2）を鏡に映した手順
    expect(check("F2L 2: L' U' L U2")[0]).toMatchObject({ ok: true, slot: 'FL', alg: "R U R' U2", written: "L' U' L U2" })
    expect(check("L' U' L U2")[0].case?.id).toBe('f2l-2')
  })

  it('skips standard algs and duplicates within the text', () => {
    const oll33 = ALL_CASES.find((c) => c.id === 'oll-33')!
    expect(check(`OLL 33: ${oll33.alg}`)[0]).toMatchObject({ ok: false, message: 'OLL 33 に同じ手順があります' })
    const rows = check("# コメント\n\nOLL 33: R U R' U' R' F R F' U\nR U R' U' R' F R F' U")
    expect(rows.map((r) => r.ok)).toEqual([true, false])
    expect(rows[0].line).toBe(3)
  })

  it('reports unknown cases and unreadable algs', () => {
    expect(check("OLL 99: R U R'")[0].message).toBe('ケース「OLL 99」がありません')
    expect(check('OLL 33: R Q')[0].message).toContain('読めない')
  })
})
