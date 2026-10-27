// smartcube-web-bluetooth を使った実機接続。

import {
  connectSmartCube,
  type SmartCubeConnection,
  type SmartCubeEvent,
} from 'smartcube-web-bluetooth'
import { Emitter, type CubeCapabilities, type CubeConnection, type CubeConnectionInfo, type CubeEvent } from './connection'

const MAC_STORAGE_PREFIX = 'cubalyst.mac.'
const MAC_PATTERN = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/

/** "ab-cd-..." や "abcdef012345" などをコロン区切りの大文字に正規化する。不正なら null。 */
export function normalizeMac(input: string): string | null {
  const hex = input.replace(/[^0-9a-fA-F]/g, '').toUpperCase()
  if (hex.length !== 12) return null
  const mac = hex.match(/.{2}/g)!.join(':')
  return MAC_PATTERN.test(mac) ? mac : null
}

function loadSavedMac(deviceName: string): string | null {
  try {
    return localStorage.getItem(MAC_STORAGE_PREFIX + deviceName)
  } catch {
    return null
  }
}

function saveMac(deviceName: string, mac: string) {
  try {
    localStorage.setItem(MAC_STORAGE_PREFIX + deviceName, mac)
  } catch {
    // 保存できなくても接続は続ける
  }
}

export type BluetoothConnectOptions = {
  /** MACアドレスを自動取得できなかったときに、ユーザーへ入力を求める。 */
  requestMac: (deviceName: string) => Promise<string | null>
  onStatus?: (message: string) => void
}

export function isWebBluetoothAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator && window.isSecureContext
}

/**
 * アドバタイズ（キューブが出している電波）を読めるか。MACアドレスの自動取得に必要で、
 * Chromeでは chrome://flags の「Experimental Web Platform features」を有効にすると使える。
 */
export function canWatchAdvertisements(): boolean {
  const ctor = (globalThis as { BluetoothDevice?: { prototype: object } }).BluetoothDevice
  return ctor !== undefined && 'watchAdvertisements' in ctor.prototype
}

/** 接続処理の経過をコンソールに出す（MAC自動取得の失敗などの切り分け用）。 */
function debugLog(start: number, message: string) {
  console.info(`[cubalyst bluetooth +${Math.round(performance.now() - start)}ms] ${message}`)
}

export async function connectBluetoothCube(opts: BluetoothConnectOptions): Promise<CubeConnection> {
  if (!isWebBluetoothAvailable()) {
    throw new Error(
      'Web Bluetoothが使えません。Chrome/Edgeで http://localhost から開いているか確認してください（LAN IPでは動きません）。',
    )
  }
  const start = performance.now()
  debugLog(start, `connect: watchAdvertisements ${canWatchAdvertisements() ? 'available' : 'NOT available (flag off?)'}`)
  let deviceName = ''
  const conn = await connectSmartCube({
    // アドバタイズの待ち時間を 2.5秒 → 8秒 に延ばす（GANではこれ以外の動作は変わらない）
    enableAddressSearch: true,
    onStatus: (msg) => {
      debugLog(start, `status: ${msg}`)
      opts.onStatus?.(msg)
    },
    macAddressProvider: async (device, isFallbackCall) => {
      deviceName = device.name ?? ''
      if (!isFallbackCall) {
        // 1回目は保存済みのMACだけ返す。なければライブラリがアドバタイズから取得を試みる。
        const saved = loadSavedMac(deviceName)
        debugLog(start, `mac provider (1st): device=${deviceName} saved=${saved ?? 'none'}`)
        return saved
      }
      debugLog(start, 'mac provider (fallback): advertisement did not give a MAC, asking user')
      const input = await opts.requestMac(deviceName || '不明なデバイス')
      return input ? normalizeMac(input) : null
    },
  })
  debugLog(start, `connected: ${conn.deviceName} protocol=${conn.protocol.name} mac=${conn.deviceMAC}`)
  if (conn.deviceMAC) saveMac(conn.deviceName || deviceName, conn.deviceMAC)
  return new BluetoothCubeConnection(conn)
}

class BluetoothCubeConnection implements CubeConnection {
  readonly info: CubeConnectionInfo
  readonly capabilities: CubeCapabilities
  private emitter = new Emitter<CubeEvent>()
  private conn: SmartCubeConnection

  constructor(conn: SmartCubeConnection) {
    this.conn = conn
    this.info = {
      kind: 'bluetooth',
      deviceName: conn.deviceName,
      protocol: conn.protocol.name,
      mac: conn.deviceMAC,
    }
    this.capabilities = {
      facelets: conn.capabilities.facelets,
      battery: conn.capabilities.battery,
      reset: conn.capabilities.reset,
    }
    // イベントの取りこぼしを防ぐため、生成時点で購読してEmitterに流す。
    // ジャイロの軸と色の対応は、実機で確かめたプロトコルだけ使う（docs/plans/phase-9.md）。
    const gyro = GYRO_PROTOCOLS.has(conn.protocol.name)
    let unsupportedSent = false
    conn.events$.subscribe((e) => {
      if (e.type === 'GYRO' && !gyro) {
        if (!unsupportedSent) this.emitter.emit({ type: 'gyro-unsupported' })
        unsupportedSent = true
        return
      }
      const mapped = mapEvent(e)
      if (mapped) this.emitter.emit(mapped)
    })
  }

  subscribe(listener: (event: CubeEvent) => void) {
    return this.emitter.subscribe(listener)
  }

  requestFacelets() {
    return this.conn.sendCommand({ type: 'REQUEST_FACELETS' })
  }

  requestBattery() {
    return this.conn.sendCommand({ type: 'REQUEST_BATTERY' })
  }

  reset() {
    return this.conn.sendCommand({ type: 'REQUEST_RESET' })
  }

  disconnect() {
    return this.conn.disconnect()
  }
}

/** ジャイロの向き（+X 赤・+Y 青・+Z 白、Z が鉛直上向き）を確かめたプロトコル。 */
const GYRO_PROTOCOLS = new Set(['GAN Gen4'])

function mapEvent(e: SmartCubeEvent): CubeEvent | null {
  switch (e.type) {
    case 'MOVE':
      return {
        type: 'move',
        move: e.move.trim(),
        localTimestamp: e.localTimestamp,
        cubeTimestamp: e.cubeTimestamp,
      }
    case 'FACELETS':
      // 3x3 のみ扱う
      return e.facelets.length === 54 ? { type: 'facelets', facelets: e.facelets } : null
    case 'BATTERY':
      return { type: 'battery', level: e.batteryLevel }
    case 'GYRO':
      return { type: 'gyro', timestamp: e.timestamp, q: e.quaternion }
    case 'DISCONNECT':
      return { type: 'disconnect' }
    default:
      return null
  }
}
