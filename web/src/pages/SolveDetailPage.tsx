import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import {
  analyzeSolve,
  deleteSolve,
  exportUrl,
  getSolve,
  listSolveAnalyses,
  replaceSplits,
  updateSolve,
  type Solve,
} from '../api'
import { AnalysisPanel } from '../components/AnalysisPanel'
import { SplitsTable } from '../components/SplitsTable'
import { useCubeStore } from '../cube/hooks'
import { ReplayPlayer } from '../replay/ReplayPlayer'
import { useSettings } from '../settings/hooks'
import { computeSplits, COLOR_LABELS } from '../solve/cfop'
import { effectiveTime, formatTime, type Penalty } from '../solve/stats'
import { formatDate, MODE_LABELS } from '../format'

/** ソルブ詳細：段階タイム、スクランブル、解法、ペナルティ・メモ編集。 */
export function SolveDetailPage() {
  const { id } = useParams()
  const solveId = Number(id)
  const [solve, setSolve] = useState<Solve | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getSolve(solveId)
      .then((s) => !cancelled && setSolve(s))
      .catch((err: unknown) => !cancelled && setError(String(err)))
    return () => {
      cancelled = true
    }
  }, [solveId])

  if (error) return <p className="error">{error}</p>
  if (!solve) return <p className="muted">読み込み中…</p>
  return <SolveDetail key={solve.id} solve={solve} onChange={setSolve} />
}

function SolveDetail({ solve, onChange }: { solve: Solve; onChange: (s: Solve) => void }) {
  const navigate = useNavigate()
  const store = useCubeStore()
  const { settings } = useSettings()
  const [note, setNote] = useState(solve.note)
  const [message, setMessage] = useState<string | null>(null)

  const setPenalty = async (p: Penalty) => onChange(await updateSolve(solve.id, { penalty: solve.penalty === p ? '' : p }))
  const saveNote = async () => {
    onChange(await updateSolve(solve.id, { note }))
    setMessage('メモを保存しました')
  }
  const remove = async () => {
    if (!confirm('この記録を削除しますか？')) return
    await deleteSolve(solve.id)
    navigate('/history')
  }
  const recompute = async () => {
    if (!solve.moves?.length) return
    onChange(await replaceSplits(solve.id, computeSplits(store.kpuzzle, solve.moves, settings.cross_color)))
    setMessage(`段階を再計算しました（クロス色：${COLOR_LABELS[settings.cross_color]}）`)
  }

  const moves = solve.moves ?? []
  const tps = solve.total_ms > 0 ? (moves.length / (solve.total_ms / 1000)).toFixed(2) : '—'

  return (
    <div className="detail-page">
      <p>
        <Link to="/history">← 履歴</Link>
      </p>
      <section className="panel detail-header">
        <div className="detail-time">
          {formatTime(effectiveTime(solve.total_ms, solve.penalty), 3)}
          {solve.penalty === '+2' && <span className="penalty"> (+2)</span>}
        </div>
        <div className="muted">
          #{solve.id} ・ {formatDate(solve.solved_at)} ・ {MODE_LABELS[solve.mode]}
          {solve.case_id && ` ${solve.case_id}`}
          {solve.step && ` ${solve.step}`} ・ {moves.length}手 ・ {tps} TPS
        </div>
        <div className="row">
          <button className={solve.penalty === '+2' ? 'on' : ''} onClick={() => setPenalty('+2')}>
            +2
          </button>
          <button className={solve.penalty === 'DNF' ? 'on' : ''} onClick={() => setPenalty('DNF')}>
            DNF
          </button>
          <span className="spacer" />
          <a className="button" href={exportUrl('txt', { ids: [solve.id] })}>
            テキストで出力
          </a>
          <button onClick={remove}>削除</button>
        </div>
      </section>

      <section className="panel">
        <h3>再生</h3>
        <ReplayPlayer solve={solve} kpuzzle={store.kpuzzle} />
      </section>

      <section className="panel">
        <h3>スクランブル</h3>
        <p className="alg">{solve.scramble}</p>
      </section>

      <section className="panel">
        <div className="row">
          <h3>段階</h3>
          {solve.mode === 'full' && <button onClick={recompute}>段階を再計算</button>}
        </div>
        <SplitsTable splits={solve.splits ?? []} moves={moves} totalMs={solve.total_ms} />
        {(solve.splits ?? []).length === 0 && moves.length > 0 && (
          <p className="alg">{moves.map((m) => m.move).join(' ')}</p>
        )}
      </section>

      <section className="panel">
        <h3>メモ</h3>
        <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="row">
          <button onClick={saveNote} disabled={note === solve.note}>
            保存
          </button>
        </div>
      </section>

      {message && <p className="muted">{message}</p>}

      <AnalysisPanel
        title="Claudeによる解析"
        runLabel="このソルブを解析"
        load={() => listSolveAnalyses(solve.id)}
        run={() => analyzeSolve(solve.id)}
        reloadKey={solve.id}
      />
    </div>
  )
}
