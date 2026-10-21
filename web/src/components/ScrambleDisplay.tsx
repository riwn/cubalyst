import type { SessionState, SolveSession } from '../solve/session'

/** スクランブル手順と進捗。間違えたときは戻す手順を表示する。 */
export function ScrambleDisplay({ session, state }: { session: SolveSession; state: SessionState }) {
  const { phase, progress, exercise } = state

  return (
    <section className="scramble">
      {exercise?.label && <div className="exercise-label">{exercise.label}</div>}
      {phase === 'generating' && <p className="muted">スクランブルを生成中…</p>}
      {phase === 'needSolved' && <p className="warn">キューブを完成状態にしてください（揃うと自動でスクランブルが始まります）</p>}
      {progress && phase !== 'needSolved' && (
        <p className="scramble-moves">
          {progress.moves.map((m, i) => {
            const cls =
              i < progress.done
                ? 'done'
                : i === progress.done && progress.correction.length === 0
                  ? progress.half
                    ? 'current half'
                    : 'current'
                  : ''
            return (
              <span key={i} className={`scramble-move ${cls}`}>
                {m}
              </span>
            )
          })}
        </p>
      )}
      <div className="correction-slot" aria-live="polite">
        {progress && progress.correction.length > 0 && phase === 'scrambling' && (
          <p className="correction">
            戻す: <strong>{progress.correction.join(' ')}</strong>
          </p>
        )}
      </div>
      <div className="row scramble-actions">
        {(phase === 'scrambling' || phase === 'needSolved') && (
          <button onClick={() => session.forceReady()} title="スクランブルの追跡がうまくいかないときに使います">
            スクランブル完了にする
          </button>
        )}
        {phase !== 'running' && (
          <button onClick={() => void session.next()} disabled={phase === 'generating'}>
            新しいスクランブル
          </button>
        )}
        {phase === 'running' && <button onClick={() => session.abort()}>中止</button>}
      </div>
    </section>
  )
}
