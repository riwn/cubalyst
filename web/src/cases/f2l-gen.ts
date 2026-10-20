// F2L 41ケースの数え上げと手順探索（f2l.ts の生成に使う。テストでも検証に使う）。
//
// 標準の向き（クロスD、FRスロット）で、FRの角（DRF）とエッジ（FR）の置き場所・向きを数え上げる。
// 手順は「基本手順」（R U R' / F' U F / スレッジハンマー等）とAUFの組み合わせで最短（手数）を探す。
// 基本手順はどれもFRスロットと上段の間でピースを入れ替えるだけで、クロスと他の3スロットは崩さない。

import { KPattern, type KPuzzle } from 'cubing/kpuzzle'
import { caseSignature } from './geometry'

const U_CORNERS = [0, 1, 2, 3]
const U_EDGES = [0, 1, 2, 3]
const SLOT_CORNER = 4 // DRF
const SLOT_EDGE = 8 // FR

export type F2LState = { pattern: KPattern; group: string; key: string }

function parity(p: number[]): number {
  let par = 0
  const seen = p.map(() => false)
  for (let i = 0; i < p.length; i++) {
    if (seen[i]) continue
    let len = 0
    for (let j = i; !seen[j]; j = p[j]) {
      seen[j] = true
      len++
    }
    par ^= (len - 1) & 1
  }
  return par
}

/** FRペアの全配置（AUFの違いは同じケースとみなし、署名で重複を除く）。完成状態は除く。 */
export function enumerateF2LStates(kpuzzle: KPuzzle): F2LState[] {
  const solved = kpuzzle.defaultPattern()
  const out = new Map<string, F2LState>()
  for (const cpos of [...U_CORNERS, SLOT_CORNER]) {
    for (let co = 0; co < 3; co++) {
      for (const epos of [...U_EDGES, SLOT_EDGE]) {
        for (let eo = 0; eo < 2; eo++) {
          if (cpos === SLOT_CORNER && co === 0 && epos === SLOT_EDGE && eo === 0) continue
          const d = structuredClone(solved.patternData)
          const C = d.CORNERS
          const E = d.EDGES
          // 角：DRF を cpos へ。押し出されたピースは DRF の位置へ
          if (cpos !== SLOT_CORNER) {
            ;[C.pieces[cpos], C.pieces[SLOT_CORNER]] = [C.pieces[SLOT_CORNER], C.pieces[cpos]]
          }
          C.orientation[cpos] = co
          if (cpos !== SLOT_CORNER) C.orientation[SLOT_CORNER] = (3 - co) % 3
          if (epos !== SLOT_EDGE) {
            ;[E.pieces[epos], E.pieces[SLOT_EDGE]] = [E.pieces[SLOT_EDGE], E.pieces[epos]]
          }
          E.orientation[epos] = eo
          if (epos !== SLOT_EDGE) E.orientation[SLOT_EDGE] = eo
          // 置換の偶奇をそろえる（関係のない上段エッジ2つを入れ替える）
          if (parity(C.pieces) !== parity(E.pieces)) {
            const free = U_EDGES.filter((e) => e !== epos)
            ;[E.pieces[free[0]], E.pieces[free[1]]] = [E.pieces[free[1]], E.pieces[free[0]]]
          }
          const pattern = new KPattern(kpuzzle, d)
          const key = caseSignature('F2L', pattern)
          if (out.has(key)) continue
          const cornerUp = cpos !== SLOT_CORNER
          const edgeUp = epos !== SLOT_EDGE
          const group =
            cornerUp && edgeUp ? '角・エッジとも上段' : cornerUp ? '角が上段・エッジがスロット' : edgeUp ? '角がスロット・エッジが上段' : '角・エッジともスロット'
          out.set(key, { pattern, group, key })
        }
      }
    }
  }
  return [...out.values()]
}

const TOKENS: { alg: string; cost: number }[] = [
  { alg: 'U', cost: 1 },
  { alg: "U'", cost: 1 },
  { alg: 'U2', cost: 1 },
  { alg: "R U R'", cost: 3 },
  { alg: "R U' R'", cost: 3 },
  { alg: "R U2 R'", cost: 3 },
  { alg: "F' U F", cost: 3 },
  { alg: "F' U' F", cost: 3 },
  { alg: "F' U2 F", cost: 3 },
  { alg: "R' F R F'", cost: 4 },
  { alg: "F R' F' R", cost: 4 },
]

/** FRペアの位置と向き（AUFを区別する）。 */
function pairKey(p: KPattern): string {
  const d = p.patternData
  const c = d.CORNERS.pieces.indexOf(SLOT_CORNER)
  const e = d.EDGES.pieces.indexOf(SLOT_EDGE)
  return `${c}:${d.CORNERS.orientation[c]}/${e}:${d.EDGES.orientation[e]}`
}

const SOLVED_KEY = `${SLOT_CORNER}:0/${SLOT_EDGE}:0`

/** 基本手順の組み合わせで、FRペアを最少手数で入れる手順を探す（ダイクストラ法）。 */
export function solveF2L(start: KPattern): string {
  type Node = { cost: number; alg: string[]; pattern: KPattern; lastU: boolean }
  const best = new Map<string, number>()
  const queue: Node[] = [{ cost: 0, alg: [], pattern: start, lastU: false }]
  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost || a.alg.length - b.alg.length)
    const node = queue.shift()!
    const key = `${pairKey(node.pattern)}|${node.lastU}`
    if ((best.get(key) ?? Infinity) <= node.cost && node.alg.length > 0) continue
    best.set(key, node.cost)
    if (pairKey(node.pattern) === SOLVED_KEY) return node.alg.join(' ')
    for (const t of TOKENS) {
      const isU = t.alg.startsWith('U')
      if (isU && (node.lastU || node.alg.length === 0 && false)) continue
      queue.push({
        cost: node.cost + t.cost,
        alg: [...node.alg, t.alg],
        pattern: node.pattern.applyAlg(t.alg),
        lastU: isU,
      })
    }
  }
  throw new Error('F2L: no solution found')
}
