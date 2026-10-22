// CFOPの段階検出。facelets（センター固定）から各段階の完了を判定し、回転ログを段階に区切る。

import type { KPattern, KPuzzle } from 'cubing/kpuzzle'
import { CORNER_SLOTS, EDGE_SLOTS, patternToFacelets } from '../cube/facelets'
import { invert } from './notation'

export const STAGES = ['cross', 'f2l1', 'f2l2', 'f2l3', 'f2l4', 'oll', 'pll'] as const
export type Stage = (typeof STAGES)[number]

export const STAGE_LABELS: Record<Stage, string> = {
  cross: 'Cross',
  f2l1: 'F2L 1',
  f2l2: 'F2L 2',
  f2l3: 'F2L 3',
  f2l4: 'F2L 4',
  oll: 'OLL',
  pll: 'PLL',
}

export type Split = {
  stage: Stage
  start_ms: number
  end_ms: number
  move_count: number
  /** 回転ログ上の範囲 [start_index, end_index) */
  start_index: number
  end_index: number
}

export const CROSS_COLORS = ['white', 'yellow', 'green', 'blue', 'red', 'orange'] as const
export type CrossColor = (typeof CROSS_COLORS)[number]

export const COLOR_LABELS: Record<CrossColor, string> = {
  white: '白',
  yellow: '黄',
  green: '緑',
  blue: '青',
  red: '赤',
  orange: '橙',
}

/** GAN標準配色での色と面（キューブ自身の座標系）の対応。 */
const COLOR_FACE: Record<CrossColor, string> = { white: 'U', yellow: 'D', green: 'F', blue: 'B', red: 'R', orange: 'L' }
const OPPOSITE: Record<string, string> = { U: 'D', D: 'U', R: 'L', L: 'R', F: 'B', B: 'F' }
const FACES = 'URFDLB'

const faceOf = (facelet: number) => FACES[Math.floor(facelet / 9)]

type Slot = { facelets: number[] }

function solvedPiece(facelets: string, slot: Slot): boolean {
  return slot.facelets.every((f) => facelets[f] === faceOf(f))
}

/** あるクロス色についての判定に必要なピースの組。 */
type CrossGeometry = {
  crossEdges: Slot[]
  /** F2Lスロット（角と中層エッジの組）。 */
  pairs: { corner: Slot; edge: Slot }[]
  /** OLLで揃える面のfacelet。 */
  lastLayer: number[]
}

const geometryCache = new Map<CrossColor, CrossGeometry>()

function geometry(color: CrossColor): CrossGeometry {
  const cached = geometryCache.get(color)
  if (cached) return cached
  const face = COLOR_FACE[color]
  const facesOf = (s: Slot) => s.facelets.map(faceOf)
  const crossEdges = EDGE_SLOTS.filter((e) => facesOf(e).includes(face))
  const pairs = CORNER_SLOTS.filter((c) => facesOf(c).includes(face)).map((corner) => {
    const sides = facesOf(corner).filter((f) => f !== face)
    const edge = EDGE_SLOTS.find((e) => {
      const fs = facesOf(e)
      return fs.length === 2 && sides.every((s) => fs.includes(s))
    })!
    return { corner, edge }
  })
  const ll = FACES.indexOf(OPPOSITE[face])
  const g = { crossEdges, pairs, lastLayer: Array.from({ length: 9 }, (_, i) => ll * 9 + i) }
  geometryCache.set(color, g)
  return g
}

/**
 * 状態の進み具合（段階の数）を返す。0=クロス未完成、1=cross、2〜5=f2l1〜f2l4、6=oll、7=pll（完成）。
 */
export function stageLevel(facelets: string, color: CrossColor): number {
  const g = geometry(color)
  if (!g.crossEdges.every((e) => solvedPiece(facelets, e))) return 0
  const slots = g.pairs.filter((p) => solvedPiece(facelets, p.corner) && solvedPiece(facelets, p.edge)).length
  if (slots < 4) return 1 + slots
  const ollFace = FACES[Math.floor(g.lastLayer[0] / 9)]
  if (!g.lastLayer.every((f) => facelets[f] === ollFace)) return 5
  return [...facelets].every((c, i) => c === faceOf(i)) ? 7 : 6
}

export type TimedMove = { move: string; t: number }

/**
 * 回転ログを段階に区切る。各段階は「初めて条件を満たした手」で終わる（途中で崩れても戻さない）。
 * 段階のスキップ（OLLスキップなど）は手数0・時間0の段階になる。到達しなかった段階は含まない。
 *
 * start を省略した場合、開始状態は「完成状態に回転ログの逆手順を当てた状態」とする
 * （完成で終わるフルソルブなら、生ログだけから正しく求まる）。
 */
export function computeSplits(
  kpuzzle: KPuzzle,
  moves: TimedMove[],
  color: CrossColor,
  start?: KPattern,
): Split[] {
  let pattern = start ?? kpuzzle.defaultPattern().applyAlg(invert(moves.map((m) => m.move)).join(' '))
  const splits: Split[] = []
  let reached = stageLevel(patternToFacelets(pattern), color)
  let prevIndex = 0
  let prevMs = 0
  // 開始時点ですでに満たしている段階
  for (let level = 1; level <= reached; level++) {
    splits.push({ stage: STAGES[level - 1], start_ms: 0, end_ms: 0, move_count: 0, start_index: 0, end_index: 0 })
  }
  moves.forEach((m, i) => {
    pattern = pattern.applyMove(m.move)
    const level = stageLevel(patternToFacelets(pattern), color)
    if (level <= reached) return
    for (let l = reached + 1; l <= level; l++) {
      const first = l === reached + 1
      splits.push({
        stage: STAGES[l - 1],
        start_ms: first ? prevMs : m.t,
        end_ms: m.t,
        move_count: first ? i + 1 - prevIndex : 0,
        start_index: first ? prevIndex : i + 1,
        end_index: i + 1,
      })
    }
    reached = level
    prevIndex = i + 1
    prevMs = m.t
  })
  return splits
}

/** フルソルブに段階を付ける（それ以外のモードはそのまま返す）。 */
export function withSplits<T extends { mode: string; moves?: TimedMove[] }>(
  kpuzzle: KPuzzle,
  solve: T,
  color: CrossColor,
): T & { splits?: Split[] } {
  if ((solve.mode !== 'full' && solve.mode !== 'assist') || !solve.moves?.length) return solve
  return { ...solve, splits: computeSplits(kpuzzle, solve.moves, color) }
}

/** 表示用にまとめた段階：Cross / F2L（4スロット合計）/ OLL / PLL。 */
export type StageGroup = 'cross' | 'f2l' | 'oll' | 'pll'
export const GROUP_LABELS: Record<StageGroup, string> = { cross: 'Cross', f2l: 'F2L', oll: 'OLL', pll: 'PLL' }

export function groupSplits(splits: Split[] | undefined): Partial<Record<StageGroup, { ms: number; moves: number }>> {
  const out: Partial<Record<StageGroup, { ms: number; moves: number }>> = {}
  for (const s of splits ?? []) {
    const g: StageGroup = s.stage.startsWith('f2l') ? 'f2l' : (s.stage as StageGroup)
    const cur = out[g] ?? { ms: 0, moves: 0 }
    out[g] = { ms: cur.ms + (s.end_ms - s.start_ms), moves: cur.moves + s.move_count }
  }
  return out
}
