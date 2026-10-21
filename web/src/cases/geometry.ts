// ケース練習のための状態操作：向きの正規化、標準の向き⇔キューブ座標系の写像、ケースの同一性判定。

import { KPattern, type KPuzzle } from 'cubing/kpuzzle'
import { patternToFacelets } from '../cube/facelets'
import type { CrossColor } from '../solve/cfop'

/** 持ち替え24通り。 */
export const ROTATIONS: string[] = (() => {
  const ups = ['', 'x', 'x2', "x'", 'z', "z'"]
  const ys = ['', 'y', 'y2', "y'"]
  return ups.flatMap((u) => ys.map((y) => `${u} ${y}`.trim()))
})()

/**
 * 持ち替え（x/y/z）やスライス・ワイドムーブでセンターが動いた状態を、センターが標準位置に来るよう持ち替える。
 * キューブを丸ごと回しただけの違いは同じ状態とみなすため。
 */
export function normalizeOrientation(kpuzzle: KPuzzle, pattern: KPattern): KPattern {
  for (const rot of ROTATIONS) {
    const p = rot ? pattern.applyAlg(rot) : pattern
    const c = p.patternData.CENTERS.pieces
    if (c.every((v, i) => v === i)) {
      const solved = kpuzzle.defaultPattern()
      return new KPattern(kpuzzle, { ...p.patternData, CENTERS: solved.patternData.CENTERS })
    }
  }
  throw new Error('normalizeOrientation: no rotation found')
}

/** 手順を当てた状態（向きは正規化済み）。 */
export function applyNormalized(kpuzzle: KPuzzle, alg: string, start?: KPattern): KPattern {
  return normalizeOrientation(kpuzzle, (start ?? kpuzzle.defaultPattern()).applyAlg(alg))
}

/**
 * 標準の向き（上面＝最終層、下面＝クロス）からキューブ座標系への持ち替え。
 * `${ROT} 手順 ${ROT}'` で「その色をクロスにして持ったときの手順」をキューブ座標系で行ったことになる。
 * キューブ座標系はGAN標準配色（白U・黄D・緑F・青B・赤R・橙L）。
 */
export const FRAME_ROTATION: Record<CrossColor, string> = {
  yellow: '', // クロスD・最終層U（そのまま）
  white: 'z2', // 最終層をDへ
  blue: 'x', // 最終層をFへ（クロスはB）
  green: "x'", // 最終層をBへ（クロスはF）
  orange: "z'", // 最終層をRへ（クロスはL）
  red: 'z', // 最終層をLへ（クロスはR）
}

export function invertRotation(rot: string): string {
  if (!rot) return ''
  return rot.endsWith("'") ? rot.slice(0, -1) : rot.endsWith('2') ? rot : `${rot}'`
}

/** 標準の向きで書いた手順を、クロス色に合わせてキューブ座標系で行う。 */
export function inFrame(alg: string, color: CrossColor): string {
  const rot = FRAME_ROTATION[color]
  return rot ? `${rot} ${alg} ${invertRotation(rot)}` : alg
}

const AUF = ['', 'U', 'U2', "U'"]

/** 上面（最終層）の向きだけを表す文字列。U色のシールの位置。 */
function ollString(p: KPattern): string {
  const f = patternToFacelets(p)
  // U面9枚と、F/R/B/L面の上段3枚ずつ
  const idx = [...Array(9).keys(), 9, 10, 11, 18, 19, 20, 36, 37, 38, 45, 46, 47]
  return idx.map((i) => (f[i] === 'U' ? 'x' : '.')).join('')
}

/** 最終層の側面シール（色の並び）。 */
function pllString(p: KPattern): string {
  const f = patternToFacelets(p)
  return [9, 10, 11, 18, 19, 20, 36, 37, 38, 45, 46, 47].map((i) => f[i]).join('')
}

/**
 * ケースの同一性判定用の署名（標準の向きの状態から）。
 * OLL：前AUFを除いた上面の向き / PLL：前後AUFを除いた並び / F2L：前AUFを除いたFRペアの位置と向き
 */
export function caseSignature(set: 'OLL' | 'PLL' | 'F2L', state: KPattern): string {
  const variants: string[] = []
  if (set === 'OLL') {
    for (const a of AUF) variants.push(ollString(a ? state.applyAlg(a) : state))
  } else if (set === 'PLL') {
    // 前AUFは状態にUを当てる。後AUF（解いた後のU）は側面の色の名前を巡回させるのと同じ
    const cycle: Record<string, string> = { F: 'R', R: 'B', B: 'L', L: 'F' }
    for (const pre of AUF) {
      let s = pllString(pre ? state.applyAlg(pre) : state)
      for (let k = 0; k < 4; k++) {
        variants.push(s)
        s = [...s].map((c) => cycle[c] ?? c).join('')
      }
    }
  } else {
    for (const a of AUF) {
      const d = (a ? state.applyAlg(a) : state).patternData
      const corner = d.CORNERS.pieces.indexOf(4) // DRF
      const edge = d.EDGES.pieces.indexOf(8) // FR
      variants.push(`${corner}:${d.CORNERS.orientation[corner]}/${edge}:${d.EDGES.orientation[edge]}`)
    }
  }
  return variants.sort()[0]
}
