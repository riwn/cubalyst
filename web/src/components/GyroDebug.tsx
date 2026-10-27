import { useEffect, useRef, useState } from 'react'
import {
  COLOR_AXIS,
  holdAt,
  horizontal,
  nearestColor,
  OPPOSITE,
  toBody,
  toWorld,
  type Hold,
  type Quat,
  type Vec3,
} from '../cube/gyro'
import { useCubeState, useCubeStore } from '../cube/hooks'
import { useSettings } from '../settings/hooks'
import { COLOR_LABELS } from '../solve/cfop'
import { HOLD_OPTIONS, rotationName } from '../solve/holds'

const RATE_WINDOW = 20
const SHOWN_CHANGES = 10

type Change = { at: number; rot: string; ms: number; hold: Hold }

type Tracker = {
  times: number[]
  count: number
  /** 解く人から見た前の方向（基準の座標、水平）。「基準にする」で決める。 */
  frontWorld: Vec3 | null
  current: Hold | null
  lastStable: number
  pending: { hold: Hold; count: number; firstT: number } | null
  changes: Change[]
}

type View = {
  q: Quat
  at: number
  rate: number | null
  count: number
  frontWorld: Vec3 | null
  hold: Hold | null
  changes: Change[]
}

const holdLabel = (h: Hold) => `下${COLOR_LABELS[h.bottom]}・前${COLOR_LABELS[h.front]}`
const sameHold = (a: Hold, b: Hold) => a.bottom === b.bottom && a.front === b.front

/**
 * ジャイロのデバッグ表示：使える状態か（設定・受信の状態・頻度）と、今の向き（クォータニオン・下の色・持ち方）。
 * 「基準にする」を押すと、そのときの前を設定の前の色とみなして持ち方を出し、持ち替えをソルブと同じしきい値で検出して並べる。
 */
export function GyroDebug() {
  const store = useCubeStore()
  const { status, gyro } = useCubeState()
  const { settings } = useSettings()
  const tracker = useRef<Tracker>({
    times: [],
    count: 0,
    frontWorld: null,
    current: null,
    lastStable: 0,
    pending: null,
    changes: [],
  })
  const [view, setView] = useState<View | null>(null)

  useEffect(
    () =>
      store.gyro.subscribe(({ timestamp: t, q }) => {
        const tr = tracker.current
        tr.count++
        tr.times = [...tr.times.slice(-RATE_WINDOW + 1), t]
        const span = tr.times[tr.times.length - 1] - tr.times[0]
        const rate = span > 0 ? ((tr.times.length - 1) * 1000) / span : null
        let hold: Hold | null = null
        if (tr.frontWorld) {
          hold = holdAt(q, tr.frontWorld, HOLD_OPTIONS.maxDeg)
          if (hold && tr.current) {
            if (sameHold(hold, tr.current)) {
              tr.lastStable = t
              tr.pending = null
            } else {
              if (tr.pending && sameHold(tr.pending.hold, hold)) tr.pending.count++
              else tr.pending = { hold, count: 1, firstT: t }
              if (tr.pending.count >= HOLD_OPTIONS.confirmSamples) {
                const change = { at: t, rot: rotationName(tr.current, hold), ms: tr.pending.firstT - tr.lastStable, hold }
                tr.changes = [change, ...tr.changes].slice(0, SHOWN_CHANGES)
                tr.current = hold
                tr.lastStable = t
                tr.pending = null
              }
            }
          }
        }
        setView({ q, at: t, rate, count: tr.count, frontWorld: tr.frontWorld, hold, changes: tr.changes })
      }),
    [store],
  )

  const setReference = () => {
    if (!view) return
    const tr = tracker.current
    const frontWorld = horizontal(toWorld(view.q, COLOR_AXIS[settings.hold_front]))
    const up = nearestColor(toBody(view.q, [0, 0, 1]))
    tr.frontWorld = frontWorld
    tr.current = frontWorld ? { bottom: OPPOSITE[up.color], front: settings.hold_front } : null
    tr.lastStable = view.at
    tr.pending = null
    tr.changes = []
    setView({ ...view, frontWorld, changes: [] })
  }

  const up = view ? nearestColor(toBody(view.q, [0, 0, 1])) : null
  const front = view?.frontWorld ? nearestColor(toBody(view.q, view.frontWorld)) : null
  const fmt = (n: number) => (n >= 0 ? ' ' : '') + n.toFixed(3)

  return (
    <section className="panel gyro-debug">
      <h3>ジャイロ</h3>
      <dl className="facelets-info small">
        <dt>設定</dt>
        <dd>
          {settings.use_gyro ? '記録する' : '記録しない'}（持ち方 {holdLabel({ bottom: settings.hold_bottom, front: settings.hold_front })}）
        </dd>
        <dt>キューブから</dt>
        <dd className={gyro === 'active' ? '' : 'warn'}>
          {status !== 'connected'
            ? '未接続'
            : gyro === 'active'
              ? '届いている'
              : gyro === 'unsupported'
                ? '届いたが、このキューブのジャイロには対応していない'
                : '届いていない（省電力がオンか、ジャイロの無いキューブ）'}
          {view && gyro === 'active' && (
            <span className="muted">
              {' '}
              ・{view.rate ? `${view.rate.toFixed(1)} 回/秒` : '—'}・{view.count} 件
            </span>
          )}
        </dd>
        {view && (
          <>
            <dt>クォータニオン（w, x, y, z）</dt>
            <dd>
              <code>
                {fmt(view.q.w)} {fmt(view.q.x)} {fmt(view.q.y)} {fmt(view.q.z)}
              </code>
            </dd>
            <dt>下の色（重力から）</dt>
            <dd className={up && up.deg > HOLD_OPTIONS.maxDeg ? 'warn' : ''}>
              {up && `${COLOR_LABELS[OPPOSITE[up.color]]}（ずれ ${Math.round(up.deg)}°）`}
            </dd>
            <dt>前の色</dt>
            <dd className={front && front.deg > HOLD_OPTIONS.maxDeg ? 'warn' : ''}>
              {front ? `${COLOR_LABELS[front.color]}（ずれ ${Math.round(front.deg)}°）` : '基準が未設定'}
            </dd>
            <dt>持ち方</dt>
            <dd>
              {!view.frontWorld
                ? '基準が未設定'
                : view.hold
                  ? holdLabel(view.hold)
                  : `回している途中（${HOLD_OPTIONS.maxDeg}° 超のずれ）`}
            </dd>
          </>
        )}
      </dl>
      {view && (
        <>
          <button onClick={setReference} title={`今の前を「${COLOR_LABELS[settings.hold_front]}」とみなす`}>
            今の向きを基準にする（前＝{COLOR_LABELS[settings.hold_front]}）
          </button>
          {view.frontWorld && (
            <>
              <p className="muted small">持ち替えの検出（ソルブと同じしきい値。新しい順）</p>
              {view.changes.length === 0 ? (
                <p className="muted small">まだありません</p>
              ) : (
                <ol className="small">
                  {view.changes.map((c) => (
                    <li key={c.at}>
                      <strong className="rot">{c.rot}</strong> → {holdLabel(c.hold)}（{(c.ms / 1000).toFixed(2)}秒）
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </>
      )}
    </section>
  )
}
