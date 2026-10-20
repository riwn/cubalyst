import { Link } from 'react-router'
import { deleteSolve, updateSolve, type Solve } from '../api'
import { averageOf, best, effectiveTime, formatTime, rollingAverages, type Penalty } from '../solve/stats'

/** 直近の記録とao5/ao12。solves は新しい順。 */
export function RecentSolves({ solves, onChange }: { solves: Solve[]; onChange: () => void }) {
  const times = solves.map((s) => effectiveTime(s.total_ms, s.penalty))
  const chronological = [...times].reverse()
  const ao5 = averageOf(times.slice(0, 5).length === 5 ? times.slice(0, 5) : [])
  const ao12 = averageOf(times.slice(0, 12).length === 12 ? times.slice(0, 12) : [])

  const setPenalty = async (s: Solve, penalty: Penalty) => {
    await updateSolve(s.id, { penalty: s.penalty === penalty ? '' : penalty })
    onChange()
  }
  const remove = async (s: Solve) => {
    if (!confirm(`${formatTime(effectiveTime(s.total_ms, s.penalty), 3)} の記録を削除しますか？`)) return
    await deleteSolve(s.id)
    onChange()
  }

  return (
    <section className="panel recent-solves">
      <div className="averages">
        <div>
          <span className="muted">ao5</span> <strong>{formatTime(ao5)}</strong>
        </div>
        <div>
          <span className="muted">ao12</span> <strong>{formatTime(ao12)}</strong>
        </div>
        <div>
          <span className="muted">best</span> <strong>{formatTime(best(chronological))}</strong>
        </div>
        <div>
          <span className="muted">best ao5</span> <strong>{formatTime(best(rollingAverages(chronological, 5)))}</strong>
        </div>
      </div>
      {solves.length === 0 ? (
        <p className="muted">まだ記録がありません</p>
      ) : (
        <table className="solve-table">
          <tbody>
            {solves.map((s, i) => (
              <tr key={s.id}>
                <td className="muted">{solves.length - i}</td>
                <td className="time">
                  <Link to={`/history/${s.id}`}>{formatTime(effectiveTime(s.total_ms, s.penalty), 3)}</Link>
                  {s.penalty === '+2' && <span className="penalty">+</span>}
                </td>
                <td className="actions">
                  <button className={s.penalty === '+2' ? 'on' : ''} onClick={() => setPenalty(s, '+2')}>
                    +2
                  </button>
                  <button className={s.penalty === 'DNF' ? 'on' : ''} onClick={() => setPenalty(s, 'DNF')}>
                    DNF
                  </button>
                  <button onClick={() => remove(s)} title="削除">
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
