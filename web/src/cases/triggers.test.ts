import { describe, expect, it } from 'vitest'
import { withTriggers } from './triggers'

describe('withTriggers', () => {
  it.each([
    ["R U R' U' R' F R F'", "(R U R' U') (R' F R F')"],
    ["F R U R' U' F'", "F (R U R' U') F'"],
    ["R U R' U' R U R' U'", "(R U R' U') (R U R' U')"],
    ["F R' F' R U R U' R'", "(F R' F' R) (U R U' R')"],
    ["y L' U' L U L' U' L", "y (L' U' L U) L' U' L"],
    ["R U2 R' U' R U' R'", "R U2 R' U' R U' R'"],
    ['', ''],
  ])('%s', (alg, want) => {
    expect(withTriggers(alg)).toBe(want)
  })
})
