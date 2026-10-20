import type { Solve } from '../api'
import { effectiveTime } from '../solve/stats'

export type CaseStat = { count: number; mean: number | null; last: Solve | null; best: number | null }

/** ケースごとの回数・平均（DNF除く）・ベスト。solves は新しい順。 */
export function caseStats(solves: Solve[]): Map<string, CaseStat> {
  const out = new Map<string, CaseStat & { sum: number; n: number }>()
  for (const s of solves) {
    if (!s.case_id) continue
    const cur = out.get(s.case_id) ?? { count: 0, mean: null, last: null, best: null, sum: 0, n: 0 }
    cur.count++
    cur.last ??= s
    const t = effectiveTime(s.total_ms, s.penalty)
    if (t != null) {
      cur.sum += t
      cur.n++
      cur.mean = cur.sum / cur.n
      cur.best = cur.best == null ? t : Math.min(cur.best, t)
    }
    out.set(s.case_id, cur)
  }
  return out
}
