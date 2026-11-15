// 手順のインポート。貼り付けた行を読み、その手順で本当にケースが解けるかを確かめる。
//
// 1行に1つ、「ケース 手順」か「手順」だけを書く。例：
//   OLL 33: (R U R' U') (R' F R F')
//   Aa perm x (R' U R') D2 (R U' R') D2 R2 x'
//   F2L 5 U' R U2 R' U2 R U' R'
//   R U R' U R U2 R'          ← ケースを書かなければ、どのケースの手順かを探す
// 括弧（グループ）や (R U R' U')2 の繰り返し、Rw のようなワイドムーブも書ける。保存するのは括弧を外した手順。
//
// 検証は手順の逆を完成状態に当てた形で行う（algs.test.ts の別手順の検証と同じ）。その形がケースの形
// （OLL：上面の向き、PLL：並び、F2L：右手前のペア。前後の AUF は問わない）と同じで、
// クロス・ほかのスロットなど揃っている段階も標準手順と同じなら、そのケースを解ける手順とみなす。
// F2L はほかのスロットの手順でもよい（鏡写しで右手前の手順に直して保存する）。

import { Alg, Move } from 'cubing/alg'
import type { KPuzzle } from 'cubing/kpuzzle'
import { patternToFacelets } from '../cube/facelets'
import { stageLevel } from '../solve/cfop'
import { algsFor } from './algs'
import type { CaseSet } from './data'
import { applyNormalized, caseSignature, closeRotation } from './geometry'
import { slotAlg, slotLabel, type F2LSlot } from './slots'

type ImportCase = { id: string; set: CaseSet; name: string; alg: string; custom_algs?: { alg: string }[] }

const SETS: CaseSet[] = ['OLL', 'PLL', 'F2L']
const SLOTS: F2LSlot[] = ['FR', 'FL', 'BR', 'BL']
const FAMILIES = new Set(['U', 'R', 'F', 'D', 'L', 'B', 'u', 'r', 'f', 'd', 'l', 'b', 'M', 'E', 'S', 'x', 'y', 'z'])

/** 手順を読み、括弧を外した手の並びにする。読めなければ error。 */
export function parseAlg(text: string): { alg: string } | { error: string } {
  const src = text
    .replace(/[’‘′´`]/g, "'")
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/　/g, ' ')
    .trim()
  if (!src) return { error: '手順がありません' }
  let alg: Alg
  try {
    alg = new Alg(src).expand()
  } catch {
    return { error: '手順を読めません（括弧の対応や手の書き方を確かめてください）' }
  }
  const out: string[] = []
  for (const node of alg.childAlgNodes()) {
    const move = node.as(Move)
    if (!move) return { error: `読めない書き方があります: ${node.toString()}` }
    let family = move.family
    if (/^[URFDLB]w$/.test(family)) family = family[0].toLowerCase()
    if (!FAMILIES.has(family) || move.innerLayer != null || move.outerLayer != null) {
      return { error: `読めない手があります: ${move.toString()}` }
    }
    const amount = ((move.amount % 4) + 4) % 4
    if (amount === 0) continue
    out.push(family + ['', '', '2', "'"][amount])
  }
  if (out.length === 0) return { error: '手順がありません' }
  return { alg: out.join(' ') }
}

/** 行の先頭のケース名（OLL 33、Aa perm、PLL T、F2L 5 など）を読む。無ければ caseId なし。 */
export function splitCasePrefix(line: string, cases: ImportCase[]): { caseId?: string; caseLabel?: string; rest: string } {
  const numbered = line.match(/^(oll|f2l)[\s\-#]*(\d+)\s*[:：]?\s*(.*)$/i)
  if (numbered) {
    const set = numbered[1].toUpperCase()
    return { caseId: `${set.toLowerCase()}-${Number(numbered[2])}`, caseLabel: `${set} ${numbered[2]}`, rest: numbered[3] }
  }
  // PLL の名前。E・F・T などの1文字は手と見分けられないので、PLL・perm・「:」のどれかが要る
  const pll = line.match(/^(pll[\s-]*)?([a-z]{1,2})([\s-]*perm)?\s*([:：])?\s*(.*)$/i)
  if (pll) {
    const name = pll[2][0].toUpperCase() + pll[2].slice(1).toLowerCase()
    const marked = Boolean(pll[1] || pll[3] || pll[4]) || name.length === 2
    if (marked && cases.some((c) => c.id === `pll-${name}`)) return { caseId: `pll-${name}`, caseLabel: `${name} perm`, rest: pll[5] }
    if (pll[1] || pll[3]) return { caseId: `pll-${name}`, caseLabel: `${name} perm`, rest: pll[5] }
  }
  return { rest: line }
}

/** 手順でケースを解いたときの、解く前の形（標準の向き）。 */
function caseState(kpuzzle: KPuzzle, alg: string) {
  return applyNormalized(kpuzzle, new Alg(closeRotation(kpuzzle, alg)).invert().toString())
}

const keyOf = (set: CaseSet, kpuzzle: KPuzzle, alg: string) => {
  const state = caseState(kpuzzle, alg)
  return `${set}|${caseSignature(set, state)}|${stageLevel(patternToFacelets(state), 'yellow')}`
}

const indexes = new WeakMap<ImportCase[], Map<string, ImportCase>>()

/** ケースの形から、ケースを引く表（標準手順で作る）。 */
function caseIndex(kpuzzle: KPuzzle, cases: ImportCase[]): Map<string, ImportCase> {
  let index = indexes.get(cases)
  if (!index) {
    index = new Map(cases.map((c) => [keyOf(c.set, kpuzzle, c.alg), c]))
    indexes.set(cases, index)
  }
  return index
}

export type AlgMatch = {
  case: ImportCase
  /** 書いた手順のスロット（OLL・PLL は FR）。 */
  slot: F2LSlot
  /** 保存する手順（標準の向き・右手前のスロット）。 */
  alg: string
}

/** 手順で解けるケース（F2L は右手前を先に、ほかのスロットの手順としても探す）。 */
export function identifyAlg(kpuzzle: KPuzzle, cases: ImportCase[], alg: string): AlgMatch[] {
  const index = caseIndex(kpuzzle, cases)
  const out: AlgMatch[] = []
  for (const slot of SLOTS) {
    // 鏡写しは2回当てると元に戻るので、そのスロットの手順を右手前の手順に直すのにも使える
    const fr = slotAlg(alg, slot)
    for (const set of slot === 'FR' ? SETS : (['F2L'] as const)) {
      const c = index.get(keyOf(set, kpuzzle, fr))
      if (c) out.push({ case: c, slot, alg: fr })
    }
  }
  return out
}

export type ImportRow = {
  /** 何行目か（1から）。 */
  line: number
  text: string
  ok: boolean
  /** 解けるケース（ok のとき。違うケースを書いていたときはそのケース）。 */
  case?: ImportCase
  slot?: F2LSlot
  /** 保存する手順（ok のとき）。 */
  alg?: string
  /** 書いたとおりのスロットの手順（括弧なし）。 */
  written?: string
  message?: string
}

const caseLabel = (m: AlgMatch) => (m.case.set === 'F2L' ? `${m.case.name}（${slotLabel(m.slot)}）` : m.case.name)

/** 貼り付けた文を1行ずつ読み、確かめる。空行と # で始まる行は飛ばす。 */
export function checkImport(kpuzzle: KPuzzle, cases: ImportCase[], text: string): ImportRow[] {
  const rows: ImportRow[] = []
  const seen = new Set<string>()
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim()
    if (!line || line.startsWith('#') || line.startsWith('//')) return
    const row = (r: Omit<ImportRow, 'line' | 'text'>) => rows.push({ line: i + 1, text: line, ...r })

    const { caseId, caseLabel: label, rest } = splitCasePrefix(line, cases)
    const named = caseId ? cases.find((c) => c.id === caseId) : undefined
    if (caseId && !named) return row({ ok: false, message: `ケース「${label}」がありません` })
    const parsed = parseAlg(rest)
    if ('error' in parsed) return row({ ok: false, message: parsed.error })

    const matches = identifyAlg(kpuzzle, cases, parsed.alg)
    const match = named ? matches.find((m) => m.case.id === named.id) : matches[0]
    if (!match) {
      if (named && matches[0]) {
        return row({ ok: false, case: named, written: parsed.alg, message: `${named.name} ではなく ${caseLabel(matches[0])} を解く手順です` })
      }
      return row({
        ok: false,
        case: named,
        written: parsed.alg,
        message: named ? `${named.name} を解けません` : 'どのケースの手順か分かりません（OLL・PLL・F2L のどれも解けません）',
      })
    }
    const key = `${match.case.id}|${match.alg}`
    if (algsFor(match.case).includes(match.alg) || seen.has(key)) {
      return row({ ok: false, case: match.case, slot: match.slot, written: parsed.alg, message: `${caseLabel(match)} に同じ手順があります` })
    }
    seen.add(key)
    row({ ok: true, case: match.case, slot: match.slot, alg: match.alg, written: parsed.alg })
  })
  return rows
}
