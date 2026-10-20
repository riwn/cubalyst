import { cube3x3x3 } from 'cubing/puzzles'
import { describe, expect, it } from 'vitest'
import { SOLVED_FACELETS, faceletsToPattern, patternToFacelets } from './facelets'

const kpuzzle = await cube3x3x3.kpuzzle()
const solved = kpuzzle.defaultPattern()

// 完成状態から1手回したときの既知のfacelets（Kociemba形式）。
const KNOWN: Record<string, string> = {
  R: 'UUFUUFUUF' + 'RRRRRRRRR' + 'FFDFFDFFD' + 'DDBDDBDDB' + 'LLLLLLLLL' + 'UBBUBBUBB',
  U: 'UUUUUUUUU' + 'BBBRRRRRR' + 'RRRFFFFFF' + 'DDDDDDDDD' + 'FFFLLLLLL' + 'LLLBBBBBB',
  F: 'UUUUUULLL' + 'URRURRURR' + 'FFFFFFFFF' + 'RRRDDDDDD' + 'LLDLLDLLD' + 'BBBBBBBBB',
}

function randomAlg(n: number, seed: number): string {
  const faces = 'URFDLB'
  const suffix = ['', "'", '2']
  let x = seed
  const next = () => {
    x = (x * 1103515245 + 12345) % 2 ** 31
    return x
  }
  const moves: string[] = []
  for (let i = 0; i < n; i++) {
    moves.push(faces[next() % 6] + suffix[next() % 3])
  }
  return moves.join(' ')
}

describe('patternToFacelets', () => {
  it('solved', () => {
    expect(patternToFacelets(solved)).toBe(SOLVED_FACELETS)
  })
  for (const [move, facelets] of Object.entries(KNOWN)) {
    it(`single move ${move}`, () => {
      expect(patternToFacelets(solved.applyMove(move))).toBe(facelets)
    })
  }
})

describe('faceletsToPattern', () => {
  it('solved', () => {
    expect(faceletsToPattern(kpuzzle, SOLVED_FACELETS)?.isIdentical(solved)).toBe(true)
  })

  it('round-trips random states', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const pattern = solved.applyAlg(randomAlg(25, seed))
      const facelets = patternToFacelets(pattern)
      const back = faceletsToPattern(kpuzzle, facelets)
      expect(back, `seed ${seed}`).not.toBeNull()
      expect(back!.isIdentical(pattern), `seed ${seed}`).toBe(true)
    }
  })

  it('rejects invalid input', () => {
    expect(faceletsToPattern(kpuzzle, 'UUU')).toBeNull()
    // 角を1つだけ捻った状態
    const twisted = SOLVED_FACELETS.split('')
    ;[twisted[8], twisted[20], twisted[9]] = [twisted[20], twisted[9], twisted[8]]
    expect(faceletsToPattern(kpuzzle, twisted.join(''))).toBeNull()
    // エッジ2つだけ入れ替え（パリティ違反）
    const swapped = SOLVED_FACELETS.split('')
    ;[swapped[7], swapped[5]] = [swapped[5], swapped[7]]
    ;[swapped[19], swapped[10]] = [swapped[10], swapped[19]]
    expect(faceletsToPattern(kpuzzle, swapped.join(''))).toBeNull()
  })
})
