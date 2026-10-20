import { useEffect, useState } from 'react'
import { fetchHealth, type Health } from './api'

type State =
  | { kind: 'loading' }
  | { kind: 'done'; health: Health }
  | { kind: 'failed'; message: string }

// サーバーとDBの状態を表示する。
export function HealthStatus() {
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    const ctrl = new AbortController()
    fetchHealth(ctrl.signal)
      .then((health) => setState({ kind: 'done', health }))
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return
        setState({ kind: 'failed', message: err instanceof Error ? err.message : String(err) })
      })
    return () => ctrl.abort()
  }, [])

  if (state.kind === 'loading') {
    return <p className="health">サーバーに接続中…</p>
  }
  if (state.kind === 'failed') {
    return (
      <p className="health health--error">
        サーバーに接続できません（{state.message}）。Goサーバーが起動しているか確認してください。
      </p>
    )
  }
  const { health } = state
  const ok = health.status === 'ok'
  return (
    <dl className={`health ${ok ? 'health--ok' : 'health--error'}`}>
      <dt>サーバー</dt>
      <dd>{ok ? 'OK' : 'エラー'}</dd>
      <dt>DB</dt>
      <dd>{health.db === 'ok' ? 'OK' : `エラー: ${health.error ?? ''}`}</dd>
      <dt>スキーマ</dt>
      <dd>v{health.schema_version}</dd>
    </dl>
  )
}
