import { useEffect, useState } from 'react'
import { INSPECTION_DNF_MS, INSPECTION_MS, type SessionState } from '../solve/session'
import { effectiveTime, formatTime } from '../solve/stats'

/** 大きなタイマー表示。計測中は経過時間、それ以外は直前の記録。 */
export function TimerDisplay({ state }: { state: SessionState }) {
  const { phase, startedAt, last, moveCount, readyAt, inspection } = state
  const inspecting = phase === 'ready' && inspection && readyAt != null
  const [now, setNow] = useState(() => performance.now())

  useEffect(() => {
    if (phase !== 'running' && !inspecting) return
    let raf = 0
    const tick = () => {
      setNow(performance.now())
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [phase, inspecting])

  let time: string
  let hint: string
  let mod = ''
  if (inspecting) {
    // インスペクション：残り秒数。15秒を過ぎたら +2、17秒を過ぎたら DNF
    const elapsed = Math.max(0, now - readyAt)
    if (elapsed > INSPECTION_DNF_MS) {
      time = 'DNF'
      mod = 'timer--over'
    } else if (elapsed > INSPECTION_MS) {
      time = '+2'
      mod = 'timer--over'
    } else {
      time = String(Math.ceil((INSPECTION_MS - elapsed) / 1000))
      mod = elapsed > INSPECTION_MS - 3000 ? 'timer--hurry' : 'timer--inspecting'
    }
    hint = 'インスペクション中：最初の回転でスタート'
  } else if (phase === 'running' && startedAt != null) {
    time = formatTime(Math.max(0, now - startedAt), 2)
    hint = `${moveCount}手${state.inspectionPenalty ? `（インスペクション超過：${state.inspectionPenalty}）` : ''}`
  } else {
    time = last ? formatTime(effectiveTime(last.total_ms, last.penalty), 3) : '0.000'
    hint =
      phase === 'ready'
        ? '準備OK：最初の回転でスタート'
        : phase === 'scrambling'
          ? 'スクランブル中'
          : last
            ? `${last.moves?.length ?? 0}手`
            : ''
  }
  return (
    <section className={`timer timer--${phase} ${mod}`}>
      <div className="timer-time">{time}</div>
      <div className="timer-hint">{hint}</div>
    </section>
  )
}
