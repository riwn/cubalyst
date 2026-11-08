// PLL のケース図に描く矢印（どのパーツをどこへ動かすか）を、ケースの facelets から求める。

import { CORNER_SLOTS, EDGE_SLOTS, SOLVED_FACELETS } from '../cube/facelets'

/** 上面のシールの位置（U 面の 0〜8）で表した矢印。both は入れ替え（両向き）。 */
export type PllArrow = { from: number; to: number; both: boolean }

// 最終層の角・辺。facelets の先頭が U 面、残りが側面
const TOP = [...CORNER_SLOTS.slice(0, 4), ...EDGE_SLOTS.slice(0, 4)]

const sideKey = (faces: string[]) => [...faces].sort().join('')

// 解き終わりの AUF（U）は、側面の色の名前を巡回させるのと同じ
const NEXT: Record<string, string> = { F: 'R', R: 'B', B: 'L', L: 'F' }
const cycle = (face: string, k: number) => {
  for (let i = 0; i < k; i++) face = NEXT[face] ?? face
  return face
}

/**
 * 各パーツを、今ある位置から戻るべき位置への矢印にする。2つのパーツの入れ替えは両向きの矢印1本にまとめる。
 * 解き終わりの AUF は自由なので、動かすパーツが最も少なくなる AUF で考える（ケースの手順が AUF を含んでいても、
 * 最終層全体が回っているようには描かない）。最終層の向きが揃っていない（PLL の状態でない）ときは空。
 */
export function pllArrows(pattern: string): PllArrow[] {
  if (TOP.some((s) => pattern[s.facelets[0]] !== 'U')) return []
  // 側面の色の組 → その色のパーツが戻るべき位置
  const home = new Map(TOP.map((s) => [sideKey(s.facelets.slice(1).map((i) => SOLVED_FACELETS[i])), s.facelets[0]]))
  let dest = new Map<number, number>()
  for (let k = 0; k < 4; k++) {
    const d = new Map<number, number>()
    for (const s of TOP) {
      const to = home.get(sideKey(s.facelets.slice(1).map((i) => cycle(pattern[i], k))))
      if (to !== undefined && to !== s.facelets[0]) d.set(s.facelets[0], to)
    }
    if (k === 0 || d.size < dest.size) dest = d
  }
  const out: PllArrow[] = []
  for (const [from, to] of dest) {
    const swap = dest.get(to) === from
    if (swap && to < from) continue // 入れ替えは片方だけ
    out.push({ from, to, both: swap })
  }
  return out
}
