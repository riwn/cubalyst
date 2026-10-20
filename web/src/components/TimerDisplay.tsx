import { useEffect, useState } from 'react'
import type { SessionState } from '../solve/session'
import { effectiveTime, formatTime } from '../solve/stats'

/** 大きなタイマー表示。計測中は経過時間、それ以外は直前の記録。 */
export function TimerDisplay({ state }: { state: SessionState }) {
  const { phase, startedAt, last, moveCount } = state
  const [now, setNow] = useState(() => performance.now())

  useEffect(() => {
    if (phase !== 'running') return
    let raf = 0
    const tick = () => {
      setNow(performance.now())
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [phase])

  let time: string
  let hint: string
  if (phase === 'running' && startedAt != null) {
    time = formatTime(Math.max(0, now - startedAt), 2)
    hint = `${moveCount}手`
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
    <section className={`timer timer--${phase}`}>
      <div className="timer-time">{time}</div>
      <div className="timer-hint">{hint}</div>
    </section>
  )
}
