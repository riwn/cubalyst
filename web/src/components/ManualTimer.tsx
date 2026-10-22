import { useEffect, useReducer, useRef, useState } from 'react'
import { initialManualTimer, isArmed, manualTimerReducer, type ManualResult } from '../solve/manual-timer'
import { INSPECTION_DNF_MS, INSPECTION_MS } from '../solve/session'
import { averageOf, effectiveTime, formatTime } from '../solve/stats'

/**
 * キューブをつながずに使うタイマー。Space（スマホは画面のタイマー部分）で操作する。
 * 記録は保存せず、このページを開いているあいだだけ一覧に残す。
 */
export function ManualTimer({
  scramble,
  inspection,
  onNext,
}: {
  scramble: string | undefined
  inspection: boolean
  /** 1回止めるたびに呼ぶ（次のスクランブルを出す）。 */
  onNext: () => void
}) {
  const [state, dispatch] = useReducer(manualTimerReducer, initialManualTimer)
  const [results, setResults] = useState<ManualResult[]>([])
  const [now, setNow] = useState(() => performance.now())
  const { phase, holdStart, inspectStart, startedAt, last } = state

  // 止めたら一覧に足して次のスクランブルへ
  const lastRef = useRef(last)
  const onNextRef = useRef(onNext)
  useEffect(() => {
    onNextRef.current = onNext
  })
  useEffect(() => {
    if (last && last !== lastRef.current) {
      setResults((rs) => [last, ...rs])
      onNextRef.current()
    }
    lastRef.current = last
  }, [last])

  const inspectionRef = useRef(inspection)
  useEffect(() => {
    inspectionRef.current = inspection
  })
  useEffect(() => {
    const ignore = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      return (
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        (t != null && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)))
      )
    }
    const down = (e: KeyboardEvent) => {
      if (ignore(e)) return
      if (e.code === 'Escape') {
        dispatch({ type: 'cancel' })
        return
      }
      if (e.code !== 'Space') return
      // フォーカス中のボタンが押されたり、ページがスクロールしたりしないようにする
      e.preventDefault()
      if (e.repeat) return
      dispatch({ type: 'press', now: performance.now(), inspection: inspectionRef.current })
    }
    const up = (e: KeyboardEvent) => {
      if (ignore(e) || e.code !== 'Space') return
      e.preventDefault()
      dispatch({ type: 'release', now: performance.now() })
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  const animating = phase !== 'idle' || holdStart != null
  useEffect(() => {
    if (!animating) return
    let raf = 0
    const tick = () => {
      setNow(performance.now())
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [animating])

  const armed = isArmed(state, now)
  let time: string
  let hint: string
  let mod = ''
  if (phase === 'running' && startedAt != null) {
    time = formatTime(Math.max(0, now - startedAt), 2)
    hint = `Space で停止${state.penalty ? `（インスペクション超過：${state.penalty}）` : ''}`
    mod = 'timer--running'
  } else if (holdStart != null) {
    time = phase === 'inspecting' ? inspectionText(now - (inspectStart ?? now)) : '0.00'
    hint = armed ? '離すとスタート' : 'そのまま押し続ける'
    mod = armed ? 'timer--armed' : 'timer--holding'
  } else if (phase === 'inspecting' && inspectStart != null) {
    const elapsed = Math.max(0, now - inspectStart)
    time = inspectionText(elapsed)
    hint = 'インスペクション中：Space を長押しして離すとスタート'
    mod =
      elapsed > INSPECTION_MS
        ? 'timer--inspecting timer--over'
        : elapsed > INSPECTION_MS - 3000
          ? 'timer--hurry'
          : 'timer--inspecting'
  } else {
    time = last ? formatTime(effectiveTime(last.ms, last.penalty), 3) : '0.000'
    hint = inspection ? 'Space でインスペクション開始' : 'Space を長押しして離すとスタート'
    mod = 'timer--idle'
  }

  const times = results.map((r) => effectiveTime(r.ms, r.penalty))
  const ao = (n: number) => (times.length >= n ? averageOf(times.slice(0, n)) : undefined)

  return (
    <>
      <section className="scramble">
        <p className="scramble-moves">
          {scramble ? scramble.split(' ').map((m, i) => <span key={i} className="scramble-move">{m}</span>) : '…'}
        </p>
        <div className="row scramble-actions">
          {phase === 'idle' && (
            <button className="icon-button" onClick={onNext} title="新しいスクランブル" aria-label="新しいスクランブル">
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path
                  d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
          {phase !== 'idle' && <button onClick={() => dispatch({ type: 'cancel' })}>中止（Esc）</button>}
        </div>
      </section>
      <section
        className={`timer manual-timer ${mod}`}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse') return
          e.currentTarget.setPointerCapture(e.pointerId)
          dispatch({ type: 'press', now: performance.now(), inspection })
        }}
        onPointerUp={(e) => {
          if (e.pointerType === 'mouse') return
          dispatch({ type: 'release', now: performance.now() })
        }}
      >
        <div className="timer-time">{time}</div>
        <div className="timer-hint">{hint}</div>
      </section>
      {results.length > 0 && (
        <section className="manual-results">
          <p className="small muted">
            ao5 {formatTime(ao(5))} ・ ao12 {formatTime(ao(12))} ・ {results.length}回（キューブ未接続のため保存されません）
          </p>
          <ol className="manual-results-list">
            {results.slice(0, 12).map((r, i) => (
              <li key={results.length - i}>
                {formatTime(effectiveTime(r.ms, r.penalty), 2)}
                {r.penalty === '+2' && <span className="muted">（+2）</span>}
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  )
}

function inspectionText(elapsed: number): string {
  if (elapsed > INSPECTION_DNF_MS) return 'DNF'
  if (elapsed > INSPECTION_MS) return '+2'
  return String(Math.ceil((INSPECTION_MS - elapsed) / 1000))
}
