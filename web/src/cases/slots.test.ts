import { Alg } from 'cubing/alg'
import { cube3x3x3 } from 'cubing/puzzles'
import { describe, expect, it } from 'vitest'
import { patternToFacelets } from '../cube/facelets'
import { stageLevel } from '../solve/cfop'
import { algsFor, defaultAlg } from './algs'
import { F2L_CASES } from './data'
import { f2lGrayStickers } from './f2l-view'
import { applyNormalized, closeRotation } from './geometry'
import { casePattern } from './seed'
import { F2L_SLOTS, SLOT_PIECES, slotAlg, slotView, type F2LSlot } from './slots'

const kpuzzle = await cube3x3x3.kpuzzle()
const solved = kpuzzle.defaultPattern()
const AUF = ['', 'U', 'U2', "U'"]

const caseState = (alg: string) => applyNormalized(kpuzzle, new Alg(closeRotation(kpuzzle, alg)).invert().toString())

/** スロットのペアの位置と向き（前 AUF の違いは同じ形とみなす）。 */
function signature(slot: F2LSlot, alg: string): string {
  const { corner, edge } = SLOT_PIECES[slot]
  const state = caseState(alg)
  return AUF.map((a) => {
    const d = (a ? state.applyAlg(a) : state).patternData
    const c = d.CORNERS.pieces.indexOf(corner)
    const e = d.EDGES.pieces.indexOf(edge)
    return `${c}:${d.CORNERS.orientation[c]}/${e}:${d.EDGES.orientation[e]}`
  }).sort()[0]
}

describe('slotAlg', () => {
  it('mirrors moves for each slot', () => {
    expect(slotAlg("R U R'", 'FR')).toBe("R U R'")
    expect(slotAlg("R U R'", 'FL')).toBe("L' U' L")
    expect(slotAlg("R U R'", 'BR')).toBe("R' U' R")
    expect(slotAlg("R U R'", 'BL')).toBe("L U L'")
    expect(slotAlg("y L' U2 L F", 'FL')).toBe("y' R U2 R' F'")
    expect(slotAlg("y L' U2 L F", 'BR')).toBe("y' L U2 L' B'")
    expect(slotAlg("y L' U2 L F", 'BL')).toBe("y R' U2 R B")
  })

  it('keeps the direction of slices and rotations on the mirror axis', () => {
    expect(slotAlg("M x S z", 'FL')).toBe("M x S' z'")
    expect(slotAlg("M x S z", 'BR')).toBe("M' x' S z")
    expect(slotAlg("M x S z", 'BL')).toBe("M' x' S' z'")
  })
})

describe.each(F2L_SLOTS.map((s) => s.slot))('F2L in the %s slot', (slot) => {
  const others = F2L_SLOTS.map((s) => s.slot).filter((s) => s !== slot)

  it('every alg of a case solves the same shape, and only that slot', () => {
    for (const c of F2L_CASES) {
      const algs = algsFor(c, slot)
      const sig = signature(slot, algs[0])
      for (const alg of algs) {
        expect(signature(slot, alg), `${c.id} ${alg}`).toBe(sig)
        // クロスとほかの3つのスロットは揃ったまま
        expect(stageLevel(patternToFacelets(caseState(alg)), 'yellow'), `${c.id} ${alg}`).toBe(
          stageLevel(patternToFacelets(caseState(c.alg)), 'yellow'),
        )
        for (const o of others) expect(signature(o, alg), `${c.id} ${alg} ${o}`).toBe(signature(o, ''))
      }
    }
  })

  it('has 41 different shapes', () => {
    expect(new Set(F2L_CASES.map((c) => signature(slot, defaultAlg(c, slot)))).size).toBe(41)
  })

  it('draws the pair in color, seen from the corner of the slot', () => {
    for (const c of F2L_CASES) {
      const fr = f2lGrayStickers(casePattern(kpuzzle, c.alg))
      const view = slotView(casePattern(kpuzzle, defaultAlg(c, slot)), slot)
      expect(f2lGrayStickers(view, slot).size, c.id).toBe(fr.size)
    }
  })
})

describe('slotView', () => {
  it('turns the whole cube so that the slot comes to the front right', () => {
    const state = solved.applyAlg("R U R' F' U2 F L D")
    const f = patternToFacelets(state)
    expect(slotView(f, 'FR')).toBe(f)
    expect(slotView(f, 'BR')).toBe(patternToFacelets(state.applyAlg('y')))
    expect(slotView(f, 'BL')).toBe(patternToFacelets(state.applyAlg('y2')))
    expect(slotView(f, 'FL')).toBe(patternToFacelets(state.applyAlg("y'")))
  })
})
