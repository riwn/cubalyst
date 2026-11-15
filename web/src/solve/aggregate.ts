// 統計画面用の集計。入力のソルブは古い順。

import type { Solve } from '../api'
import { groupSplits, STAGES, type Stage, type StageGroup } from './cfop'
import { best, effectiveTime, rollingAverages } from './stats'

export type TrendPoint = {
  n: number
  solvedAt: string
  single: number | null
  ao5: number | null | undefined
  ao12: number | null | undefined
  ao50: number | null | undefined
  ao100: number | null | undefined
}

/** 推移：各ソルブ時点の single / ao5 / ao12 / ao50 / ao100。 */
export function trend(solves: Solve[]): TrendPoint[] {
  const times = solves.map((s) => effectiveTime(s.total_ms, s.penalty))
  const ao5 = rollingAverages(times, 5)
  const ao12 = rollingAverages(times, 12)
  const ao50 = rollingAverages(times, 50)
  const ao100 = rollingAverages(times, 100)
  return solves.map((s, i) => ({
    n: i + 1,
    solvedAt: s.solved_at,
    single: times[i],
    ao5: ao5[i],
    ao12: ao12[i],
    ao50: ao50[i],
    ao100: ao100[i],
  }))
}

export type Bests = {
  single: number | undefined
  ao5: number | undefined
  ao12: number | undefined
  ao50: number | undefined
  ao100: number | undefined
  currentAo5: number | null | undefined
  currentAo12: number | null | undefined
  currentAo50: number | null | undefined
  currentAo100: number | null | undefined
  count: number
  dnf: number
}

export function bests(points: TrendPoint[]): Bests {
  const last = points[points.length - 1]
  return {
    single: best(points.map((p) => p.single)),
    ao5: best(points.map((p) => p.ao5)),
    ao12: best(points.map((p) => p.ao12)),
    currentAo5: last?.ao5,
    ao50: best(points.map((p) => p.ao50)),
    ao100: best(points.map((p) => p.ao100)),
    currentAo12: last?.ao12,
    currentAo50: last?.ao50,
    currentAo100: last?.ao100,
    count: points.length,
    dnf: points.filter((p) => p.single === null).length,
  }
}

/** 外れ値の境。lo 未満・hi 超えを外れ値とみなす。 */
export type Fences = { lo: number; hi: number }

function quantile(sorted: number[], q: number) {
  const pos = (sorted.length - 1) * q
  const i = Math.floor(pos)
  return i + 1 < sorted.length ? sorted[i] + (sorted[i + 1] - sorted[i]) * (pos - i) : sorted[i]
}

/**
 * 外れ値の境（Tukey の柵：Q1 − k×IQR 〜 Q3 + k×IQR）。DNF（null）は除く。
 * 件数が少ないとき、または外れ値が無いときは null（グラフはそのまま全部を描く）。
 */
export function outlierFences(values: (number | null | undefined)[], k = 1.5): Fences | null {
  const v = values.filter((t): t is number => t != null).sort((a, b) => a - b)
  if (v.length < 8) return null
  const q1 = quantile(v, 0.25)
  const q3 = quantile(v, 0.75)
  const iqr = q3 - q1
  const lo = q1 - k * iqr
  const hi = q3 + k * iqr
  if (v[0] >= lo && v[v.length - 1] <= hi) return null
  return { lo: Math.max(lo, v[0]), hi: Math.min(hi, v[v.length - 1]) }
}

/** edge：外れ値をまとめた端のビン（under＝lo 未満、over＝hi 超え）。 */
export type Bin = { from: number; to: number; count: number; edge?: 'under' | 'over' }

const BIN_WIDTHS = [250, 500, 1000, 2000, 5000]

/**
 * ヒストグラム。DNFを除き、ビン数がおよそ target 以下になる幅を選ぶ。
 * fences を渡すと、その外のタイムは両端の1本ずつのビン（edge）にまとめ、幅は内側だけで決める。
 */
export function histogram(
  times: (number | null)[],
  target = 20,
  fences?: Fences | null,
): { bins: Bin[]; dnf: number; width: number; outliers: number } {
  const valid = times.filter((t): t is number => t != null)
  const dnf = times.length - valid.length
  const under = fences ? valid.filter((t) => t < fences.lo) : []
  const over = fences ? valid.filter((t) => t > fences.hi) : []
  const inside = fences ? valid.filter((t) => t >= fences.lo && t <= fences.hi) : valid
  const outliers = under.length + over.length
  if (inside.length === 0) return { bins: [], dnf, width: 0, outliers }
  const min = Math.min(...inside)
  const max = Math.max(...inside)
  const width = BIN_WIDTHS.find((w) => (max - min) / w <= target) ?? BIN_WIDTHS[BIN_WIDTHS.length - 1]
  const start = Math.floor(min / width) * width
  const n = Math.floor((max - start) / width) + 1
  const bins: Bin[] = Array.from({ length: n }, (_, i) => ({ from: start + i * width, to: start + (i + 1) * width, count: 0 }))
  for (const t of inside) bins[Math.min(n - 1, Math.floor((t - start) / width))].count++
  if (under.length) bins.unshift({ from: Math.min(...under), to: start, count: under.length, edge: 'under' })
  if (over.length) bins.push({ from: start + n * width, to: Math.max(...over), count: over.length, edge: 'over' })
  return { bins, dnf, width, outliers }
}

export type StageStat = { ms: number; moves: number; share: number; tps: number }

/** 段階別の平均（段階の記録があるソルブのみ。DNFは除く）。share は平均合計に占める割合。 */
export function stageStats(solves: Solve[]): {
  groups: Partial<Record<StageGroup, StageStat>>
  stages: Partial<Record<Stage, StageStat>>
  count: number
} {
  const target = solves.filter((s) => s.penalty !== 'DNF' && s.splits && s.splits.length === STAGES.length)
  const n = target.length
  if (n === 0) return { groups: {}, stages: {}, count: 0 }
  const groupSum: Record<string, { ms: number; moves: number }> = {}
  const stageSum: Record<string, { ms: number; moves: number }> = {}
  let totalMs = 0
  for (const s of target) {
    for (const [g, v] of Object.entries(groupSplits(s.splits))) {
      const cur = (groupSum[g] ??= { ms: 0, moves: 0 })
      cur.ms += v.ms
      cur.moves += v.moves
    }
    for (const sp of s.splits!) {
      const cur = (stageSum[sp.stage] ??= { ms: 0, moves: 0 })
      cur.ms += sp.end_ms - sp.start_ms
      cur.moves += sp.move_count
      totalMs += sp.end_ms - sp.start_ms
    }
  }
  const avgTotal = totalMs / n
  const toStat = (v: { ms: number; moves: number }): StageStat => {
    const ms = v.ms / n
    const moves = v.moves / n
    return { ms, moves, share: avgTotal > 0 ? ms / avgTotal : 0, tps: ms > 0 ? moves / (ms / 1000) : 0 }
  }
  return {
    groups: Object.fromEntries(Object.entries(groupSum).map(([k, v]) => [k, toStat(v)])),
    stages: Object.fromEntries(Object.entries(stageSum).map(([k, v]) => [k, toStat(v)])),
    count: n,
  }
}
