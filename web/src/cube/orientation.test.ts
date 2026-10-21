import { cube3x3x3 } from 'cubing/puzzles'
import { describe, expect, it } from 'vitest'
import { normalizeOrientation } from '../cases/geometry'
import { COLOR_FACE, convertMove, holdFrame, holdRotation, isValidHold, rightColor, type Color } from './orientation'

const kpuzzle = await cube3x3x3.kpuzzle()
const solved = kpuzzle.defaultPattern()
const COLORS = Object.keys(COLOR_FACE) as Color[]
const order = (f: Record<string, string>) => [...'URFDLB'].map((c) => f[c]).join('')

describe('holdFrame', () => {
  it('matches the Go implementation for known holds', () => {
    expect(order(holdFrame('yellow', 'green')!)).toBe('URFDLB')
    expect(order(holdFrame('white', 'green')!)).toBe('DLFURB')
    expect(order(holdFrame('white', 'red')!)).toBe('DFRUBL')
    expect(rightColor('white', 'red')).toBe('green')
    expect(rightColor('white', 'green')).toBe('orange')
  })

  it('rejects non-adjacent colors', () => {
    expect(isValidHold('white', 'yellow')).toBe(false)
    expect(holdFrame('white', 'white')).toBeNull()
  })

  it('converts moves keeping the direction', () => {
    const f = holdFrame('white', 'red')!
    expect(["D'", 'F2', 'R', 'U'].map((m) => convertMove(f, m))).toEqual(["U'", 'R2', 'F', 'D'])
  })
})

describe('holdRotation', () => {
  // 持ち替えた状態で持ち方の記号の手を回すと、キューブの記号の手を回して持ち替えたのと同じになる
  it('is consistent with holdFrame for all 24 holds', () => {
    let n = 0
    for (const bottom of COLORS) {
      for (const front of COLORS) {
        const frame = holdFrame(bottom, front)
        if (!frame) continue
        n++
        const rot = holdRotation(solved, bottom, front)
        const start = solved.applyAlg("R U F' D2 L B'")
        for (const move of ['R', "U'", 'F2', 'D', 'L', 'B']) {
          const a = start.applyAlg(rot).applyMove(convertMove(frame, move))
          const b = start.applyMove(move).applyAlg(rot)
          expect(normalizeOrientation(kpuzzle, a).isIdentical(normalizeOrientation(kpuzzle, b)), `${bottom}/${front} ${move}`).toBe(true)
          expect(a.isIdentical(b), `${bottom}/${front} ${move} (raw)`).toBe(true)
        }
      }
    }
    expect(n).toBe(24)
  })
})
