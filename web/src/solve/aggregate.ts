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
}

/** 推移：各ソルブ時点の single / ao5 / ao12。 */
export function trend(solves: Solve[]): TrendPoint[] {
  const times = solves.map((s) => effectiveTime(s.total_ms, s.penalty))
  const ao5 = rollingAverages(times, 5)
  const ao12 = rollingAverages(times, 12)
  return solves.map((s, i) => ({ n: i + 1, solvedAt: s.solved_at, single: times[i], ao5: ao5[i], ao12: ao12[i] }))
}

export type Bests = {
  single: number | undefined
  ao5: number | undefined
  ao12: number | undefined
  currentAo5: number | null | undefined
  currentAo12: number | null | undefined
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
    currentAo12: last?.ao12,
    count: points.length,
    dnf: points.filter((p) => p.single === null).length,
  }
}

export type Bin = { from: number; to: number; count: number }

const BIN_WIDTHS = [250, 500, 1000, 2000, 5000]

/** ヒストグラム。DNFを除き、ビン数がおよそ target 以下になる幅を選ぶ。 */
export function histogram(times: (number | null)[], target = 20): { bins: Bin[]; dnf: number; width: number } {
  const valid = times.filter((t): t is number => t != null)
  const dnf = times.length - valid.length
  if (valid.length === 0) return { bins: [], dnf, width: 0 }
  const min = Math.min(...valid)
  const max = Math.max(...valid)
  const width = BIN_WIDTHS.find((w) => (max - min) / w <= target) ?? BIN_WIDTHS[BIN_WIDTHS.length - 1]
  const start = Math.floor(min / width) * width
  const n = Math.floor((max - start) / width) + 1
  const bins: Bin[] = Array.from({ length: n }, (_, i) => ({ from: start + i * width, to: start + (i + 1) * width, count: 0 }))
  for (const t of valid) bins[Math.min(n - 1, Math.floor((t - start) / width))].count++
  return { bins, dnf, width }
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
