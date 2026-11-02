// タイマー画面の中継（/api/live）でやり取りする形。サーバーは session の中身を見ずにそのまま流す。
//
// 時刻（performance.now()）は端末ごとに基準が違うので、「送った時点で何 ms たったか」（*_ago_ms）にして送り、
// 受け取った側が自分の時計に置き直す。

import type { NewSolve } from '../api'
import type { ConnectionStatus } from '../cube/store'
import type { Split } from '../solve/cfop'
import type { ScrambleProgress } from '../solve/scramble-tracker'
import type { SessionPhase, SessionState } from '../solve/session'
import type { Penalty } from '../solve/stats'

/** 直前のソルブ。回転ログやジャイロは送らず、表示に使う分だけ。 */
export type LiveLast = {
  solved_at: string
  total_ms: number
  penalty: Penalty
  move_count: number
  splits?: Split[]
}

/** タイマーの状態。 */
export type LiveSession = {
  phase: SessionPhase
  scramble: string | null
  label: string | null
  progress: ScrambleProgress | null
  inspection: boolean
  inspection_penalty: Penalty
  move_count: number
  /** 計測を始めてから送るまでの時間。計測中でなければ null。 */
  started_ago_ms: number | null
  /** 計測待ち（インスペクションの起点）になってから送るまでの時間。 */
  ready_ago_ms: number | null
  last: LiveLast | null
  error: string | null
}

/** メインが送る出来事。 */
export type LiveEvent =
  | { type: 'main'; cube: ConnectionStatus }
  | { type: 'move'; move: string; facelets: string }
  | { type: 'facelets'; facelets: string }
  | { type: 'session'; session: LiveSession }
  | { type: 'bye' }

/** 見る側が受け取る出来事。 */
export type LiveMessage =
  | {
      type: 'snapshot'
      online: boolean
      cube?: ConnectionStatus
      facelets?: string
      session?: LiveSession
      /** session をサーバーが受け取ってからの時間。 */
      age_ms?: number
    }
  | { type: 'ping'; online: boolean }
  | { type: 'main'; online: boolean; cube?: ConnectionStatus }
  | { type: 'move'; move: string; facelets: string }
  | { type: 'facelets'; facelets: string }
  | { type: 'session'; session: LiveSession }

const ago = (now: number, at: number | null) => (at == null ? null : Math.max(0, Math.round(now - at)))

/** メインのタイマーの状態を、送る形にする。splits は直前のソルブの段階（表示している分）。 */
export function toLiveSession(state: SessionState, now: number, splits?: Split[]): LiveSession {
  const { last } = state
  return {
    phase: state.phase,
    scramble: state.exercise?.scramble ?? null,
    label: state.exercise?.label ?? null,
    progress: state.progress,
    inspection: state.inspection,
    inspection_penalty: state.inspectionPenalty,
    move_count: state.moveCount,
    started_ago_ms: ago(now, state.startedAt),
    ready_ago_ms: ago(now, state.readyAt),
    last: last
      ? {
          solved_at: last.solved_at,
          total_ms: last.total_ms,
          penalty: last.penalty,
          move_count: last.moves?.length ?? 0,
          splits,
        }
      : null,
    error: state.error,
  }
}

/** 受け取ったタイマーの状態を、この端末の時計での SessionState にする（画面の部品をそのまま使うため）。 */
export function fromLiveSession(s: LiveSession, now: number): SessionState {
  const at = (agoMs: number | null) => (agoMs == null ? null : now - agoMs)
  const last: NewSolve | null = s.last
    ? {
        mode: 'full',
        solved_at: s.last.solved_at,
        total_ms: s.last.total_ms,
        penalty: s.last.penalty,
        scramble: '',
        case_id: null,
        step: null,
        note: '',
        splits: s.last.splits,
      }
    : null
  return {
    phase: s.phase,
    exercise:
      s.scramble == null
        ? null
        : {
            mode: 'full',
            scramble: s.scramble,
            label: s.label ?? undefined,
            isGoal: () => false,
          },
    progress: s.progress,
    startedAt: at(s.started_ago_ms),
    readyAt: at(s.ready_ago_ms),
    inspection: s.inspection,
    inspectionPenalty: s.inspection_penalty,
    moveCount: s.move_count,
    last,
    error: s.error,
  }
}
