import { useMemo, useState } from 'react'
import type { Solve } from '../api'
import { GROUP_LABELS } from '../solve/cfop'
import { FAST_RATIO, targetPlan } from '../solve/target'
import { formatTime } from '../solve/stats'

const KEY = 'cubalyst.targetSec'

function loadTarget(): number | null {
  try {
    const v = Number(localStorage.getItem(KEY))
    return v > 0 ? v : null
  } catch {
    return null
  }
}

function saveTarget(sec: number) {
  try {
    localStorage.setItem(KEY, String(sec))
  } catch {
    // 保存できなくても、この画面では使える
  }
}

/** 目標タイム：速い回の配分で、段階ごとの目標と縮める量を出す。solves は段階の記録があるフルソルブ。 */
export function TargetPanel({ solves }: { solves: Solve[] }) {
  const base = useMemo(() => targetPlan(solves, 1), [solves])
  const [sec, setSec] = useState<number | null>(loadTarget)
  // 目標が未設定なら、今の平均の 85%（秒の切り捨て）から始める
  const target = sec ?? (base ? Math.max(1, Math.floor((base.nowMs * 0.85) / 1000)) : 30)
  const plan = useMemo(() => targetPlan(solves, target * 1000), [solves, target])
  if (!plan) return null
  const focus = [...plan.rows].sort((a, b) => b.cutMs - a.cutMs)[0]

  return (
    <section className="panel target-panel">
      <div className="row">
        <h3>目標タイム</h3>
        <label>
          <input
            id="target-sec"
            type="number"
            min={1}
            step={1}
            value={target}
            onChange={(e) => {
              const v = Math.max(1, Math.floor(Number(e.target.value) || 1))
              setSec(v)
              saveTarget(v)
            }}
            style={{ width: '5em' }}
          />{' '}
          秒
        </label>
        <span className="muted small">
          今の平均 {formatTime(plan.nowMs, 2)} ・ 目標以下で解けた回 {plan.reached} / {plan.count}
        </span>
      </div>
      {target * 1000 >= plan.nowMs ? (
        <p className="muted">今の平均より遅い目標です。もう少し速い目標にすると、縮める段階が出ます。</p>
      ) : (
        focus.cutMs > 0 && (
          <p>
            縮める {formatTime(plan.nowMs - target * 1000, 2)}秒のうち、<strong>{GROUP_LABELS[focus.group]}</strong> が{' '}
            {Math.round(focus.cutShare * 100)}%（{formatTime(focus.cutMs, 2)}秒）です。
          </p>
        )
      )}
      <table className="splits-table">
        <thead>
          <tr>
            <th className="left">ステップ</th>
            <th>今の平均</th>
            <th>目標</th>
            <th>縮める</th>
            <th>割合</th>
            <th title="今の手数のまま目標の時間で回すのに要る TPS">要る TPS</th>
            <th>今の TPS</th>
          </tr>
        </thead>
        <tbody>
          {plan.rows.map((r) => (
            <tr key={r.group}>
              <th className="left">{GROUP_LABELS[r.group]}</th>
              <td>{formatTime(r.nowMs, 2)}</td>
              <td>{formatTime(r.targetMs, 2)}</td>
              <td className={r === focus && r.cutMs > 0 ? 'target-focus' : undefined}>
                {r.cutMs > 0 ? `−${formatTime(r.cutMs, 2)}` : '—'}
              </td>
              <td>{r.cutMs > 0 ? `${Math.round(r.cutShare * 100)}%` : '—'}</td>
              <td>{r.neededTps.toFixed(2)}</td>
              <td>{r.nowTps.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">
        目標は、自分のソルブのうち速い方の{Math.round(FAST_RATIO * 100)}%（{plan.fastCount}回、平均{' '}
        {formatTime(plan.fastMs, 2)}）での段階の配分で割り振っています。「要る TPS」は、今の手数のまま目標の時間に収めるときの速さです。手数を減らせば、そのぶん低くて済みます。時間は段階の合計で、+2 は入れていません。
      </p>
    </section>
  )
}
