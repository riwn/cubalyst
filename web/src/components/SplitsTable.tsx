import type { SolveMove } from '../api'
import { useHoldFrame } from '../settings/hooks'
import { STAGE_LABELS, type Split } from '../solve/cfop'
import { notationTokens, type HoldChange, type Holds, type NotationToken } from '../solve/holds'
import { formatTime } from '../solve/stats'

function tps(moves: number, ms: number): string {
  return ms > 0 ? (moves / (ms / 1000)).toFixed(2) : '—'
}

/** 持ち替えの所要時間（秒）と、ワイドムーブかもしれないことの説明。 */
function rotationTitle(c: HoldChange): string {
  const sec = ((c.end_t - c.start_t) / 1000).toFixed(2)
  return `持ち替え ${c.rot}（${sec}秒）` + (c.with_move ? '。L・R と同時なので、ワイドムーブやスライスの一部かもしれません' : '')
}

/** 解法の表示。持ち替えは色を変え、所要時間をツールチップで出す。 */
export function NotationLine({ tokens }: { tokens: NotationToken[] }) {
  return (
    <>
      {tokens.map((t, i) => (
        <span
          key={i}
          className={t.kind === 'rotation' ? 'rot' : undefined}
          title={t.kind === 'rotation' ? rotationTitle(t.change) : undefined}
        >
          {i > 0 && ' '}
          {t.text}
        </span>
      ))}
    </>
  )
}

/**
 * 段階ごとの時間・手数・TPSと、その段階の解法（持ち方での記号）。
 * 持ち替えの記録があれば、その時点の持ち方で書き、持ち替えの回数と時間の列を足す。
 */
export function SplitsTable({
  splits,
  moves,
  holds,
  totalMs,
}: {
  splits: Split[]
  moves?: SolveMove[]
  holds?: Holds | null
  totalMs: number
}) {
  const frame = useHoldFrame()
  if (splits.length === 0) return <p className="muted">ステップの記録がありません</p>
  return (
    <table className="splits-table">
      <thead>
        <tr>
          <th>ステップ</th>
          <th>経過</th>
          <th>所要</th>
          <th>割合</th>
          <th>手数</th>
          <th>TPS</th>
          {holds && <th title="持ち替えの回数（合計の秒数）">持ち替え</th>}
          <th className="left">解法</th>
        </tr>
      </thead>
      <tbody>
        {splits.map((s) => {
          const ms = s.end_ms - s.start_ms
          const tokens = moves ? notationTokens(moves, holds, frame, s.start_index, s.end_index) : []
          const rots = tokens.flatMap((t) => (t.kind === 'rotation' ? [t.change] : []))
          const rotMs = rots.reduce((sum, c) => sum + (c.end_t - c.start_t), 0)
          return (
            <tr key={s.stage}>
              <th>{STAGE_LABELS[s.stage]}</th>
              <td>{formatTime(s.end_ms, 3)}</td>
              <td>{formatTime(ms, 3)}</td>
              <td>{totalMs > 0 ? `${Math.round((ms / totalMs) * 100)}%` : '—'}</td>
              <td>{s.move_count}</td>
              <td>{tps(s.move_count, ms)}</td>
              {holds && <td>{rots.length ? `${rots.length}（${(rotMs / 1000).toFixed(2)}）` : '—'}</td>}
              <td className="alg">{tokens.length ? <NotationLine tokens={tokens} /> : <span className="muted">(skip)</span>}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
