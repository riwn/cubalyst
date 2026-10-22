import { Alg } from 'cubing/alg'
import { cube3x3x3 } from 'cubing/puzzles'
import { describe, expect, it } from 'vitest'
import { F2L_CASES, OLL_CASES, PLL_CASES } from '../cases/data'
import { applyNormalized, invertRotation } from '../cases/geometry'
import { patternToFacelets } from '../cube/facelets'
import { holdRotation } from '../cube/orientation'
import { stageLevel } from '../solve/cfop'
import { afterRotation, assistFor, MAX_FROZEN_MOVES, stickyAssist, viewFrom, type StickyAssist } from './detect'

const kpuzzle = await cube3x3x3.kpuzzle()
const solved = kpuzzle.defaultPattern()
const AUF = ['', 'U', 'U2', "U'"]
const inv = (alg: string) => new Alg(alg).invert().toString()
const level = (p: ReturnType<typeof solved.applyAlg>) => stageLevel(patternToFacelets(p), 'yellow')

let seed = 11
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]

describe('viewFrom', () => {
  it('turns a cube-frame state into the state seen from the hold', () => {
    const rot = holdRotation(solved, 'white', 'red')
    const a = "R U R' U' F2 D L'"
    const cube = applyNormalized(kpuzzle, `${rot} ${a} ${invertRotation(rot)}`)
    expect(viewFrom(kpuzzle, cube, rot).isIdentical(applyNormalized(kpuzzle, a))).toBe(true)
  })
})

describe('assistFor', () => {
  it('finds every OLL case with the U to do before it', () => {
    for (const c of OLL_CASES) {
      const pre = pick(AUF)
      const view = applyNormalized(kpuzzle, `${inv(c.alg)} ${inv(pre)}`.trim())
      const got = assistFor(kpuzzle, view)
      expect(got.stage).toBe('oll')
      if (got.stage !== 'oll') continue
      expect(got.case?.id, c.name).toBe(c.id)
      expect(level(applyNormalized(kpuzzle, `${got.pre} ${got.alg}`.trim(), view))).toBeGreaterThanOrEqual(6)
    }
  })

  it('finds every PLL case with the U before and after it', () => {
    for (const c of PLL_CASES) {
      const pre = pick(AUF)
      const post = pick(AUF)
      const view = applyNormalized(kpuzzle, `${inv(post)} ${inv(c.alg)} ${inv(pre)}`.trim())
      const got = assistFor(kpuzzle, view)
      expect(got.stage).toBe('pll')
      if (got.stage !== 'pll') continue
      expect(got.case?.id, c.name).toBe(c.id)
      expect(level(applyNormalized(kpuzzle, `${got.pre} ${got.alg} ${got.post}`.trim(), view))).toBe(7)
    }
  })

  it('finds every F2L case in every slot', () => {
    const slots = [
      { rotation: '', slot: '前右' },
      { rotation: "y'", slot: '前左' },
      { rotation: 'y', slot: '後右' },
      { rotation: 'y2', slot: '後左' },
    ]
    for (const c of F2L_CASES) {
      const { rotation, slot } = pick(slots)
      const pre = pick(AUF)
      // そのスロットを前右に持ってきた向きで、ケースの状態を作る
      const atFR = applyNormalized(kpuzzle, `${inv(c.alg)} ${inv(pre)}`.trim())
      // 持ち替える前（今の持ち方）から見た状態
      const view = afterRotation(kpuzzle, atFR, invertRotation(rotation))
      const got = assistFor(kpuzzle, view)
      expect(got.stage).toBe('f2l')
      if (got.stage !== 'f2l') continue
      expect(got.slots.map((s) => s.slot)).toEqual([slot])
      const hint = got.slots[0]
      expect(hint.case?.id, c.name).toBe(c.id)
      // 持ち替えて手順を回すと F2L が揃う
      // F2L が揃う（F2L の手順は上の段も動かすので、最終層は崩れていてよい）
      expect(
        level(applyNormalized(kpuzzle, `${hint.pre} ${hint.alg}`.trim(), afterRotation(kpuzzle, view, hint.rotation))),
      ).toBeGreaterThanOrEqual(5)
    }
  })

  it('names the slots as seen from the hold', () => {
    // y で持ち替えてから R U' R'：後右のスロットが崩れ、R U R' で戻せる（F2L 2）
    const view = applyNormalized(kpuzzle, "y R U' R' y'")
    const got = assistFor(kpuzzle, view)
    expect(got.stage === 'f2l' && got.slots.map((s) => [s.slot, s.case?.id])).toEqual([['後右', 'f2l-2']])
  })

  it('reports pairs that are not one of the 41 cases', () => {
    // 前右のペアを後右のスロットに入れてしまった状態（前右も後右も崩れていて、41 ケースに当てはまらない）
    const view = applyNormalized(kpuzzle, "R U R' y R U2 R' y'")
    const got = assistFor(kpuzzle, view)
    expect(got.stage).toBe('f2l')
    if (got.stage === 'f2l') expect(got.slots.some((s) => s.case === null)).toBe(true)
  })

  it('uses the given algorithm', () => {
    const t = PLL_CASES.find((c) => c.id === 'pll-T')!
    const alt = "R U R' U' R' F R2 U' R' U' R U R' F'"
    const got = assistFor(kpuzzle, applyNormalized(kpuzzle, inv(t.alg)), () => alt)
    expect(got.stage === 'pll' && got.alg).toBe(alt)
  })

  it('reports cross and solved', () => {
    expect(assistFor(kpuzzle, solved).stage).toBe('solved')
    expect(assistFor(kpuzzle, applyNormalized(kpuzzle, 'D R2 F')).stage).toBe('cross')
  })
})

describe('stickyAssist', () => {
  /** 手順を90度ずつの手に分ける（R2 → R R）。 */
  const quarters = (alg: string) =>
    alg
      .trim()
      .split(/\s+/)
      .flatMap((m) => (m.endsWith('2') ? [m[0], m[0]] : [m]))

  it('keeps the OLL hint while the algorithm breaks F2L, then moves on to PLL', () => {
    const oll = OLL_CASES.find((c) => c.id === 'oll-33')!
    const tperm = "R U R' U' R' F R2 U' R' U' R U R' F'"
    // T パームのあと OLL 33 の逆：OLL を回すと PLL（T パーム）が残る
    let view = applyNormalized(kpuzzle, `${tperm} ${inv(oll.alg)}`)
    let s: StickyAssist | null = stickyAssist(null, kpuzzle, view)
    expect(s.assist.stage === 'oll' && s.assist.case?.id).toBe('oll-33')

    const moves = quarters(oll.alg)
    let dropped = false
    moves.forEach((m, i) => {
      view = view.applyAlg(m)
      s = stickyAssist(s, kpuzzle, view)
      if (i < moves.length - 1) {
        // 回している途中は、段階が下がっても OLL 33 のまま
        if (s.frozen > 0) dropped = true
        expect(s.assist.stage === 'oll' && s.assist.case?.id).toBe('oll-33')
      }
    })
    expect(dropped).toBe(true)
    // 回し終えると PLL に進む
    expect(s!.assist.stage === 'pll' && s!.assist.case?.id).toBe('pll-T')
  })

  it('updates within the same stage when nothing was broken (adjusting with U)', () => {
    const oll = OLL_CASES.find((c) => c.id === 'oll-45')!
    let view = applyNormalized(kpuzzle, inv(oll.alg))
    let s = stickyAssist(null, kpuzzle, view)
    const pre = s.assist.stage === 'oll' ? s.assist.pre : null
    view = view.applyAlg('U')
    s = stickyAssist(s, kpuzzle, view)
    expect(s.frozen).toBe(0)
    expect(s.assist.stage === 'oll' && s.assist.pre).not.toBe(pre)
  })

  it('gives up keeping the hint after many moves without progress', () => {
    const view = applyNormalized(kpuzzle, "R U R' U' F")
    let s: StickyAssist = { level: 6, assist: { stage: 'pll', case: null, pre: '', alg: '', post: '' }, frozen: 0 }
    s = stickyAssist(s, kpuzzle, view)
    expect(s.frozen).toBe(1)
    for (let i = 0; i < MAX_FROZEN_MOVES; i++) s = stickyAssist(s, kpuzzle, view)
    expect(s.frozen).toBe(0)
    expect(s.assist.stage).not.toBe('pll')
  })
})
