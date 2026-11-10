import { useId } from 'react'
import type { CaseInfo } from '../api'
import { f2lGrayStickers } from '../cases/f2l-view'
import { pllArrows } from '../cases/pll-arrows'
import { slotView, type F2LSlot } from '../cases/slots'

// 標準の向き（上面＝黄、前面＝緑）での表示色。
const COLORS: Record<string, string> = {
  U: '#ffd500',
  D: '#ffffff',
  F: '#009e60',
  B: '#0051ba',
  R: '#ff5800',
  L: '#c41e3a',
}
const GRAY = '#8a8a8a'

const S = 14 // シール1枚の大きさ
const G = 2 // すき間

/**
 * ケースの図。OLL/PLL は上面（＋側面の上段）、F2L は右手前の上から見た立体（上面・前面・右面）。
 * OLLは最終層の色以外を灰色にし、向きだけが分かるようにする。
 * arrows を付けると、PLL ではどのパーツをどこへ動かすかを矢印で重ねる（小さい図では見づらいので、大きい図だけで使う）。
 * slot を付けると、F2L をそのスロットの角から見た図にする（pattern はそのスロットの手順で作ったもの）。
 */
export function CaseDiagram({
  c,
  size = 72,
  arrows = false,
  slot = 'FR',
}: {
  c: Pick<CaseInfo, 'set' | 'pattern'>
  size?: number
  arrows?: boolean
  slot?: F2LSlot
}) {
  const markerId = useId()
  const f = c.pattern
  const color = (i: number) => {
    const ch = f[i]
    if (c.set === 'OLL') return ch === 'U' ? COLORS.U : GRAY
    return COLORS[ch] ?? GRAY
  }
  const cell = (x: number, y: number, i: number, w = S, h = S) => (
    <rect key={`${i}-${x}-${y}`} x={x} y={y} width={w} height={h} rx={2} fill={color(i)} stroke="rgba(0,0,0,0.35)" strokeWidth={0.5} />
  )
  const cells: React.ReactNode[] = []
  const step = S + G

  if (c.set === 'F2L') {
    const view = slotView(f, slot)
    return <IsoCube facelets={view} gray={f2lGrayStickers(view, slot)} size={size} />
  }

  // 上面＋側面の上段（細長いシール）
  const o = 6 // 側面ぶんの余白
  for (let i = 0; i < 9; i++) cells.push(cell(o + (i % 3) * step, o + Math.floor(i / 3) * step, i))
  const thin = 4
  for (let k = 0; k < 3; k++) {
    // 奥（B面の上段：右から左へ並ぶ）
    cells.push(cell(o + (2 - k) * step, o - thin - G, 45 + k, S, thin))
    // 手前（F面の上段）
    cells.push(cell(o + k * step, o + 3 * step, 18 + k, S, thin))
    // 左（L面の上段：奥から手前）
    cells.push(cell(o - thin - G, o + k * step, 36 + k, thin, S))
    // 右（R面の上段：手前から奥）
    cells.push(cell(o + 3 * step, o + (2 - k) * step, 9 + k, thin, S))
  }
  const w = 3 * step + 2 * o
  const center = (i: number) => [o + (i % 3) * step + S / 2, o + Math.floor(i / 3) * step + S / 2]
  return (
    <svg viewBox={`-2 -2 ${w + 4} ${w + 4}`} width={size} height={size} role="img" aria-label="ケースの図">
      {cells}
      {arrows && c.set === 'PLL' && (
        <g className="case-arrows">
          <defs>
            <marker id={markerId} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
              <path d="M0 0L10 5L0 10z" fill="#14181c" />
            </marker>
          </defs>
          {pllArrows(f).map(({ from, to, both }) => {
            const [x1, y1] = center(from)
            const [x2, y2] = center(to)
            // シールの真ん中どうしを結び、両端を少し縮めて矢じりがシールに収まるようにする
            const len = Math.hypot(x2 - x1, y2 - y1)
            const k = 3.5 / len
            const a = [x1 + (x2 - x1) * k, y1 + (y2 - y1) * k]
            const b = [x2 - (x2 - x1) * k, y2 - (y2 - y1) * k]
            return (
              <line
                key={`${from}-${to}`}
                x1={a[0]}
                y1={a[1]}
                x2={b[0]}
                y2={b[1]}
                stroke="#14181c"
                strokeWidth={1.6}
                strokeLinecap="round"
                markerEnd={`url(#${markerId})`}
                markerStart={both ? `url(#${markerId})` : undefined}
              />
            )
          })}
        </g>
      )}
    </svg>
  )
}

/** 立体の図の1マスの長さ。 */
const U3 = 10
const COS30 = Math.cos(Math.PI / 6)
type Vec = [number, number]
// 右手前の上から見た等角図の向き：前面の左→右（X）、右面の手前→奥（Z）、下（Y）
const X: Vec = [COS30 * U3, 0.5 * U3]
const Z: Vec = [COS30 * U3, -0.5 * U3]
const Y: Vec = [0, U3]
// 手前・左・上の角を原点にする
const at = (x: number, z: number, y: number): Vec => [X[0] * x + Z[0] * z + Y[0] * y, X[1] * x + Z[1] * z + Y[1] * y]

/** 原点を角にして、a・b の向きに広がる1マスのシール（すき間のぶん内側に縮める）。 */
function quad(o: Vec, a: Vec, b: Vec): string {
  const k = 0.08
  const p = (s: number, t: number) => `${(o[0] + a[0] * s + b[0] * t).toFixed(2)},${(o[1] + a[1] * s + b[1] * t).toFixed(2)}`
  return [p(k, k), p(1 - k, k), p(1 - k, 1 - k), p(k, 1 - k)].join(' ')
}

/**
 * キューブを右手前の上から見た立体の図（上面・前面・右面）。gray のシールは灰色にする。
 * F2L のケースの図では、スロットのペア（角とエッジ）だけ色を付け、上段のほかのパーツを灰色にする。
 */
export function IsoCube({ facelets, gray, size = 72 }: { facelets: string; gray?: Set<number>; size?: number }) {
  const fill = (i: number) => (gray?.has(i) ? GRAY : (COLORS[facelets[i]] ?? GRAY))
  const stickers: React.ReactNode[] = []
  const add = (i: number, o: Vec, a: Vec, b: Vec) =>
    stickers.push(<polygon key={i} points={quad(o, a, b)} fill={fill(i)} />)
  for (let r = 0; r < 3; r++) {
    for (let col = 0; col < 3; col++) {
      // 上面：U0 が奥の左。行は奥から手前、列は左から右
      add(3 * r + col, at(col, 2 - r, 0), X, Z)
      // 前面：F18 が上の左
      add(18 + 3 * r + col, at(col, 0, r), X, Y)
      // 右面：R9 が上の手前。列は手前から奥
      add(9 + 3 * r + col, at(3, col, r), Z, Y)
    }
  }
  // キューブの輪郭（六角形）を黒で敷いて、シールのすき間を黒く見せる
  const outline = [at(0, 0, 0), at(0, 3, 0), at(3, 3, 0), at(3, 3, 3), at(3, 0, 3), at(0, 0, 3)]
    .map((v) => v.join(','))
    .join(' ')
  const w = 6 * X[0]
  const top = 3 * Z[1]
  const h = 3 * Y[1] - top + 3 * X[1]
  const pad = 1.5
  return (
    <svg
      viewBox={`${-pad} ${top - pad} ${w + 2 * pad} ${h + 2 * pad}`}
      width={size}
      height={size}
      role="img"
      aria-label="ケースの図"
    >
      <polygon points={outline} fill="#14181c" stroke="#14181c" strokeWidth={1.2} strokeLinejoin="round" />
      {stickers}
    </svg>
  )
}
