import { cube3x3x3 } from 'cubing/puzzles'
import { describe, expect, it } from 'vitest'
import { holdAt, quatFromHold, rotate, slerp, type GyroSample, type Hold, type Quat } from '../cube/gyro'
import { holdFrame, holdRotation, isValidHold, type Color } from '../cube/orientation'
import { applyRotation, detectHolds, estimateHolds, notationTokens, rotationName } from './holds'

const kpuzzle = await cube3x3x3.kpuzzle()
const solved = kpuzzle.defaultPattern()

const COLORS: Color[] = ['white', 'yellow', 'green', 'blue', 'red', 'orange']
const HOLDS: Hold[] = COLORS.flatMap((bottom) =>
  COLORS.filter((front) => isValidHold(bottom, front)).map((front) => ({ bottom, front })),
)

// 解く人は下が白・前が赤で持つ
const START: Hold = { bottom: 'white', front: 'red' }

/** 向き q を、t から t+ms まで 90ms ごとのサンプルにする。 */
function hold(q: (t: number) => Quat, from: number, to: number): GyroSample[] {
  const out: GyroSample[] = []
  for (let t = from; t < to; t += 90) {
    const r = q(t)
    out.push([t, r.w, r.x, r.y, r.z])
  }
  return out
}

/** 持ち方 a で from まで、そこから 200ms かけて b へ持ち替え、to まで持つ。 */
function rotateBetween(a: Hold, b: Hold, from: number, to: number, yaw = 0.3): GyroSample[] {
  const qa = quatFromHold(a, yaw)
  const qb = quatFromHold(b, yaw)
  return hold((t) => (t < from ? qa : t < from + 200 ? slerp(qa, qb, (t - from) / 200) : qb), -500, to)
}

const moves = (n: number, step = 100) => Array.from({ length: n }, (_, i) => ({ move: 'U', t: i * step }))

describe('quatFromHold / holdAt', () => {
  it('reads back every hold at any yaw', () => {
    for (const h of HOLDS) {
      for (const yaw of [0, 1, -2.5]) {
        const front = [Math.sin(yaw), -Math.cos(yaw), 0] as [number, number, number]
        expect(holdAt(quatFromHold(h, yaw), front, 30)).toEqual(h)
      }
    }
  })

  it('keeps white at +Z when white is up', () => {
    const q = quatFromHold({ bottom: 'yellow', front: 'green' })
    const white = rotate(q, [0, 0, 1])
    expect(white[2]).toBeCloseTo(1)
  })
})

describe('rotationName', () => {
  it('agrees with cubing.js x / y / z', () => {
    for (const h of HOLDS) {
      for (const r of ['y', "y'", 'y2', 'x', "x'", 'x2', 'z', "z'", 'z2']) {
        const after = applyRotation(h, r)
        const a = solved.applyAlg(`${holdRotation(solved, h.bottom, h.front)} ${r}`.trim())
        const b = solved.applyAlg(holdRotation(solved, after.bottom, after.front) || 'x x x x')
        expect(a.patternData.CENTERS.pieces, `${h.bottom}/${h.front} ${r}`).toEqual(b.patternData.CENTERS.pieces)
      }
    }
  })

  it('names every pair of holds', () => {
    for (const a of HOLDS) {
      for (const b of HOLDS) {
        const r = rotationName(a, b)
        expect(applyRotation(a, r)).toEqual(b)
        expect(r.split(' ').filter(Boolean).length).toBeLessThanOrEqual(2)
      }
    }
  })

  it('prefers a single rotation', () => {
    expect(rotationName(START, applyRotation(START, "y'"))).toBe("y'")
    expect(rotationName(START, applyRotation(START, 'x2'))).toBe('x2')
  })
})

describe('detectHolds', () => {
  it('finds no change when the hold stays', () => {
    const samples = rotateBetween(START, START, 0, 3000)
    expect(detectHolds(samples, moves(30), START)).toEqual({ start: START, changes: [] })
  })

  it("finds a y' and where it is in the move log", () => {
    const after = applyRotation(START, "y'")
    const samples = rotateBetween(START, after, 1000, 3000)
    const res = detectHolds(samples, moves(30), START)!
    expect(res.changes).toHaveLength(1)
    const c = res.changes[0]
    expect(c).toMatchObject({ rot: "y'", bottom: after.bottom, front: after.front, with_move: false })
    // 回し始めて 30° までは、まだ前の持ち方とみなす
    expect(c.start_t).toBeGreaterThanOrEqual(1000)
    expect(c.start_t).toBeLessThanOrEqual(1070)
    expect(c.end_t).toBeGreaterThanOrEqual(1200)
    expect(c.end_t).toBeLessThanOrEqual(1300)
    expect(c.index).toBe(moves(30).filter((m) => m.t < (c.start_t + c.end_t) / 2).length)
  })

  it('ignores wobble and slow drift', () => {
    const base = quatFromHold(START, 0.3)
    // 20° までの揺れと、ソルブの間に 15° 水平にずれる
    const q = (t: number) => {
      const wobble = slerp(base, quatFromHold(applyRotation(START, 'x'), 0.3), (Math.sin(t / 50) * 20) / 90)
      return slerp(wobble, quatFromHold(START, 0.3 + Math.PI / 2), (t / 3000) * (15 / 90))
    }
    expect(detectHolds(hold(q, -500, 3000), moves(30), START)?.changes).toEqual([])
  })

  it('needs the new hold to last', () => {
    // 1 サンプルだけ別の持ち方になっても持ち替えにしない
    const samples = rotateBetween(START, START, 0, 3000)
    const other = quatFromHold(applyRotation(START, 'y'), 0.3)
    samples[20] = [samples[20][0], other.w, other.x, other.y, other.z]
    expect(detectHolds(samples, moves(30), START)?.changes).toEqual([])
  })

  it('bridges a short gap', () => {
    // 実機では 1 秒ほど届かないことがある。途切れの間に持ち替えても、前後の持ち方から分かる
    const after = applyRotation(START, 'y')
    const samples = rotateBetween(START, after, 1500, 3000).filter((s) => s[0] < 1000 || s[0] > 2100)
    expect(detectHolds(samples, moves(30), START)?.changes).toMatchObject([{ rot: 'y' }])
  })

  it('gives up when the samples have a long gap', () => {
    const samples = rotateBetween(START, START, 0, 5000).filter((s) => s[0] < 1000 || s[0] > 4100)
    expect(detectHolds(samples, moves(50), START)).toBeNull()
  })

  it('gives up when the bottom color is not the setting', () => {
    const samples = rotateBetween({ bottom: 'yellow', front: 'red' }, { bottom: 'yellow', front: 'red' }, 0, 3000)
    expect(detectHolds(samples, moves(30), START)).toBeNull()
  })

  it('gives up without samples before the first move', () => {
    const samples = rotateBetween(START, START, 0, 3000).filter((s) => s[0] > 0)
    expect(detectHolds(samples, moves(30), START)).toBeNull()
  })

  it('marks an x that comes with an L turn', () => {
    const after = applyRotation(START, 'x')
    const samples = rotateBetween(START, after, 1000, 3000)
    // 下が白・前が赤の持ち方の L は、キューブ自身の向きでは F（緑）
    const frame = holdFrame('white', 'red')!
    const cubeL = Object.keys(frame).find((f) => frame[f] === 'L')!
    const ms = moves(30).map((m) => (m.t === 1100 ? { ...m, move: cubeL } : m))
    const res = detectHolds(samples, ms, START)!
    expect(res.changes).toMatchObject([{ rot: 'x', with_move: true }])
    expect(detectHolds(samples, moves(30), START)!.changes).toMatchObject([{ rot: 'x', with_move: false }])
  })
})

describe('estimateHolds', () => {
  // 解く人の持ち方 hold での記号の列を、キューブ自身の向きの回転ログにする
  const cubeMoves = (hold: Hold, alg: string) => {
    const frame = holdFrame(hold.bottom, hold.front)!
    const cube = (m: string) => Object.keys(frame).find((f) => frame[f] === m[0])! + m.slice(1)
    return alg.split(' ').map((m, i) => ({ move: cube(m), t: i * 100 }))
  }
  const sexy = Array(8).fill("R U R' U'").join(' ')

  it('finds the front from the moves', () => {
    // 設定は下白・前赤だが、実際は前緑で持って解いた
    const actual: Hold = { bottom: 'white', front: 'green' }
    const ms = cubeMoves(actual, `${sexy} F R U R' U' F'`)
    const samples = rotateBetween(actual, actual, 0, 4000)
    const res = estimateHolds(samples, ms, START)!
    expect(res).toMatchObject({ start: actual, estimated: true })
    expect(notationTokens(ms, res, holdFrame('white', 'red')!).map((t) => t.text).slice(0, 4)).toEqual(['R', 'U', "R'", "U'"])
  })

  it('keeps the setting when the moves do not tell', () => {
    const ms = cubeMoves(START, 'U U U')
    const samples = rotateBetween(START, START, 0, 1000)
    expect(estimateHolds(samples, ms, START)).toEqual({ start: START, changes: [] })
  })

  it('follows y rotations while estimating', () => {
    const actual: Hold = { bottom: 'white', front: 'orange' }
    const after = applyRotation(actual, 'y')
    const ms = [...cubeMoves(actual, sexy).slice(0, 16), ...cubeMoves(after, sexy).slice(0, 16).map((m) => ({ ...m, t: m.t + 2000 }))]
    const samples = rotateBetween(actual, after, 1650, 4000)
    const res = estimateHolds(samples, ms, START)!
    expect(res.start).toEqual(actual)
    expect(res.changes).toMatchObject([{ rot: 'y', front: after.front }])
  })
})

describe('notationTokens', () => {
  it('writes moves in the hold at that time, with the rotation in between', () => {
    // 下が白・前が赤で R U、y で前が緑になり R U
    const before = holdFrame('white', 'red')!
    const after = holdFrame('white', 'green')!
    const cube = (frame: Record<string, string>, m: string) => Object.keys(frame).find((f) => frame[f] === m)!
    const ms = [cube(before, 'R'), cube(before, 'U'), cube(after, 'R'), cube(after, 'U')].map((move) => ({ move }))
    const holds = {
      start: START,
      changes: [{ index: 2, start_t: 0, end_t: 0, bottom: 'white' as const, front: 'green' as const, rot: 'y', with_move: false }],
    }
    expect(applyRotation(START, 'y')).toEqual({ bottom: 'white', front: 'green' })
    expect(notationTokens(ms, holds, before).map((t) => t.text)).toEqual(['R', 'U', 'y', 'R', 'U'])
    expect(notationTokens(ms, holds, before, 2, 4).map((t) => t.text)).toEqual(['y', 'R', 'U'])
    // 記録が無ければ設定の持ち方で固定
    expect(notationTokens(ms, null, before).map((t) => t.text)).toEqual(['R', 'U', 'B', 'U'])
  })
})
