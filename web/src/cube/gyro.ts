// ジャイロ（キューブの向き）の計算。
//
// GAN のクォータニオン q は「キューブの座標 → 基準の座標」の回転で、基準の Z 軸は鉛直上向き（重力に合っている）。
// 水平の向き（基準の X・Y 軸）は決まっていない。キューブの軸は +X 赤・+Y 青・+Z 白。
// 実機（GAN i4）で確かめた内容は docs/plans/phase-9.md。

import { isValidHold, rightColor, type Color } from './orientation'

export type Quat = { w: number; x: number; y: number; z: number }
export type Vec3 = [number, number, number]

/** 保存する1サンプル：[t, w, x, y, z]。t はソルブ開始からの相対ms。 */
export type GyroSample = [number, number, number, number, number]

/** 持ち方（下の色・前の色）。 */
export type Hold = { bottom: Color; front: Color }

/** キューブの各色の面が向いている軸（キューブの座標）。 */
export const COLOR_AXIS: Record<Color, Vec3> = {
  red: [1, 0, 0],
  orange: [-1, 0, 0],
  blue: [0, 1, 0],
  green: [0, -1, 0],
  white: [0, 0, 1],
  yellow: [0, 0, -1],
}

export const OPPOSITE: Record<Color, Color> = {
  red: 'orange',
  orange: 'red',
  blue: 'green',
  green: 'blue',
  white: 'yellow',
  yellow: 'white',
}

const COLORS = Object.keys(COLOR_AXIS) as Color[]

export const sampleQuat = (s: GyroSample): Quat => ({ w: s[1], x: s[2], y: s[3], z: s[4] })

const conj = (q: Quat): Quat => ({ w: q.w, x: -q.x, y: -q.y, z: -q.z })

/** ベクトル v をクォータニオン q で回す（q v q*）。 */
export function rotate(q: Quat, v: Vec3): Vec3 {
  const { w, x, y, z } = q
  const tx = 2 * (y * v[2] - z * v[1])
  const ty = 2 * (z * v[0] - x * v[2])
  const tz = 2 * (x * v[1] - y * v[0])
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)]
}

/** 基準の座標のベクトルを、キューブの座標で表す。 */
export const toBody = (q: Quat, v: Vec3): Vec3 => rotate(conj(q), v)

/** キューブの座標のベクトルを、基準の座標で表す。 */
export const toWorld = (q: Quat, v: Vec3): Vec3 => rotate(q, v)

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

/** キューブの座標のベクトルに一番近い面の色と、その面の軸とのずれ（度）。 */
export function nearestColor(v: Vec3): { color: Color; deg: number } {
  const len = Math.hypot(...v) || 1
  let best: Color = COLORS[0]
  let bestDot = -Infinity
  for (const c of COLORS) {
    const d = dot(COLOR_AXIS[c], v) / len
    if (d > bestDot) {
      bestDot = d
      best = c
    }
  }
  return { color: best, deg: (Math.acos(Math.min(1, bestDot)) * 180) / Math.PI }
}

/** 水平面に射影して正規化する。ほぼ鉛直なら null。 */
export function horizontal(v: Vec3): Vec3 | null {
  const len = Math.hypot(v[0], v[1])
  return len < 0.5 ? null : [v[0] / len, v[1] / len, 0]
}

/**
 * 向き q のときの持ち方。frontWorld は、解く人から見た「前」の方向（基準の座標、水平）。
 * どちらかの軸が maxDeg を超えてずれていれば（回している途中）null。
 */
export function holdAt(q: Quat, frontWorld: Vec3, maxDeg: number): Hold | null {
  const up = nearestColor(toBody(q, [0, 0, 1]))
  const front = nearestColor(toBody(q, frontWorld))
  if (up.deg > maxDeg || front.deg > maxDeg) return null
  const hold = { bottom: OPPOSITE[up.color], front: front.color }
  return isValidHold(hold.bottom, hold.front) ? hold : null
}

/** 3x3 の回転行列（行が基準の座標、列がキューブの座標）からクォータニオンを作る。 */
function quatFromMatrix(m: number[][]): Quat {
  const trace = m[0][0] + m[1][1] + m[2][2]
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1)
    return { w: 0.25 / s, x: (m[2][1] - m[1][2]) * s, y: (m[0][2] - m[2][0]) * s, z: (m[1][0] - m[0][1]) * s }
  }
  if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) {
    const s = 2 * Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2])
    return { w: (m[2][1] - m[1][2]) / s, x: 0.25 * s, y: (m[0][1] + m[1][0]) / s, z: (m[0][2] + m[2][0]) / s }
  }
  if (m[1][1] > m[2][2]) {
    const s = 2 * Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2])
    return { w: (m[0][2] - m[2][0]) / s, x: (m[0][1] + m[1][0]) / s, y: 0.25 * s, z: (m[1][2] + m[2][1]) / s }
  }
  const s = 2 * Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1])
  return { w: (m[1][0] - m[0][1]) / s, x: (m[0][2] + m[2][0]) / s, y: (m[1][2] + m[2][1]) / s, z: 0.25 * s }
}

/**
 * 持ち方 hold で持ったときの向き。解く人から見た前は、基準の -Y を yaw（ラジアン）だけ Z 軸まわりに回した方向。
 * モック接続とテストで使う。
 */
export function quatFromHold(hold: Hold, yaw = 0): Quat {
  const front: Vec3 = [Math.sin(yaw), -Math.cos(yaw), 0]
  const up: Vec3 = [0, 0, 1]
  const right = cross(up, front)
  const right_ = rightColor(hold.bottom, hold.front)!
  const world: Record<Color, Vec3> = {} as Record<Color, Vec3>
  const neg = (v: Vec3): Vec3 => [-v[0], -v[1], -v[2]]
  world[hold.bottom] = neg(up)
  world[OPPOSITE[hold.bottom]] = up
  world[hold.front] = front
  world[OPPOSITE[hold.front]] = neg(front)
  world[right_] = right
  world[OPPOSITE[right_]] = neg(right)
  // 列 j は、キューブの軸 e_j（+X 赤・+Y 青・+Z 白）が向いている方向
  const cols: Vec3[] = [world.red, world.blue, world.white]
  return quatFromMatrix([0, 1, 2].map((i) => cols.map((c) => c[i])))
}

/** 2つの向きの間を補間する（モック接続で、持ち替えの途中のサンプルを作るのに使う）。 */
export function slerp(a: Quat, b: Quat, u: number): Quat {
  let d = a.w * b.w + a.x * b.x + a.y * b.y + a.z * b.z
  let bb = b
  if (d < 0) {
    d = -d
    bb = { w: -b.w, x: -b.x, y: -b.y, z: -b.z }
  }
  if (d > 0.9995) {
    const q = {
      w: a.w + (bb.w - a.w) * u,
      x: a.x + (bb.x - a.x) * u,
      y: a.y + (bb.y - a.y) * u,
      z: a.z + (bb.z - a.z) * u,
    }
    const n = Math.hypot(q.w, q.x, q.y, q.z)
    return { w: q.w / n, x: q.x / n, y: q.y / n, z: q.z / n }
  }
  const th = Math.acos(d)
  const s = Math.sin(th)
  const ka = Math.sin((1 - u) * th) / s
  const kb = Math.sin(u * th) / s
  return { w: a.w * ka + bb.w * kb, x: a.x * ka + bb.x * kb, y: a.y * ka + bb.y * kb, z: a.z * ka + bb.z * kb }
}
