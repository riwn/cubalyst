import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { listCases, type CaseInfo } from '../api'
import {
  addRecogResult,
  loadRecogStats,
  pickRecogCase,
  recogAvg,
  recogFacelets,
  saveRecogStats,
  type RecogStats,
} from '../cases/recog'
import { CaseDiagram, IsoCube } from '../components/CaseDiagram'
import { formatTime } from '../solve/stats'

type Question = { id: string; facelets: string }
type Answer = { picked: string; correct: boolean; ms: number }

/** 正解のあと、次の問題へ進むまでの時間。 */
const NEXT_DELAY_MS = 700

const rand4 = () => Math.floor(Math.random() * 4)

/**
 * PLL の認識練習：前と右の2面だけを見て、どの PLL かを答える。キューブは使わないので、スマホでもできる。
 * 記録（ケースごとの正解率と時間）は、この端末のブラウザにだけ保存する。
 */
export function PllRecogPractice() {
  const [cases, setCases] = useState<CaseInfo[]>([])
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<RecogStats>(loadRecogStats)
  const [learnedOnly, setLearnedOnly] = useState(false)
  const [question, setQuestion] = useState<Question | null>(null)
  const [answer, setAnswer] = useState<Answer | null>(null)
  // 次の問題を選ぶときに、最新の記録を読む（記録が変わるたびに問題を出し直さないため）
  const statsRef = useRef(stats)

  useEffect(() => {
    listCases()
      .then((list) => setCases(list.filter((c) => c.set === 'PLL')))
      .catch((err: unknown) => setError(String(err)))
  }, [])

  const byId = useMemo(() => new Map(cases.map((c) => [c.id, c])), [cases])
  const pool = useMemo(() => {
    const learned = cases.filter((c) => c.learned)
    return learnedOnly && learned.length > 0 ? learned : cases
  }, [cases, learnedOnly])

  const next = useCallback(
    (last: string | null) => {
      if (pool.length === 0) return
      const id = pickRecogCase(
        pool.map((c) => c.id),
        statsRef.current,
        last,
        Math.random(),
      )
      const c = pool.find((x) => x.id === id)!
      setAnswer(null)
      setQuestion({ id, facelets: recogFacelets(c.pattern, rand4(), rand4()) })
    },
    [pool],
  )

  // 問題が画面に出た時刻（答えるまでの時間を測る）
  const shownAt = useRef(0)
  useEffect(() => {
    shownAt.current = performance.now()
  }, [question])

  // 最初の問題と、出す範囲を変えたときの出し直し
  useEffect(() => {
    // eslint-disable-next-line react/set-state-in-effect
    next(null)
  }, [next])

  /** at は押した時刻（イベントの timeStamp。performance.now と同じ基準）。 */
  const pick = (id: string, at: number) => {
    if (!question || answer) return
    const ms = Math.max(0, Math.round(at - shownAt.current))
    const correct = id === question.id
    const updated = addRecogResult(statsRef.current, question.id, correct, ms)
    statsRef.current = updated
    setStats(updated)
    saveRecogStats(updated)
    setAnswer({ picked: id, correct, ms })
  }

  // 正解なら少し見せてから次へ。間違えたときは、正解の形を見てから自分で進む
  useEffect(() => {
    if (!answer?.correct || !question) return
    const timer = setTimeout(() => next(question.id), NEXT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [answer, question, next])

  const reset = () => {
    statsRef.current = {}
    setStats({})
    saveRecogStats({})
  }

  if (error) return <p className="error">{error}</p>

  const groups = [...new Set(cases.map((c) => c.group))]
  const correctCase = question ? byId.get(question.id) : undefined
  const total = Object.values(stats).reduce((a, s) => ({ n: a.n + s.n, ok: a.ok + s.ok, ms: a.ms + s.ms }), { n: 0, ok: 0, ms: 0 })
  const rows = cases
    .map((c) => ({ c, s: stats[c.id] }))
    .filter((r) => r.s && r.s.n > 0)
    .sort((a, b) => a.s!.ok / a.s!.n - b.s!.ok / b.s!.n || (recogAvg(b.s) ?? 0) - (recogAvg(a.s) ?? 0))

  return (
    <div className="recog">
      <section className="panel row">
        <span className="muted small">前と右の2面だけを見て、どの PLL かを答えます。間違えやすいケースと遅いケースが多めに出ます</span>
        <span className="spacer" />
        <label className="small">
          <input type="checkbox" checked={learnedOnly} onChange={(e) => setLearnedOnly(e.target.checked)} /> 覚えた手順だけ
        </label>
      </section>

      <section className="panel recog-question">
        <div className="recog-cube">{question && <IsoCube facelets={question.facelets} size={200} />}</div>
        <div className="recog-result" aria-live="polite">
          {!answer && <p className="muted">下のボタンで答えてください</p>}
          {answer?.correct && (
            <p className="recog-ok">
              正解　{correctCase?.name}　{formatTime(answer.ms, 2)}
            </p>
          )}
          {answer && !answer.correct && correctCase && question && (
            <>
              <p className="recog-ng">
                正解は {correctCase.name}（答えたのは {byId.get(answer.picked)?.name}）
              </p>
              <div className="row">
                <CaseDiagram c={correctCase} size={88} arrows />
                <button className="primary" onClick={() => next(question.id)}>
                  次へ
                </button>
              </div>
            </>
          )}
        </div>
      </section>

      <section className="panel recog-answers">
        {groups.map((g) => (
          <div key={g} className="recog-answer-group">
            <span className="muted small">{g}</span>
            {cases
              .filter((c) => c.group === g)
              .map((c) => {
                const mark = !answer ? '' : c.id === question?.id ? 'correct' : c.id === answer.picked ? 'wrong' : ''
                return (
                  <button key={c.id} className={`recog-answer ${mark}`} onClick={(e) => pick(c.id, e.timeStamp)} disabled={!!answer}>
                    {c.name.replace(' perm', '')}
                  </button>
                )
              })}
          </div>
        ))}
      </section>

      <section className="panel">
        <div className="row">
          <h3>記録</h3>
          <span className="muted small">
            {total.n}問 ・ 正解 {total.n > 0 ? Math.round((total.ok / total.n) * 100) : 0}% ・ 平均{' '}
            {formatTime(total.ok > 0 ? total.ms / total.ok : undefined, 2)}（この端末のブラウザにだけ保存しています）
          </span>
          <span className="spacer" />
          {total.n > 0 && <button onClick={reset}>記録を消す</button>}
        </div>
        {rows.length > 0 && (
          <table className="splits-table recog-stats">
            <thead>
              <tr>
                <th className="left">ケース</th>
                <th>回数</th>
                <th>正解率</th>
                <th title="正解したときの平均">平均</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ c, s }) => (
                <tr key={c.id}>
                  <th className="left">{c.name}</th>
                  <td>{s!.n}</td>
                  <td>{Math.round((s!.ok / s!.n) * 100)}%</td>
                  <td>{formatTime(recogAvg(s) ?? undefined, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
