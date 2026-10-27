import { cube3x3x3 } from 'cubing/puzzles'
import { describe, expect, it } from 'vitest'
import type { NewSolve } from '../api'
import { quatFromHold, slerp, type Hold } from '../cube/gyro'
import { MockConnection } from '../cube/mock'
import { CubeStore } from '../cube/store'
import { applyRotation } from './holds'
import { invert, simplify } from './notation'
import { ScrambleTracker } from './scramble-tracker'
import { SolveSession, inspectionPenalty, isSolved, type Exercise } from './session'
import { averageOf, effectiveTime, formatTime, rollingAverages } from './stats'

const kpuzzle = await cube3x3x3.kpuzzle()
const solved = kpuzzle.defaultPattern()
const flush = () => new Promise((r) => setTimeout(r, 0))

describe('notation', () => {
  it('simplifies same-face and opposite-face sequences', () => {
    expect(simplify(['R', 'R'])).toEqual(['R2'])
    expect(simplify(['R', "R'"])).toEqual([])
    expect(simplify(['R', 'L', 'R'])).toEqual(['R2', 'L'])
    expect(simplify(['U', 'R', "R'", 'U'])).toEqual(['U2'])
    expect(simplify(["R'", "R'", "R'"])).toEqual(['R'])
  })
  it('inverts', () => {
    expect(invert(['R', "U'", 'F2'])).toEqual(['F2', 'U', "R'"])
  })
})

describe('ScrambleTracker', () => {
  const scramble = "R U2 F'"

  function run(moves: string[]) {
    const tracker = new ScrambleTracker(scramble, solved)
    let p = solved
    let progress = tracker.progress
    for (const m of moves) {
      p = p.applyMove(m)
      progress = tracker.onMove(m, p)
    }
    return progress
  }

  it('follows the correct sequence', () => {
    expect(run([]).done).toBe(0)
    expect(run(['R']).done).toBe(1)
    expect(run(['R', 'U'])).toMatchObject({ done: 1, half: true, correction: [] })
    expect(run(['R', "U'"])).toMatchObject({ done: 1, half: true })
    expect(run(['R', 'U', 'U'])).toMatchObject({ done: 2, half: false })
    expect(run(['R', "U'", "U'", "F'"])).toMatchObject({ done: 3, complete: true })
  })

  it('shows a correction after a wrong move and recovers', () => {
    expect(run(['L'])).toMatchObject({ done: 0, correction: ["L'"], complete: false })
    expect(run(['L', 'D'])).toMatchObject({ correction: ["D'", "L'"] })
    expect(run(['R', 'F'])).toMatchObject({ done: 1, correction: ["F'"] })
    expect(run(['R', 'F', "F'"])).toMatchObject({ done: 1, correction: [] })
    expect(run(['R', 'F', "F'", 'U2'.slice(0, 1), 'U'])).toMatchObject({ done: 2 })
  })

  it('merges repeated wrong turns on the same face', () => {
    expect(run(["R'"])).toMatchObject({ correction: ['R'] })
    expect(run(["R'", "R'"])).toMatchObject({ correction: ['R2'] })
    // R' R' R' = R なので正しい1手目と同じ状態
    expect(run(["R'", "R'", "R'"])).toMatchObject({ done: 1, correction: [] })
  })

  it('is complete when the scramble is empty', () => {
    expect(new ScrambleTracker('', solved).progress.complete).toBe(true)
  })
})

describe('stats', () => {
  it('effectiveTime', () => {
    expect(effectiveTime(10000, '')).toBe(10000)
    expect(effectiveTime(10000, '+2')).toBe(12000)
    expect(effectiveTime(10000, 'DNF')).toBeNull()
  })
  it('averageOf follows WCA rules', () => {
    expect(averageOf([10000, 11000, 12000, 13000, 14000])).toBe(12000)
    expect(averageOf([10000, null, 12000, 13000, 14000])).toBe(13000)
    expect(averageOf([10000, null, null, 13000, 14000])).toBeNull()
    expect(averageOf([10001, 10002, 10006, 10000, 99999])).toBe(10000)
    expect(averageOf([1, 2])).toBeUndefined()
  })
  it('rollingAverages', () => {
    expect(rollingAverages([1000, 2000, 3000, 4000, 5000, 6000], 5)).toEqual([
      undefined, undefined, undefined, undefined, 3000, 4000,
    ])
  })
  it('formatTime', () => {
    expect(formatTime(12345)).toBe('12.34')
    expect(formatTime(12345, 3)).toBe('12.345')
    expect(formatTime(62345)).toBe('1:02.34')
    expect(formatTime(null)).toBe('DNF')
    expect(formatTime(undefined)).toBe('--')
  })
})

describe('inspectionPenalty', () => {
  it('follows WCA rules', () => {
    expect(inspectionPenalty(10_000)).toBe('')
    expect(inspectionPenalty(15_000)).toBe('')
    expect(inspectionPenalty(15_001)).toBe('+2')
    expect(inspectionPenalty(17_000)).toBe('+2')
    expect(inspectionPenalty(17_001)).toBe('DNF')
  })
})

describe('SolveSession with mock cube', () => {
  function setup(exercise: Partial<Exercise> = {}) {
    const store = new CubeStore(kpuzzle)
    const mock = new MockConnection(kpuzzle)
    store.attach(mock)
    const saved: NewSolve[] = []
    const scrambles = ["R U R'", 'F2']
    const session = new SolveSession(
      store,
      async () => ({
        mode: 'full',
        scramble: scrambles.shift() ?? 'U',
        isGoal: isSolved,
        ...exercise,
      }),
      (s) => saved.push(s),
    )
    return { store, mock, session, saved }
  }

  it('records gyro samples and the holds when enabled', async () => {
    const { store, mock, session, saved } = setup()
    const start: Hold = { bottom: 'white', front: 'red' }
    session.setGyro(start)
    await session.next()
    const qa = quatFromHold(start, 0.3)
    const qb = quatFromHold(applyRotation(start, 'y'), 0.3)
    // 3050〜3250 で y の持ち替え
    const q = (t: number) => (t < 3050 ? qa : t < 3250 ? slerp(qa, qb, (t - 3050) / 200) : qb)
    let g = 0
    const gyroUntil = (end: number) => {
      for (; g <= end; g += 90) store.handleEvent({ type: 'gyro', timestamp: g, q: q(g) })
    }
    let t = 1000
    const turn = (m: string) => {
      gyroUntil(t)
      mock.turn(m, { localTimestamp: t, cubeTimestamp: t * 2 })
      t += 200
    }
    turn('R')
    turn('U')
    turn("R'")
    // スクランブルが終わってから、しばらく見てから解く
    t = 3000
    turn('R')
    turn("U'")
    turn("R'")
    await flush()

    expect(saved).toHaveLength(1)
    const gyro = saved[0].gyro!
    // 着手（PC 時刻 3000、t=0）の 0.5 秒前から、t は回転ログと同じ基準
    expect(gyro[0][0]).toBeGreaterThanOrEqual(-500)
    expect(gyro[0][0]).toBeLessThan(-400)
    expect(gyro[gyro.length - 1][0]).toBeLessThanOrEqual(400)
    expect(saved[0].holds).toMatchObject({ start, changes: [{ rot: 'y', bottom: 'white', front: 'green' }] })
  })

  it('records no gyro when disabled', async () => {
    const { store, mock, session, saved } = setup()
    await session.next()
    let t = 1000
    for (const m of ['R', 'U', "R'", 'R', "U'", "R'"]) {
      store.handleEvent({ type: 'gyro', timestamp: t - 50, q: quatFromHold({ bottom: 'white', front: 'red' }) })
      mock.turn(m, { localTimestamp: t, cubeTimestamp: t * 2 })
      t += 200
    }
    await flush()
    expect(saved[0].gyro).toBeUndefined()
    expect(saved[0].holds).toBeUndefined()
  })

  it('scrambles, times, and saves a solve', async () => {
    const { mock, session, saved } = setup()
    await session.next()
    expect(session.getSnapshot().phase).toBe('scrambling')

    let t = 1000
    const turn = (m: string) => {
      mock.turn(m, { localTimestamp: t, cubeTimestamp: t * 2 })
      t += 200
    }
    turn('R')
    turn('U')
    turn("R'")
    expect(session.getSnapshot().phase).toBe('ready')

    // 解く：R U' R'
    turn('R')
    expect(session.getSnapshot()).toMatchObject({ phase: 'running', moveCount: 1 })
    turn("U'")
    turn("R'")
    await flush()

    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ mode: 'full', scramble: "R U R'", penalty: '' })
    expect(saved[0].moves!.map((m) => m.move)).toEqual(['R', "U'", "R'"])
    expect(saved[0].moves!.map((m) => m.t)).toEqual([0, 200, 400])
    expect(saved[0].total_ms).toBe(400)
    // 次の出題へ
    expect(session.getSnapshot()).toMatchObject({ phase: 'scrambling', exercise: { scramble: 'F2' } })
  })

  it('uses the scramble as is when the cube is solved', async () => {
    const { session } = setup({ scramble: "R U F'" })
    await session.next()
    expect(session.getSnapshot().progress!.moves).toEqual(['R', 'U', "F'"])
  })

  it('scrambles from an unsolved cube to the same state as the scramble from solved', async () => {
    const { store, mock, session, saved } = setup({ scramble: "R U F'" })
    mock.turn('L')
    mock.turn('D2')
    await session.next()
    const { phase, progress } = session.getSnapshot()
    expect(phase).toBe('scrambling')
    for (const m of progress!.moves) mock.turn(m)
    expect(session.getSnapshot().phase).toBe('ready')
    const target = kpuzzle.defaultPattern().applyAlg("R U F'")
    expect(store.getSnapshot().pattern.isIdentical(target)).toBe(true)

    // 記録には完成状態からのスクランブルを残す
    for (const m of ['F', "U'", "R'"]) mock.turn(m)
    await flush()
    expect(saved[0]).toMatchObject({ scramble: "R U F'" })
  })

  it('makes the scramble again from the new state if the cube is turned while generating', async () => {
    const { store, mock, session } = setup({ scramble: "R U F'" })
    mock.turn('L')
    const pending = session.next()
    mock.turn('B')
    await pending
    await flush()
    const { phase, progress } = session.getSnapshot()
    expect(phase).toBe('scrambling')
    for (const m of progress!.moves) mock.turn(m)
    expect(session.getSnapshot().phase).toBe('ready')
    expect(store.getSnapshot().pattern.isIdentical(kpuzzle.defaultPattern().applyAlg("R U F'"))).toBe(true)
  })

  it('records readyAt and applies no penalty for a quick start with inspection on', async () => {
    const { session, mock, saved } = setup({ scramble: 'R' })
    session.setInspection(true)
    await session.next()
    mock.turn('R')
    expect(session.getSnapshot()).toMatchObject({ phase: 'ready', inspection: true })
    expect(session.getSnapshot().readyAt).not.toBeNull()
    mock.turn("R'")
    await flush()
    expect(saved[0].penalty).toBe('')
  })

  it('forceReady skips scramble tracking', async () => {
    const { session, mock } = setup()
    await session.next()
    session.forceReady()
    expect(session.getSnapshot().phase).toBe('ready')
    mock.turn('U')
    expect(session.getSnapshot().phase).toBe('running')
  })
})
