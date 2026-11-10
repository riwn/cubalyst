// PLL の認識練習：前と右の2面だけを見て、どの PLL かを答える。キューブは使わない。
// facelets は 54 文字（U 0-8・R 9-17・F 18-26・D 27-35・L 36-44・B 45-53）、標準の向き（上面＝最終層）。

import { SOLVED_FACELETS } from '../cube/facelets'

/** 最終層の側面のシール。前の左から、上から見て反時計回りに1周（前・右・奥・左）。 */
const RING = [18, 19, 20, 9, 10, 11, 45, 46, 47, 36, 37, 38]
const SIDES = ['F', 'R', 'B', 'L']

/**
 * 出題する向きの facelets。turn（0〜3）は見る角度（どの面を前にするか）、auf（0〜3）は最終層のずれ。
 * 下の2段は揃っていて、最終層の側面だけがケースの並びになる。
 */
export function recogFacelets(pattern: string, turn: number, auf: number): string {
  const out = [...SOLVED_FACELETS]
  // 見る角度：下の2段の色が回る
  const side = (k: number) => SIDES[(k + turn) % 4]
  for (const [start, k] of [[18, 0], [9, 1], [45, 2], [36, 3]] as const) {
    for (let i = 0; i < 9; i++) out[start + i] = side(k)
  }
  // 最終層：同じ角度から見た並びを、auf のぶん色を巡回させる（最終層だけを回したのと同じ）
  RING.forEach((pos, i) => {
    const color = pattern[RING[(i + 3 * turn) % 12]]
    out[pos] = SIDES[(SIDES.indexOf(color) + auf) % 4]
  })
  return out.join('')
}

export type RecogStat = {
  /** 出題された回数。 */
  n: number
  /** 正解した回数。 */
  ok: number
  /** 正解したときの時間の合計（ms）。 */
  ms: number
}

export type RecogStats = Record<string, RecogStat>

const KEY = 'cubalyst.pllRecog'

export function loadRecogStats(): RecogStats {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return v && typeof v === 'object' ? (v as RecogStats) : {}
  } catch {
    return {}
  }
}

export function saveRecogStats(stats: RecogStats) {
  try {
    localStorage.setItem(KEY, JSON.stringify(stats))
  } catch {
    // 保存できなくても練習はできる
  }
}

export function addRecogResult(stats: RecogStats, id: string, correct: boolean, ms: number): RecogStats {
  const cur = stats[id] ?? { n: 0, ok: 0, ms: 0 }
  return { ...stats, [id]: { n: cur.n + 1, ok: cur.ok + (correct ? 1 : 0), ms: cur.ms + (correct ? ms : 0) } }
}

/** 正解したときの平均時間（ms）。正解が無ければ null。 */
export const recogAvg = (s: RecogStat | undefined) => (s && s.ok > 0 ? s.ms / s.ok : null)

/**
 * 出やすさ。まだ出ていないケースと、間違えやすいケース、遅いケースを多めに出す。
 * mean は全体の（正解したときの）平均時間。
 */
export function recogWeight(s: RecogStat | undefined, mean: number | null): number {
  if (!s || s.n === 0) return 3
  const miss = 1 - s.ok / s.n
  const avg = recogAvg(s)
  const slow = avg != null && mean != null && mean > 0 ? Math.max(0, avg / mean - 1) : 0
  return 1 + 3 * miss + Math.min(2, 2 * slow)
}

/** 次に出すケース。直前のケースは続けて出さない。rand は 0 以上 1 未満。 */
export function pickRecogCase(ids: string[], stats: RecogStats, last: string | null, rand: number): string {
  const pool = ids.length > 1 ? ids.filter((id) => id !== last) : ids
  const total = Object.values(stats).reduce((a, s) => ({ ok: a.ok + s.ok, ms: a.ms + s.ms }), { ok: 0, ms: 0 })
  const mean = total.ok > 0 ? total.ms / total.ok : null
  const weights = pool.map((id) => recogWeight(stats[id], mean))
  let x = rand * weights.reduce((a, b) => a + b, 0)
  for (let i = 0; i < pool.length; i++) {
    x -= weights[i]
    if (x < 0) return pool[i]
  }
  return pool[pool.length - 1]
}
