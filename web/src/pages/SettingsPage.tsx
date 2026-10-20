import { useState } from 'react'
import { exportUrl, importSolves } from '../api'
import { useCubeStore } from '../cube/hooks'
import { useSettings } from '../settings/hooks'
import { COLOR_LABELS, CROSS_COLORS, type CrossColor } from '../solve/cfop'
import { recomputeAllSplits } from '../solve/recompute'

/** 設定：クロス色、段階の再計算、export / import。 */
export function SettingsPage() {
  const store = useCubeStore()
  const { settings, update } = useSettings()
  const [progress, setProgress] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const changeColor = async (color: CrossColor) => {
    setError(null)
    try {
      await update({ ...settings, cross_color: color })
    } catch (err) {
      setError(String(err))
    }
  }

  const recompute = async () => {
    setError(null)
    try {
      const n = await recomputeAllSplits(store.kpuzzle, settings.cross_color, (done, total) =>
        setProgress(`再計算中… ${done} / ${total}`),
      )
      setProgress(`${n}件の段階を再計算しました`)
    } catch (err) {
      setError(String(err))
    }
  }

  const onImport = async (file: File) => {
    setError(null)
    setImportResult(null)
    try {
      const res = await importSolves(await file.text())
      setImportResult(
        `${res.imported}件を取り込みました（重複${res.skipped}件はスキップ）` +
          (res.errors.length ? `。エラー${res.errors.length}件: ${res.errors.slice(0, 3).join(' / ')}` : ''),
      )
    } catch (err) {
      setError(`importに失敗しました: ${String(err)}`)
    }
  }

  return (
    <div className="settings-page">
      <section className="panel">
        <h3>クロス色</h3>
        <p className="muted small">CFOPの段階判定に使います（GAN標準配色：白の反対が黄、緑の反対が青、赤の反対が橙）。</p>
        <div className="row">
          {CROSS_COLORS.map((c) => (
            <label key={c} className="radio">
              <input
                type="radio"
                name="cross"
                checked={settings.cross_color === c}
                onChange={() => changeColor(c)}
              />
              <span className={`swatch swatch--${c}`} /> {COLOR_LABELS[c]}
            </label>
          ))}
        </div>
        <p className="muted small">変更は以降のソルブに適用されます。過去の記録に反映するには再計算してください。</p>
        <div className="row">
          <button onClick={recompute}>全ソルブの段階を再計算</button>
          {progress && <span className="muted">{progress}</span>}
        </div>
      </section>

      <section className="panel">
        <h3>export</h3>
        <p className="muted small">全件を書き出します。期間や個別の選択は「履歴」画面から。</p>
        <div className="row">
          <a className="button" href={exportUrl('json')}>
            JSON（バックアップ用）
          </a>
          <a className="button" href={exportUrl('csv')}>
            CSV
          </a>
          <a className="button" href={exportUrl('txt')}>
            テキスト（リコン）
          </a>
        </div>
      </section>

      <section className="panel">
        <h3>import</h3>
        <p className="muted small">JSONのexportファイルを取り込みます。同じ記録（日時・スクランブル・タイムが一致）はスキップします。</p>
        <input type="file" accept="application/json,.json" onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
        {importResult && <p>{importResult}</p>}
      </section>

      <section className="panel">
        <h3>DB</h3>
        <p className="muted small">
          保存場所はサーバーの起動オプション <code>-db</code>（環境変数 <code>CUBALYST_DB</code>、既定{' '}
          <code>./data/cubalyst.db</code>）で変更できます。
        </p>
      </section>

      {error && <p className="error">{error}</p>}
    </div>
  )
}
