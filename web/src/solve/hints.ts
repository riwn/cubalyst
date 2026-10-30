// 「この手順なら速かった」：1回のソルブで、ケースが分かった段階を標準手順と比べ、時間を損したところを挙げる。

import type { StageCaseRef, StageSolve } from '../api'
import { STAGE_LABELS, type Stage } from './cfop'

export type Hint = {
  stage: string
  /** 段階の名前（例 F2L 2（緑・赤）、PLL）。 */
  label: string
  case: StageCaseRef & { moves: number }
  /** 実際に回した手数。 */
  moves: number
  /** 実行（最初の手から段階の終わりまで）の時間。 */
  execMs: number
  /** 2-look など、手順を2つ以上に分けた。 */
  multiLook: boolean
  /** 標準手順で回したときの見込み。 */
  expectedMs: number
  /** 見込みの根拠。drill は手順練習の平均、tps はこの段階と同じ速さで標準手順の手数を回した場合。 */
  basis: 'drill' | 'tps'
  savedMs: number
}

/** 指摘する下限。これより小さい差は、AUF や回し方のゆれとみなす。 */
export const MIN_EXTRA_MOVES = 4
export const MIN_SAVED_MS = 400

type Stageish = { stage: string; ms: number; recognition_ms: number; moves: number }

function hintOf(
  s: Stageish,
  label: string,
  c: StageCaseRef | null | undefined,
  multiLook: boolean,
  drillMean: (id: string) => number | null | undefined,
): Hint | null {
  if (!c?.id || !c.moves || s.moves <= 0) return null
  const extra = s.moves - c.moves
  if (!multiLook && extra < MIN_EXTRA_MOVES) return null
  const execMs = Math.max(0, s.ms - s.recognition_ms)
  const drill = drillMean(c.id)
  const expectedMs = drill ?? (execMs * c.moves) / s.moves
  const savedMs = execMs - expectedMs
  if (savedMs < MIN_SAVED_MS) return null
  return {
    stage: s.stage,
    label,
    case: { ...c, moves: c.moves },
    moves: s.moves,
    execMs,
    multiLook,
    expectedMs,
    basis: drill != null ? 'drill' : 'tps',
    savedMs,
  }
}

/**
 * 時間を損したところ（損した時間の大きい順）。
 * F2L はケースが分かったペアで、標準手順より MIN_EXTRA_MOVES 手以上多く回したもの。
 * OLL・PLL は、始めたときのケースの1つの手順で揃えられたはずのもの（2-look・やり直し、または手数が多い）。
 * 見込みは手順練習の平均があればそれを、無ければ同じ速さで標準手順の手数を回した時間を使う。
 */
export function lossHints(s: StageSolve, drillMean: (caseId: string) => number | null | undefined): Hint[] {
  const out: Hint[] = []
  for (const p of s.pairs) {
    const h = hintOf(p, `${STAGE_LABELS[p.stage as Stage] ?? p.stage}（${p.slot}）`, p.case, false, drillMean)
    if (h) out.push(h)
  }
  for (const ll of [s.oll, s.pll]) {
    if (!ll) continue
    const h = hintOf(ll, ll.stage.toUpperCase(), ll.steps[0], ll.steps.length > 1, drillMean)
    if (h) out.push(h)
  }
  return out.sort((a, b) => b.savedMs - a.savedMs)
}
