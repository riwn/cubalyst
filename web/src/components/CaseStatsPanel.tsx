import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { getStageCaseSummary, listCases, type CaseInfo, type SolveMode, type StageCaseSummary } from '../api'
import { formatTime } from '../solve/stats'
import { CaseDiagram } from './CaseDiagram'

const SETS = ['PLL', 'OLL', 'F2L'] as const
type SetName = (typeof SETS)[number]

type Sort = 'gain' | 'avg' | 'recognition' | 'count'
const SORTS: { value: Sort; label: string }[] = [
  { value: 'gain', label: '伸びしろ' },
  { value: 'avg', label: '平均' },
  { value: 'recognition', label: '認識' },
  { value: 'count', label: '回数' },
]

/** ケース判定はサーバーで回転ログを再生するので、まとめ解析と同じ上限まで。 */
const LIMIT = 1000
/** これより少ないケースは平均がぶれやすいので薄く出す。 */
const FEW = 3

type Row = {
  key: string
  id: string
  name: string
  count: number
  avg: number
  recognition: number
  moves: number
  /** 標準手順より多く回した手数。 */
  extra: number | null
  note: string
  /** (このケースの平均 − 全体の平均) × 回数。遅い分の合計（ms）。 */
  gain: number
}

function rowsOf(data: StageCaseSummary, set: SetName): Row[] {
  const rows: Omit<Row, 'gain'>[] =
    set === 'F2L'
      ? data.summary.f2l_cases.map((c) => ({
          key: c.id,
          id: c.id,
          name: c.name,
          count: c.count,
          avg: c.avg_ms,
          recognition: c.avg_recognition_ms,
          moves: c.avg_moves,
          extra: c.avg_extra,
          note: c.rewrong > 0 ? `色違い ${c.rewrong}` : '',
        }))
      : data.summary[set === 'OLL' ? 'oll' : 'pll'].map((c) => ({
          key: c.id || 'unknown',
          id: c.id,
          name: c.id ? c.name : '判定できない形',
          count: c.count,
          avg: c.avg_ms,
          recognition: c.avg_recognition_ms,
          moves: c.avg_moves,
          extra: c.avg_extra,
          note: [c.avg_steps > 1 && `手順 ${c.avg_steps.toFixed(1)}回`, c.repeated > 0 && `やり直し ${c.repeated}`]
            .filter(Boolean)
            .join(' ・ '),
        }))
  const total = rows.reduce((n, r) => n + r.count, 0)
  const mean = total > 0 ? rows.reduce((s, r) => s + r.avg * r.count, 0) / total : 0
  return rows.map((r) => ({ ...r, gain: Math.max(0, r.avg - mean) * r.count }))
}

function sortRows(rows: Row[], sort: Sort): Row[] {
  const key: Record<Sort, (r: Row) => number> = {
    gain: (r) => r.gain,
    avg: (r) => r.avg,
    recognition: (r) => r.recognition,
    count: (r) => r.count,
  }
  return [...rows].sort((a, b) => key[sort](b) - key[sort](a) || b.count - a.count)
}

/**
 * ケース別：フルソルブの各段階を始めたときのケース（OLL・PLL・F2L）ごとの時間・認識・手数。
 * 遅いケースを見つけて、手順練習へつなぐ。
 */
export function CaseStatsPanel({ mode, from, to }: { mode: SolveMode; from?: string; to?: string }) {
  const [data, setData] = useState<StageCaseSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cases, setCases] = useState<Map<string, CaseInfo>>(new Map())
  const [set, setSet] = useState<SetName>('PLL')
  const [sort, setSort] = useState<Sort>('gain')

  useEffect(() => {
    let cancelled = false
    getStageCaseSummary({ mode, from, to, limit: LIMIT })
      .then((d) => {
        if (cancelled) return
        setData(d)
        setError(null)
      })
      .catch((err: unknown) => !cancelled && setError(err instanceof Error ? err.message : String(err)))
    return () => {
      cancelled = true
    }
  }, [mode, from, to])

  useEffect(() => {
    listCases()
      .then((list) => setCases(new Map(list.map((c) => [c.id, c]))))
      .catch(() => {
        // 図が出ないだけで、表は読める
      })
  }, [])

  const all = useMemo(() => (data ? rowsOf(data, set) : []), [data, set])
  const rows = useMemo(() => sortRows(all, sort), [all, sort])
  const counted = all.reduce((n, r) => n + r.count, 0)
  const mean = counted > 0 ? all.reduce((s, r) => s + r.avg * r.count, 0) / counted : 0
  const unmatched = data && set === 'F2L' ? data.summary.pairs - counted : 0

  return (
    <section className="panel case-stats">
      <div className="row">
        <h3>ケース別</h3>
        {SETS.map((s) => (
          <button key={s} className={set === s ? 'on-accent' : ''} onClick={() => setSet(s)}>
            {s}
          </button>
        ))}
        <span className="spacer" />
        <label className="small">
          並べ替え{' '}
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted small">
        回転ログから、各段階を始めたときのケースを判定して集計しています。伸びしろは「（そのケースの平均 − {set}{' '}
        全体の平均）× 回数」で、練習すると全体のタイムが縮みやすい順です。
        {data && data.solve_ids.length >= LIMIT && ` 直近${LIMIT}件で集計しています。`}
      </p>
      {error && <p className="error">{error}</p>}
      {!data && !error && <p className="muted">集計しています…</p>}
      {data && rows.length === 0 && <p className="muted">この条件では {set} のケースを判定できたソルブがありません</p>}
      {data && rows.length > 0 && (
        <>
          <div className="case-stats-scroll">
            <table className="splits-table">
              <thead>
                <tr>
                  <th className="left" colSpan={2}>
                    ケース
                  </th>
                  <th>回数</th>
                  <th>平均</th>
                  <th>認識</th>
                  <th>実行</th>
                  <th>手数</th>
                  <th title="標準手順より多く回した手数">標準比</th>
                  <th>伸びしろ</th>
                  <th className="left">メモ</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const c = cases.get(r.id)
                  return (
                    <tr key={r.key} className={r.count < FEW ? 'muted' : undefined}>
                      <td className="case-stats-diagram">{c && <CaseDiagram c={c} size={40} />}</td>
                      <th className="left">
                        {c?.learned && (
                          <span className="learned-mark" aria-label="覚えた">
                            ✓
                          </span>
                        )}
                        {r.name}
                      </th>
                      <td>{r.count}</td>
                      <td className={r.avg > mean ? 'case-stats-slow' : undefined}>{formatTime(r.avg, 2)}</td>
                      <td>{formatTime(r.recognition, 2)}</td>
                      <td>{formatTime(r.avg - r.recognition, 2)}</td>
                      <td>{r.moves.toFixed(1)}</td>
                      <td>{r.extra == null ? '—' : `${r.extra > 0 ? '+' : ''}${r.extra.toFixed(1)}`}</td>
                      <td>{r.gain > 0 ? `+${(r.gain / 1000).toFixed(1)}秒` : '—'}</td>
                      <td className="left small">{r.note}</td>
                      <td>{c && <Link to={`/practice?case=${encodeURIComponent(c.id)}`}>練習</Link>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="muted small">
            {set} 全体の平均 {formatTime(mean, 2)}（{counted}回）。✓ は手順練習で覚えた印を付けたケース、{FEW}回未満のケースは薄く表示しています。
            {set !== 'F2L' && '標準比は1つの手順で揃えた回だけで、AUF の手も含みます。'}
            {unmatched > 0 && ` ほかに、41ケースに当てはまらないペア（片方が別のスロットにあるなど）が${unmatched}回あります。`}
          </p>
        </>
      )}
    </section>
  )
}
