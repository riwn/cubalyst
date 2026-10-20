import { useEffect, useState, type ReactNode } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { deleteAnalysis, getAnalysisStatus, type Analysis, type AnalysisStatus } from '../api'
import { formatDate } from '../format'

/**
 * Claudeによる解析の表示と実行。run で解析を実行し、load で過去の結果を読み込む。
 * controls には実行ボタンの横に置く入力（傾向分析の件数など）を渡す。
 */
export function AnalysisPanel({
  title,
  load,
  run,
  runLabel,
  controls,
  reloadKey,
}: {
  title: string
  load: () => Promise<Analysis[]>
  run: () => Promise<Analysis>
  runLabel: string
  controls?: ReactNode
  reloadKey?: string | number
}) {
  const [status, setStatus] = useState<AnalysisStatus | null>(null)
  const [list, setList] = useState<Analysis[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openInput, setOpenInput] = useState<number | null>(null)

  useEffect(() => {
    getAnalysisStatus()
      .then(setStatus)
      .catch(() => setStatus({ configured: false, model: '', message: 'サーバーに接続できません' }))
  }, [])

  useEffect(() => {
    let cancelled = false
    load()
      .then((l) => !cancelled && setList(l))
      .catch((err: unknown) => !cancelled && setError(String(err)))
    return () => {
      cancelled = true
    }
    // load は呼び出し側で毎回作られるので、reloadKey で再読み込みを制御する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey])

  const execute = async () => {
    setRunning(true)
    setError(null)
    try {
      const a = await run()
      setList((prev) => [a, ...prev])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
    }
  }

  const remove = async (id: number) => {
    if (!confirm('この解析結果を削除しますか？')) return
    await deleteAnalysis(id)
    setList((prev) => prev.filter((a) => a.id !== id))
  }

  return (
    <section className="panel analysis-panel">
      <div className="row">
        <h3>{title}</h3>
        <span className="spacer" />
        {controls}
        <button className="primary" onClick={execute} disabled={running || !status?.configured}>
          {running ? '解析中…' : runLabel}
        </button>
      </div>
      {status && !status.configured && (
        <p className="warn small">
          Claude APIが設定されていません。サーバーを環境変数 <code>ANTHROPIC_API_KEY</code> 付きで起動すると使えます（README参照）。
        </p>
      )}
      {status?.configured && <p className="muted small">モデル：{status.model}（解析には数十秒かかることがあります）</p>}
      {error && <p className="error">{error}</p>}
      {list.length === 0 && !running && <p className="muted">まだ解析結果はありません</p>}
      {list.map((a) => (
        <article key={a.id} className="analysis">
          <div className="row muted small">
            <span>
              {formatDate(a.created_at)} ・ {a.model}
              {a.kind === 'trend' && a.params.limit && ` ・ 直近${a.params.limit}件（${a.params.mode}）`} ・ 入力
              {a.input_tokens} / 出力{a.output_tokens} tokens
            </span>
            <span className="spacer" />
            <button onClick={() => setOpenInput(openInput === a.id ? null : a.id)}>
              {openInput === a.id ? '入力データを隠す' : '入力データ'}
            </button>
            <button onClick={() => remove(a.id)} title="削除">
              ×
            </button>
          </div>
          {openInput === a.id && <pre className="analysis-input">{a.input}</pre>}
          <div className="markdown">
            <Markdown remarkPlugins={[remarkGfm]}>{a.result}</Markdown>
          </div>
        </article>
      ))}
    </section>
  )
}
