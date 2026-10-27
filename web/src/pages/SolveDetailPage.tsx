import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import {
  deleteSolve,
  exportUrl,
  getSolve,
  listAnalyses,
  replaceSplits,
  updateSolve,
  type Analysis,
  type Solve,
} from '../api'
import { AnalysisCard, AnalysisHowTo } from '../components/AnalysisCard'
import { StepShareDonut } from '../components/charts'
import { ConfirmDialog } from '../ui/Dialog'
import { KebabMenu } from '../ui/Popover'
import { NotationLine, SplitsTable } from '../components/SplitsTable'
import { useCubeStore } from '../cube/hooks'
import { ReplayPlayer } from '../replay/ReplayPlayer'
import { notationTokens } from '../solve/holds'
import { useHoldFrame, useSettings } from '../settings/hooks'
import { computeSplits, COLOR_LABELS } from '../solve/cfop'
import { effectiveTime, formatTime, type Penalty } from '../solve/stats'
import { formatDate, isFullSolve, MODE_LABELS, multiTitle } from '../format'

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
  const frame = useHoldFrame()
  const [note, setNote] = useState(solve.note)
  const [message, setMessage] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const setPenalty = async (p: Penalty) => onChange(await updateSolve(solve.id, { penalty: solve.penalty === p ? '' : p }))
  const saveNote = async () => {
    onChange(await updateSolve(solve.id, { note }))
    setMessage('メモを保存しました')
  }
  const remove = async () => {
    setConfirmDelete(false)
    await deleteSolve(solve.id)
    navigate('/history')
  }
  const recompute = async () => {
    if (!solve.moves?.length) return
    onChange(await replaceSplits(solve.id, computeSplits(store.kpuzzle, solve.moves, settings.cross_color)))
    setMessage(`ステップを再計算しました（クロス色：${COLOR_LABELS[settings.cross_color]}）`)
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
          <KebabMenu
            items={[
              { label: 'テキストで出力', onSelect: () => window.location.assign(exportUrl('txt', { ids: [solve.id] })) },
              ...(isFullSolve(solve.mode)
                ? [{ label: 'ステップを再計算', onSelect: () => void recompute() }]
                : []),
              'separator',
              { label: 'この記録を削除', danger: true, onSelect: () => setConfirmDelete(true) },
            ]}
          />
        </div>
      </section>
      <ConfirmDialog
        open={confirmDelete}
        title="記録の削除"
        message={
          <p>
            {formatTime(effectiveTime(solve.total_ms, solve.penalty), 3)}（#{solve.id}）の記録を削除します。回転ログ・ステップ・解析結果もすべて消え、元に戻せません。
          </p>
        }
        confirmLabel="削除する"
        danger
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(false)}
      />

      <section className="panel">
        <h3>再生</h3>
        <ReplayPlayer solve={solve} kpuzzle={store.kpuzzle} />
      </section>

      <section className="panel">
        <h3>スクランブル（白上・緑前）</h3>
        <p className="alg">{solve.scramble}</p>
      </section>

      <section className="panel">
        <h3>ステップ</h3>
        {(solve.splits ?? []).length > 0 && <StepShareDonut splits={solve.splits ?? []} totalMs={solve.total_ms} />}
        <SplitsTable splits={solve.splits ?? []} moves={moves} holds={solve.holds} totalMs={solve.total_ms} />
        {(solve.splits ?? []).length === 0 && moves.length > 0 && (
          <p className="alg">
            <NotationLine tokens={notationTokens(moves, solve.holds, frame)} />
          </p>
        )}
        <HoldsNote solve={solve} />
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

      <SolveAnalyses solveId={solve.id} />
    </div>
  )
}

/** 持ち替えの記録についての一言。ジャイロを使っていない（記録も無い）ソルブでは何も出さない。 */
function HoldsNote({ solve }: { solve: Solve }) {
  const { settings } = useSettings()
  const h = solve.holds
  if (h) {
    const n = h.changes.length
    return (
      <p className="muted small">
        ジャイロで記録した持ち替え {n}回（着手時：下が{COLOR_LABELS[h.start.bottom]}・前が{COLOR_LABELS[h.start.front]}）。
        解法はその時点の持ち方の記号です。
      </p>
    )
  }
  if (solve.gyro?.length) {
    return (
      <p className="muted small">
        持ち替えの記録なし（ジャイロのデータはありますが、着手時の下の色が設定と違うか、途中で途切れたため、持ち方を決められませんでした）
      </p>
    )
  }
  return settings.use_gyro ? <p className="muted small">持ち替えの記録なし（ジャイロのデータがありません）</p> : null
}

/** このソルブの単体の解析と、このソルブを含むまとめ解析へのリンク。 */
function SolveAnalyses({ solveId }: { solveId: number }) {
  const [list, setList] = useState<Analysis[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listAnalyses({ solve_id: solveId })
      .then((l) => !cancelled && setList(l))
      .catch((err: unknown) => !cancelled && setError(String(err)))
    return () => {
      cancelled = true
    }
  }, [solveId])

  const singles = list.filter((a) => a.kind === 'solve')
  const multis = list.filter((a) => a.kind === 'multi')
  return (
    <section className="panel analysis-panel">
      <h3>解析</h3>
      {error && <p className="error">{error}</p>}
      {singles.length === 0 && (
        <>
          <p className="muted">このソルブの単体の解析はまだありません</p>
          <AnalysisHowTo />
        </>
      )}
      {singles.map((a) => (
        <AnalysisCard
          key={a.id}
          a={a}
          showTarget={false}
          onDeleted={(d) => setList((prev) => prev.filter((x) => x.id !== d.id))}
        />
      ))}
      {multis.length > 0 && (
        <div className="analysis-multis">
          <h4>このソルブを含むまとめ解析</h4>
          <ul>
            {multis.map((a) => (
              <li key={a.id}>
                <Link to={`/analyses/${a.id}`}>
                  {multiTitle(a)}
                </Link>{' '}
                <span className="muted small">{formatDate(a.created_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
