import { cube3x3x3 } from 'cubing/puzzles'
import { expect, it } from 'vitest'
import { OLL_CASES } from './data'
import { caseStateInCubeFrame, scrambleFor } from './exercise'

it('solver-based scramble reproduces the case state', async () => {
  const kpuzzle = await cube3x3x3.kpuzzle()
  const state = caseStateInCubeFrame(kpuzzle, OLL_CASES[0].alg, 'white', 'U')
  const scramble = await scrambleFor(state)
  expect(kpuzzle.defaultPattern().applyAlg(scramble).isIdentical(state)).toBe(true)
}, 60_000)

it('scramble uses only plain face turns', async () => {
  const kpuzzle = await cube3x3x3.kpuzzle()
  const scramble = await scrambleFor(caseStateInCubeFrame(kpuzzle, OLL_CASES[5].alg, 'white'))
  for (const m of scramble.split(' ')) expect(m).toMatch(/^[URFDLB]['2]?$/)
}, 60_000)
