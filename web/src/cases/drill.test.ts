import { cube3x3x3 } from 'cubing/puzzles'
import { describe, expect, it } from 'vitest'
import { holdFrame, holdRotation } from '../cube/orientation'
import { MockConnection } from '../cube/mock'
import { CubeStore } from '../cube/store'
import { AlgDrill, quarterLength, type DrillEvent } from './drill'
import { scrambleFor } from './exercise'
import { invertRotation, normalizeOrientation } from './geometry'

const kpuzzle = await cube3x3x3.kpuzzle()
const solved = kpuzzle.defaultPattern()

const TPERM = "R U R' U' R' F R2 U' R' U' R U R' F'"
const UA = "M2 U M U2 M' U M2"

/** 持ち方（白下・赤前）の記号の外層回転を、キューブ自身の向きの90度回転に直す。 */
function toCubeMoves(alg: string): string[] {
  const frame = holdFrame('white', 'red')!
  const inv = Object.fromEntries(Object.entries(frame).map(([k, v]) => [v, k]))
  return alg
    .split(' ')
    .map((m) => inv[m[0]] + m.slice(1))
    .flatMap((m) => (m.includes('2') ? [m[0], m[0]] : [m]))
}

function setup(alg: string) {
  const store = new CubeStore(kpuzzle)
  const mock = new MockConnection(kpuzzle)
  store.attach(mock)
  const rotation = holdRotation(solved, 'white', 'red')
  const drill = new AlgDrill(store, alg, rotation)
  const events: DrillEvent[] = []
  drill.events.subscribe((e) => events.push(e))
  let t = 1000
  const turn = (m: string, gap = 100) => {
    t += gap
    mock.turn(m, { localTimestamp: t, cubeTimestamp: t })
  }
  return { store, mock, drill, events, turn, rotation }
}

describe('AlgDrill', () => {
  it('counts each execution, repeatedly, even after unrelated moves', () => {
    const { events, turn } = setup(TPERM)
    // 揃っていない状態で、関係ない手を回してから始める
    turn('F')
    turn('D')
    turn('B')
    const moves = toCubeMoves(TPERM)
    for (let i = 0; i < 3; i++) moves.forEach((m) => turn(m))
    expect(events).toHaveLength(3)
    // 1回分は手順の手だけ（関係ない手は含まない）
    expect(events[0].attempt.moves).toHaveLength(moves.length)
    expect(events[0].attempt.ms).toBe((moves.length - 1) * 100)
  })

  it('accepts AUF before and after the algorithm', () => {
    const { events, turn } = setup(TPERM)
    toCubeMoves(`U ${TPERM} U2`).forEach((m) => turn(m))
    expect(events).toHaveLength(1)
  })

  it('accepts the algorithm performed on another face (y)', () => {
    const { events, turn } = setup(TPERM)
    // y で持ち替えて行った T パーム（持ち方の記号で R→B, F→R …）
    const yTperm = "B U B' U' B' R B2 U' B' U' B U B' R'"
    toCubeMoves(yTperm).forEach((m) => turn(m))
    expect(events).toHaveLength(1)
  })

  it('accepts algorithms with slice moves (state-based)', async () => {
    const { events, turn, store, rotation } = setup(UA)
    const start = store.getSnapshot().pattern
    const target = normalizeOrientation(kpuzzle, start.applyAlg(`${rotation} ${UA} ${invertRotation(rotation)}`))
    const outer = await scrambleFor(target)
    outer
      .split(' ')
      .flatMap((m) => (m.includes('2') ? [m[0], m[0]] : [m]))
      .forEach((m) => turn(m))
    expect(events).toHaveLength(1)
  }, 60_000)

  it('ignores moves before a long pause', () => {
    const { events, turn, drill } = setup(TPERM)
    const moves = toCubeMoves(TPERM)
    turn(moves[0])
    turn(moves[1])
    // 長い間のあとに最初から回し直す（前の2手を戻してから）
    turn(moves[1].endsWith("'") ? moves[1][0] : `${moves[1]}'`, 4000)
    turn(moves[0].endsWith("'") ? moves[0][0] : `${moves[0]}'`)
    expect(drill.getSnapshot().moveCount).toBe(2)
    moves.forEach((m) => turn(m))
    expect(events).toHaveLength(1)
  })

  it('does not count random moves', () => {
    const { events, turn } = setup(TPERM)
    for (let i = 0; i < 80; i++) turn('RUFLDB'[(i * 7) % 6])
    expect(events).toHaveLength(0)
  })

  it('quarterLength', () => {
    expect(quarterLength("R U2 R'")).toBe(4)
  })
})
