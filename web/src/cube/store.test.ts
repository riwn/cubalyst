import { cube3x3x3 } from 'cubing/puzzles'
import { describe, expect, it, vi } from 'vitest'
import { normalizeMac } from './bluetooth'
import type { CubeEvent } from './connection'
import { SOLVED_FACELETS, patternToFacelets } from './facelets'
import { MockConnection, parseMoveLog } from './mock'
import { CubeStore, type ViewUpdate } from './store'
import { fitTimestamps } from './timestamps'

const kpuzzle = await cube3x3x3.kpuzzle()
const flush = () => new Promise((r) => setTimeout(r, 0))

function connectedStore() {
  const store = new CubeStore(kpuzzle)
  const mock = new MockConnection(kpuzzle)
  store.attach(mock)
  return { store, mock }
}

describe('CubeStore with MockConnection', () => {
  it('requests facelets and battery on attach', async () => {
    const { store } = connectedStore()
    await flush()
    const s = store.getSnapshot()
    expect(s.status).toBe('connected')
    expect(s.battery).toBe(100)
    expect(s.deviceFacelets).toBe(SOLVED_FACELETS)
    expect(s.resyncCount).toBe(0)
  })

  it('tracks moves and returns to solved after the inverse', () => {
    const { store, mock } = connectedStore()
    const views: ViewUpdate[] = []
    store.view.subscribe((u) => views.push(u))
    const sexy = ['R', 'U', "R'", "U'"]
    for (let i = 0; i < 6; i++) sexy.forEach((m) => mock.turn(m))
    const s = store.getSnapshot()
    expect(s.moves).toHaveLength(24)
    expect(s.facelets).toBe(SOLVED_FACELETS)
    expect(views.every((v) => v.type === 'move')).toBe(true)
  })

  it('logs both timestamps for each move', () => {
    const { store, mock } = connectedStore()
    mock.turn('R', { localTimestamp: 1000, cubeTimestamp: 5000 })
    expect(store.getSnapshot().moves[0]).toMatchObject({ move: 'R', localTimestamp: 1000, cubeTimestamp: 5000 })
  })

  it('resyncs to device facelets when they differ', () => {
    const { store } = connectedStore()
    const views: ViewUpdate[] = []
    store.view.subscribe((u) => views.push(u))
    const device = patternToFacelets(kpuzzle.defaultPattern().applyAlg("F R U'"))
    store.handleEvent({ type: 'facelets', facelets: device })
    const s = store.getSnapshot()
    expect(s.facelets).toBe(device)
    expect(s.resyncCount).toBe(1)
    expect(views).toEqual([{ type: 'replace', pattern: s.pattern }])
  })

  it('reports invalid facelets without changing state', () => {
    const { store } = connectedStore()
    store.handleEvent({ type: 'facelets', facelets: 'X'.repeat(54) })
    const s = store.getSnapshot()
    expect(s.error).toMatch(/不正なfacelets/)
    expect(s.facelets).toBe(SOLVED_FACELETS)
  })

  it('resetState returns to solved and clears the log', async () => {
    const { store, mock } = connectedStore()
    mock.turn('R')
    mock.turn('U')
    await store.resetState()
    const s = store.getSnapshot()
    expect(s.facelets).toBe(SOLVED_FACELETS)
    expect(s.moves).toHaveLength(0)
    // モック側も完成状態になっている
    await store.requestFacelets()
    await flush()
    expect(store.getSnapshot().resyncCount).toBe(0)
  })

  it('goes to disconnected on disconnect event', async () => {
    const { store, mock } = connectedStore()
    await mock.disconnect()
    expect(store.getSnapshot().status).toBe('disconnected')
    expect(store.getSnapshot().connection).toBeNull()
  })
})

describe('MockConnection.replay', () => {
  it('replays moves with recorded intervals', () => {
    vi.useFakeTimers()
    try {
      const mock = new MockConnection(kpuzzle, { now: () => 0 })
      const events: CubeEvent[] = []
      mock.subscribe((e) => events.push(e))
      const done = vi.fn()
      mock.replay(
        [
          { move: 'R', localTimestamp: null, cubeTimestamp: 1000 },
          { move: 'U', localTimestamp: null, cubeTimestamp: 1200 },
          { move: "R'", localTimestamp: null, cubeTimestamp: 1600 },
        ],
        2,
        done,
      )
      vi.advanceTimersByTime(0)
      expect(events.map((e) => e.type === 'move' && e.move)).toEqual(['R'])
      vi.advanceTimersByTime(100)
      expect(events).toHaveLength(2)
      vi.advanceTimersByTime(199)
      expect(events).toHaveLength(2)
      vi.advanceTimersByTime(1)
      expect(events).toHaveLength(3)
      expect(done).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('parseMoveLog', () => {
  it('parses notation and expands double turns', () => {
    expect(parseMoveLog("R U2 R'").map((m) => m.move)).toEqual(['R', 'U', 'U', "R'"])
  })
  it('parses JSON objects', () => {
    expect(parseMoveLog('[{"move":"R","cubeTimestamp":10,"localTimestamp":20}]')).toEqual([
      { move: 'R', cubeTimestamp: 10, localTimestamp: 20 },
    ])
  })
  it('parses JSON string arrays', () => {
    expect(parseMoveLog('["R","U\'"]').map((m) => m.move)).toEqual(['R', "U'"])
  })
  it('rejects unknown moves', () => {
    expect(() => parseMoveLog('R X')).toThrow(/不明な回転/)
  })
})

describe('normalizeMac', () => {
  it('normalizes various formats', () => {
    expect(normalizeMac('ab:cd:ef:01:23:45')).toBe('AB:CD:EF:01:23:45')
    expect(normalizeMac('AB-CD-EF-01-23-45')).toBe('AB:CD:EF:01:23:45')
    expect(normalizeMac('abcdef012345')).toBe('AB:CD:EF:01:23:45')
    expect(normalizeMac('abcdef01234')).toBeNull()
  })
})

describe('fitTimestamps', () => {
  it('corrects a skewed cube clock to host scale', () => {
    // キューブ時計がPCより1%速い
    const moves = [0, 300, 700, 1000, 1500].map((t, i) => ({
      move: 'R',
      localTimestamp: 10_000 + t,
      cubeTimestamp: 50_000 + Math.round(t * 1.01),
      i,
    }))
    const fitted = fitTimestamps(moves)
    expect(fitted.map((m) => m.fittedTimestamp)).toEqual([0, 300, 700, 1000, 1500])
  })
  it('falls back to host timestamps without cube clock', () => {
    const fitted = fitTimestamps([
      { move: 'R', localTimestamp: 100, cubeTimestamp: null },
      { move: 'U', localTimestamp: 350, cubeTimestamp: null },
    ])
    expect(fitted.map((m) => m.fittedTimestamp)).toEqual([0, 250])
  })
})
