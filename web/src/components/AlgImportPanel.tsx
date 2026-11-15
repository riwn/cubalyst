import { useMemo, useState } from 'react'
import { addCaseAlg, type CaseInfo } from '../api'
import { checkImport } from '../cases/alg-import'
import { slotLabel } from '../cases/slots'
import { withTriggers } from '../cases/triggers'
import { useCubeStore } from '../cube/hooks'

const EXAMPLE = `OLL 33: (R U R' U') (R' F R F')
Aa perm: x (R' U R') D2 (R U' R') D2 R2 x'
F2L 5: U' R U2 R' U2 R U' R'
R U R' U R U2 R'`

/** 手順のインポート。貼り付けた手順を1行ずつ確かめ、ケースを解ける手順だけを追加する。 */
export function AlgImportPanel({ cases, onAdded, onClose }: { cases: CaseInfo[]; onAdded: () => void; onClose: () => void }) {
  const store = useCubeStore()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ added: number; errors: string[] } | null>(null)
  const rows = useMemo(() => checkImport(store.kpuzzle, cases, text), [store.kpuzzle, cases, text])
  const ok = rows.filter((r) => r.ok)

  const add = async () => {
    setBusy(true)
    let added = 0
    const errors: string[] = []
    for (const r of ok) {
      try {
        await addCaseAlg(r.case!.id, r.alg!)
        added++
      } catch (err) {
        errors.push(`${r.line}行目: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    setBusy(false)
    setResult({ added, errors })
    if (errors.length === 0) setText('')
    if (added > 0) onAdded()
  }

  return (
    <section className="panel alg-import">
      <div className="row">
        <h3>手順をインポート</h3>
        <span className="spacer" />
        <button onClick={onClose}>閉じる</button>
      </div>
      <p className="muted small">
        1行に1つ、「ケース: 手順」か手順だけを書いてください。ケースを書かなければ、どのケースの手順かを探します。
        手順で本当にそのケースが解けるかを確かめ、解ける手順だけを追加します。括弧（R U R' U'）や (R U R' U')2、Rw
        も書けます。F2L はどのスロットの手順でも構いません（右手前の手順に直して、ほかのスロットでは鏡写しで出します）
      </p>
      <textarea
        rows={6}
        value={text}
        placeholder={EXAMPLE}
        spellCheck={false}
        aria-label="インポートする手順"
        onChange={(e) => {
          setText(e.target.value)
          setResult(null)
        }}
      />
      {rows.length > 0 && (
        <ul className="alg-import-rows">
          {rows.map((r) => (
            <li key={r.line} className={r.ok ? 'ok' : 'ng'}>
              <span className="alg-import-mark" aria-label={r.ok ? '追加できる' : '追加できない'}>
                {r.ok ? '✓' : '✗'}
              </span>
              <span className="muted small">{r.line}行目</span>
              {r.case && (
                <strong>
                  {r.case.name}
                  {r.case.set === 'F2L' && r.slot && `（${slotLabel(r.slot)}）`}
                </strong>
              )}
              {r.written && <span className="alg">{withTriggers(r.written)}</span>}
              {r.message && <span className="alg-import-message small">{r.message}</span>}
            </li>
          ))}
        </ul>
      )}
      <div className="row">
        <button className="primary" disabled={busy || ok.length === 0} onClick={add}>
          {ok.length > 0 ? `${ok.length}件を追加` : '追加'}
        </button>
        {rows.length > ok.length && <span className="muted small">✗ の行は追加しません</span>}
        {result && (
          <span className={result.errors.length ? 'error small' : 'muted small'} aria-live="polite">
            {result.added}件を追加しました
            {result.errors.length > 0 && `。追加できなかった行：${result.errors.join('、')}`}
          </span>
        )}
      </div>
    </section>
  )
}
