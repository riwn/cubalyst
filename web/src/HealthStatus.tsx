import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { fetchHealth, type Health } from './api'
import { Popover } from './ui/Popover'
import { setDebug, useDebug } from './ui/prefs'

type State = { kind: 'loading' } | { kind: 'done'; health: Health } | { kind: 'failed'; message: string }

const POLL_MS = 30_000

/**
 * ヘッダー右上のメニュー。設定画面へのリンク、サーバー・DBの状態（異常なときだけヘッダーでも目立たせる）、
 * デバッグ表示の切り替えを置く。
 */
export function SystemMenu() {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const debug = useDebug()

  const check = useCallback((signal?: AbortSignal) => {
    fetchHealth(signal)
      .then((health) => setState({ kind: 'done', health }))
      .catch((err: unknown) => {
        if (signal?.aborted) return
        setState({ kind: 'failed', message: err instanceof Error ? err.message : String(err) })
      })
  }, [])

  useEffect(() => {
    const ctrl = new AbortController()
    check(ctrl.signal)
    const timer = setInterval(() => check(), POLL_MS)
    return () => {
      ctrl.abort()
      clearInterval(timer)
    }
  }, [check])

  const ok = state.kind === 'done' && state.health.status === 'ok'
  const bad = state.kind === 'failed' || (state.kind === 'done' && !ok)

  return (
    <div className="row system-area">
      {bad && (
        <span className="error small" role="alert">
          {state.kind === 'failed' ? 'サーバーに接続できません' : 'DBエラー'}
        </span>
      )}
      <Popover
        trigger={
          <svg className="system-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path
              d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        }
        title="設定・システムの状態"
        buttonClassName="icon-button"
      >
        {(close) => (
          <div className="conn-detail">
            <Link className="system-settings-link" to="/settings" onClick={close}>
              設定を開く
            </Link>
            <dl>
              <dt>サーバー</dt>
              <dd className={state.kind === 'failed' ? 'error' : ''}>
                {state.kind === 'loading'
                  ? '確認中…'
                  : state.kind === 'failed'
                    ? `接続できません（${state.message}）`
                    : state.health.status === 'ok'
                      ? 'OK'
                      : 'エラー'}
              </dd>
              {state.kind === 'done' && (
                <>
                  <dt>DB</dt>
                  <dd className={state.health.db === 'ok' ? '' : 'error'}>
                    {state.health.db === 'ok' ? 'OK' : `エラー: ${state.health.error ?? ''}`}
                  </dd>
                  <dt>スキーマ</dt>
                  <dd>v{state.health.schema_version}</dd>
                </>
              )}
            </dl>
            <label className="radio">
              <input type="checkbox" checked={debug} onChange={(e) => setDebug(e.target.checked)} />
              デバッグ表示（回転ログ・facelets・ジャイロ・モック接続）
            </label>
          </div>
        )}
      </Popover>
    </div>
  )
}
