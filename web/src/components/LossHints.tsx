import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { getSolveStageCases, type StageSolve } from '../api'
import { caseStats } from '../cases/stats'
import { lossHints, MIN_EXTRA_MOVES } from '../solve/hints'
import { useSolveList } from '../solve/hooks'

const sec = (ms: number) => (ms / 1000).toFixed(1)

/** 「この手順なら速かった」：ケースが分かった段階を標準手順と比べ、時間を損したところを挙げる。 */
export function LossHints({ solveId }: { solveId: number }) {
  const [stages, setStages] = useState<StageSolve | null>(null)
  const [error, setError] = useState<string | null>(null)
  const drills = useSolveList({ mode: 'case', limit: 0 })
  const means = useMemo(() => caseStats(drills.solves), [drills.solves])

  useEffect(() => {
    let cancelled = false
    getSolveStageCases(solveId)
      .then((s) => !cancelled && setStages(s ?? null))
      .catch((err: unknown) => !cancelled && setError(err instanceof Error ? err.message : String(err)))
    return () => {
      cancelled = true
    }
  }, [solveId])

  const hints = useMemo(() => (stages ? lossHints(stages, (id) => means.get(id)?.mean) : []), [stages, means])
  const total = hints.reduce((s, h) => s + h.savedMs, 0)

  return (
    <section className="panel loss-hints">
      <h3>この手順なら速かった</h3>
      {error && <p className="error">{error}</p>}
      {!stages && !error && <p className="muted">判定しています…</p>}
      {stages && hints.length === 0 && (
        <p className="muted">標準手順より大きく遠回りした段階はありませんでした</p>
      )}
      {hints.length > 0 && (
        <>
          <p>
            標準手順で回していれば、合わせて約 <strong>{sec(total)}秒</strong> 速かった見込みです。
          </p>
          <ul className="loss-hint-list">
            {hints.map((h) => (
              <li key={h.stage}>
                <div className="row">
                  <strong>{h.label}</strong>
                  <span>
                    {h.case.name} を{h.multiLook ? '2つ以上の手順で' : ''} {h.moves}手（標準 {h.case.moves}手）
                  </span>
                  <span className="loss-hint-saved">−{sec(h.savedMs)}秒</span>
                  <span className="spacer" />
                  <Link to={`/practice?case=${encodeURIComponent(h.case.id)}`}>練習</Link>
                </div>
                <div className="muted small">
                  実行 {sec(h.execMs)}秒 → 見込み {sec(h.expectedMs)}秒（
                  {h.basis === 'drill' ? '手順練習の平均' : 'この段階と同じ速さで標準手順の手数を回した場合'}）
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="muted small">
        回転ログから各段階を始めたときのケースを判定し、標準手順より {MIN_EXTRA_MOVES}手以上多く回した段階と、OLL・PLL を
        2つ以上の手順で揃えた段階を挙げています。認識の時間は比べていません。
      </p>
    </section>
  )
}
