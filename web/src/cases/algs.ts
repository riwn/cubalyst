// ケースごとの別手順（標準手順のほかに選べる手順）。標準手順と同じ向き・同じ前提で書く。
// 同じケースを解けるかは algs.test.ts で検証する。

export const ALT_ALGS: Record<string, string[]> = {
  'oll-1': ["R U B' l U l2 x' U' R' F R F'"],
  'oll-2': ["r U r' U2 r U2 R' U2 R U' r'"],
  'oll-3': ["r' R2 U R' U r U2 r' U M'"],
  'oll-4': ["M U' r U2 r' U' R U' R' M'"],
  'oll-7': ["L' U2 L U2 L F' L' F"],
  'oll-8': ["R U2 R' U2 R' F R F'"],
  'oll-13': ["r U' r' U' r U r' F' U F"],
  'oll-15': ["r' U' r R' U' R U r' U r"],
  'oll-21': ["R U R' U R U' R' U R U2 R'", "F R U R' U' R U R' U' R U R' U' F'"],
  'oll-22': ["f R U R' U' f' F R U R' U' F'"],
  'oll-23': ["R2 D R' U2 R D' R' U2 R'"],
  'oll-24': ["L F R' F' L' F R F'"],
  'oll-25': ["R' F R B' R' F' R B", "F R' F' r U R U' r'"],
  'oll-26': ["L' U' L U' L' U2 L"],
  'oll-27': ["L' U2 L U L' U L"],
  'oll-28': ["M' U M U2 M' U M"],
  'oll-31': ["S' L' U' L U L F' L' f"],
  'oll-32': ["S R U R' U' R' F R f'"],
  'oll-33': ["L' U' L U L F' L' F"],
  'oll-37': ["F R U' R' U' R U R' F'"],
  'oll-43': ["f' L' U' L U f"],
  'oll-44': ["f R U R' U' f'"],
  'oll-45': ["F' L' U' L U F"],
  'oll-47': ["F' L' U' L U L' U' L U F"],
  'oll-51': ["f R U R' U' R U R' U' f'"],
  'oll-52': ["R' F' U' F U' R U R' U R"],
  'oll-57': ["R U R' U' r R' U R U' r'"],
  'pll-Aa': ["x L2 D2 L' U' L D2 L' U L' x'", "R' F R' B2 R F' R' B2 R2"],
  'pll-Ab': ["x' L2 D2 L U L' D2 L U' L x", "R B' R F2 R' B R F2 R2"],
  'pll-H': ["M2 U' M2 U2 M2 U' M2", 'R2 U2 R U2 R2 U2 R2 U2 R U2 R2'],
  'pll-Ua': ["R U' R U R U R U' R' U' R2", "R2 U' R' U' R U R U R U' R"],
  'pll-Ub': ["R2 U R U R' U' R' U' R' U R'", "R' U R' U' R' U' R' U R U R2"],
  'pll-Z': ["M2 U M2 U M' U2 M2 U2 M'", "M2 U' M2 U' M' U2 M2 U2 M'"],
  'pll-Ja': ["L' U' L F L' U' L U L F' L2 U L", "R' U L' U2 R U' R' U2 R L"],
  'pll-Jb': ["R U2 R' U' R U2 L' U R' U' L"],
  'pll-Ra': ["R U R' F' R U2 R' U2 R' F R U R U2 R'"],
  'pll-Rb': ["R' U2 R U2 R' F R U R' U' R' F' R2"],
  'pll-Ga': ["R2 u R' U R' U' R u' R2 F' U F"],
  'pll-Gb': ["R' U' R y R2 u R' U R U' R u' R2"],
  'pll-Gc': ["R2 u' R U' R U R' u R2 f R' f'"],
  'pll-Gd': ["R U R' y' R2 u' R U' R' U R' u R2"],
  'pll-Na': ["L U' R U2 L' U R' L U' R U2 L' U R'"],
  'pll-Nb': ["R' U L' U2 R U' L R' U L' U2 R U' L"],
  'pll-V': ["R' U R U' R' f' U' R U2 R' U' R U' R' f R"],
}

/** ケースで選べる手順（先頭が標準手順）。 */
export function algsFor(c: { id: string; alg: string }): string[] {
  return [c.alg, ...(ALT_ALGS[c.id] ?? [])]
}
