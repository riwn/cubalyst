// F2L のケースの図で、どのシールを色付きで見せるか。
// facelets は 54 文字（U 0-8・R 9-17・F 18-26・D 27-35・L 36-44・B 45-53）、標準の向き（上面＝最終層、FR スロット）。

import { SLOT_COLORS, type F2LSlot } from './slots'

/** 上段と FR スロットの、パーツごとのシールの位置。 */
const PIECES: number[][] = [
  // 上段の角（URF・UFL・ULB・UBR）
  [8, 9, 20],
  [6, 18, 38],
  [0, 36, 47],
  [2, 45, 11],
  // 上段のエッジ（UR・UF・UL・UB）
  [5, 10],
  [7, 19],
  [3, 37],
  [1, 46],
  // FR スロット（DFR の角、FR のエッジ）
  [29, 26, 15],
  [23, 12],
]

const sameColors = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join()

/**
 * 灰色にするシールの位置。上段と FR スロットにあるパーツのうち、FR のペア（D・F・R の角と F・R のエッジ）でないものを灰色にする。
 * 下の2段のほかの場所は揃っているので、色のまま残す。
 * ほかのスロットの図は、そのスロットを右手前に回した facelets（slotView）と、スロットを渡す（ペアの色が変わる）。
 */
export function f2lGrayStickers(facelets: string, slot: F2LSlot = 'FR'): Set<number> {
  const { corner, edge } = SLOT_COLORS[slot]
  const gray = new Set<number>()
  for (const piece of PIECES) {
    const colors = piece.map((i) => facelets[i])
    const pair = piece.length === 3 ? corner : edge
    if (!sameColors(colors, pair)) for (const i of piece) gray.add(i)
  }
  return gray
}
