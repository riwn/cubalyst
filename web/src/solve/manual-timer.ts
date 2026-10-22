// キューブをつながずに使う手動タイマー（Space キーやタッチで操作する、よくあるキューブタイマー方式）。
//
//   idle →(押す)→ inspecting →(長押しして離す)→ running →(押す)→ idle
//
// - インスペクションを使わないときは、idle で長押しして離すとスタート
// - 長押しが HOLD_MS に届く前に離したら、元の状態に戻る（スタートしない）
// - 止めた押下や、インスペクションを始めた押下を離しても何もしない

import { inspectionPenalty } from './session'
import type { Penalty } from './stats'

/** スタートできるようになるまでの長押し時間。 */
export const HOLD_MS = 300

export type ManualResult = { ms: number; penalty: Penalty }

export type ManualTimerState = {
  phase: 'idle' | 'inspecting' | 'running'
  /** 長押しを始めた時刻。押していなければ null。 */
  holdStart: number | null
  inspectStart: number | null
  startedAt: number | null
  /** 計測開始時に確定したインスペクション超過のペナルティ。 */
  penalty: Penalty
  /** 次の離す操作を無視する（止めた押下・インスペクションを始めた押下）。 */
  swallowRelease: boolean
  last: ManualResult | null
}

export const initialManualTimer: ManualTimerState = {
  phase: 'idle',
  holdStart: null,
  inspectStart: null,
  startedAt: null,
  penalty: '',
  swallowRelease: false,
  last: null,
}

export type ManualTimerEvent =
  | { type: 'press'; now: number; inspection: boolean }
  | { type: 'release'; now: number }
  | { type: 'cancel' }

export function manualTimerReducer(s: ManualTimerState, e: ManualTimerEvent): ManualTimerState {
  switch (e.type) {
    case 'press':
      if (s.holdStart != null || s.swallowRelease) return s
      if (s.phase === 'running' && s.startedAt != null) {
        const last = { ms: Math.max(0, e.now - s.startedAt), penalty: s.penalty }
        return { ...initialManualTimer, swallowRelease: true, last }
      }
      if (s.phase === 'idle' && e.inspection) {
        return { ...s, phase: 'inspecting', inspectStart: e.now, swallowRelease: true }
      }
      return { ...s, holdStart: e.now }
    case 'release':
      if (s.swallowRelease) return { ...s, swallowRelease: false }
      if (s.holdStart == null) return s
      if (e.now - s.holdStart < HOLD_MS) return { ...s, holdStart: null }
      return {
        ...s,
        phase: 'running',
        holdStart: null,
        startedAt: e.now,
        penalty: s.inspectStart != null ? inspectionPenalty(e.now - s.inspectStart) : '',
      }
    case 'cancel':
      return { ...initialManualTimer, last: s.last }
  }
}

/** 長押しがスタートできる長さに届いたか。 */
export function isArmed(s: ManualTimerState, now: number): boolean {
  return s.holdStart != null && now - s.holdStart >= HOLD_MS
}
