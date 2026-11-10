// F2L のスロット（右手前・左手前・右奥・左奥）。
// ケースと手順は FR スロット（右手前）で持ち、ほかのスロットは左右・前後の鏡写しで作る。
// 左手前は左右の鏡写し、右奥は前後の鏡写し、左奥はその両方（y2 で回したのと同じ）。
// 鏡写しなので、左手前と右奥では、ペアの形も FR のケースを鏡に映した形になる。

export type F2LSlot = 'FR' | 'FL' | 'BR' | 'BL'

export const F2L_SLOTS: { slot: F2LSlot; label: string }[] = [
  { slot: 'FR', label: '右手前' },
  { slot: 'FL', label: '左手前' },
  { slot: 'BR', label: '右奥' },
  { slot: 'BL', label: '左奥' },
]

export const slotLabel = (slot: F2LSlot) => F2L_SLOTS.find((s) => s.slot === slot)!.label

/** スロットのペアのパーツ（cubing.js の番号）。角は DRF・DFL・DBR・DLB、エッジは FR・FL・BR・BL。 */
export const SLOT_PIECES: Record<F2LSlot, { corner: number; edge: number }> = {
  FR: { corner: 4, edge: 8 },
  FL: { corner: 5, edge: 9 },
  BR: { corner: 7, edge: 10 },
  BL: { corner: 6, edge: 11 },
}

/** スロットのペアのシールの色（面の名前）。 */
export const SLOT_COLORS: Record<F2LSlot, { corner: string[]; edge: string[] }> = {
  FR: { corner: ['D', 'F', 'R'], edge: ['F', 'R'] },
  FL: { corner: ['D', 'F', 'L'], edge: ['F', 'L'] },
  BR: { corner: ['D', 'B', 'R'], edge: ['B', 'R'] },
  BL: { corner: ['D', 'B', 'L'], edge: ['B', 'L'] },
}

/** 鏡写しでの、手の面の入れ替えと、回す向きを逆にしない手。 */
type Mirror = { swap: Record<string, string>; keep: string }

// 左右の鏡写し：R と L が入れ替わり、回す向きが逆になる。左右の軸で回す M・x は、鏡に映しても同じ向き
const LEFT_RIGHT: Mirror = { swap: { R: 'L', L: 'R', r: 'l', l: 'r' }, keep: 'Mx' }
// 前後の鏡写し：F と B が入れ替わる。前後の軸で回す S・z は同じ向き
const FRONT_BACK: Mirror = { swap: { F: 'B', B: 'F', f: 'b', b: 'f' }, keep: 'Sz' }

const MIRRORS: Record<F2LSlot, Mirror[]> = {
  FR: [],
  FL: [LEFT_RIGHT],
  BR: [FRONT_BACK],
  BL: [LEFT_RIGHT, FRONT_BACK],
}

function mirrorMove(move: string, m: Mirror): string {
  const face = move[0]
  const suffix = move.slice(1)
  const to = m.swap[face] ?? face
  if (m.keep.includes(face) || suffix.startsWith('2')) return to + suffix
  return to + (suffix === "'" ? '' : "'")
}

/** FR スロットの手順を、そのスロットの手順にする。 */
export function slotAlg(alg: string, slot: F2LSlot): string {
  const mirrors = MIRRORS[slot]
  if (mirrors.length === 0) return alg
  return alg
    .trim()
    .split(/\s+/)
    .map((move) => mirrors.reduce(mirrorMove, move))
    .join(' ')
}

/** 上から見て時計回りに、キューブごと 90 度回した facelets（y。前に R 面が来る）。色はそのまま。 */
function rotateY(f: string): string {
  const face = (start: number) => f.slice(start, start + 9)
  const [u, r, front, d, l, b] = [0, 9, 18, 27, 36, 45].map(face)
  // 上面は時計回り、下面は（下から見て）反時計回りに回る
  const cw = (s: string) => [6, 3, 0, 7, 4, 1, 8, 5, 2].map((i) => s[i]).join('')
  const ccw = (s: string) => [2, 5, 8, 1, 4, 7, 0, 3, 6].map((i) => s[i]).join('')
  return cw(u) + b + r + ccw(d) + front + l
}

const VIEW_TURNS: Record<F2LSlot, number> = { FR: 0, BR: 1, BL: 2, FL: 3 }

/** そのスロットが右手前に来るよう、キューブごと回した facelets（スロットの角から見た図を描くため）。 */
export function slotView(facelets: string, slot: F2LSlot): string {
  let f = facelets
  for (let i = 0; i < VIEW_TURNS[slot]; i++) f = rotateY(f)
  return f
}
