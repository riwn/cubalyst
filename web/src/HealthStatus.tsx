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
        trigger={<span className="system-icon">⚙</span>}
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
              デバッグ表示（回転ログ・facelets・モック接続）
            </label>
          </div>
        )}
      </Popover>
    </div>
  )
}
