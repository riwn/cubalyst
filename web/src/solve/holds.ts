// 持ち替え（持ち方の移り変わり）の検出と、持ち方に合わせた解法の表記。
//
// ジャイロのサンプルから、ソルブ中の持ち方（下の色・前の色）を出し、変わったところを持ち替え（y・x・z）として記録する。
// 下の色は重力から決まる。前の色は、着手の時点で設定の前の色だと仮定する（docs/plans/phase-9.md）。

import {
  COLOR_AXIS,
  holdAt,
  horizontal,
  nearestColor,
  OPPOSITE,
  sampleQuat,
  toBody,
  toWorld,
  type GyroSample,
  type Hold,
} from '../cube/gyro'
import { convertMove, holdFrame, rightColor, type Frame } from '../cube/orientation'
import type { TimedMove } from './cfop'

export type HoldChange = {
  /** 回転ログで、この持ち替えより前にある手の数（moves[index] 以降が新しい持ち方）。 */
  index: number
  /** 持ち替えを始める前の、最後の落ち着いたサンプルの時刻（ms）。 */
  start_t: number
  /** 新しい持ち方で落ち着いた、最初のサンプルの時刻（ms）。 */
  end_t: number
  bottom: Hold['bottom']
  front: Hold['front']
  /** 持ち替えの記号（y、x'、x y など）。 */
  rot: string
  /** L・R の回転と同時に起きた x 系の持ち替え（ワイドムーブやスライスの一部かもしれない）。 */
  with_move: boolean
}

export type Holds = { start: Hold; changes: HoldChange[] }

export const HOLD_OPTIONS = {
  /** これより軸からずれているサンプルは「回している途中」とみなす（度）。 */
  maxDeg: 30,
  /** 新しい持ち方がこのサンプル数だけ続いたら、持ち替えたと確定する。 */
  confirmSamples: 2,
  /** サンプルの間がこれより空いたら、そのソルブは持ち替えの記録なしとする（ms）。 */
  maxGapMs: 1000,
  /** x 系の持ち替えと L・R の回転がこれ以内なら with_move とする（ms）。 */
  withMoveMs: 150,
}

// --- 持ち替えの記号 ---

const SINGLE = ['y', "y'", 'y2', 'x', "x'", 'x2', 'z', "z'", 'z2']

function quarter(h: Hold, axis: string): Hold {
  const right = rightColor(h.bottom, h.front)!
  switch (axis) {
    case 'y': // 前の面が左へ。右の面が前に来る
      return { bottom: h.bottom, front: right }
    case 'x': // 前の面が上へ。下の面が前に、後ろの面が下に来る
      return { bottom: OPPOSITE[h.front], front: h.bottom }
    default: // z：上の面が右へ。右の面が下に来る
      return { bottom: right, front: h.front }
  }
}

/** 持ち方 h から、持ち替えの記号（空白区切り）どおりに回した持ち方。 */
export function applyRotation(h: Hold, rot: string): Hold {
  for (const r of rot.split(' ').filter(Boolean)) {
    const n = r.endsWith('2') ? 2 : r.endsWith("'") ? 3 : 1
    for (let i = 0; i < n; i++) h = quarter(h, r[0])
  }
  return h
}

const sameHold = (a: Hold, b: Hold) => a.bottom === b.bottom && a.front === b.front

/** 持ち方 from から to へ移る持ち替えの記号。手数（x・y・z の数）が少ない書き方を選ぶ。 */
export function rotationName(from: Hold, to: Hold): string {
  if (sameHold(from, to)) return ''
  for (const r of SINGLE) if (sameHold(applyRotation(from, r), to)) return r
  for (const a of SINGLE) {
    for (const b of SINGLE) {
      if (a[0] === b[0]) continue
      if (sameHold(applyRotation(from, `${a} ${b}`), to)) return `${a} ${b}`
    }
  }
  throw new Error(`rotationName: ${JSON.stringify(from)} → ${JSON.stringify(to)}`)
}

// --- 検出 ---

/**
 * ジャイロのサンプルから持ち替えを検出する。持ち方が決められないとき（サンプルが無い・途切れている、
 * 着手の時点の下の色が設定と違う）は null（持ち替えの記録なし）。
 * samples と moves の t は、どちらもソルブ開始からの相対ms。
 */
export function detectHolds(samples: GyroSample[], moves: TimedMove[], start: Hold, opts = HOLD_OPTIONS): Holds | null {
  if (samples.length === 0 || moves.length === 0) return null
  const t0 = moves[0].t
  const end = moves[moves.length - 1].t
  // 基準：着手の時点（最初の手）の直前のサンプル
  let a = -1
  for (let i = 0; i < samples.length && samples[i][0] <= t0; i++) a = i
  if (a < 0) return null
  // 途切れていないか
  for (let i = a + 1; i < samples.length && samples[i - 1][0] <= end; i++) {
    if (samples[i][0] - samples[i - 1][0] > opts.maxGapMs) return null
  }
  if (samples[samples.length - 1][0] < end - opts.maxGapMs) return null

  const q0 = sampleQuat(samples[a])
  const up0 = nearestColor(toBody(q0, [0, 0, 1]))
  if (OPPOSITE[up0.color] !== start.bottom || up0.deg > opts.maxDeg) return null
  const frontWorld = horizontal(toWorld(q0, COLOR_AXIS[start.front]))
  if (!frontWorld) return null

  const changes: HoldChange[] = []
  let current = start
  let lastStable = samples[a][0]
  let pending: { hold: Hold; count: number; firstT: number } | null = null
  for (let i = a + 1; i < samples.length && samples[i][0] <= end; i++) {
    const t = samples[i][0]
    const h = holdAt(sampleQuat(samples[i]), frontWorld, opts.maxDeg)
    if (!h) continue // 回している途中
    if (sameHold(h, current)) {
      lastStable = t
      pending = null
      continue
    }
    if (pending && sameHold(pending.hold, h)) pending.count++
    else pending = { hold: h, count: 1, firstT: t }
    if (pending.count < opts.confirmSamples) continue
    const mid = (lastStable + pending.firstT) / 2
    changes.push({
      index: moves.filter((m) => m.t < mid).length,
      start_t: Math.round(lastStable),
      end_t: Math.round(pending.firstT),
      bottom: h.bottom,
      front: h.front,
      rot: rotationName(current, h),
      with_move: false,
    })
    current = h
    lastStable = t
    pending = null
  }

  // x 系の持ち替えが L・R と同時なら印を付ける
  let prev = start
  for (const c of changes) {
    if (c.rot[0] === 'x' && !c.rot.includes(' ')) {
      const frame = holdFrame(prev.bottom, prev.front)!
      c.with_move = moves.some(
        (m) =>
          m.t >= c.start_t - opts.withMoveMs &&
          m.t <= c.end_t + opts.withMoveMs &&
          'LR'.includes(convertMove(frame, m.move)[0]),
      )
    }
    prev = c
  }
  return { start, changes }
}

// --- 表記 ---

/** 回転ログの各手の時点での持ち方。 */
export function holdsByMove(holds: Holds, moveCount: number): Hold[] {
  const out: Hold[] = []
  let h: Hold = holds.start
  let c = 0
  for (let i = 0; i < moveCount; i++) {
    while (c < holds.changes.length && holds.changes[c].index <= i) h = holds.changes[c++]
    out.push(h)
  }
  return out
}

/** 解法の1語：手（持ち方での記号）か、持ち替え。 */
export type NotationToken =
  | { kind: 'move'; index: number; text: string }
  | { kind: 'rotation'; change: HoldChange; text: string }

/**
 * 回転ログ moves[from, to) を、持ち方での記号の列にする。holds があれば、その時点の持ち方で変換し、
 * 範囲の中の持ち替えを入れる。無ければ fallback（設定の持ち方）で変換する。
 */
export function notationTokens(
  moves: { move: string }[],
  holds: Holds | null | undefined,
  fallback: Frame,
  from = 0,
  to = moves.length,
): NotationToken[] {
  const out: NotationToken[] = []
  const byMove = holds ? holdsByMove(holds, moves.length) : null
  const frames = new Map<string, Frame>()
  const frameOf = (h: Hold) => {
    const k = `${h.bottom}/${h.front}`
    if (!frames.has(k)) frames.set(k, holdFrame(h.bottom, h.front)!)
    return frames.get(k)!
  }
  for (let i = from; i < to; i++) {
    for (const c of holds?.changes ?? []) {
      if (c.index === i) out.push({ kind: 'rotation', change: c, text: c.rot })
    }
    out.push({ kind: 'move', index: i, text: convertMove(byMove ? frameOf(byMove[i]) : fallback, moves[i].move) })
  }
  return out
}
