import { useState } from 'react'
import Markdown from 'react-markdown'
import { Link } from 'react-router'
import remarkGfm from 'remark-gfm'
import { deleteAnalysis, type Analysis, type AnalysisKind } from '../api'
import { formatDate, KIND_LABELS, multiTitle } from '../format'
import { ConfirmDialog } from '../ui/Dialog'
import { KebabMenu } from '../ui/Popover'

export function KindBadge({ kind }: { kind: AnalysisKind }) {
  return <span className={`kind-badge kind-badge--${kind}`}>{KIND_LABELS[kind]}</span>
}

/** 解析の対象（単体はソルブ、まとめは見出しと件数）。 */
export function AnalysisTarget({ a }: { a: Analysis }) {
  if (a.kind === 'solve') {
    const id = a.solve_ids[0]
    return id ? <Link to={`/history/${id}`}>ソルブ #{id}</Link> : <span className="muted">（ソルブは削除済み）</span>
  }
  return (
    <Link to={`/analyses/${a.id}`}>
      {multiTitle(a)}
    </Link>
  )
}

/**
 * 解析結果1件。collapsible のときは本文を途中までにして「続きを読む」で開く。
 * onDeleted は削除したあとに呼ばれる。
 */
export function AnalysisCard({
  a,
  collapsible = false,
  showTarget = true,
  onDeleted,
}: {
  a: Analysis
  collapsible?: boolean
  showTarget?: boolean
  onDeleted?: (a: Analysis) => void
}) {
  const [open, setOpen] = useState(!collapsible)
  const [showInput, setShowInput] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const remove = async () => {
    setDeleting(false)
    try {
      await deleteAnalysis(a.id)
      onDeleted?.(a)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <article className="analysis">
      <div className="row analysis-head">
        <KindBadge kind={a.kind} />
        {showTarget && (
          <strong>
            <AnalysisTarget a={a} />
          </strong>
        )}
        <span className="muted small">
          {formatDate(a.created_at)} ・ {a.model}
        </span>
        <span className="spacer" />
        <KebabMenu
          title="この解析結果の操作"
          items={[
            { label: showInput ? '入力データを隠す' : '入力データを見る', onSelect: () => setShowInput(!showInput) },
            'separator',
            { label: 'この解析結果を削除', danger: true, onSelect: () => setDeleting(true) },
          ]}
        />
      </div>
      {error && <p className="error">{error}</p>}
      {showInput && <pre className="analysis-input">{a.input}</pre>}
      <div className={`markdown ${open ? '' : 'markdown--collapsed'}`}>
        <Markdown remarkPlugins={[remarkGfm]}>{a.result}</Markdown>
      </div>
      {collapsible && (
        <button className="link-button small" onClick={() => setOpen(!open)}>
          {open ? 'たたむ' : '続きを読む'}
        </button>
      )}
      <ConfirmDialog
        open={deleting}
        title="解析結果の削除"
        message={<p>{formatDate(a.created_at)} の解析結果を削除します。元に戻せません。</p>}
        confirmLabel="削除する"
        danger
        onConfirm={() => void remove()}
        onCancel={() => setDeleting(false)}
      />
    </article>
  )
}

/** 解析の頼み方の案内。 */
export function AnalysisHowTo() {
  return (
    <p className="muted small">
      解析は、Claude Code や Claude Desktop で <code>/cubalyst-coach</code> を呼ぶか、「直近のソルブを解析して」「直近20件をまとめて見て」のように頼むと、ここに保存されます（MCP
      の設定は docs/mcp.md）。
    </p>
  )
}
