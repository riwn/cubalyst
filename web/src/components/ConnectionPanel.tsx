import { useState } from 'react'
import { canWatchAdvertisements, connectBluetoothCube, isWebBluetoothAvailable, normalizeMac } from '../cube/bluetooth'
import { useCubeState, useCubeStore } from '../cube/hooks'
import { MockConnection } from '../cube/mock'
import { useDebug } from '../ui/prefs'
import { Dialog } from '../ui/Dialog'
import { Popover } from '../ui/Popover'

/**
 * ヘッダー右上のキューブ接続。未接続なら「Connect」、接続中はデバイス名とバッテリーを出し、
 * 押すと詳細（状態リセット・切断など）を開く。
 */
export function CubeConnectionControl() {
  const store = useCubeStore()
  const state = useCubeState()
  const debug = useDebug()
  const { status, connection } = state

  const connectBluetooth = () =>
    store.connectWith(() =>
      connectBluetoothCube({
        requestMac: (name) => store.requestMac(name),
        onStatus: (msg) => store.setStatusMessage(msg),
      }),
    )
  const connectMock = () => store.connectWith(async () => new MockConnection(store.kpuzzle))

  if (status === 'connecting') {
    return <span className="conn-chip muted">接続中… {state.statusMessage}</span>
  }

  if (status === 'disconnected' || !connection) {
    return (
      <div className="row conn-actions">
        {debug && <button onClick={connectMock}>モック接続</button>}
        <button
          className="primary"
          onClick={connectBluetooth}
          disabled={!isWebBluetoothAvailable()}
          title={isWebBluetoothAvailable() ? 'キューブに接続' : 'Web Bluetoothが使えません（http://localhost から開いてください）'}
        >
          Connect
        </button>
      </div>
    )
  }

  const battery = state.battery
  const low = battery != null && battery <= 15
  return (
    <Popover
      className="conn-menu"
      buttonClassName="conn-chip"
      title="接続状態"
      trigger={
        <>
          <span className={`status-dot ${state.resyncCount > 0 ? 'status-dot--warn' : 'status-dot--on'}`} aria-hidden />
          <span className="conn-name">{connection.info.deviceName}</span>
          {battery != null && <span className={low ? 'error' : 'muted'}> {battery}%</span>}
        </>
      }
    >
      {(close) => (
        <div className="conn-detail">
          <dl>
            <dt>デバイス</dt>
            <dd>{connection.info.deviceName}</dd>
            <dt>プロトコル</dt>
            <dd>{connection.info.protocol}</dd>
            {connection.info.mac && (
              <>
                <dt>MAC</dt>
                <dd>
                  <code>{connection.info.mac}</code>
                </dd>
              </>
            )}
            <dt>バッテリー</dt>
            <dd className={low ? 'error' : ''}>{battery == null ? '--' : `${battery}%`}</dd>
          </dl>
          {state.resyncCount > 0 && (
            <p className="warn small">実機とのズレを検出し、実機の状態に合わせました（{state.resyncCount}回）</p>
          )}
          <div className="menu-buttons">
            <button onClick={() => store.resetState()} title="実機が完成状態のときに押してください">
              状態リセット（実機が完成状態のとき）
            </button>
            {connection.capabilities.facelets && <button onClick={() => store.requestFacelets()}>実機の状態を取得</button>}
            <button
              className="danger"
              onClick={() => {
                close()
                void store.disconnect()
              }}
            >
              切断
            </button>
          </div>
        </div>
      )}
    </Popover>
  )
}

/** キューブ接続のエラー（閉じられるバナー）と、MACアドレスの入力ダイアログ。 */
export function CubeNotices() {
  const store = useCubeStore()
  const state = useCubeState()
  return (
    <>
      {state.error && (
        <div className="banner banner--error" role="alert">
          <span>{state.error}</span>
          <button onClick={() => store.clearError()} title="閉じる">
            ×
          </button>
        </div>
      )}
      {state.macRequest && <MacDialog deviceName={state.macRequest.deviceName} />}
    </>
  )
}

function MacDialog({ deviceName }: { deviceName: string }) {
  const store = useCubeStore()
  const [value, setValue] = useState('')
  const mac = normalizeMac(value)
  return (
    <Dialog open title="MACアドレスの入力" onClose={() => store.submitMac(null)}>
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
        {canWatchAdvertisements() ? (
          <p className="muted small">
            自動取得の機能は有効ですが、8秒以内にキューブの電波（アドバタイズ）からMACアドレスを読めませんでした。
            キューブを何回か回して起こす、スマホなど他の機器との接続を切る、ページを再読み込みしてから接続し直す、を試してください。
            詳しい経過はDevTools（F12）のConsoleに <code>[cubalyst bluetooth]</code> として出ています。
          </p>
        ) : (
          <p className="muted small">
            自動取得の機能が無効です。Chromeの <code>chrome://flags/#enable-experimental-web-platform-features</code>{' '}
            を有効にしてChromeを再起動すると、自動で取得できるようになります。
          </p>
        )}
        <p className="muted small">
          手動で調べる場合：<code>chrome://bluetooth-internals</code> の Devices タブで Start Scan を押し、{deviceName} の
          Address を確認してください（名前の末尾 {deviceName.split('_').pop()} がアドレスの末尾と一致することが多いです）。
        </p>
        <div className="row">
          <input autoFocus placeholder="AB:12:CD:34:EF:56" value={value} onChange={(e) => setValue(e.target.value)} />
          <button className="primary" type="submit" disabled={!mac}>
            接続
          </button>
          <button type="button" onClick={() => store.submitMac(null)}>
            キャンセル
          </button>
        </div>
      </form>
    </Dialog>
  )
}
