// 段階・持ち替えの再計算（判定ロジックやクロス色を変えたとき用）。回転ログ・ジャイロの生データから計算し直してサーバーに保存する。

import type { KPuzzle } from 'cubing/kpuzzle'
import { listSolves, replaceHolds, replaceSplits } from '../api'
import type { Hold } from '../cube/gyro'
import { computeSplits, type CrossColor } from './cfop'
import { estimateHolds } from './holds'

export async function recomputeAllSplits(
  kpuzzle: KPuzzle,
  color: CrossColor,
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  const full = await listSolves({ mode: 'full', limit: 0, includeMoves: true })
  const assist = await listSolves({ mode: 'assist', limit: 0, includeMoves: true })
  const solves = [...full.solves, ...assist.solves]
  let done = 0
  for (const s of solves) {
    if (s.moves?.length) {
      await replaceSplits(s.id, computeSplits(kpuzzle, s.moves, color))
    }
    done++
    onProgress?.(done, solves.length)
  }
  return done
}

/**
 * ジャイロの生データがあるソルブの持ち替えを計算し直す。着手時の下の色は重力から、前の色は回した手から決め直す
 * （hold は、前の色を決められなかったときの設定の持ち方）。
 */
export async function recomputeAllHolds(hold: Hold, onProgress?: (done: number, total: number) => void): Promise<number> {
  const { solves } = await listSolves({ limit: 0, includeMoves: true })
  const targets = solves.filter((s) => s.gyro?.length && s.moves?.length)
  let done = 0
  for (const s of targets) {
    await replaceHolds(s.id, estimateHolds(s.gyro!, s.moves!, hold))
    done++
    onProgress?.(done, targets.length)
  }
  return done
}
