// 回転記号の座標系の変換（Go の internal/notation と同じ考え方）。
//
// スマートキューブは、キューブ自身の向き（GAN標準配色：白U・黄D・緑F・青B・赤R・橙L）で回転を報告する。
// 解く人の持ち方（下の色・前の色）での面の名前に読み替えて表示する。回転方向（' や 2）は変わらない。

import type { KPattern } from 'cubing/kpuzzle'
import { ROTATIONS } from '../cases/geometry'
import type { CrossColor } from '../solve/cfop'

export type Color = CrossColor

export const COLOR_FACE: Record<Color, string> = { white: 'U', yellow: 'D', green: 'F', blue: 'B', red: 'R', orange: 'L' }

type Vec = [number, number, number]
const FACE_VEC: Record<string, Vec> = {
  U: [0, 1, 0],
  D: [0, -1, 0],
  F: [0, 0, 1],
  B: [0, 0, -1],
  R: [1, 0, 0],
  L: [-1, 0, 0],
}
const neg = (v: Vec): Vec => [-v[0], -v[1], -v[2]]
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const key = (v: Vec) => v.join(',')

/** キューブ自身の面 → 持ち方での面。 */
export type Frame = Record<string, string>

export const IDENTITY_FRAME: Frame = { U: 'U', D: 'D', F: 'F', B: 'B', R: 'R', L: 'L' }

/** 前の色が下の色と隣り合っているか。 */
export function isValidHold(bottom: Color, front: Color): boolean {
  const b = FACE_VEC[COLOR_FACE[bottom]]
  const f = FACE_VEC[COLOR_FACE[front]]
  return b[0] * f[0] + b[1] * f[1] + b[2] * f[2] === 0
}

/** 「下の色・前の色」で持ったときの対応。不正な組み合わせなら null。 */
export function holdFrame(bottom: Color, front: Color): Frame | null {
  if (!isValidHold(bottom, front)) return null
  const b = FACE_VEC[COLOR_FACE[bottom]]
  const f = FACE_VEC[COLOR_FACE[front]]
  const up = neg(b)
  const right = cross(up, f) // 右手系：R = U × F
  const user = new Map<string, string>([
    [key(up), 'U'],
    [key(b), 'D'],
    [key(f), 'F'],
    [key(neg(f)), 'B'],
    [key(right), 'R'],
    [key(neg(right)), 'L'],
  ])
  return Object.fromEntries(Object.entries(FACE_VEC).map(([face, v]) => [face, user.get(key(v))!]))
}

/** 持ち方での右の面の色。 */
export function rightColor(bottom: Color, front: Color): Color | null {
  const frame = holdFrame(bottom, front)
  if (!frame) return null
  return (Object.keys(COLOR_FACE) as Color[]).find((c) => frame[COLOR_FACE[c]] === 'R') ?? null
}

/** 1手を持ち方での記号に変換する。外層回転以外はそのまま。 */
export function convertMove(frame: Frame, move: string): string {
  const to = frame[move[0]]
  return to ? to + move.slice(1) : move
}

/**
 * キューブを丸ごと持ち替えて、持ち方の向き（下の色が下、前の色が前）にする回転（x/y/z）。
 * 再生の3D表示を持ち方に合わせるために使う。
 */
export function holdRotation(solved: KPattern, bottom: Color, front: Color): string {
  // cubing.js の CENTERS は U L F R B D の順
  const order = 'ULFRBD'
  const wantD = order.indexOf(COLOR_FACE[bottom])
  const wantF = order.indexOf(COLOR_FACE[front])
  for (const rot of ROTATIONS) {
    const c = (rot ? solved.applyAlg(rot) : solved).patternData.CENTERS.pieces
    if (c[order.indexOf('D')] === wantD && c[order.indexOf('F')] === wantF) return rot
  }
  return ''
}
