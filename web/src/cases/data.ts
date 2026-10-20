// ケースのマスタ（OLL 57 / PLL 21 / F2L 41）。
// 手順は標準の向き（上面＝最終層、下面＝クロス、F2LはFRスロット）。正しさは data.test.ts で検証する。
// このファイルを変更したら `npm run gen:cases` でマイグレーションのシードを作り直す。

export type CaseSet = 'OLL' | 'PLL' | 'F2L'

export type CaseDef = {
  id: string
  set: CaseSet
  name: string
  /** グループ（表示用の分類）。 */
  group: string
  /** 標準手順。 */
  alg: string
}

const oll = (n: number, group: string, alg: string): CaseDef => ({ id: `oll-${n}`, set: 'OLL', name: `OLL ${n}`, group, alg })
const pll = (name: string, group: string, alg: string): CaseDef => ({ id: `pll-${name}`, set: 'PLL', name: `${name} perm`, group, alg })

export const OLL_CASES: CaseDef[] = [
  oll(1, 'Dot', "R U2 R2 F R F' U2 R' F R F'"),
  oll(2, 'Dot', "F R U R' U' F' f R U R' U' f'"),
  oll(3, 'Dot', "f R U R' U' f' U' F R U R' U' F'"),
  oll(4, 'Dot', "f R U R' U' f' U F R U R' U' F'"),
  oll(17, 'Dot', "F R' F' R2 r' U R U' R' U' M'"),
  oll(18, 'Dot', "r U R' U R U2 r2 U' R U' R' U2 r"),
  oll(19, 'Dot', "r' R U R U R' U' M' R' F R F'"),
  oll(20, 'Dot', "r U R' U' M2 U R U' R' U' M'"),
  oll(21, 'OCLL', "R U2 R' U' R U R' U' R U' R'"),
  oll(22, 'OCLL', "R U2 R2 U' R2 U' R2 U2 R"),
  oll(23, 'OCLL', "R2 D' R U2 R' D R U2 R"),
  oll(24, 'OCLL', "r U R' U' r' F R F'"),
  oll(25, 'OCLL', "F' r U R' U' r' F R"),
  oll(26, 'OCLL', "R U2 R' U' R U' R'"),
  oll(27, 'OCLL', "R U R' U R U2 R'"),
  oll(28, 'All corners', "r U R' U' r' R U R U' R'"),
  oll(57, 'All corners', "R U R' U' M' U R U' r'"),
  oll(5, 'Square', "l' U2 L U L' U l"),
  oll(6, 'Square', "r U2 R' U' R U' r'"),
  oll(7, 'Lightning', "r U R' U R U2 r'"),
  oll(8, 'Lightning', "l' U' L U' L' U2 l"),
  oll(11, 'Lightning', "r U R' U R' F R F' R U2 r'"),
  oll(12, 'Lightning', "M' R' U' R U' R' U2 R U' R r'"),
  oll(39, 'Lightning', "L F' L' U' L U F U' L'"),
  oll(40, 'Lightning', "R' F R U R' U' F' U R"),
  oll(9, 'Fish', "R U R' U' R' F R2 U R' U' F'"),
  oll(10, 'Fish', "R U R' U R' F R F' R U2 R'"),
  oll(35, 'Fish', "R U2 R2 F R F' R U2 R'"),
  oll(37, 'Fish', "F R' F' R U R U' R'"),
  oll(13, 'Knight', "F U R U' R2 F' R U R U' R'"),
  oll(14, 'Knight', "R' F R U R' F' R F U' F'"),
  oll(15, 'Knight', "l' U' l L' U' L U l' U l"),
  oll(16, 'Knight', "r U r' R U R' U' r U' r'"),
  oll(29, 'Awkward', "R U R' U' R U' R' F' U' F R U R'"),
  oll(30, 'Awkward', "F R' F R2 U' R' U' R U R' F2"),
  oll(41, 'Awkward', "R U R' U R U2 R' F R U R' U' F'"),
  oll(42, 'Awkward', "R' U' R U' R' U2 R F R U R' U' F'"),
  oll(31, 'P', "R' U' F U R U' R' F' R"),
  oll(32, 'P', "L U F' U' L' U L F L'"),
  oll(43, 'P', "F' U' L' U L F"),
  oll(44, 'P', "F U R U' R' F'"),
  oll(33, 'T', "R U R' U' R' F R F'"),
  oll(45, 'T', "F R U R' U' F'"),
  oll(34, 'C', "R U R2 U' R' F R U R U' F'"),
  oll(46, 'C', "R' U' R' F R F' U R"),
  oll(36, 'W', "L' U' L U' L' U L U L F' L' F"),
  oll(38, 'W', "R U R' U R U' R' U' R' F R F'"),
  oll(47, 'Small L', "R' U' R' F R F' R' F R F' U R"),
  oll(48, 'Small L', "F R U R' U' R U R' U' F'"),
  oll(49, 'Small L', "r U' r2 U r2 U r2 U' r"),
  oll(50, 'Small L', "r' U r2 U' r2 U' r2 U r'"),
  oll(53, 'Small L', "l' U2 L U L' U' L U L' U l"),
  oll(54, 'Small L', "r U2 R' U' R U R' U' R U' r'"),
  oll(51, 'Line', "F U R U' R' U R U' R' F'"),
  oll(52, 'Line', "R U R' U R U' B U' B' R'"),
  oll(55, 'Line', "R' F R U R U' R2 F' R2 U' R' U R U R'"),
  oll(56, 'Line', "r' U' r U' R' U R U' R' U R r' U r"),
].sort((a, b) => Number(a.id.slice(4)) - Number(b.id.slice(4)))

export const PLL_CASES: CaseDef[] = [
  pll('Aa', 'Corners', "x R' U R' D2 R U' R' D2 R2 x'"),
  pll('Ab', 'Corners', "x R2 D2 R U R' D2 R U' R x'"),
  pll('E', 'Corners', "x' R U' R' D R U R' D' R U R' D R U' R' D' x"),
  pll('H', 'Edges', 'M2 U M2 U2 M2 U M2'),
  pll('Ua', 'Edges', "M2 U M U2 M' U M2"),
  pll('Ub', 'Edges', "M2 U' M U2 M' U' M2"),
  pll('Z', 'Edges', "M' U M2 U M2 U M' U2 M2"),
  pll('F', 'Adjacent', "R' U' F' R U R' U' R' F R2 U' R' U' R U R' U R"),
  pll('Ja', 'Adjacent', "x R2 F R F' R U2 r' U r U2 x'"),
  pll('Jb', 'Adjacent', "R U R' F' R U R' U' R' F R2 U' R'"),
  pll('Ra', 'Adjacent', "R U' R' U' R U R D R' U' R D' R' U2 R'"),
  pll('Rb', 'Adjacent', "R2 F R U R U' R' F' R U2 R' U2 R"),
  pll('T', 'Adjacent', "R U R' U' R' F R2 U' R' U' R U R' F'"),
  pll('Ga', 'G', "R2 U R' U R' U' R U' R2 U' D R' U R D'"),
  pll('Gb', 'G', "R' U' R U D' R2 U R' U R U' R U' R2 D"),
  pll('Gc', 'G', "R2 U' R U' R U R' U R2 U D' R U' R' D"),
  pll('Gd', 'G', "R U R' U' D R2 U' R U' R' U R' U R2 D'"),
  pll('Na', 'Diagonal', "R U R' U R U R' F' R U R' U' R' F R2 U' R' U2 R U' R'"),
  pll('Nb', 'Diagonal', "R' U R U' R' F' U' F R U R' F R' F' R U' R"),
  pll('V', 'Diagonal', "R' U R' U' y R' F' R2 U' R' U R' F R F"),
  pll('Y', 'Diagonal', "F R U' R' U' R U R' F' R U R' U' R' F R F'"),
]

export { F2L_CASES } from './f2l'

import { F2L_CASES } from './f2l'

export const ALL_CASES: CaseDef[] = [...OLL_CASES, ...PLL_CASES, ...F2L_CASES]

export const SET_SIZES: Record<CaseSet, number> = { OLL: 57, PLL: 21, F2L: 41 }
