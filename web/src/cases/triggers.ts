// 手順の中のトリガー（セクシームーブなど、ひとまとまりで回す4手）を括弧で囲んで、読みやすくする。
// 手順そのものは括弧なしで持ち、表示するときだけ囲む。

import { slotAlg, type F2LSlot } from './slots'

/** 右手で回すトリガー。 */
const BASE: { name: string; alg: string }[] = [
  { name: 'セクシームーブ', alg: "R U R' U'" },
  { name: '逆セクシー', alg: "U R U' R'" },
  { name: '逆セクシー', alg: "R' U' R U" },
  { name: 'スレッジハンマー', alg: "R' F R F'" },
  { name: 'ヘッジスラマー', alg: "F R' F' R" },
]

// F2L のほかのスロットの手順は鏡写しで作るので、トリガーも鏡写しを入れる（左手のセクシー L' U' L U など）
const SLOTS: F2LSlot[] = ['FR', 'FL', 'BR', 'BL']

export const TRIGGERS: { name: string; moves: string[] }[] = (() => {
  const out: { name: string; moves: string[] }[] = []
  for (const slot of SLOTS) {
    for (const t of BASE) {
      const alg = slotAlg(t.alg, slot)
      if (!out.some((o) => o.moves.join(' ') === alg)) out.push({ name: t.name, moves: alg.split(' ') })
    }
  }
  return out
})()

/** 手順の区切り。トリガーなら name が付く。 */
export type AlgPart = { moves: string[]; name?: string }

/** 手順を、トリガーとそれ以外に分ける（左から順に、重ならないように当てる）。 */
export function splitTriggers(alg: string): AlgPart[] {
  const moves = alg.trim().split(/\s+/).filter(Boolean)
  const parts: AlgPart[] = []
  let plain: string[] = []
  for (let i = 0; i < moves.length; ) {
    const t = TRIGGERS.find((t) => t.moves.every((m, k) => moves[i + k] === m))
    if (!t) {
      plain.push(moves[i++])
      continue
    }
    if (plain.length) parts.push({ moves: plain })
    plain = []
    parts.push({ moves: t.moves, name: t.name })
    i += t.moves.length
  }
  if (plain.length) parts.push({ moves: plain })
  return parts
}

/** トリガーを括弧で囲んだ手順。例：F (R U R' U') F' */
export function withTriggers(alg: string): string {
  return splitTriggers(alg)
    .map((p) => (p.name ? `(${p.moves.join(' ')})` : p.moves.join(' ')))
    .join(' ')
}
