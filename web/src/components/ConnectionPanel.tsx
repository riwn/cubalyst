import { useState } from 'react'
import { connectBluetoothCube, isWebBluetoothAvailable, normalizeMac } from '../cube/bluetooth'
import { useCubeState, useCubeStore } from '../cube/hooks'
import { MockConnection } from '../cube/mock'

/** 接続ボタン、接続状態、バッテリー、状態リセット。 */
export function ConnectionPanel() {
  const store = useCubeStore()
  const state = useCubeState()
  const { status, connection } = state

  const connectBluetooth = () =>
    store.connectWith(() =>
      connectBluetoothCube({
        requestMac: (name) => store.requestMac(name),
        onStatus: (msg) => store.setStatusMessage(msg),
      }),
    )
  const connectMock = () => store.connectWith(async () => new MockConnection(store.kpuzzle))

  return (
    <section className="panel connection-panel">
      <div className="row">
        {status === 'disconnected' && (
          <>
            <button className="primary" onClick={connectBluetooth} disabled={!isWebBluetoothAvailable()}>
              Connect
            </button>
            <button onClick={connectMock}>モック接続</button>
          </>
        )}
        {status === 'connecting' && <span className="muted">接続中… {state.statusMessage}</span>}
        {status === 'connected' && connection && (
          <>
            <span className="status-dot status-dot--on" aria-hidden />
            <strong>{connection.info.deviceName}</strong>
            <span className="muted">
              {connection.info.protocol}
              {connection.info.mac && ` / ${connection.info.mac}`}
            </span>
            <Battery level={state.battery} />
            <button onClick={() => store.disconnect()}>切断</button>
          </>
        )}
      </div>

      {status === 'disconnected' && !isWebBluetoothAvailable() && (
        <p className="warn">
          Web Bluetoothが使えません。Chrome/Edgeで <code>http://localhost</code> から開いてください（LAN
          IPでは動きません）。モック接続は使えます。
        </p>
      )}

      {status === 'connected' && (
        <div className="row">
          <button onClick={() => store.resetState()} title="実機が完成状態のときに押してください">
            状態リセット
          </button>
          {connection?.capabilities.facelets && (
            <button onClick={() => store.requestFacelets()}>実機の状態を取得</button>
          )}
          {state.resyncCount > 0 && (
            <span className="warn">実機とのズレを検出し、実機の状態に合わせました（{state.resyncCount}回）</span>
          )}
        </div>
      )}

      {state.error && <p className="error">{state.error}</p>}
      {state.macRequest && <MacDialog deviceName={state.macRequest.deviceName} />}
    </section>
  )
}

function Battery({ level }: { level: number | null }) {
  if (level == null) return <span className="muted">バッテリー: --</span>
  const cls = level <= 15 ? 'error' : level <= 30 ? 'warn' : ''
  return <span className={cls}>バッテリー: {level}%</span>
}

function MacDialog({ deviceName }: { deviceName: string }) {
  const store = useCubeStore()
  const [value, setValue] = useState('')
  const mac = normalizeMac(value)
  return (
    <form
      className="mac-dialog"
      onSubmit={(e) => {
        e.preventDefault()
        if (mac) store.submitMac(mac)
      }}
    >
      <p>
        <strong>{deviceName}</strong> のMACアドレスを自動取得できませんでした。入力してください（初回のみ。以降は保存されます）。
      </p>
      <p className="muted small">
        自動取得するには、Chromeの <code>chrome://flags/#enable-experimental-web-platform-features</code>{' '}
        を有効にします。MACアドレスはWindowsの「設定 → Bluetoothとデバイス」や{' '}
        <code>chrome://bluetooth-internals</code> で確認できます。
      </p>
      <div className="row">
        <input
          autoFocus
          placeholder="AB:12:CD:34:EF:56"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button className="primary" type="submit" disabled={!mac}>
          接続
        </button>
        <button type="button" onClick={() => store.submitMac(null)}>
          キャンセル
        </button>
      </div>
    </form>
  )
}
