import { useMemo, useState } from 'react'
import { useCubeState } from '../cube/hooks'
import { fitTimestamps } from '../cube/timestamps'

const SHOWN = 30

/** 直近の回転ログ。生のタイムスタンプと補正後の時刻を並べて表示する。 */
export function MoveLog() {
  const { moves } = useCubeState()
  const [copied, setCopied] = useState(false)
  const fitted = useMemo(() => fitTimestamps(moves), [moves])
  const shown = fitted.slice(-SHOWN).reverse()

  const copy = async () => {
    const json = JSON.stringify(
      moves.map(({ move, localTimestamp, cubeTimestamp }) => ({ move, localTimestamp, cubeTimestamp })),
    )
    await navigator.clipboard.writeText(json)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <section className="panel move-log">
      <div className="row">
        <h3>回転ログ（{moves.length}手）</h3>
        <button onClick={copy} disabled={moves.length === 0}>
          {copied ? 'コピーしました' : 'JSONをコピー'}
        </button>
      </div>
      {moves.length === 0 ? (
        <p className="muted">まだ回転がありません</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>手</th>
              <th>キューブ時刻</th>
              <th>PC時刻</th>
              <th>補正後(ms)</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((m, i) => (
              <tr key={fitted.length - i}>
                <td className="muted">{fitted.length - i}</td>
                <td className="move">{m.move}</td>
                <td>{m.cubeTimestamp ?? '—'}</td>
                <td>{m.localTimestamp ?? '—'}</td>
                <td>{m.fittedTimestamp}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
