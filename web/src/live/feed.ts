// 見る側：中継のサーバー（SSE）から受け取った出来事を、この端末のキューブのストアとタイマーの状態に映す。

import type { CubeStore, ConnectionStatus } from '../cube/store'
import type { SessionState } from '../solve/session'
import { fromLiveSession, type LiveMessage } from './protocol'

const ENDPOINT = '/api/live/stream'

export type LiveView = {
  /** サーバーとの接続。error のときは EventSource がつなぎ直している。 */
  stream: 'connecting' | 'open' | 'error'
  /** メイン（キューブをつないだタイマー画面）がいるか。 */
  online: boolean
  /** メインのキューブの接続の状態。 */
  cube: ConnectionStatus | null
  /** メインのタイマーの状態（この端末の時計に置き直したもの）。 */
  session: SessionState | null
  /** 直前のソルブの手数。 */
  lastMoveCount: number
}

export class LiveFeed {
  private view: LiveView = {
    stream: 'connecting',
    online: false,
    cube: null,
    session: null,
    lastMoveCount: 0,
  }
  private listeners = new Set<() => void>()
  private source: EventSource | null = null
  private readonly store: CubeStore

  constructor(store: CubeStore) {
    this.store = store
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): LiveView => this.view

  private set(patch: Partial<LiveView>) {
    this.view = { ...this.view, ...patch }
    for (const l of this.listeners) l()
  }

  start() {
    if (this.source) return
    const source = new EventSource(ENDPOINT)
    this.source = source
    source.onopen = () => this.set({ stream: 'open' })
    source.onerror = () => this.set({ stream: 'error' })
    source.onmessage = (e: MessageEvent<string>) => {
      let msg: LiveMessage
      try {
        msg = JSON.parse(e.data) as LiveMessage
      } catch {
        return
      }
      this.handle(msg, performance.now())
    }
  }

  stop() {
    this.source?.close()
    this.source = null
  }

  /** 1つの出来事を映す。now は受け取った時刻（performance.now() 基準）。 */
  handle(msg: LiveMessage, now: number) {
    switch (msg.type) {
      case 'snapshot':
        if (msg.facelets) this.store.handleEvent({ type: 'facelets', facelets: msg.facelets })
        this.set({
          online: msg.online,
          cube: msg.cube ?? null,
          ...(msg.session ? this.sessionPatch(msg.session, now - (msg.age_ms ?? 0)) : { session: null }),
        })
        break
      case 'ping':
        if (msg.online !== this.view.online) this.set({ online: msg.online })
        break
      case 'main':
        this.set({ online: msg.online, cube: msg.cube ?? this.view.cube })
        break
      case 'move':
        this.store.handleEvent({
          type: 'move',
          move: msg.move,
          localTimestamp: null,
          cubeTimestamp: null,
        })
        // 回したあとの状態と比べ、ずれていたら合わせ直す（途中の出来事を取りこぼしたときなど）
        this.store.handleEvent({ type: 'facelets', facelets: msg.facelets })
        break
      case 'facelets':
        this.store.handleEvent({ type: 'facelets', facelets: msg.facelets })
        break
      case 'session':
        this.set(this.sessionPatch(msg.session, now))
        break
    }
  }

  private sessionPatch(s: Parameters<typeof fromLiveSession>[0], now: number): Partial<LiveView> {
    return {
      session: fromLiveSession(s, now),
      lastMoveCount: s.last?.move_count ?? 0,
    }
  }
}
