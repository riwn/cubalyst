// 段階の再計算（判定ロジックやクロス色を変えたとき用）。回転ログから計算し直してサーバーに保存する。

import type { KPuzzle } from 'cubing/kpuzzle'
import { listSolves, replaceSplits } from '../api'
import { computeSplits, type CrossColor } from './cfop'

export async function recomputeAllSplits(
  kpuzzle: KPuzzle,
  color: CrossColor,
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  const { solves } = await listSolves({ mode: 'full', limit: 0, includeMoves: true })
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
