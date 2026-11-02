import { cube3x3x3 } from 'cubing/puzzles'
import { describe, expect, it } from 'vitest'
import type { NewSolve } from '../api'
import { MockConnection } from '../cube/mock'
import { CubeStore } from '../cube/store'
import { SolveSession, isSolved } from '../solve/session'
import { LiveFeed } from './feed'
import type { LiveEvent, LiveMessage } from './protocol'
import { LiveQueue, startLivePublish } from './publisher'

const kpuzzle = await cube3x3x3.kpuzzle()
const flush = () => new Promise((r) => setTimeout(r, 0))

/** 送るたびに呼び出しを残し、resolve するまで返さない POST。 */
function manualPost() {
  const calls: { events: LiveEvent[]; resolve: () => void; reject: () => void }[] = []
  const post = (events: LiveEvent[]) =>
    new Promise<void>((resolve, reject) => {
      calls.push({ events, resolve, reject: () => reject(new Error('fail')) })
    })
  return { calls, post }
}

const move = (m: string): LiveEvent => ({ type: 'move', move: m, facelets: 'x' })
const session = (n: number): LiveEvent => ({ type: 'session', session: { move_count: n } as never })

describe('LiveQueue', () => {
  it('sends one request at a time and batches what piles up', async () => {
    const { calls, post } = manualPost()
    const q = new LiveQueue(() => [], post)
    q.push(move('R'))
    q.push(move('U'))
    q.push(session(1))
    q.push(session(2))
    expect(calls.map((c) => c.events)).toEqual([[move('R')]])
    calls[0].resolve()
    await flush()
    // タイマーの状態は最新の1つだけ
    expect(calls[1].events).toEqual([move('U'), session(2)])
  })

  it('resends the whole state after a failure', async () => {
    const { calls, post } = manualPost()
    const snap: LiveEvent[] = [{ type: 'main', cube: 'connected' }]
    const q = new LiveQueue(() => snap, post)
    q.push(move('R'))
    calls[0].reject()
    await flush()
    q.push(move('U'))
    expect(calls[1].events).toEqual(snap)
    calls[1].resolve()
    await flush()
    q.push(move('F'))
    expect(calls[2].events).toEqual([move('F')])
  })

  it('sends a heartbeat when idle and bye on stop', async () => {
    const { calls, post } = manualPost()
    const q = new LiveQueue(() => [], post)
    q.heartbeat()
    expect(calls[0].events).toEqual([])
    calls[0].resolve()
    await flush()
    q.stop()
    q.push(move('R'))
    expect(calls.slice(1).map((c) => c.events)).toEqual([[{ type: 'bye' }]])
  })
})

/** サーバー（internal/live）と同じように、メインの出来事を見る側の出来事にする。 */
function relay(e: LiveEvent): LiveMessage {
  switch (e.type) {
    case 'main':
      return { type: 'main', online: true, cube: e.cube }
    case 'bye':
      return { type: 'main', online: false }
    default:
      return e
  }
}

describe('mirroring the timer to another browser', () => {
  it('shows the same cube and timer as the main', async () => {
    const main = new CubeStore(kpuzzle)
    const mock = new MockConnection(kpuzzle)
    main.attach(mock)
    const solves: NewSolve[] = []
    const scrambles = ["R U R'"]
    const timer = new SolveSession(
      main,
      async () => ({ mode: 'full', scramble: scrambles.shift() ?? 'F2', isGoal: isSolved }),
      (s) => solves.push(s),
    )
    await timer.next()

    const viewer = new CubeStore(kpuzzle)
    const feed = new LiveFeed(viewer)
    feed.handle({ type: 'snapshot', online: false }, 0)
    const stop = startLivePublish(
      main,
      timer,
      () => undefined,
      async (events) => {
        events.forEach((e) => feed.handle(relay(e), performance.now()))
      },
    )
    await flush()
    expect(feed.getSnapshot()).toMatchObject({ online: true, cube: 'connected' })
    expect(feed.getSnapshot().session).toMatchObject({ phase: 'scrambling', exercise: { scramble: "R U R'" } })

    for (const m of ['R', 'U', "R'"]) {
      mock.turn(m)
      await flush()
    }
    expect(viewer.getSnapshot().facelets).toBe(main.getSnapshot().facelets)
    expect(feed.getSnapshot().session?.phase).toBe('ready')

    mock.turn('R')
    await flush()
    const running = feed.getSnapshot().session!
    expect(running).toMatchObject({ phase: 'running', moveCount: 1 })
    // 計測を始めた時刻は、この端末の時計に置き直してある
    expect(Math.abs(running.startedAt! - timer.getSnapshot().startedAt!)).toBeLessThan(50)

    for (const m of ["U'", "R'"]) {
      mock.turn(m)
      await flush()
    }
    expect(solves).toHaveLength(1)
    await flush()
    expect(viewer.getSnapshot().facelets).toBe(main.getSnapshot().facelets)
    const after = feed.getSnapshot()
    expect(after.session?.last).toMatchObject({ total_ms: solves[0].total_ms, solved_at: solves[0].solved_at })
    expect(after.lastMoveCount).toBe(3)

    stop()
    await flush()
    expect(feed.getSnapshot().online).toBe(false)
    timer.dispose()
  })

  it('shifts the timer by the age of a snapshot', () => {
    const feed = new LiveFeed(new CubeStore(kpuzzle))
    feed.handle(
      {
        type: 'snapshot',
        online: true,
        cube: 'connected',
        session: {
          phase: 'running',
          scramble: 'R',
          label: null,
          progress: null,
          inspection: true,
          inspection_penalty: '',
          move_count: 5,
          started_ago_ms: 2000,
          ready_ago_ms: 5000,
          last: null,
          error: null,
        },
        age_ms: 1000,
      },
      10_000,
    )
    expect(feed.getSnapshot().session).toMatchObject({ startedAt: 7000, readyAt: 4000, moveCount: 5 })
  })
})
