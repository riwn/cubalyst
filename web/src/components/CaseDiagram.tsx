import type { CaseInfo } from '../api'

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
 * ケースの図。OLL/PLL は上面（＋側面の上段）、F2L は上面＋前面＋右面。
 * OLLは最終層の色以外を灰色にし、向きだけが分かるようにする。
 */
export function CaseDiagram({ c, size = 72 }: { c: Pick<CaseInfo, 'set' | 'pattern'>; size?: number }) {
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
    // 上面（U 0-8）、前面（F 18-26）、右面（R 9-17）を展開図で
    for (let i = 0; i < 9; i++) cells.push(cell((i % 3) * step, Math.floor(i / 3) * step, i))
    for (let i = 0; i < 9; i++) cells.push(cell((i % 3) * step, 3 * step + G + Math.floor(i / 3) * step, 18 + i))
    for (let i = 0; i < 9; i++) cells.push(cell(3 * step + G + (i % 3) * step, 3 * step + G + Math.floor(i / 3) * step, 9 + i))
    const w = 6 * step + G
    return (
      <svg viewBox={`-2 -2 ${w + 4} ${w + 4}`} width={size} height={size} role="img" aria-label="ケースの図">
        {cells}
      </svg>
    )
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
  return (
    <svg viewBox={`-2 -2 ${w + 4} ${w + 4}`} width={size} height={size} role="img" aria-label="ケースの図">
      {cells}
    </svg>
  )
}
