import { useCallback } from 'react'
import { ConnectionPanel } from '../components/ConnectionPanel'
import { CubeView } from '../components/CubeView'
import { MockControls } from '../components/MockControls'
import { MoveLog } from '../components/MoveLog'
import { RecentSolves } from '../components/RecentSolves'
import { ScrambleDisplay } from '../components/ScrambleDisplay'
import { TimerDisplay } from '../components/TimerDisplay'
import { useCubeState, useCubeStore } from '../cube/hooks'
import { useSettings } from '../settings/hooks'
import { withSplits } from '../solve/cfop'
import { fullSolveSource } from '../solve/exercises'
import { useSaveSolve, useSessionState, useSolveList, useSolveSession } from '../solve/hooks'
import { invert, splitAlg } from '../solve/notation'
import type { SessionState } from '../solve/session'

const RECENT = { mode: 'full', limit: 12 } as const

/** タイマー画面：フルソルブの計測。 */
export function TimerPage() {
  const recent = useSolveList(RECENT)
  const { reload } = recent
  const { save, error: saveError } = useSaveSolve(useCallback(() => reload(), [reload]))
  const store = useCubeStore()
  const { settings } = useSettings()
  const session = useSolveSession(fullSolveSource, (solve) =>
    save(withSplits(store.kpuzzle, solve, settings.cross_color)),
  )
  const state = useSessionState(session)
  const { status } = useCubeState()

  return (
    <div className="timer-page">
      <ConnectionPanel />
      {session && state && (
        <>
          <ScrambleDisplay session={session} state={state} />
          <TimerDisplay state={state} />
        </>
      )}
      {status === 'disconnected' && <p className="muted center">キューブを接続すると計測できます</p>}
      {saveError && <p className="error">{saveError}</p>}
      <div className="timer-grid">
        <div>
          <CubeView />
        </div>
        <div>
          <RecentSolves solves={recent.solves} onChange={reload} />
          {state && <MockControls {...mockShortcuts(state)} />}
        </div>
      </div>
      <details className="debug">
        <summary>デバッグ情報（回転ログ・facelets）</summary>
        <MoveLog />
        <FaceletsInfo />
      </details>
    </div>
  )
}

function mockShortcuts(state: SessionState): { scramble?: string[]; solution?: string[] } {
  const { phase, progress, exercise } = state
  if (phase === 'scrambling' && progress) {
    const rest = progress.moves.slice(progress.done)
    // 180度回転の途中なら残り90度だけ回す
    if (progress.halfRemaining && rest.length > 0) rest[0] = progress.halfRemaining
    return { scramble: [...progress.correction, ...rest] }
  }
  if ((phase === 'ready' || phase === 'running') && exercise) {
    return { solution: invert(splitAlg(exercise.scramble)) }
  }
  return {}
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
