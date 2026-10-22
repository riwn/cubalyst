import { Fragment, useState } from 'react'
import { Link } from 'react-router'
import { exportUrl, type ExportFormat, type Solve, type SolveFilter, type SolveMode, type SolveSort } from '../api'
import { AnalysisTabs } from '../components/AnalysisTabs'
import { formatDate, KIND_LABELS, MODE_LABELS } from '../format'
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

type Sort = { key: SolveSort; asc: boolean }
const DEFAULT_SORT: Sort = { key: 'date', asc: false }

/** 履歴：ソルブ一覧（フィルタ・並べ替え・ページング・選択してexport）。 */
export function HistoryPage() {
  const [mode, setMode] = useState<SolveMode | ''>('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState<Sort>(DEFAULT_SORT)
  const [selected, setSelected] = useState<Set<number>>(new Set())

  const filter: SolveFilter = {
    mode: mode || undefined,
    from: from || undefined,
    to: to ? nextDay(to) : undefined,
  }
  const { solves, total, error } = useSolveList({
    ...filter,
    sort: sort.key,
    order: sort.asc ? 'asc' : 'desc',
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    includeSplits: true,
    includeAnalyses: true,
  })
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
  // 同じ列ならもう一度押すと逆順。別の列は、日時なら新しい順、それ以外は速い（少ない）順から
  const sortBy = (key: SolveSort) =>
    resetPage(setSort)(sort.key === key ? { key, asc: !sort.asc } : { key, asc: key !== 'date' })
  const sortHeader = (key: SolveSort, label: string) => (
    <th aria-sort={sort.key === key ? (sort.asc ? 'ascending' : 'descending') : undefined}>
      <button className={`sort-button ${sort.key === key ? 'sorted' : ''}`} onClick={() => sortBy(key)}>
        {label}
        <span className="sort-mark" aria-hidden="true">
          {sort.key === key ? (sort.asc ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  )

  return (
    <div className="history-page">
      <AnalysisTabs />
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
            {sortHeader('date', '日時')}
            <th>モード</th>
            {sortHeader('time', 'タイム')}
            {GROUPS.map((g) => (
              <Fragment key={g}>{sortHeader(g, GROUP_LABELS[g])}</Fragment>
            ))}
            {sortHeader('moves', '手数')}
            <th>解析</th>
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
                <td className="analysis-marks">
                  <AnalysisMarks solveId={s.id} counts={s.analyses} />
                </td>
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

/** 解析の有無。単体はソルブの詳細へ、まとめはそのソルブを含むまとめ解析の一覧へ。 */
function AnalysisMarks({ solveId, counts }: { solveId: number; counts: Solve['analyses'] }) {
  if (!counts || (counts.solve === 0 && counts.multi === 0)) return null
  return (
    <>
      {counts.solve > 0 && (
        <Link className="kind-badge kind-badge--solve" to={`/history/${solveId}`} title="このソルブの単体の解析があります">
          {KIND_LABELS.solve}
        </Link>
      )}
      {counts.multi > 0 && (
        <Link
          className="kind-badge kind-badge--multi"
          to={`/analyses?kind=multi&solve=${solveId}`}
          title={`このソルブを含むまとめ解析が${counts.multi}件あります`}
        >
          {KIND_LABELS.multi}
          {counts.multi > 1 && `×${counts.multi}`}
        </Link>
      )}
    </>
  )
}
