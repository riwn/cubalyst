import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { listCases, type CaseInfo, type NewSolve, type Solve } from '../api'
import { assistFor, viewFrom, type Assist } from '../assist/detect'
import { preferredAlg } from '../cases/algs'
import type { CaseDef } from '../cases/data'
import { CaseDiagram } from '../components/CaseDiagram'
import { PracticeRunner } from '../components/PracticeRunner'
import { useCubeState, useCubeStore } from '../cube/hooks'
import { holdRotation } from '../cube/orientation'
import { useSettings } from '../settings/hooks'
import { withSplits } from '../solve/cfop'
import { assistSolveSource } from '../solve/exercises'
import { useSolveList } from '../solve/hooks'
import { averageOf, best, effectiveTime, formatTime } from '../solve/stats'

const DELAY_KEY = 'cubalyst.assistDelay'
const DELAYS = [0, 1, 2, 3]

function loadDelay(): number {
  try {
    const v = Number(localStorage.getItem(DELAY_KEY))
    return DELAYS.includes(v) ? v : 0
  } catch {
    return 0
  }
}

/**
 * 補助付きフルソルブ：ふつうのフルソルブと同じ出題で、計測中に F2L・OLL・PLL のケースと手順を画面に出す。
 * 記録は「補助付き」として保存し、タイマーの記録・統計には混ぜない。
 */
export function AssistPractice() {
  const store = useCubeStore()
  const { settings } = useSettings()
  const [delay, setDelay] = useState(loadDelay)
  const [cases, setCases] = useState<Map<string, CaseInfo>>(new Map())
  const [last, setLast] = useState<Solve | null>(null)
  const history = useSolveList({ mode: 'assist', limit: 12 })
  const { reload } = history

  useEffect(() => {
    listCases()
      .then((l) => setCases(new Map(l.map((c) => [c.id, c]))))
      .catch(() => setCases(new Map()))
  }, [])

  const prepare = useCallback(
    (s: NewSolve): NewSolve => withSplits(store.kpuzzle, s, settings.cross_color),
    [store.kpuzzle, settings.cross_color],
  )
  const onSaved = useCallback(
    (s: Solve) => {
      setLast(s)
      reload()
    },
    [reload],
  )
  const changeDelay = (v: number) => {
    setDelay(v)
    try {
      localStorage.setItem(DELAY_KEY, String(v))
    } catch {
      // 保存できなくても練習はできる
    }
  }

  const times = history.solves.map((s) => effectiveTime(s.total_ms, s.penalty))
  return (
    <div className="assist-practice">
      <section className="panel row">
        <span className="muted small">計測中に、F2L・OLL・PLL のケースと手順を表示します。記録は「補助付き」として、タイマーとは別に保存します。</span>
        <span className="spacer" />
        <label className="small">
          手順を出すまで{' '}
          <select value={delay} onChange={(e) => changeDelay(Number(e.target.value))}>
            {DELAYS.map((d) => (
              <option key={d} value={d}>
                {d === 0 ? 'すぐ' : `${d}秒`}
              </option>
            ))}
          </select>
        </label>
      </section>
      <PracticeRunner
        source={assistSolveSource}
        prepare={prepare}
        onSaved={onSaved}
        overlay={(state) => (state.phase === 'running' ? <AssistPanel cases={cases} delay={delay} /> : null)}
        side={
          <section className="panel">
            {last && (
              <p>
                <span className="muted small">直前の記録</span>{' '}
                <strong>{formatTime(effectiveTime(last.total_ms, last.penalty), 3)}</strong>{' '}
                <Link to={`/history/${last.id}`} className="small">
                  詳細
                </Link>
              </p>
            )}
            <div className="averages">
              <div>
                <span className="muted">ao5</span>{' '}
                <strong>{formatTime(times.length >= 5 ? averageOf(times.slice(0, 5)) : undefined)}</strong>
              </div>
              <div>
                <span className="muted">ao12</span>{' '}
                <strong>{formatTime(times.length >= 12 ? averageOf(times.slice(0, 12)) : undefined)}</strong>
              </div>
              <div>
                <span className="muted">best（直近12）</span> <strong>{formatTime(best(times))}</strong>
              </div>
            </div>
            <p className="muted small">
              補助付きの記録は <Link to="/history">履歴</Link> でモード「補助付き」を選ぶと見られます。
            </p>
          </section>
        }
      />
    </div>
  )
}

/** 計測中の補助。キューブの状態が変わるたびに判定し直す。 */
function AssistPanel({ cases, delay }: { cases: Map<string, CaseInfo>; delay: number }) {
  const store = useCubeStore()
  const { pattern } = useCubeState()
  const { settings } = useSettings()
  const rot = useMemo(
    () => holdRotation(store.kpuzzle.defaultPattern(), settings.hold_bottom, settings.hold_front),
    [store.kpuzzle, settings.hold_bottom, settings.hold_front],
  )
  const assist = useMemo(
    () => assistFor(store.kpuzzle, viewFrom(store.kpuzzle, pattern, rot), preferredAlg),
    [store.kpuzzle, pattern, rot],
  )

  // 同じケースのあいだは表示を続け、ケースが変わったら delay 秒待ってから手順を出す
  const key = assistKey(assist)
  const [revealed, setRevealed] = useState<string | null>(null)
  useEffect(() => {
    if (delay === 0) return
    const timer = setTimeout(() => setRevealed(key), delay * 1000)
    return () => clearTimeout(timer)
  }, [key, delay])
  const show = delay === 0 || revealed === key

  if (settings.hold_bottom !== settings.cross_color) {
    return (
      <section className="panel assist">
        <p className="muted">持ち方の下の色がクロス色と違うため、補助を出せません（設定の「持ち方」をクロス色が下になるようにしてください）。</p>
      </section>
    )
  }
  if (assist.stage === 'cross' || assist.stage === 'solved') {
    return (
      <section className="panel assist">
        <div className="assist-stage">{assist.stage === 'cross' ? 'Cross' : '完成'}</div>
      </section>
    )
  }
  return (
    <section className="panel assist">
      {assist.stage === 'f2l' && (
        <>
          <div className="assist-stage">F2L（残り {assist.slots.length} スロット）</div>
          {assist.slots.map((s) => (
            <CaseHint
              key={s.slot}
              place={s.slot}
              c={s.case}
              info={s.case ? cases.get(s.case.id) : undefined}
              steps={s.case ? [s.rotation, s.pre, s.alg] : []}
              show={show}
              missing="41 ケースに当てはまりません（ペアの片方がほかのスロットにあります。取り出してください）"
            />
          ))}
        </>
      )}
      {assist.stage === 'oll' && (
        <>
          <div className="assist-stage">OLL</div>
          <CaseHint c={assist.case} info={assist.case ? cases.get(assist.case.id) : undefined} steps={[assist.pre, assist.alg]} show={show} />
        </>
      )}
      {assist.stage === 'pll' && (
        <>
          <div className="assist-stage">PLL</div>
          <CaseHint
            c={assist.case}
            info={assist.case ? cases.get(assist.case.id) : undefined}
            steps={[assist.pre, assist.alg]}
            post={assist.post}
            show={show}
          />
        </>
      )}
    </section>
  )
}

function assistKey(a: Assist): string {
  switch (a.stage) {
    case 'f2l':
      return `f2l:${a.slots.map((s) => `${s.slot}=${s.case?.id ?? '-'}${s.pre}`).join(',')}`
    case 'oll':
    case 'pll':
      return `${a.stage}:${a.case?.id ?? '-'}${a.pre}`
    default:
      return a.stage
  }
}

/** ケース1つ分の表示：図・名前・手順（持ち替えと U を含む）。 */
function CaseHint({
  place,
  c,
  info,
  steps,
  post,
  show,
  missing = 'ケースを判定できませんでした',
}: {
  place?: string
  c: CaseDef | null
  info?: CaseInfo
  steps: string[]
  post?: string
  show: boolean
  missing?: string
}) {
  return (
    <div className="assist-case row">
      {place && <span className="assist-slot">{place}</span>}
      {!c ? (
        <span className="muted small">{missing}</span>
      ) : !show ? (
        <span className="muted">考え中…</span>
      ) : (
        <>
          {info && <CaseDiagram c={info} size={56} />}
          <div>
            <div>
              <strong>{c.name}</strong>
              {info?.learned && <span className="learned-mark"> ✓覚えた</span>}
            </div>
            <div className="alg assist-alg">
              {steps.filter(Boolean).map((s, i) => (
                <span key={i} className={/^[yU]/.test(s) && s.length <= 3 ? 'assist-setup' : ''}>
                  {s}
                </span>
              ))}
              {post && <span className="assist-setup">{post}</span>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
