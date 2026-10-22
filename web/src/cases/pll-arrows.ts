// PLL のケース図に描く矢印（どのパーツをどこへ動かすか）を、ケースの facelets から求める。

import { CORNER_SLOTS, EDGE_SLOTS, SOLVED_FACELETS } from '../cube/facelets'

/** 上面のシールの位置（U 面の 0〜8）で表した矢印。both は入れ替え（両向き）。 */
export type PllArrow = { from: number; to: number; both: boolean }

// 最終層の角・辺。facelets の先頭が U 面、残りが側面
const TOP = [...CORNER_SLOTS.slice(0, 4), ...EDGE_SLOTS.slice(0, 4)]

const sideKey = (faces: string[]) => [...faces].sort().join('')

/**
 * 各パーツを、今ある位置から戻るべき位置への矢印にする。2つのパーツの入れ替えは両向きの矢印1本にまとめる。
 * 最終層の向きが揃っていない（PLL の状態でない）ときは空。
 */
export function pllArrows(pattern: string): PllArrow[] {
  if (TOP.some((s) => pattern[s.facelets[0]] !== 'U')) return []
  // 側面の色の組 → その色のパーツが戻るべき位置
  const home = new Map(TOP.map((s) => [sideKey(s.facelets.slice(1).map((i) => SOLVED_FACELETS[i])), s.facelets[0]]))
  const dest = new Map<number, number>()
  for (const s of TOP) {
    const to = home.get(sideKey(s.facelets.slice(1).map((i) => pattern[i])))
    if (to !== undefined && to !== s.facelets[0]) dest.set(s.facelets[0], to)
  }
  const out: PllArrow[] = []
  for (const [from, to] of dest) {
    const swap = dest.get(to) === from
    if (swap && to < from) continue // 入れ替えは片方だけ
    out.push({ from, to, both: swap })
  }
  return out
}
