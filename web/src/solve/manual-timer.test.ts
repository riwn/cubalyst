import { describe, expect, it } from 'vitest'
import { HOLD_MS, initialManualTimer, isArmed, manualTimerReducer, type ManualTimerEvent } from './manual-timer'

const run = (events: ManualTimerEvent[]) => events.reduce(manualTimerReducer, initialManualTimer)
const press = (now: number, inspection = true): ManualTimerEvent => ({ type: 'press', now, inspection })
const release = (now: number): ManualTimerEvent => ({ type: 'release', now })

describe('manual timer', () => {
  it('starts inspection on press, starts timing on hold-and-release, stops on press', () => {
    let s = run([press(0), release(50)])
    expect(s.phase).toBe('inspecting')
    s = run([press(0), release(50), press(5000)])
    expect(isArmed(s, 5000 + HOLD_MS - 1)).toBe(false)
    expect(isArmed(s, 5000 + HOLD_MS)).toBe(true)
    s = run([press(0), release(50), press(5000), release(5500)])
    expect(s.phase).toBe('running')
    expect(s.startedAt).toBe(5500)
    s = run([press(0), release(50), press(5000), release(5500), press(17500)])
    expect(s.phase).toBe('idle')
    expect(s.last).toEqual({ ms: 12000, penalty: '' })
    // 止めた押下を離しても、次のインスペクションは始まらない
    s = manualTimerReducer(s, release(17600))
    expect(s.phase).toBe('idle')
    expect(s.swallowRelease).toBe(false)
  })

  it('does not start when released before the hold time', () => {
    const s = run([press(0), release(10), press(1000), release(1000 + HOLD_MS - 1)])
    expect(s.phase).toBe('inspecting')
    expect(s.holdStart).toBeNull()
  })

  it('starts without inspection when it is off', () => {
    const s = run([press(0, false), release(HOLD_MS)])
    expect(s.phase).toBe('running')
    expect(s.penalty).toBe('')
  })

  it('applies inspection penalties', () => {
    expect(run([press(0), release(1), press(15200), release(15600)]).penalty).toBe('+2')
    expect(run([press(0), release(1), press(17200), release(17600)]).penalty).toBe('DNF')
  })

  it('cancel keeps the last result', () => {
    let s = run([press(0, false), release(HOLD_MS), press(1300), release(1400), press(2000, false)])
    s = manualTimerReducer(s, { type: 'cancel' })
    expect(s.phase).toBe('idle')
    expect(s.holdStart).toBeNull()
    expect(s.last).toEqual({ ms: 1000, penalty: '' })
  })
})
