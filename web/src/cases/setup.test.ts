import { cube3x3x3 } from 'cubing/puzzles'
import { describe, expect, it } from 'vitest'
import { holdRotation } from '../cube/orientation'
import { MockConnection } from '../cube/mock'
import { CubeStore } from '../cube/store'
import { splitAlg } from '../solve/notation'
import { AlgDrill } from './drill'
import { CaseSetup, caseSetupTarget, type CaseSetupState } from './setup'

const kpuzzle = await cube3x3x3.kpuzzle()
const solved = kpuzzle.defaultPattern()

const TPERM = "R U R' U' R' F R2 U' R' U' R U R' F'"
const SUNE = "R U R' U R U2 R'"

function waitFor(setup: CaseSetup, pred: (s: CaseSetupState) => boolean): Promise<CaseSetupState> {
  return new Promise((resolve) => {
    const check = () => {
      const s = setup.getSnapshot()
      if (pred(s)) {
        unsub()
        resolve(s)
      }
    }
    const unsub = setup.subscribe(check)
    check()
  })
}

/** 1手ずつ90度回転で回す（R2 は R R）。 */
function turnAll(mock: MockConnection, moves: string[]) {
  for (const m of moves) {
    if (m.endsWith('2')) {
      mock.turn(m[0])
      mock.turn(m[0])
    } else mock.turn(m)
  }
}

describe('CaseSetup', () => {
  it('leads from a scrambled cube to a state the drill alg solves, in the hold orientation', async () => {
    const store = new CubeStore(kpuzzle)
    const mock = new MockConnection(kpuzzle)
    store.attach(mock)
    turnAll(mock, ['F', 'D', 'B', 'L'])
    const rotation = holdRotation(solved, 'white', 'red')
    const setup = new CaseSetup(store, TPERM, rotation)
    const s = await waitFor(setup, (x) => x.phase !== 'generating')
    if (s.phase !== 'scrambling') throw new Error(`unexpected ${s.phase}`)
    turnAll(mock, s.progress.moves)
    expect(setup.getSnapshot().phase).toBe('done')
    // 持ち方で手順を回すと揃う形になっている
    const after = store.getSnapshot().pattern.applyAlg(`${rotation} ${TPERM}`)
    expect(after.experimentalIsSolved({ ignorePuzzleOrientation: true, ignoreCenterOrientation: true })).toBe(true)
    expect(caseSetupTarget(kpuzzle, TPERM, rotation).isIdentical(store.getSnapshot().pattern)).toBe(true)
    setup.dispose()
  })

  it('a drill reset after the setup counts the next execution', async () => {
    const store = new CubeStore(kpuzzle)
    const mock = new MockConnection(kpuzzle)
    store.attach(mock)
    const rotation = holdRotation(solved, 'white', 'green')
    const drill = new AlgDrill(store, SUNE, rotation)
    let done = 0
    drill.events.subscribe(() => done++)
    const setup = new CaseSetup(store, SUNE, rotation)
    const s = await waitFor(setup, (x) => x.phase !== 'generating')
    if (s.phase !== 'scrambling') throw new Error(`unexpected ${s.phase}`)
    turnAll(mock, s.progress.moves)
    expect(setup.getSnapshot().phase).toBe('done')
    drill.reset()
    done = 0
    // 白下・緑前なら持ち方の R は キューブ自身の L（z2 で上下と左右が入れ替わる）
    const frame: Record<string, string> = { R: 'L', U: 'D' }
    turnAll(
      mock,
      splitAlg(SUNE).map((m) => frame[m[0]] + m.slice(1)),
    )
    expect(done).toBe(1)
    expect(store.getSnapshot().pattern.experimentalIsSolved({ ignorePuzzleOrientation: true, ignoreCenterOrientation: true })).toBe(true)
    setup.dispose()
    drill.dispose()
  })

  it('is done immediately when the cube is already in the case state', async () => {
    const store = new CubeStore(kpuzzle)
    const mock = new MockConnection(kpuzzle)
    store.attach(mock)
    const rotation = holdRotation(solved, 'yellow', 'green')
    turnAll(mock, splitAlg(SUNE).reverse().map((m) => (m.endsWith("'") ? m[0] : m.endsWith('2') ? m : `${m}'`)))
    const setup = new CaseSetup(store, SUNE, rotation)
    const s = await waitFor(setup, (x) => x.phase !== 'generating')
    expect(s.phase).toBe('done')
    setup.dispose()
  })
})
