// 持ち替え（持ち方の移り変わり）の検出と、持ち方に合わせた解法の表記。
//
// ジャイロのサンプルから、ソルブ中の持ち方（下の色・前の色）を出し、変わったところを持ち替え（y・x・z）として記録する。
// 下の色は重力から決まる。前の色は、回した手の偏りから推定する（決められなければ設定の前の色。docs/plans/phase-9.md）。

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
import { convertMove, holdFrame, isValidHold, rightColor, type Color, type Frame } from '../cube/orientation'
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
  /**
   * L・R の回転と同時に起きた x 系（ワイドムーブやスライスの一部）。キューブは中心ごと向きが変わるのでジャイロには x に見えるが、
   * 解く人は持ち替えていない。持ち替えの回数と時間には数えない。
   */
  with_move: boolean
  /** with_move のうち、L・R の組と合わせてスライス（M）になるもの。M' = R' L x、M = R L' x'、M2 = R2 L2 x2。 */
  slice?: Slice
  /** slice の L・R の手（回転ログの添字）。表記ではこの手と持ち替えをまとめて slice の1語にする。 */
  slice_moves?: number[]
}

export type Slice = 'M' | "M'" | 'M2'

/** 解く人が持ち替えた（ワイドムーブやスライスで中心ごと回ったのではない）か。 */
export const isRegrip = (c: HoldChange) => !c.with_move

export type Holds = {
  start: Hold
  changes: HoldChange[]
  /** 着手時の前の色を、回した手の偏りから決めた（無ければ設定の前の色を仮定した）。 */
  estimated?: boolean
  /**
   * 持ち替えを記録し始めた時刻（ms）。着手の時点で傾けていたら、持ち方が落ち着いたところから記録する。
   * それより前の手は start の持ち方で書く。無ければ着手の時点から。
   */
  from_t?: number
}

export const HOLD_OPTIONS = {
  /** これより軸からずれているサンプルは「回している途中」とみなす（度）。 */
  maxDeg: 30,
  /** 新しい持ち方がこのサンプル数だけ続いたら、持ち替えたと確定する。 */
  confirmSamples: 2,
  /**
   * サンプルの間がこれより空いたら、そのソルブは持ち替えの記録なしとする（ms）。
   * 実機（i4）では電波の都合で 0.3〜1 秒ほど届かないことがよくあるので、短い途切れは前後の持ち方でつなぐ。
   */
  maxGapMs: 3000,
  /** x 系の持ち替えと L・R の回転がこれ以内なら with_move とする（ms）。 */
  withMoveMs: 150,
  /**
   * 着手の時点で傾けていたとき、これ以内（着手からの ms）に下が設定の色で落ち着けば、そこを基準にする。
   * 落ち着かなければ（白を下にしたつもりで上にしていた、など）、最初に落ち着いた下の色を基準にする。
   */
  preferBottomMs: 15000,
  /** 着手時の前の色を推定するとき、点数（2×R ＋ F − 3×B）が2番目の候補よりこれだけ多ければ採る。 */
  estimateMargin: 3,
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
 * 基準にするサンプル。下の色は重力から決まる。
 * 1. 着手の時点（最初の手の直前）で落ち着いていれば、そこ
 * 2. 傾けていたら（クロスでは傾けて見ていることが多い）、着手から preferBottomMs 以内に下が prefer の色で
 *    confirmSamples 回続けて落ち着いた最初のサンプル
 * 3. それも無ければ、同じ下の色で confirmSamples 回続けて落ち着いた最初のサンプル
 * 決められないとき（サンプルが無い・途切れている・落ち着かない）は null。
 */
export function holdAnchor(
  samples: GyroSample[],
  moves: TimedMove[],
  prefer: Color,
  opts = HOLD_OPTIONS,
): { a: number; b: number; bottom: Color } | null {
  if (samples.length === 0 || moves.length === 0) return null
  const t0 = moves[0].t
  const end = moves[moves.length - 1].t
  let a = -1
  for (let i = 0; i < samples.length && samples[i][0] <= t0; i++) a = i
  if (a < 0) return null
  // 途切れていないか
  for (let i = a + 1; i < samples.length && samples[i - 1][0] <= end; i++) {
    if (samples[i][0] - samples[i - 1][0] > opts.maxGapMs) return null
  }
  if (samples[samples.length - 1][0] < end - opts.maxGapMs) return null

  const bottomAt = (i: number) => {
    const up = nearestColor(toBody(sampleQuat(samples[i]), [0, 0, 1]))
    return up.deg <= opts.maxDeg ? OPPOSITE[up.color] : null
  }
  const first = bottomAt(a)
  if (first) return { a, b: a, bottom: first }
  const settled = (until: number, want?: Color) => {
    let run = 0
    let prev: Color | null = null
    for (let i = a + 1; i < samples.length && samples[i][0] <= until; i++) {
      const bottom = bottomAt(i)
      const ok = bottom && (!want || bottom === want)
      run = ok && bottom === prev ? run + 1 : ok ? 1 : 0
      prev = ok ? bottom : null
      if (ok && run >= opts.confirmSamples) return { a, b: i - run + 1, bottom }
    }
    return null
  }
  return settled(Math.min(end, t0 + opts.preferBottomMs), prefer) ?? settled(end)
}

/**
 * ジャイロのサンプルから持ち替えを検出する。基準のサンプル（holdAnchor）で start の持ち方だったとする。
 * 持ち方が決められないとき（基準が無い、基準の下の色が start と違う）は null（持ち替えの記録なし）。
 * samples と moves の t は、どちらもソルブ開始からの相対ms。
 */
export function detectHolds(samples: GyroSample[], moves: TimedMove[], start: Hold, opts = HOLD_OPTIONS): Holds | null {
  const anchor = holdAnchor(samples, moves, start.bottom, opts)
  if (!anchor || anchor.bottom !== start.bottom) return null
  const { a, b } = anchor
  const end = moves[moves.length - 1].t
  const frontWorld = horizontal(toWorld(sampleQuat(samples[b]), COLOR_AXIS[start.front]))
  if (!frontWorld) return null

  const changes: HoldChange[] = []
  let current = start
  let lastStable = samples[b][0]
  let pending: { hold: Hold; count: number; firstT: number } | null = null
  for (let i = b + 1; i < samples.length && samples[i][0] <= end; i++) {
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

  // x 系の持ち替えが L・R と同時なら印を付け、L・R の組と合わせてスライスになるかを見る
  let prev = start
  const used = new Set<number>()
  for (const c of changes) {
    if (c.rot[0] === 'x' && !c.rot.includes(' ')) {
      // L・R は x で入れ替わらないので、持ち替え前の持ち方で見ればよい
      const frame = holdFrame(prev.bottom, prev.front)!
      const mid = (c.start_t + c.end_t) / 2
      const near = moves
        .map((m, i) => ({ i, t: m.t, face: convertMove(frame, m.move) }))
        .filter((m) => m.t >= c.start_t - opts.withMoveMs && m.t <= c.end_t + opts.withMoveMs && 'LR'.includes(m.face[0]))
      c.with_move = near.length > 0
      const slice = findSlice(
        c.rot,
        near.filter((m) => !used.has(m.i)).sort((a, b) => Math.abs(a.t - mid) - Math.abs(b.t - mid)),
      )
      if (slice) {
        c.slice = slice.slice
        c.slice_moves = slice.moves.sort((a, b) => a - b)
        for (const i of c.slice_moves) used.add(i)
      }
    }
    prev = c
  }
  return b > a ? { start, changes, from_t: Math.round(samples[b][0]) } : { start, changes }
}

/** スライスになる L・R の手の組（M' = R' L x、M = R L' x'、M2 = R2 L2 x2）。near は近い順。 */
const SLICES: Record<string, { slice: Slice; need: string[][] }> = {
  x: { slice: "M'", need: [["R'", 'L']] },
  "x'": { slice: 'M', need: [['R', "L'"]] },
  x2: {
    slice: 'M2',
    need: [
      ['R', 'R', 'L', 'L'],
      ['R', 'R', "L'", "L'"],
      ["R'", "R'", 'L', 'L'],
      ["R'", "R'", "L'", "L'"],
    ],
  },
}

function findSlice(rot: string, near: { i: number; face: string }[]): { slice: Slice; moves: number[] } | null {
  const s = SLICES[rot]
  if (!s) return null
  for (const need of s.need) {
    const left = [...near]
    const moves: number[] = []
    for (const face of need) {
      const k = left.findIndex((m) => m.face === face)
      if (k < 0) break
      moves.push(left[k].i)
      left.splice(k, 1)
    }
    if (moves.length === need.length) return { slice: s.slice, moves }
  }
  return null
}

/**
 * detectHolds の、着手時の持ち方を決める版。下の色は基準のサンプル（holdAnchor）の重力から決める（着手の時点で傾けていたら
 * 設定の下の色を優先するが、しばらく落ち着かなければ違う色でもよい。白を下にしたつもりで上にしていた、など）。前の色はジャイロでは水平の向きが分からないので、その下の色での
 * 4通りの前の色で持ち替えを計算し、持ち方の記号の数で「2×R ＋ F − 3×B」が一番多いものを採る（CFOP では R をよく回し、
 * F は OLL・PLL で回すが、B はほとんど回さない）。B だけだと、R・U だけの手順で前と横の区別が付かない。
 * R − B だけだと、左のスロット（L）をよく使って F・B が少ないソルブで、前と後ろ（R と L、F と B が入れ替わる）が同点になる。
 * R と F が同じ重みだと、R ばかりの手順で前と横（R が F になる向き）が同点になるので、R を重くする。
 * 差が estimateMargin に届かなければ（手が少ないなど）、下の色が setting と同じなら setting の前の色のまま、違えば null。
 */
export function estimateHolds(samples: GyroSample[], moves: TimedMove[], setting: Hold, opts = HOLD_OPTIONS): Holds | null {
  const anchor = holdAnchor(samples, moves, setting.bottom, opts)
  if (!anchor) return null
  const bottom = anchor.bottom
  const base = bottom === setting.bottom ? detectHolds(samples, moves, setting, opts) : null
  const scored = (Object.keys(COLOR_AXIS) as Color[])
    .filter((front) => isValidHold(bottom, front))
    .map((front) => {
      const holds =
        base && front === setting.front ? base : detectHolds(samples, moves, { bottom, front }, opts)
      return { holds, score: holds ? frontScore(moves, holds) : -Infinity }
    })
    .sort((a, b) => b.score - a.score || (a.holds === base ? -1 : b.holds === base ? 1 : 0))
  const [best, second] = scored
  if (!best.holds || best.score - second.score < opts.estimateMargin) return base
  return { ...best.holds, estimated: true }
}

/** 持ち方 holds での記号の数の「2×R ＋ F − 3×B」。 */
function frontScore(moves: TimedMove[], holds: Holds): number {
  const byMove = holdsByMove(holds, moves.length)
  let score = 0
  moves.forEach((m, i) => {
    const face = convertMove(holdFrame(byMove[i].bottom, byMove[i].front)!, m.move)[0]
    if (face === 'R') score += 2
    if (face === 'F') score++
    if (face === 'B') score -= 3
  })
  return score
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
  /** スライス（M）。L・R の組（change.slice_moves）と x 系の持ち替えをまとめた1語。 */
  | { kind: 'slice'; change: HoldChange; text: string }

/**
 * 回転ログ moves[from, to) を、持ち方での記号の列にする。holds があれば、その時点の持ち方で変換し、
 * 範囲の中の持ち替えを入れる。スライスになる L・R の組と持ち替えは、組の最初の手の位置に M などの1語でまとめる。
 * 無ければ fallback（設定の持ち方）で変換する。
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
  const sliceAt = new Map<number, HoldChange>()
  const used = new Set<number>()
  for (const c of holds?.changes ?? []) {
    if (!c.slice || !c.slice_moves?.length) continue
    sliceAt.set(c.slice_moves[0], c)
    for (const i of c.slice_moves) used.add(i)
  }
  for (let i = from; i < to; i++) {
    for (const c of holds?.changes ?? []) {
      if (c.index === i && !c.slice) out.push({ kind: 'rotation', change: c, text: c.rot })
    }
    const slice = sliceAt.get(i)
    if (slice) out.push({ kind: 'slice', change: slice, text: slice.slice! })
    if (used.has(i)) continue
    out.push({ kind: 'move', index: i, text: convertMove(byMove ? frameOf(byMove[i]) : fallback, moves[i].move) })
  }
  return out
}
