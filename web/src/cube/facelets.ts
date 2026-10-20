// 54文字のfacelets（URFDLB、各面row-major。Kociemba形式）と cubing.js の KPattern の相互変換。
//
// 面の並び（Kociembaの展開図）:
//   U: 0-8（B側が上）, R: 9-17, F: 18-26, D: 27-35（F側が上）, L: 36-44, B: 45-53
//
// cubing.js 3x3 の slot 名は Reid 順。各 slot のシールは名前の面の順に並べる。
// KPattern の orientation o は「slot の k 番目のシールに、ピースの (k + o) % n 番目のシールが来る」を意味する。

import { KPattern, type KPuzzle } from 'cubing/kpuzzle'

export const SOLVED_FACELETS = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB'

const CORNER_SLOTS: { name: string; facelets: number[] }[] = [
  { name: 'UFR', facelets: [8, 20, 9] },
  { name: 'URB', facelets: [2, 11, 45] },
  { name: 'UBL', facelets: [0, 47, 36] },
  { name: 'ULF', facelets: [6, 38, 18] },
  { name: 'DRF', facelets: [29, 15, 26] },
  { name: 'DFL', facelets: [27, 24, 44] },
  { name: 'DLB', facelets: [33, 42, 53] },
  { name: 'DBR', facelets: [35, 51, 17] },
]

const EDGE_SLOTS: { name: string; facelets: number[] }[] = [
  { name: 'UF', facelets: [7, 19] },
  { name: 'UR', facelets: [5, 10] },
  { name: 'UB', facelets: [1, 46] },
  { name: 'UL', facelets: [3, 37] },
  { name: 'DF', facelets: [28, 25] },
  { name: 'DR', facelets: [32, 16] },
  { name: 'DB', facelets: [34, 52] },
  { name: 'DL', facelets: [30, 43] },
  { name: 'FR', facelets: [23, 12] },
  { name: 'FL', facelets: [21, 41] },
  { name: 'BR', facelets: [48, 14] },
  { name: 'BL', facelets: [50, 39] },
]

// cubing.js の CENTERS は U L F R B D の順。
const CENTER_FACELETS = [4, 40, 22, 13, 49, 31]
const CENTER_COLORS = 'ULFRBD'

type Slot = { name: string; facelets: number[] }

function writeOrbit(out: string[], slots: Slot[], pieces: number[], orientation: number[]) {
  slots.forEach((slot, s) => {
    const piece = slots[pieces[s]].name
    const n = slot.facelets.length
    slot.facelets.forEach((f, k) => {
      out[f] = piece[(k + orientation[s]) % n]
    })
  })
}

/** KPattern を54文字のfaceletsに変換する。センターは固定（向き無視）とみなす。 */
export function patternToFacelets(pattern: KPattern): string {
  const d = pattern.patternData
  const out: string[] = new Array(54)
  writeOrbit(out, CORNER_SLOTS, d.CORNERS.pieces, d.CORNERS.orientation)
  writeOrbit(out, EDGE_SLOTS, d.EDGES.pieces, d.EDGES.orientation)
  CENTER_FACELETS.forEach((f, i) => {
    out[f] = CENTER_COLORS[d.CENTERS.pieces[i]]
  })
  return out.join('')
}

function readOrbit(facelets: string, slots: Slot[]): { pieces: number[]; orientation: number[] } | null {
  const pieces: number[] = []
  const orientation: number[] = []
  const used = new Set<number>()
  for (const slot of slots) {
    const colors = slot.facelets.map((f) => facelets[f]).join('')
    const n = colors.length
    let found = false
    for (let p = 0; p < slots.length && !found; p++) {
      const name = slots[p].name
      for (let o = 0; o < n; o++) {
        let match = true
        for (let k = 0; k < n; k++) {
          if (colors[k] !== name[(k + o) % n]) {
            match = false
            break
          }
        }
        if (match) {
          if (used.has(p)) return null
          used.add(p)
          pieces.push(p)
          orientation.push(o)
          found = true
          break
        }
      }
    }
    if (!found) return null
  }
  return { pieces, orientation }
}

function permutationParity(p: number[]): number {
  let parity = 0
  const seen = new Array(p.length).fill(false)
  for (let i = 0; i < p.length; i++) {
    if (seen[i]) continue
    let len = 0
    for (let j = i; !seen[j]; j = p[j]) {
      seen[j] = true
      len++
    }
    parity ^= (len - 1) & 1
  }
  return parity
}

/**
 * 54文字のfaceletsを KPattern に変換する。
 * センターが標準配置（U面にU…）でない場合や、物理的にあり得ない状態の場合は null を返す。
 */
export function faceletsToPattern(kpuzzle: KPuzzle, facelets: string): KPattern | null {
  if (facelets.length !== 54) return null
  for (let i = 0; i < CENTER_FACELETS.length; i++) {
    if (facelets[CENTER_FACELETS[i]] !== CENTER_COLORS[i]) return null
  }
  const corners = readOrbit(facelets, CORNER_SLOTS)
  const edges = readOrbit(facelets, EDGE_SLOTS)
  if (!corners || !edges) return null
  if (corners.orientation.reduce((a, b) => a + b, 0) % 3 !== 0) return null
  if (edges.orientation.reduce((a, b) => a + b, 0) % 2 !== 0) return null
  if (permutationParity(corners.pieces) !== permutationParity(edges.pieces)) return null

  const solved = kpuzzle.defaultPattern()
  return new KPattern(kpuzzle, {
    ...solved.patternData,
    CORNERS: corners,
    EDGES: edges,
  })
}
