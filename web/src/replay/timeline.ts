// 再生用のタイムライン計算。実時間（ソルブ開始からのms）と回転ログの位置を相互に変換する。

/** 1手の見た目上の回転時間（ms）。次の手までの間隔の方が短ければそちらに合わせる。 */
export const MOVE_ANIM_MS = 100

export type Position = {
  /** 回り終えた手の数。 */
  done: number
  /** 回転中の手（moves[done]）の進み具合 0〜1。 */
  fraction: number
}

/** 手 i のアニメーション時間。 */
export function animDuration(times: number[], i: number): number {
  const next = times[i + 1]
  return next === undefined ? MOVE_ANIM_MS : Math.max(1, Math.min(MOVE_ANIM_MS, next - times[i]))
}

/** 実時間 t（ms）の時点の位置。times は各手の開始時刻（昇順）。 */
export function positionAt(times: number[], t: number): Position {
  // t 以前に始まった最後の手を二分探索
  let lo = 0
  let hi = times.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (times[mid] <= t) lo = mid + 1
    else hi = mid
  }
  const i = lo - 1
  if (i < 0) return { done: 0, fraction: 0 }
  const f = (t - times[i]) / animDuration(times, i)
  return f >= 1 ? { done: i + 1, fraction: 0 } : { done: i, fraction: Math.max(0, f) }
}

/** 手 n 個を回り終えた直後の実時間。 */
export function timeAfter(times: number[], n: number): number {
  if (n <= 0) return 0
  const i = Math.min(n, times.length) - 1
  return times[i] + animDuration(times, i)
}

/** 再生全体の長さ。 */
export function totalDuration(times: number[]): number {
  return times.length === 0 ? 0 : timeAfter(times, times.length)
}
