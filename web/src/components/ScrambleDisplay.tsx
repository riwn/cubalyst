import type { SessionState, SolveSession } from '../solve/session'
import { KebabMenu } from '../ui/Popover'

/** スクランブル手順と進捗。間違えたときは戻す手順を表示する。 */
export function ScrambleDisplay({ session, state }: { session: SolveSession; state: SessionState }) {
  const { phase, progress, exercise } = state

  return (
    <section className="scramble">
      {exercise?.label && <div className="exercise-label">{exercise.label}</div>}
      {phase === 'generating' && <p className="muted">スクランブルを生成中…</p>}
      {/* 回し始めたら手順は消して、場所をキューブに回す */}
      {progress && phase !== 'running' && (
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
        {phase !== 'running' && (
          <button
            className="icon-button"
            onClick={() => void session.next()}
            disabled={phase === 'generating'}
            title="新しいスクランブル"
            aria-label="新しいスクランブル"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
        {phase === 'scrambling' && (
          <KebabMenu
            align="left"
            items={[
              {
                label: 'スクランブル完了にする（追跡がうまくいかないとき）',
                onSelect: () => session.forceReady(),
              },
            ]}
          />
        )}
        {phase === 'running' && <button onClick={() => session.abort()}>中止</button>}
      </div>
    </section>
  )
}
