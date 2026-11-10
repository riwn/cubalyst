// 手順の手数と、使う面。別の手順を選ぶときの目安にする。

export type AlgInfo = {
  /** 手数（R2 やスライス・ワイドムーブも1手。持ち替えは数えない）。 */
  moves: number
  /** 使う面（出てきた順。ワイドムーブは小文字、スライスは M・S・E）。 */
  faces: string[]
  /** 持ち替え（x・y・z）の回数。 */
  rotations: number
}

const isRotation = (move: string) => 'xyz'.includes(move[0])

export function algInfo(alg: string): AlgInfo {
  const tokens = alg.trim().split(/\s+/).filter(Boolean)
  const turns = tokens.filter((m) => !isRotation(m))
  return {
    moves: turns.length,
    faces: [...new Set(turns.map((m) => m[0]))],
    rotations: tokens.length - turns.length,
  }
}

/** 「8手 ・ R U ・ 持ち替え1回」の形。 */
export function formatAlgInfo(alg: string): string {
  const info = algInfo(alg)
  return [`${info.moves}手`, info.faces.join(' '), info.rotations > 0 && `持ち替え${info.rotations}回`].filter(Boolean).join(' ・ ')
}
