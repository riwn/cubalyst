// 目標タイムから段階ごとの目標を出す。自分のソルブのうち速い回の配分を使う。

import type { Solve } from '../api'
import { stageStats } from './aggregate'
import { STAGES, type StageGroup } from './cfop'

export const TARGET_GROUPS: StageGroup[] = ['cross', 'f2l', 'oll', 'pll']

/** 配分を取る「速い回」：段階の時間の合計が速い方からこの割合（ただし FAST_MIN 件以上）。 */
export const FAST_RATIO = 0.2
export const FAST_MIN = 5

export type TargetRow = {
  group: StageGroup
  /** 今の平均。 */
  nowMs: number
  nowMoves: number
  /** 速い回での割合（0〜1）。 */
  fastShare: number
  targetMs: number
  /** 縮める時間（目標より速ければ 0）。 */
  cutMs: number
  /** 縮める時間の合計に占める割合（0〜1）。 */
  cutShare: number
  /** 今の手数のまま目標の時間で回すのに要る TPS。 */
  neededTps: number
  nowTps: number
}

export type TargetPlan = {
  rows: TargetRow[]
  /** 段階の時間の合計の平均。 */
  nowMs: number
  /** 配分に使った速い回の数と、その平均。 */
  fastCount: number
  fastMs: number
  /** 段階の時間の合計が目標以下だった回数。 */
  reached: number
  count: number
}

const stageTotal = (s: Solve) => (s.splits ?? []).reduce((n, sp) => n + sp.end_ms - sp.start_ms, 0)

/** 段階の記録がそろったソルブ（DNF 除く）から、目標タイム targetMs の段階ごとの目標を作る。対象が無ければ null。 */
export function targetPlan(solves: Solve[], targetMs: number): TargetPlan | null {
  const valid = solves.filter((s) => s.penalty !== 'DNF' && s.splits?.length === STAGES.length)
  if (valid.length === 0 || targetMs <= 0) return null
  const now = stageStats(valid)
  const sorted = [...valid].sort((a, b) => stageTotal(a) - stageTotal(b))
  const fast = sorted.slice(0, Math.min(valid.length, Math.max(FAST_MIN, Math.round(valid.length * FAST_RATIO))))
  const fastStats = stageStats(fast)

  const rows = TARGET_GROUPS.map((group) => {
    const n = now.groups[group] ?? { ms: 0, moves: 0, share: 0, tps: 0 }
    const fastShare = fastStats.groups[group]?.share ?? 0
    const target = targetMs * fastShare
    return {
      group,
      nowMs: n.ms,
      nowMoves: n.moves,
      fastShare,
      targetMs: target,
      cutMs: Math.max(0, n.ms - target),
      cutShare: 0,
      neededTps: target > 0 ? n.moves / (target / 1000) : 0,
      nowTps: n.tps,
    }
  })
  const cut = rows.reduce((s, r) => s + r.cutMs, 0)
  for (const r of rows) r.cutShare = cut > 0 ? r.cutMs / cut : 0

  return {
    rows,
    nowMs: valid.reduce((s, x) => s + stageTotal(x), 0) / valid.length,
    fastCount: fast.length,
    fastMs: fast.reduce((s, x) => s + stageTotal(x), 0) / fast.length,
    reached: valid.filter((s) => stageTotal(s) <= targetMs).length,
    count: valid.length,
  }
}
