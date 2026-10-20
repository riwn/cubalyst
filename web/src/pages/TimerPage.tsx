import { ConnectionPanel } from '../components/ConnectionPanel'
import { CubeView } from '../components/CubeView'
import { MockControls } from '../components/MockControls'
import { MoveLog } from '../components/MoveLog'
import { useCubeState } from '../cube/hooks'

/** タイマー画面。Phase 1では接続・3D表示・回転ログまで。 */
export function TimerPage() {
  return (
    <div className="timer-page">
      <ConnectionPanel />
      <div className="timer-grid">
        <div>
          <CubeView />
          <FaceletsInfo />
        </div>
        <div>
          <MockControls />
          <MoveLog />
        </div>
      </div>
    </div>
  )
}

function FaceletsInfo() {
  const { facelets, deviceFacelets } = useCubeState()
  return (
    <dl className="facelets-info small">
      <dt>状態（facelets）</dt>
      <dd>
        <code>{facelets}</code>
      </dd>
      <dt>実機から最後に受信</dt>
      <dd>
        <code>{deviceFacelets ?? '—'}</code>
      </dd>
    </dl>
  )
}
