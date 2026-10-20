import type { SolveMove } from '../api'
import { STAGE_LABELS, type Split } from '../solve/cfop'
import { formatTime } from '../solve/stats'

function tps(moves: number, ms: number): string {
  return ms > 0 ? (moves / (ms / 1000)).toFixed(2) : '—'
}

/** 段階ごとの時間・手数・TPSと、その段階の解法。 */
export function SplitsTable({ splits, moves, totalMs }: { splits: Split[]; moves?: SolveMove[]; totalMs: number }) {
  if (splits.length === 0) return <p className="muted">段階の記録がありません</p>
  return (
    <table className="splits-table">
      <thead>
        <tr>
          <th>段階</th>
          <th>経過</th>
          <th>所要</th>
          <th>割合</th>
          <th>手数</th>
          <th>TPS</th>
          <th className="left">解法</th>
        </tr>
      </thead>
      <tbody>
        {splits.map((s) => {
          const ms = s.end_ms - s.start_ms
          const alg = moves?.slice(s.start_index, s.end_index).map((m) => m.move).join(' ')
          return (
            <tr key={s.stage}>
              <th>{STAGE_LABELS[s.stage]}</th>
              <td>{formatTime(s.end_ms, 3)}</td>
              <td>{formatTime(ms, 3)}</td>
              <td>{totalMs > 0 ? `${Math.round((ms / totalMs) * 100)}%` : '—'}</td>
              <td>{s.move_count}</td>
              <td>{tps(s.move_count, ms)}</td>
              <td className="alg">{alg || <span className="muted">(skip)</span>}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
