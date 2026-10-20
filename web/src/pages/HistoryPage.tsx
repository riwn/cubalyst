import { useState } from 'react'
import { Link } from 'react-router'
import { exportUrl, type ExportFormat, type SolveFilter, type SolveMode } from '../api'
import { formatDate, MODE_LABELS } from '../format'
import { GROUP_LABELS, groupSplits, type StageGroup } from '../solve/cfop'
import { useSolveList } from '../solve/hooks'
import { effectiveTime, formatTime } from '../solve/stats'

const PAGE_SIZE = 50
const GROUPS: StageGroup[] = ['cross', 'f2l', 'oll', 'pll']

/** 'YYYY-MM-DD' の翌日（期間の終わりを含めるため）。 */
function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 履歴：ソルブ一覧（フィルタ・ページング・選択してexport）。 */
export function HistoryPage() {
  const [mode, setMode] = useState<SolveMode | ''>('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<Set<number>>(new Set())

  const filter: SolveFilter = {
    mode: mode || undefined,
    from: from || undefined,
    to: to ? nextDay(to) : undefined,
  }
  const { solves, total, error } = useSolveList({ ...filter, limit: PAGE_SIZE, offset: page * PAGE_SIZE, includeSplits: true })
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const toggle = (id: number) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }
  const exportFilter = selected.size > 0 ? { ids: [...selected] } : filter
  const download = (format: ExportFormat) => {
    window.location.assign(exportUrl(format, exportFilter))
  }
  const resetPage = <T,>(set: (v: T) => void) => (v: T) => {
    set(v)
    setPage(0)
  }

  return (
    <div className="history-page">
      <section className="panel row">
        <label>
          モード{' '}
          <select value={mode} onChange={(e) => resetPage(setMode)(e.target.value as SolveMode | '')}>
            <option value="">すべて</option>
            {Object.entries(MODE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          期間 <input type="date" value={from} onChange={(e) => resetPage(setFrom)(e.target.value)} />
        </label>
        <label>
          〜 <input type="date" value={to} onChange={(e) => resetPage(setTo)(e.target.value)} />
        </label>
        <span className="muted">{total}件</span>
        <span className="spacer" />
        <span className="muted small">{selected.size > 0 ? `選択した${selected.size}件を` : '絞り込み結果を'}export:</span>
        {(['json', 'csv', 'txt'] as const).map((f) => (
          <button key={f} onClick={() => download(f)}>
            {f.toUpperCase()}
          </button>
        ))}
        {selected.size > 0 && <button onClick={() => setSelected(new Set())}>選択解除</button>}
      </section>

      {error && <p className="error">{error}</p>}

      <table className="history-table">
        <thead>
          <tr>
            <th />
            <th>#</th>
            <th>日時</th>
            <th>モード</th>
            <th>タイム</th>
            {GROUPS.map((g) => (
              <th key={g}>{GROUP_LABELS[g]}</th>
            ))}
            <th>手数</th>
            <th className="left">メモ</th>
          </tr>
        </thead>
        <tbody>
          {solves.map((s) => {
            const groups = groupSplits(s.splits)
            const moves = s.splits?.reduce((a, sp) => a + sp.move_count, 0)
            return (
              <tr key={s.id}>
                <td>
                  <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                </td>
                <td className="muted">{s.id}</td>
                <td>{formatDate(s.solved_at)}</td>
                <td>
                  {MODE_LABELS[s.mode]}
                  {s.case_id && <span className="muted"> {s.case_id}</span>}
                  {s.step && <span className="muted"> {s.step}</span>}
                </td>
                <td className="time">
                  <Link to={`/history/${s.id}`}>{formatTime(effectiveTime(s.total_ms, s.penalty), 3)}</Link>
                  {s.penalty === '+2' && <span className="penalty">+</span>}
                </td>
                {GROUPS.map((g) => (
                  <td key={g}>{groups[g] ? formatTime(groups[g].ms) : ''}</td>
                ))}
                <td>{moves || ''}</td>
                <td className="left note">{s.note}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {solves.length === 0 && <p className="muted">記録がありません</p>}

      <div className="row pager">
        <button disabled={page === 0} onClick={() => setPage(page - 1)}>
          前へ
        </button>
        <span>
          {page + 1} / {pages}
        </span>
        <button disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>
          次へ
        </button>
      </div>
    </div>
  )
}
