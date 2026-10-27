// キューブ状態のストア。接続（実機／モック）からのイベントを受け、現在の状態・回転ログ・バッテリーを保持する。
// React からは useSyncExternalStore で購読する（hooks.ts）。

import type { KPattern, KPuzzle } from 'cubing/kpuzzle'
import { Emitter, type CubeConnection, type CubeEvent, type CubeMove } from './connection'
import type { Quat } from './gyro'
import { SOLVED_FACELETS, faceletsToPattern, patternToFacelets } from './facelets'

/** ログに残す1手。receivedAt はストアが受け取ったPC時刻。 */
export type LoggedMove = CubeMove & { receivedAt: number }

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected'

/** ジャイロ：active＝届いている、none＝届いていない、unsupported＝届いたが使えないキューブ。 */
export type GyroStatus = 'none' | 'active' | 'unsupported'

/** ジャイロの1サンプル。timestamp は PC 側の時刻（performance.now() 基準）。 */
export type GyroReading = { timestamp: number; q: Quat }

export type CubeState = {
  status: ConnectionStatus
  /** 接続処理中のメッセージ（MAC取得中など）。 */
  statusMessage: string | null
  error: string | null
  connection: CubeConnection | null
  battery: number | null
  /** アプリ側で追跡している現在の状態。 */
  pattern: KPattern
  facelets: string
  /** 最後に実機から受け取ったfacelets。 */
  deviceFacelets: string | null
  /** 実機のfaceletsと追跡状態がズレていたため、実機側に合わせ直した回数。 */
  resyncCount: number
  /** 接続（またはリセット）以降の回転ログ。 */
  moves: LoggedMove[]
  gyro: GyroStatus
  /** MACアドレスの入力待ち。 */
  macRequest: { deviceName: string } | null
}

/** 3D表示への指示。move は1手のアニメーション、replace は状態の丸ごと置き換え。 */
export type ViewUpdate = { type: 'move'; move: string } | { type: 'replace'; pattern: KPattern }

const MAX_LOGGED_MOVES = 2000
const BATTERY_POLL_MS = 60_000
/** ジャイロのデータがこれだけ届かなければ「届いていない」にする。 */
const GYRO_STALE_MS = 2_000

export class CubeStore {
  readonly kpuzzle: KPuzzle
  readonly view = new Emitter<ViewUpdate>()
  /** 回転ごとに通知する（Phase 2以降のタイマー等が購読する）。 */
  readonly moves = new Emitter<{ move: LoggedMove; pattern: KPattern }>()
  /** ジャイロのサンプルごとに通知する（約 11 回/秒。state には入れず、再描画させない）。 */
  readonly gyro = new Emitter<GyroReading>()

  private state: CubeState
  private listeners = new Set<() => void>()
  private unsubscribe: (() => void) | null = null
  private batteryTimer: ReturnType<typeof setInterval> | null = null
  private gyroTimer: ReturnType<typeof setInterval> | null = null
  private lastGyroAt = 0
  private macResolver: ((mac: string | null) => void) | null = null

  constructor(kpuzzle: KPuzzle) {
    this.kpuzzle = kpuzzle
    const solved = kpuzzle.defaultPattern()
    this.state = {
      status: 'disconnected',
      statusMessage: null,
      error: null,
      connection: null,
      battery: null,
      pattern: solved,
      facelets: SOLVED_FACELETS,
      deviceFacelets: null,
      resyncCount: 0,
      moves: [],
      gyro: 'none',
      macRequest: null,
    }
  }

  // --- useSyncExternalStore 用 ---

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): CubeState => this.state

  private set(patch: Partial<CubeState>) {
    this.state = { ...this.state, ...patch }
    for (const l of this.listeners) l()
  }

  // --- 接続 ---

  /** 実機に接続する。connect は接続処理（Bluetooth等）を行い CubeConnection を返す関数。 */
  async connectWith(connect: () => Promise<CubeConnection>) {
    if (this.state.status !== 'disconnected') return
    this.set({ status: 'connecting', error: null, statusMessage: null })
    try {
      const conn = await connect()
      this.attach(conn)
    } catch (err) {
      this.set({
        status: 'disconnected',
        statusMessage: null,
        macRequest: null,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  /** 接続済みの CubeConnection を取り付ける。 */
  attach(conn: CubeConnection) {
    this.detach()
    this.unsubscribe = conn.subscribe((e) => this.handleEvent(e))
    this.set({
      status: 'connected',
      statusMessage: null,
      error: null,
      connection: conn,
      battery: null,
      deviceFacelets: null,
      resyncCount: 0,
      moves: [],
      gyro: 'none',
      macRequest: null,
    })
    this.gyroTimer = setInterval(() => {
      if (this.state.gyro === 'active' && performance.now() - this.lastGyroAt > GYRO_STALE_MS) this.set({ gyro: 'none' })
    }, 1000)
    const report = (err: unknown) => this.set({ error: err instanceof Error ? err.message : String(err) })
    if (conn.capabilities.facelets) conn.requestFacelets().catch(report)
    if (conn.capabilities.battery) {
      conn.requestBattery().catch(report)
      this.batteryTimer = setInterval(() => conn.requestBattery().catch(report), BATTERY_POLL_MS)
    }
  }

  async disconnect() {
    const conn = this.state.connection
    this.detach()
    this.set({ status: 'disconnected', connection: null, battery: null, gyro: 'none' })
    await conn?.disconnect().catch(() => {})
  }

  private detach() {
    this.unsubscribe?.()
    this.unsubscribe = null
    if (this.batteryTimer) clearInterval(this.batteryTimer)
    this.batteryTimer = null
    if (this.gyroTimer) clearInterval(this.gyroTimer)
    this.gyroTimer = null
  }

  /** 実機の状態を取り直す。 */
  async requestFacelets() {
    await this.state.connection?.requestFacelets()
  }

  /** 実機が完成状態のときに押す「状態リセット」。実機とアプリの状態を完成状態にそろえる。 */
  async resetState() {
    const conn = this.state.connection
    if (conn?.capabilities.reset) {
      await conn.reset()
    }
    const solved = this.kpuzzle.defaultPattern()
    this.set({ pattern: solved, facelets: SOLVED_FACELETS, deviceFacelets: null, moves: [], resyncCount: 0 })
    this.view.emit({ type: 'replace', pattern: solved })
  }

  // --- MACアドレス入力 ---

  /** Bluetooth接続処理から呼ばれ、UIでMACアドレスが入力されるまで待つ。 */
  requestMac(deviceName: string): Promise<string | null> {
    this.macResolver?.(null)
    return new Promise((resolve) => {
      this.macResolver = resolve
      this.set({ macRequest: { deviceName } })
    })
  }

  submitMac(mac: string | null) {
    const resolve = this.macResolver
    this.macResolver = null
    this.set({ macRequest: null })
    resolve?.(mac)
  }

  clearError() {
    this.set({ error: null })
  }

  setStatusMessage(message: string | null) {
    this.set({ statusMessage: message })
  }

  // --- イベント処理 ---

  handleEvent(e: CubeEvent) {
    switch (e.type) {
      case 'move':
        this.applyMove(e)
        break
      case 'facelets':
        this.applyFacelets(e.facelets)
        break
      case 'battery':
        this.set({ battery: e.level })
        break
      case 'gyro':
        this.lastGyroAt = performance.now()
        if (this.state.gyro !== 'active') this.set({ gyro: 'active' })
        this.gyro.emit({ timestamp: e.timestamp, q: e.q })
        break
      case 'gyro-unsupported':
        this.set({ gyro: 'unsupported' })
        break
      case 'disconnect':
        this.detach()
        this.set({ status: 'disconnected', connection: null, battery: null, gyro: 'none', error: '接続が切れました' })
        break
    }
  }

  private applyMove(m: CubeMove) {
    let pattern: KPattern
    try {
      pattern = this.state.pattern.applyMove(m.move)
    } catch {
      this.set({ error: `不明な回転: ${m.move}` })
      return
    }
    const logged: LoggedMove = {
      move: m.move,
      localTimestamp: m.localTimestamp,
      cubeTimestamp: m.cubeTimestamp,
      receivedAt: performance.now(),
    }
    const moves = this.state.moves.length >= MAX_LOGGED_MOVES
      ? [...this.state.moves.slice(-MAX_LOGGED_MOVES + 1), logged]
      : [...this.state.moves, logged]
    this.set({ pattern, facelets: patternToFacelets(pattern), moves })
    this.view.emit({ type: 'move', move: m.move })
    this.moves.emit({ move: logged, pattern })
  }

  private applyFacelets(facelets: string) {
    const pattern = faceletsToPattern(this.kpuzzle, facelets)
    if (!pattern) {
      this.set({ deviceFacelets: facelets, error: `実機から不正なfaceletsを受信しました: ${facelets}` })
      return
    }
    if (pattern.isIdentical(this.state.pattern)) {
      this.set({ deviceFacelets: facelets })
      return
    }
    // 実機の状態を正とする。
    this.set({
      deviceFacelets: facelets,
      pattern,
      facelets,
      resyncCount: this.state.resyncCount + 1,
    })
    this.view.emit({ type: 'replace', pattern })
  }
}

let storePromise: Promise<CubeStore> | null = null

/** アプリ全体で1つのストアを返す（3x3のKPuzzle読み込みは非同期）。 */
export function getCubeStore(): Promise<CubeStore> {
  storePromise ??= import('cubing/puzzles')
    .then(({ cube3x3x3 }) => cube3x3x3.kpuzzle())
    .then((kpuzzle) => new CubeStore(kpuzzle))
  return storePromise
}
