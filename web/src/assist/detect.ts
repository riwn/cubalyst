// 補助付きフルソルブ：今のキューブの状態から、F2L の各スロット・OLL・PLL のケースと、解く手順の前後に要る U（AUF）を求める。
//
// キューブの状態は、持ち方の向き（下の色が下、前の色が前）から見た状態に直してから判定する。
// 持ち方で手順 A を回すことは、キューブ座標系では `rot A rot'`（rot は holdRotation）を回すこと。
// 持ち方から見た状態は viewFrom(C, rot)（C はキューブ座標系の状態）。
// スロットを前右に持ってくるときは、実際に y で持ち替えた先から見た状態（afterRotation）で判定する。

import { Alg } from 'cubing/alg'
import type { KPattern, KPuzzle } from 'cubing/kpuzzle'
import { ALL_CASES, type CaseDef, type CaseSet } from '../cases/data'
import { applyNormalized, caseSignature, invertRotation, normalizeOrientation } from '../cases/geometry'
import { patternToFacelets } from '../cube/facelets'
import { stageLevel } from '../solve/cfop'

const AUF = ['', 'U', 'U2', "U'"]

/** y で持ち替えて、そのスロットを前右に持ってくる。 */
const SLOT_ROTATIONS = [
  { rotation: '', slot: '前右' },
  { rotation: "y'", slot: '前左' },
  { rotation: 'y', slot: '後右' },
  { rotation: 'y2', slot: '後左' },
] as const

export type SlotName = (typeof SLOT_ROTATIONS)[number]['slot']

/** 1つのスロットの F2L。case が null なら 41 ケースに当てはまらない（ペアの片方が別のスロットにあるなど）。 */
export type F2LHint = {
  slot: SlotName
  /** そのスロットを前右に持ってくる持ち替え。 */
  rotation: string
  case: CaseDef | null
  /** 手順の前に回す U。 */
  pre: string
  alg: string
}

export type Assist =
  | { stage: 'cross' }
  | { stage: 'f2l'; slots: F2LHint[] }
  | { stage: 'oll'; case: CaseDef | null; pre: string; alg: string }
  | { stage: 'pll'; case: CaseDef | null; pre: string; alg: string; post: string }
  | { stage: 'solved' }

/**
 * 完成状態に rot・pattern・rot' を順に当て、向きを正規化した状態。
 * holdRotation の rot を渡すと、持ち方から見た状態になる（rot の逆に持ち替えた先から見た状態）。
 */
export function viewFrom(kpuzzle: KPuzzle, pattern: KPattern, rot: string): KPattern {
  if (!rot) return pattern
  return normalizeOrientation(
    kpuzzle,
    kpuzzle
      .defaultPattern()
      .applyAlg(rot)
      .applyTransformation(pattern.experimentalToTransformation()!)
      .applyAlg(invertRotation(rot)),
  )
}

/** 実際に rotation（y など）で持ち替えた先から見た状態。 */
export function afterRotation(kpuzzle: KPuzzle, view: KPattern, rotation: string): KPattern {
  return viewFrom(kpuzzle, view, invertRotation(rotation))
}

const signatures = new Map<KPuzzle, Map<string, CaseDef>>()

/** ケースの署名 → ケース（セットごとに名前空間を分ける）。 */
function caseIndex(kpuzzle: KPuzzle): Map<string, CaseDef> {
  let m = signatures.get(kpuzzle)
  if (!m) {
    m = new Map()
    for (const c of ALL_CASES) {
      const state = applyNormalized(kpuzzle, new Alg(c.alg).invert().toString())
      m.set(`${c.set}:${caseSignature(c.set, state)}`, c)
    }
    signatures.set(kpuzzle, m)
  }
  return m
}

const level = (p: KPattern) => stageLevel(patternToFacelets(p), 'yellow')

/** 前右スロット（DRF の角と FR のエッジ）が揃っているか。 */
function frSolved(p: KPattern): boolean {
  const d = p.patternData
  return d.CORNERS.pieces[4] === 4 && d.CORNERS.orientation[4] === 0 && d.EDGES.pieces[8] === 8 && d.EDGES.orientation[8] === 0
}

function findCase(kpuzzle: KPuzzle, set: CaseSet, state: KPattern): CaseDef | null {
  return caseIndex(kpuzzle).get(`${set}:${caseSignature(set, state)}`) ?? null
}

/** 手順を当てた状態（手順に y などの持ち替えがあっても向きをそろえる）。 */
const after = (kpuzzle: KPuzzle, state: KPattern, alg: string) => applyNormalized(kpuzzle, alg, state)

/** done(当てた後) を満たすような、手順の前の U を探す。 */
function findPre(kpuzzle: KPuzzle, state: KPattern, alg: string, done: (p: KPattern) => boolean): string | null {
  for (const a of AUF) {
    if (done(after(kpuzzle, state, a ? `${a} ${alg}` : alg))) return a
  }
  return null
}

/**
 * 今の状態の補助。view は持ち方から見た状態（下＝クロスの面、上＝最終層）。
 * algFor はケースごとに出す手順（手順練習で選んだ手順など）。
 */
export function assistFor(kpuzzle: KPuzzle, view: KPattern, algFor: (c: CaseDef) => string = (c) => c.alg): Assist {
  const lv = level(view)
  if (lv === 0) return { stage: 'cross' }
  if (lv >= 7) return { stage: 'solved' }
  if (lv <= 4) {
    const slots: F2LHint[] = []
    for (const { rotation, slot } of SLOT_ROTATIONS) {
      const v = afterRotation(kpuzzle, view, rotation)
      if (frSolved(v)) continue
      const c = findCase(kpuzzle, 'F2L', v)
      const alg = c ? algFor(c) : ''
      // 前右が揃い、揃っていたほかの段階を崩さない
      const pre = c ? findPre(kpuzzle, v, alg, (p) => frSolved(p) && level(p) > lv) : null
      slots.push({ slot, rotation, case: pre == null ? null : c, pre: pre ?? '', alg: pre == null ? '' : alg })
    }
    return { stage: 'f2l', slots }
  }
  if (lv === 5) {
    const c = findCase(kpuzzle, 'OLL', view)
    const alg = c ? algFor(c) : ''
    const pre = c ? findPre(kpuzzle, view, alg, (p) => level(p) >= 6) : null
    return pre == null ? { stage: 'oll', case: null, pre: '', alg: '' } : { stage: 'oll', case: c, pre, alg }
  }
  const c = findCase(kpuzzle, 'PLL', view)
  const alg = c ? algFor(c) : ''
  if (c) {
    for (const a of AUF) {
      const p = after(kpuzzle, view, a ? `${a} ${alg}` : alg)
      const post = AUF.find((u) => level(u ? p.applyAlg(u) : p) >= 7)
      if (post !== undefined) return { stage: 'pll', case: c, pre: a, alg, post }
    }
  }
  return { stage: 'pll', case: null, pre: '', alg: '', post: '' }
}

/** 段階（0：Cross 前 … 4：F2L 3ペア、5：F2L 完成、6：OLL 完成、7：完成）。 */
export const stageOf = (view: KPattern) => level(view)

/**
 * 画面に出し続ける補助。手順を回している途中は F2L やクロスが一時的に崩れて段階が下がるので、
 * 一度進んだ段階より下がったあいだは、前の表示（ケースと手順）を保つ。
 */
export type StickyAssist = {
  /** 表示している補助を判定したときの段階。 */
  level: number
  assist: Assist
  /** 段階が下がってから回した手数（0 なら下がっていない）。 */
  frozen: number
}

/** 段階が下がったまま、これだけ回したら（手順をやめて崩した場合など）、今の状態で判定し直す。 */
export const MAX_FROZEN_MOVES = 40

/**
 * 1手ごとに呼び、表示する補助を返す。prev は前の手での戻り値（ソルブの始めは null）。
 * 段階が上がった・同じ段階のまま（U で合わせるなど）なら判定し直し、下がったら前の表示を保つ。
 * いったん下がったあとは、段階が前より上がるまで（＝手順を回し終えるまで）保つ。
 */
export function stickyAssist(
  prev: StickyAssist | null,
  kpuzzle: KPuzzle,
  view: KPattern,
  algFor: (c: CaseDef) => string = (c) => c.alg,
): StickyAssist {
  const lv = level(view)
  const fresh = () => ({ level: lv, assist: assistFor(kpuzzle, view, algFor), frozen: 0 })
  if (!prev || lv > prev.level || prev.frozen + 1 > MAX_FROZEN_MOVES) return fresh()
  if (lv === prev.level && prev.frozen === 0) return fresh()
  return { ...prev, frozen: prev.frozen + 1 }
}
