// メイン（キューブをつないだタイマー画面）から、中継のサーバーへ出来事を送る。
//
// 送る順番を崩さないよう、一度に1つの POST だけを送り、その間に溜まった出来事はまとめて次に送る。
// 送れなかったときは捨て、次に送るときに今の状態を丸ごと送り直す（見る側はそれで合わせ直す）。

import type { NewSolve } from '../api'
import type { CubeStore } from '../cube/store'
import type { Split } from '../solve/cfop'
import type { SolveSession } from '../solve/session'
import { toLiveSession, type LiveEvent } from './protocol'

const ENDPOINT = '/api/live/events'
/** 何もなくても送る間隔。サーバーは40秒届かなければメインがいなくなったとみなす。 */
const HEARTBEAT_MS = 15_000

export type PostEvents = (events: LiveEvent[]) => Promise<void>

async function postEvents(events: LiveEvent[]): Promise<void> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events }),
    keepalive: true,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

/** 出来事を順に送る列。snapshot は、送り直すときの今の状態。 */
export class LiveQueue {
  private queue: LiveEvent[] = []
  private sending = false
  private resync = false
  private stopped = false
  private readonly post: PostEvents
  private readonly snapshot: () => LiveEvent[]

  constructor(snapshot: () => LiveEvent[], post: PostEvents = postEvents) {
    this.snapshot = snapshot
    this.post = post
  }

  push(e: LiveEvent) {
    if (this.stopped) return
    // タイマーの状態は最新の1つだけ送れば足りる
    if (e.type === 'session') this.queue = this.queue.filter((q) => q.type !== 'session')
    this.queue.push(e)
    void this.flush()
  }

  /** 何もなくても送る（生きている知らせ）。送っている途中なら、それで足りる。 */
  heartbeat() {
    if (!this.stopped && !this.sending) void this.flush(true)
  }

  /** 止める。最後に bye を送る。 */
  stop() {
    if (this.stopped) return
    this.queue.push({ type: 'bye' })
    void this.flush()
    this.stopped = true
  }

  private async flush(force = false) {
    if (this.sending) return
    this.sending = true
    try {
      while (this.queue.length > 0 || force) {
        force = false
        const batch = this.queue
        this.queue = []
        const events = this.resync ? [...this.snapshot(), ...batch.filter((e) => e.type === 'bye')] : batch
        try {
          await this.post(events)
          this.resync = false
        } catch {
          this.resync = !this.stopped
        }
      }
    } finally {
      this.sending = false
    }
  }
}

/**
 * キューブとタイマーの出来事を中継のサーバーへ送り始める。戻り値で止める（bye を送る）。
 * splitsOf は直前のソルブの段階（画面に出している分）を返す。
 */
export function startLivePublish(
  store: CubeStore,
  session: SolveSession,
  splitsOf: (last: NewSolve) => Split[] | undefined,
  post?: PostEvents,
): () => void {
  const sessionEvent = (): LiveEvent => {
    const state = session.getSnapshot()
    return {
      type: 'session',
      session: toLiveSession(state, performance.now(), state.last ? splitsOf(state.last) : undefined),
    }
  }
  const snapshot = (): LiveEvent[] => {
    const cube = store.getSnapshot()
    return [{ type: 'main', cube: cube.status }, { type: 'facelets', facelets: cube.facelets }, sessionEvent()]
  }
  const queue = new LiveQueue(snapshot, post)
  snapshot().forEach((e) => queue.push(e))

  let status = store.getSnapshot().status
  const unsubscribes = [
    store.moves.subscribe(({ move }) =>
      queue.push({
        type: 'move',
        move: move.move,
        facelets: store.getSnapshot().facelets,
      }),
    ),
    store.view.subscribe((u) => {
      if (u.type === 'replace')
        queue.push({
          type: 'facelets',
          facelets: store.getSnapshot().facelets,
        })
    }),
    store.subscribe(() => {
      const next = store.getSnapshot().status
      if (next !== status) {
        status = next
        queue.push({ type: 'main', cube: next })
      }
    }),
    session.subscribe(() => queue.push(sessionEvent())),
  ]
  const timer = setInterval(() => queue.heartbeat(), HEARTBEAT_MS)
  // タブを閉じたときは fetch が間に合わないことがあるので sendBeacon で知らせる
  const onPageHide = () => {
    navigator.sendBeacon?.(
      ENDPOINT,
      new Blob([JSON.stringify({ events: [{ type: 'bye' }] })], {
        type: 'application/json',
      }),
    )
  }
  // 戻る・進むでページが戻ってきたら、今の状態を送り直す
  const onPageShow = (e: PageTransitionEvent) => {
    if (e.persisted) snapshot().forEach((ev) => queue.push(ev))
  }
  const win = typeof window === 'undefined' ? null : window // テスト（Node）には無い
  win?.addEventListener('pagehide', onPageHide)
  win?.addEventListener('pageshow', onPageShow)

  return () => {
    unsubscribes.forEach((u) => u())
    clearInterval(timer)
    win?.removeEventListener('pagehide', onPageHide)
    win?.removeEventListener('pageshow', onPageShow)
    queue.stop()
  }
}
