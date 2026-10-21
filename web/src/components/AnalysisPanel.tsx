import { useEffect, useState, type ReactNode } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { deleteAnalysis, getAnalysisStatus, type Analysis, type AnalysisStatus } from '../api'
import { formatDate } from '../format'
import { ConfirmDialog } from '../ui/Dialog'
import { KebabMenu } from '../ui/Popover'

/**
 * Claudeによる解析の表示と実行。run で解析を実行し、load で過去の結果を読み込む。
 * controls には実行ボタンの横に置く入力（傾向分析の件数など）を渡す。
 * confirmRerun を付けると、解析済みのときは実行ボタンを「⋯」メニューに隠し、実行前に確認する。
 */
export function AnalysisPanel({
  title,
  load,
  run,
  runLabel,
  controls,
  reloadKey,
  confirmRerun = false,
}: {
  title: string
  load: () => Promise<Analysis[]>
  run: () => Promise<Analysis>
  runLabel: string
  controls?: ReactNode
  reloadKey?: string | number
  confirmRerun?: boolean
}) {
  const [status, setStatus] = useState<AnalysisStatus | null>(null)
  const [list, setList] = useState<Analysis[]>([])
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openInput, setOpenInput] = useState<number | null>(null)
  const [askRerun, setAskRerun] = useState(false)
  const [deleting, setDeleting] = useState<Analysis | null>(null)

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
    setAskRerun(false)
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

  const remove = async (a: Analysis) => {
    setDeleting(null)
    await deleteAnalysis(a.id)
    setList((prev) => prev.filter((x) => x.id !== a.id))
  }

  const analyzed = list.length > 0
  const hideRunButton = confirmRerun && analyzed && !running
  const canRun = !running && !!status?.configured

  return (
    <section className="panel analysis-panel">
      <div className="row">
        <h3>{title}</h3>
        <span className="spacer" />
        {controls}
        {hideRunButton ? (
          <KebabMenu items={[{ label: 'もう一度解析する', disabled: !canRun, onSelect: () => setAskRerun(true) }]} />
        ) : (
          <button className="primary" onClick={execute} disabled={!canRun}>
            {running ? '解析中…' : runLabel}
          </button>
        )}
      </div>
      {status && !status.configured && (
        <p className="warn small">
          Claude APIが設定されていません。サーバーを環境変数 <code>ANTHROPIC_API_KEY</code> 付きで起動すると使えます（README参照）。
        </p>
      )}
      {status?.configured && !analyzed && (
        <p className="muted small">モデル：{status.model}（解析には数十秒かかることがあります）</p>
      )}
      {running && <p className="muted small">解析中です。数十秒かかることがあります…</p>}
      {error && <p className="error">{error}</p>}
      {!analyzed && !running && <p className="muted">まだ解析結果はありません</p>}
      {list.map((a) => (
        <article key={a.id} className="analysis">
          <div className="row muted small">
            <span>
              {formatDate(a.created_at)} ・ {a.model}
              {a.kind === 'trend' && a.params.limit && ` ・ 直近${a.params.limit}件（${a.params.mode}）`} ・ 入力
              {a.input_tokens} / 出力{a.output_tokens} tokens
            </span>
            <span className="spacer" />
            <KebabMenu
              title="この解析結果の操作"
              items={[
                {
                  label: openInput === a.id ? '入力データを隠す' : '入力データを見る',
                  onSelect: () => setOpenInput(openInput === a.id ? null : a.id),
                },
                'separator',
                { label: 'この解析結果を削除', danger: true, onSelect: () => setDeleting(a) },
              ]}
            />
          </div>
          {openInput === a.id && <pre className="analysis-input">{a.input}</pre>}
          <div className="markdown">
            <Markdown remarkPlugins={[remarkGfm]}>{a.result}</Markdown>
          </div>
        </article>
      ))}

      <ConfirmDialog
        open={askRerun}
        title="もう一度解析しますか？"
        message={
          <>
            <p>このソルブはすでに解析済みです（{list.length}件）。もう一度解析すると、新しい結果が追加されます。</p>
            <p className="muted small">前の結果は消えません。Claude APIの利用料（1回あたりおおよそ十数円〜数十円）がかかります。</p>
          </>
        }
        confirmLabel="もう一度解析する"
        onConfirm={() => void execute()}
        onCancel={() => setAskRerun(false)}
      />
      <ConfirmDialog
        open={deleting != null}
        title="解析結果の削除"
        message={<p>{deleting && formatDate(deleting.created_at)} の解析結果を削除します。元に戻せません。</p>}
        confirmLabel="削除する"
        danger
        onConfirm={() => deleting && void remove(deleting)}
        onCancel={() => setDeleting(null)}
      />
    </section>
  )
}
