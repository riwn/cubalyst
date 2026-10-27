import { useState } from 'react'
import { exportUrl, importSolves } from '../api'
import { useCubeStore } from '../cube/hooks'
import { isValidHold, rightColor } from '../cube/orientation'
import { useSettings } from '../settings/hooks'
import { COLOR_LABELS, CROSS_COLORS, type CrossColor } from '../solve/cfop'
import { recomputeAllHolds, recomputeAllSplits } from '../solve/recompute'

/** 設定：クロス色、段階の再計算、export / import。 */
export function SettingsPage() {
  const store = useCubeStore()
  const { settings, update } = useSettings()
  const [progress, setProgress] = useState<string | null>(null)
  const [holdsProgress, setHoldsProgress] = useState<string | null>(null)
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

  const changeHold = async (bottom: CrossColor, front: CrossColor) => {
    setError(null)
    // 前の色が下の色と隣り合わなくなったら、隣り合う最初の色にする
    const f = isValidHold(bottom, front) ? front : CROSS_COLORS.find((c) => isValidHold(bottom, c))!
    try {
      await update({ ...settings, hold_bottom: bottom, hold_front: f })
    } catch (err) {
      setError(String(err))
    }
  }
  const right = rightColor(settings.hold_bottom, settings.hold_front)

  const recompute = async () => {
    setError(null)
    try {
      const n = await recomputeAllSplits(store.kpuzzle, settings.cross_color, (done, total) =>
        setProgress(`再計算中… ${done} / ${total}`),
      )
      setProgress(`${n}件のステップを再計算しました`)
    } catch (err) {
      setError(String(err))
    }
  }

  const recomputeHolds = async () => {
    setError(null)
    try {
      const n = await recomputeAllHolds({ bottom: settings.hold_bottom, front: settings.hold_front }, (done, total) =>
        setHoldsProgress(`再計算中… ${done} / ${total}`),
      )
      setHoldsProgress(`ジャイロの記録がある${n}件の持ち替えを再計算しました`)
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
        <p className="muted small">CFOPのステップの判定に使います（GAN標準配色：白の反対が黄、緑の反対が青、赤の反対が橙）。</p>
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
          <button onClick={recompute}>全ソルブのステップを再計算</button>
          {progress && <span className="muted">{progress}</span>}
        </div>
      </section>

      <section className="panel">
        <h3>インスペクション</h3>
        <label className="radio">
          <input
            type="checkbox"
            checked={settings.inspection}
            onChange={(e) => update({ ...settings, inspection: e.target.checked }).catch((err) => setError(String(err)))}
          />
          フルソルブでWCA方式の15秒インスペクションを使う
        </label>
        <p className="muted small">
          スクランブルが完了した時点から数え始めます。最初の回転が15秒を超えると+2、17秒を超えるとDNFが自動で付きます。
        </p>
      </section>

      <section className="panel">
        <h3>持ち方（解法の表記）</h3>
        <p className="muted small">
          スマートキューブはキューブ自身の向き（白上・緑前）で回転を記録します。解くときの持ち方を設定すると、
          解法・再生・リコン・AI解析の記号をその向きに合わせて表示します（記録そのものは変わりません。スクランブルは白上・緑前のままです）。
        </p>
        <div className="row">
          <label>
            下{' '}
            <select value={settings.hold_bottom} onChange={(e) => changeHold(e.target.value as CrossColor, settings.hold_front)}>
              {CROSS_COLORS.map((c) => (
                <option key={c} value={c}>
                  {COLOR_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          <label>
            前{' '}
            <select value={settings.hold_front} onChange={(e) => changeHold(settings.hold_bottom, e.target.value as CrossColor)}>
              {CROSS_COLORS.filter((c) => isValidHold(settings.hold_bottom, c)).map((c) => (
                <option key={c} value={c}>
                  {COLOR_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          {right && (
            <span className="muted">
              → 右は <span className={`swatch swatch--${right}`} /> {COLOR_LABELS[right]}
            </span>
          )}
        </div>
      </section>

      <section className="panel">
        <h3>ジャイロ（持ち替えの記録）</h3>
        <label className="radio">
          <input
            type="checkbox"
            checked={settings.use_gyro}
            onChange={(e) => update({ ...settings, use_gyro: e.target.checked }).catch((err) => setError(String(err)))}
          />
          ジャイロで持ち替え（y・x・z）を記録する
        </label>
        <p className="muted small">
          ジャイロのあるキューブ（GAN i4 などの Gen4）で、ソルブ中の持ち替えを記録し、解法をその時点の持ち方で表示します。
          着手の時点で上の「持ち方」で持っていると仮定します（下の色はジャイロで分かるので、違えば記録しません）。
        </p>
        <p className="muted small">
          ジャイロは電池を多く使います。キューブのジャイロは、GAN のアプリの省電力の設定で切り替えてください（キューブに保存されます）。
          ここをオフにしても、キューブ側のジャイロは止まりません。
        </p>
        <div className="row">
          <button onClick={recomputeHolds}>全ソルブの持ち替えを再計算</button>
          {holdsProgress && <span className="muted">{holdsProgress}</span>}
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
