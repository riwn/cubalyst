import { describe, expect, it } from 'vitest'
import { algInfo, formatAlgInfo } from './alg-info'

describe('algInfo', () => {
  it('counts turns and lists faces, without rotations', () => {
    expect(algInfo("R U R' U' R' F R2 U' R' U' R U R' F'")).toEqual({ moves: 14, faces: ['R', 'U', 'F'], rotations: 0 })
    expect(algInfo("x R' U R' D2 R U' R' D2 R2 x'")).toEqual({ moves: 9, faces: ['R', 'U', 'D'], rotations: 2 })
    expect(algInfo("M2 U M U2 M' U M2")).toEqual({ moves: 7, faces: ['M', 'U'], rotations: 0 })
  })

  it('formats for the alg list', () => {
    expect(formatAlgInfo("y L' U' L")).toBe('3手 ・ L U ・ 持ち替え1回')
    expect(formatAlgInfo("R U R'")).toBe('3手 ・ R U')
  })
})
