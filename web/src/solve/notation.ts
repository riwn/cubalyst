// 外層回転の記法ユーティリティ（U R F D L B と ' / 2 のみ扱う）。

const OPPOSITE: Record<string, string> = { U: 'D', D: 'U', R: 'L', L: 'R', F: 'B', B: 'F' }

export type FaceTurn = { face: string; amount: number } // amount: 1=時計回り, 2=180度, 3=反時計回り

export function parseMove(move: string): FaceTurn {
  const m = /^([URFDLB])(2'|2|')?$/.exec(move.trim())
  if (!m) throw new Error(`unsupported move: ${move}`)
  const amount = m[2] === "'" ? 3 : m[2] === '2' || m[2] === "2'" ? 2 : 1
  return { face: m[1], amount }
}

export function formatMove({ face, amount }: FaceTurn): string {
  return face + (amount === 1 ? '' : amount === 2 ? '2' : "'")
}

export function splitAlg(alg: string): string[] {
  return alg.trim() === '' ? [] : alg.trim().split(/\s+/)
}

/** 手順を簡約する（同じ面の連続と、反対面を挟んだ同じ面をまとめる）。 */
export function simplify(moves: string[]): string[] {
  const out: FaceTurn[] = []
  for (const m of moves) {
    const t = parseMove(m)
    let target = -1
    const last = out.length - 1
    if (last >= 0 && out[last].face === t.face) target = last
    else if (last >= 1 && out[last].face === OPPOSITE[t.face] && out[last - 1].face === t.face) target = last - 1
    if (target >= 0) {
      const amount = (out[target].amount + t.amount) % 4
      if (amount === 0) out.splice(target, 1)
      else out[target] = { face: t.face, amount }
    } else {
      out.push(t)
    }
  }
  return out.map(formatMove)
}

/** 逆手順。 */
export function invert(moves: string[]): string[] {
  return [...moves].reverse().map((m) => {
    const t = parseMove(m)
    return formatMove({ face: t.face, amount: (4 - t.amount) % 4 })
  })
}
