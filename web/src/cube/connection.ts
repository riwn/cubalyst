// キューブ接続の共通インターフェース。実機（Bluetooth）とモックの両方がこれを実装する。

import type { Quat } from './gyro'

/** 1回の回転。タイムスタンプはミリ秒。 */
export type CubeMove = {
  move: string
  /** PC側の時刻（performance.now() 基準）。 */
  localTimestamp: number | null
  /** キューブ側の時刻（キューブ内部時計）。 */
  cubeTimestamp: number | null
}

export type CubeEvent =
  | ({ type: 'move' } & CubeMove)
  | { type: 'facelets'; facelets: string }
  | { type: 'battery'; level: number }
  /** ジャイロ（キューブの向き）。timestamp は PC 側の時刻（performance.now() 基準）。 */
  | { type: 'gyro'; timestamp: number; q: Quat }
  /** ジャイロのデータは届いたが、軸と色の対応を確かめていないキューブなので使わない。 */
  | { type: 'gyro-unsupported' }
  | { type: 'disconnect' }

export type CubeConnectionInfo = {
  kind: 'bluetooth' | 'mock'
  deviceName: string
  protocol: string
  mac?: string
}

export type CubeCapabilities = {
  facelets: boolean
  battery: boolean
  reset: boolean
}

export interface CubeConnection {
  readonly info: CubeConnectionInfo
  readonly capabilities: CubeCapabilities
  /** イベントを購読する。戻り値で購読解除。 */
  subscribe(listener: (event: CubeEvent) => void): () => void
  requestFacelets(): Promise<void>
  requestBattery(): Promise<void>
  /** キューブ側の状態を完成状態にリセットする（実機が完成状態のときに使う）。 */
  reset(): Promise<void>
  disconnect(): Promise<void>
}

/** 購読者への配信を担う小さなヘルパー。 */
export class Emitter<T> {
  private listeners = new Set<(value: T) => void>()

  subscribe(listener: (value: T) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  emit(value: T) {
    for (const l of this.listeners) l(value)
  }
}
