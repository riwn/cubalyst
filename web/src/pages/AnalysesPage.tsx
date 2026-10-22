import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { getAnalysis, listAnalyses, type Analysis, type AnalysisKind } from '../api'
import { AnalysisCard, AnalysisHowTo } from '../components/AnalysisCard'
import { AnalysisTabs } from '../components/AnalysisTabs'
import { formatDate, KIND_LABELS, MODE_LABELS } from '../format'
import { GROUP_LABELS, groupSplits, type StageGroup } from '../solve/cfop'
import { useSolveList } from '../solve/hooks'
import { effectiveTime, formatTime } from '../solve/stats'

const KINDS: (AnalysisKind | '')[] = ['', 'solve', 'multi']
const GROUPS: StageGroup[] = ['cross', 'f2l', 'oll', 'pll']

/** 解析：保存された解析結果の一覧。?kind=solve|multi で種類、?solve=ID でそのソルブを対象にした解析に絞る。 */
export function AnalysesPage() {
  const [params, setParams] = useSearchParams()
  const kind = (params.get('kind') ?? '') as AnalysisKind | ''
  const solveId = Number(params.get('solve')) || undefined
  const [list, setList] = useState<Analysis[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listAnalyses({ kind: kind || undefined, solve_id: solveId })
      .then((l) => !cancelled && setList(l))
      .catch((err: unknown) => !cancelled && setError(String(err)))
    return () => {
      cancelled = true
    }
  }, [kind, solveId])

  const setKind = (k: AnalysisKind | '') => {
    const next = new URLSearchParams(params)
    if (k) next.set('kind', k)
    else next.delete('kind')
    setParams(next)
  }

  return (
    <div className="analyses-page">
      <AnalysisTabs />
      <section className="panel">
        <div className="row">
          {KINDS.map((k) => (
            <button key={k} className={kind === k ? 'on-accent' : ''} onClick={() => setKind(k)}>
              {k ? KIND_LABELS[k] : 'すべて'}
            </button>
          ))}
          {solveId && (
            <span className="row">
              <span>
                <Link to={`/history/${solveId}`}>ソルブ #{solveId}</Link> を対象にした解析
              </span>
              <button
                onClick={() => {
                  const next = new URLSearchParams(params)
                  next.delete('solve')
                  setParams(next)
                }}
              >
                絞り込みを外す
              </button>
            </span>
          )}
          <span className="spacer" />
          {list && <span className="muted">{list.length}件</span>}
        </div>
        <p className="muted small">単体は1回のソルブ、まとめは複数のソルブをまとめた解析です。</p>
        <AnalysisHowTo />
      </section>

      {error && <p className="error">{error}</p>}
      {list?.length === 0 && <p className="muted">まだ解析結果はありません</p>}
      {list?.map((a) => (
        <section key={a.id} className="panel">
          <AnalysisCard a={a} collapsible onDeleted={(d) => setList((prev) => prev?.filter((x) => x.id !== d.id) ?? null)} />
        </section>
      ))}
    </div>
  )
}

/** 解析1件の詳細。まとめは対象のソルブも並べる。 */
export function AnalysisDetailPage() {
  const id = Number(useParams().id)
  const [a, setA] = useState<Analysis | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deleted, setDeleted] = useState(false)

  useEffect(() => {
    let cancelled = false
    getAnalysis(id)
      .then((x) => !cancelled && setA(x))
      .catch((err: unknown) => !cancelled && setError(String(err)))
    return () => {
      cancelled = true
    }
  }, [id])

  if (error) return <p className="error">{error}</p>
  if (deleted) {
    return (
      <p className="muted">
        削除しました。<Link to="/analyses">解析の一覧へ</Link>
      </p>
    )
  }
  if (!a) return <p className="muted">読み込み中…</p>

  return (
    <div className="analysis-detail">
      <p>
        <Link to="/analyses">← 解析の一覧</Link>
      </p>
      {a.kind === 'multi' &&
        (a.solve_ids.length > 0 ? (
          <TargetSolves ids={a.solve_ids} />
        ) : (
          <p className="muted">対象のソルブはすべて削除されています</p>
        ))}
      <section className="panel">
        <AnalysisCard a={a} onDeleted={() => setDeleted(true)} />
      </section>
    </div>
  )
}

/** まとめ解析の対象のソルブ（ids は1件以上）。 */
function TargetSolves({ ids }: { ids: number[] }) {
  const { solves, error } = useSolveList({ ids, limit: 0, includeSplits: true, order: 'asc' })
  const times = solves.map((s) => effectiveTime(s.total_ms, s.penalty)).filter((t): t is number => t !== null)
  const mean = times.length ? times.reduce((x, y) => x + y, 0) / times.length : undefined
  return (
    <section className="panel">
      <div className="row">
        <h3>対象のソルブ（{ids.length}件）</h3>
        {solves.length > 0 && (
          <span className="muted small">
            {formatDate(solves[0].solved_at)} 〜 {formatDate(solves[solves.length - 1].solved_at)} ・ 平均 {formatTime(mean)}
          </span>
        )}
      </div>
      {error && <p className="error">{error}</p>}
      <details>
        <summary className="small">一覧を開く</summary>
        <table className="history-table">
          <thead>
            <tr>
              <th>#</th>
              <th>日時</th>
              <th>モード</th>
              <th>タイム</th>
              {GROUPS.map((g) => (
                <th key={g}>{GROUP_LABELS[g]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {solves.map((s) => {
              const groups = groupSplits(s.splits)
              return (
                <tr key={s.id}>
                  <td className="muted">{s.id}</td>
                  <td>{formatDate(s.solved_at)}</td>
                  <td>{MODE_LABELS[s.mode]}</td>
                  <td className="time">
                    <Link to={`/history/${s.id}`}>{formatTime(effectiveTime(s.total_ms, s.penalty), 3)}</Link>
                  </td>
                  {GROUPS.map((g) => (
                    <td key={g}>{groups[g] ? formatTime(groups[g].ms) : ''}</td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </details>
    </section>
  )
}
