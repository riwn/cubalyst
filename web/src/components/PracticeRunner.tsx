import type { ReactNode } from 'react'
import type { NewSolve, Solve } from '../api'
import { useCubeState } from '../cube/hooks'
import { useSaveSolve, useSessionState, useSolveSession } from '../solve/hooks'
import { invert, splitAlg } from '../solve/notation'
import type { ExerciseSource, SessionState } from '../solve/session'
import { CubeView } from './CubeView'
import { FitLayout } from './FitLayout'
import { MockControls } from './MockControls'
import { ScrambleDisplay } from './ScrambleDisplay'
import { TimerDisplay } from './TimerDisplay'

/**
 * 練習の計測部分（接続・スクランブル・タイマー・3D）。ステップ練習と補助付きフルソルブで共通。
 * prepare で保存前のソルブを加工できる（段階の付与など）。overlay はタイマーの下に出す（計測中の補助など）。
 */
export function PracticeRunner({
  source,
  onSaved,
  prepare,
  side,
  overlay,
}: {
  source: ExerciseSource
  onSaved: (solve: Solve) => void
  prepare?: (solve: NewSolve) => NewSolve
  side?: ReactNode
  overlay?: (state: SessionState) => ReactNode
}) {
  const { save, error } = useSaveSolve(onSaved)
  const session = useSolveSession(source, (s) => save(prepare ? prepare(s) : s))
  const state = useSessionState(session)
  const { status } = useCubeState()

  const mock =
    state?.phase === 'scrambling' && state.progress
      ? {
          scramble: [
            ...state.progress.correction,
            ...(state.progress.halfRemaining
              ? [state.progress.halfRemaining, ...state.progress.moves.slice(state.progress.done + 1)]
              : state.progress.moves.slice(state.progress.done)),
          ],
        }
      : (state?.phase === 'ready' || state?.phase === 'running') && state.exercise
        ? { solution: invert(splitAlg(state.exercise.scramble)) }
        : {}

  return (
    <FitLayout
      className="practice-runner"
      main={
        <>
          {session && state && (
            <>
              <ScrambleDisplay session={session} state={state} />
              <TimerDisplay state={state} />
              {overlay?.(state)}
            </>
          )}
          {status === 'disconnected' && <p className="muted center small">右上の「Connect」でキューブを接続すると練習できます</p>}
          {error && <p className="error">{error}</p>}
        </>
      }
      cube={<CubeView />}
      side={
        <>
          {side}
          <MockControls {...mock} />
        </>
      }
    />
  )
}
