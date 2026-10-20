import { Alg } from 'cubing/alg'
import { cube3x3x3 } from 'cubing/puzzles'
import { describe, expect, it } from 'vitest'
import { patternToFacelets } from '../cube/facelets'
import { stageLevel } from '../solve/cfop'
import { F2L_CASES, OLL_CASES, PLL_CASES } from './data'
import { caseGoal, caseStateInCubeFrame } from './exercise'
import { FRAME_ROTATION, inFrame } from './geometry'

const kpuzzle = await cube3x3x3.kpuzzle()
const COLORS = Object.keys(FRAME_ROTATION) as (keyof typeof FRAME_ROTATION)[]

describe('case states in the cube frame', () => {
  for (const color of COLORS) {
    it(`OLL/PLL/F2L states are at the right stage for ${color} cross`, () => {
      const lv = (alg: string, pre = '', post = '') =>
        stageLevel(patternToFacelets(caseStateInCubeFrame(kpuzzle, alg, color, pre, post)), color)
      expect(lv(OLL_CASES[20].alg, 'U')).toBe(5)
      expect(lv(PLL_CASES[12].alg, "U'", 'U2')).toBe(6)
      expect(lv(F2L_CASES[5].alg, 'U2')).toBe(4)
    })
  }

  it('solving the case (with AUF) in the same frame reaches the goal', () => {
    for (const color of COLORS) {
      for (const [set, c] of [['OLL', OLL_CASES[3]], ['PLL', PLL_CASES[7]], ['F2L', F2L_CASES[30]]] as const) {
        const state = caseStateInCubeFrame(kpuzzle, c.alg, color, 'U', set === 'PLL' ? 'U2' : '')
        const goal = caseGoal(set, color)
        expect(goal(state)).toBe(false)
        // 前AUFを戻してから手順、PLLは最後にAUF
        const solve = inFrame(["U'", c.alg, set === 'PLL' ? "U2'" : ''].filter(Boolean).join(' '), color)
        const solved = state.applyAlg(new Alg(solve).toString())
        expect(goal(solved), `${set} ${color}`).toBe(true)
      }
    }
  })
})
