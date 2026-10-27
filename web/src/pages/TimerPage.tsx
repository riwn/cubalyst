import { useCallback, useMemo } from 'react'
import { CubeView } from '../components/CubeView'
import { FitLayout } from '../components/FitLayout'
import { GyroDebug } from '../components/GyroDebug'
import { ManualTimer } from '../components/ManualTimer'
import { MockControls } from '../components/MockControls'
import { MoveLog } from '../components/MoveLog'
import { RecentSolves } from '../components/RecentSolves'
import { ScrambleDisplay } from '../components/ScrambleDisplay'
import { StageRibbon } from '../components/StageRibbon'
import { TimerDisplay } from '../components/TimerDisplay'
import { useCubeState, useCubeStore } from '../cube/hooks'
import { useSettings } from '../settings/hooks'
import { withSplits } from '../solve/cfop'
import { fullSolveSource } from '../solve/exercises'
import { useSaveSolve, useSessionState, useSolveList, useSolveSession } from '../solve/hooks'
import { invert, splitAlg } from '../solve/notation'
import { useDebug } from '../ui/prefs'
import type { SessionState } from '../solve/session'

const RECENT = { mode: 'full', limit: 12 } as const

/** タイマー画面：フルソルブの計測。キューブ未接続のときは Space で操作する手動タイマー（保存しない）。 */
export function TimerPage() {
  const recent = useSolveList(RECENT)
  const { reload } = recent
  const { save, error: saveError } = useSaveSolve(useCallback(() => reload(), [reload]))
  const store = useCubeStore()
  const { settings } = useSettings()
  const session = useSolveSession(
    fullSolveSource,
    (solve) => save(withSplits(store.kpuzzle, solve, settings.cross_color)),
    { inspection: settings.inspection },
  )
  const state = useSessionState(session)
  const { status } = useCubeState()
  const debug = useDebug()
  const last = state?.last
  const lastSplits = useMemo(
    () => (last ? withSplits(store.kpuzzle, last, settings.cross_color).splits : undefined),
    [store.kpuzzle, last, settings.cross_color],
  )

  return (
    <FitLayout
      className="timer-page"
      main={
        <>
          {session && state && status === 'disconnected' && (
            <ManualTimer
              scramble={state.exercise?.scramble}
              inspection={settings.inspection}
              onNext={() => void session.next()}
            />
          )}
          {session && state && status !== 'disconnected' && (
            <>
              <ScrambleDisplay session={session} state={state} />
              <TimerDisplay state={state} />
              {state.phase !== 'running' && last && <StageRibbon key={last.solved_at} splits={lastSplits} />}
            </>
          )}
          {status === 'disconnected' && (
            <p className="muted center small">右上の「Connect」でキューブを接続すると、回転を記録して保存できます</p>
          )}
          {saveError && <p className="error">{saveError}</p>}
        </>
      }
      cube={<CubeView />}
      sideLabel="直近の記録"
      side={
        <>
          <RecentSolves solves={recent.solves} onChange={reload} />
          {state && <MockControls {...mockShortcuts(state)} />}
          {debug && (
            <details className="debug" open>
              <summary>デバッグ情報（回転ログ・facelets・ジャイロ）</summary>
              <MoveLog />
              <FaceletsInfo />
              <GyroDebug />
            </details>
          )}
        </>
      }
    />
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
