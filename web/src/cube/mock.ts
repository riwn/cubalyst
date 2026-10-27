// モック接続。実機なしで回転イベントを流すためのもの。
// - turn(): ボタン／キーボードから1手ずつ回す
// - replay(): 回転ログ（JSON）を記録時の間隔どおりに再生する
// - setGyro() / rotateHold(): ジャイロのデータを流す（約 11 回/秒）、持ち替える

import type { KPattern, KPuzzle } from 'cubing/kpuzzle'
import { Emitter, type CubeConnection, type CubeEvent, type CubeMove } from './connection'
import { patternToFacelets } from './facelets'
import { quatFromHold, slerp, type Hold, type Quat } from './gyro'
import { applyRotation } from '../solve/holds'

/** 実機の時計ズレを模したキューブ時計（PC時計より少し速い）。 */
const CUBE_CLOCK_SKEW = 1.003
const CUBE_CLOCK_OFFSET = 123_456
/** ジャイロのデータを送る間隔（実機の GAN i4 は約 90ms）と、持ち替えにかける時間。 */
const GYRO_INTERVAL_MS = 90
const HOLD_ROTATION_MS = 200
/** 解く人から見た前の方向（基準の座標での水平の向き。実機と同じく決まった値ではない）。 */
const GYRO_YAW = 0.3

export class MockConnection implements CubeConnection {
  readonly info = { kind: 'mock' as const, deviceName: 'Mock Cube', protocol: 'mock' }
  readonly capabilities = { facelets: true, battery: true, reset: true }

  private emitter = new Emitter<CubeEvent>()
  private pattern: KPattern
  private kpuzzle: KPuzzle
  private replayTimers: ReturnType<typeof setTimeout>[] = []
  private connected = true
  private now: () => number
  private hold: Hold | null = null
  private holdAnim: { from: Quat; to: Quat; start: number } | null = null
  private gyroTimer: ReturnType<typeof setInterval> | null = null

  constructor(kpuzzle: KPuzzle, opts: { now?: () => number } = {}) {
    this.kpuzzle = kpuzzle
    this.pattern = kpuzzle.defaultPattern()
    this.now = opts.now ?? (() => performance.now())
  }

  subscribe(listener: (event: CubeEvent) => void) {
    return this.emitter.subscribe(listener)
  }

  /** 1手回す。cubeTimestamp を省略するとPC時刻からズレのある時刻を生成する。 */
  turn(move: string, timestamps: Partial<Pick<CubeMove, 'localTimestamp' | 'cubeTimestamp'>> = {}) {
    if (!this.connected) return
    this.pattern = this.pattern.applyMove(move)
    const local = timestamps.localTimestamp ?? Math.round(this.now())
    const cube = timestamps.cubeTimestamp ?? Math.round(local * CUBE_CLOCK_SKEW) + CUBE_CLOCK_OFFSET
    this.emitter.emit({ type: 'move', move, localTimestamp: local, cubeTimestamp: cube })
  }

  /**
   * 回転ログを記録時の間隔どおりに再生する。speed=2 なら2倍速。
   * 間隔はキューブ時刻（なければPC時刻）の差分から求める。戻り値で再生を中止できる。
   */
  replay(log: CubeMove[], speed = 1, onDone?: () => void): () => void {
    this.stopReplay()
    const times = log.map((m, i) => m.cubeTimestamp ?? m.localTimestamp ?? i * 150)
    const t0 = times[0] ?? 0
    log.forEach((m, i) => {
      const timer = setTimeout(() => {
        this.turn(m.move)
        if (i === log.length - 1) onDone?.()
      }, (times[i] - t0) / speed)
      this.replayTimers.push(timer)
    })
    if (log.length === 0) onDone?.()
    return () => this.stopReplay()
  }

  /** ジャイロのデータを流すか（実機で GAN のアプリの省電力をオフにした状態）。hold は今の持ち方。 */
  setGyro(hold: Hold | null) {
    if (this.gyroTimer) clearInterval(this.gyroTimer)
    this.gyroTimer = null
    this.hold = hold
    this.holdAnim = null
    if (hold) this.gyroTimer = setInterval(() => this.emitGyro(), GYRO_INTERVAL_MS)
  }

  get gyroHold(): Hold | null {
    return this.hold
  }

  /** 持ち替える（y、x' など）。200ms かけて向きを変える。 */
  rotateHold(rot: string) {
    if (!this.hold) return
    const from = this.currentQuat()
    this.hold = applyRotation(this.hold, rot)
    this.holdAnim = { from, to: quatFromHold(this.hold, GYRO_YAW), start: this.now() }
  }

  private currentQuat(): Quat {
    const target = quatFromHold(this.hold!, GYRO_YAW)
    if (!this.holdAnim) return target
    const u = (this.now() - this.holdAnim.start) / HOLD_ROTATION_MS
    if (u >= 1) {
      this.holdAnim = null
      return target
    }
    return slerp(this.holdAnim.from, this.holdAnim.to, u)
  }

  private emitGyro() {
    if (!this.connected || !this.hold) return
    this.emitter.emit({ type: 'gyro', timestamp: Math.round(this.now()), q: this.currentQuat() })
  }

  stopReplay() {
    this.replayTimers.forEach(clearTimeout)
    this.replayTimers = []
  }

  async requestFacelets() {
    // 応答を送る時点の状態を返す（要求から応答までの間の回転も反映される）
    queueMicrotask(() => this.emitter.emit({ type: 'facelets', facelets: patternToFacelets(this.pattern) }))
  }

  async requestBattery() {
    queueMicrotask(() => this.emitter.emit({ type: 'battery', level: 100 }))
  }

  async reset() {
    this.pattern = this.kpuzzle.defaultPattern()
  }

  async disconnect() {
    this.stopReplay()
    this.setGyro(null)
    this.connected = false
    this.emitter.emit({ type: 'disconnect' })
  }
}

/**
 * 再生用の入力を回転ログに変換する。受け付ける形式:
 * - JSON配列: [{"move":"R","cubeTimestamp":1000}, ...] または ["R", "U'", ...]
 * - 回転記号の文字列: "R U R' U'"（150ms間隔）。R2 などは2回の90度回転に分解する。
 */
export function parseMoveLog(input: string): CubeMove[] {
  const text = input.trim()
  if (text === '') return []
  if (text.startsWith('[')) {
    const data: unknown = JSON.parse(text)
    if (!Array.isArray(data)) throw new Error('JSONは配列である必要があります')
    return data.flatMap((item, i): CubeMove[] => {
      if (typeof item === 'string') return expandMove(item, i * 150, null)
      if (item && typeof item === 'object' && typeof item.move === 'string') {
        return [
          {
            move: item.move,
            localTimestamp: typeof item.localTimestamp === 'number' ? item.localTimestamp : null,
            cubeTimestamp: typeof item.cubeTimestamp === 'number' ? item.cubeTimestamp : null,
          },
        ]
      }
      throw new Error(`${i}番目の要素が不正です`)
    })
  }
  return text
    .split(/\s+/)
    .flatMap((token, i) => expandMove(token, i * 150, null))
    .map((m, i) => ({ ...m, localTimestamp: i * 150 }))
}

const MOVE_PATTERN = /^[URFDLB](2'|2|')?$/

function expandMove(token: string, local: number, cube: number | null): CubeMove[] {
  if (!MOVE_PATTERN.test(token)) throw new Error(`不明な回転: ${token}`)
  if (token.includes('2')) {
    const face = token[0]
    return [
      { move: face, localTimestamp: local, cubeTimestamp: cube },
      { move: face, localTimestamp: local, cubeTimestamp: cube },
    ]
  }
  return [{ move: token, localTimestamp: local, cubeTimestamp: cube }]
}
