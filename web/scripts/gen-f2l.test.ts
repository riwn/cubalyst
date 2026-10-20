// F2Lケースの生成スクリプト（GEN_F2L=1 のときだけ実行）: GEN_F2L=1 npx vitest run scripts/gen-f2l.test.ts
import { writeFileSync } from 'node:fs'
import { cube3x3x3 } from 'cubing/puzzles'
import { it } from 'vitest'
import { enumerateF2LStates, solveF2L } from '../src/cases/f2l-gen'

const GROUP_ORDER = ['角・エッジとも上段', '角が上段・エッジがスロット', '角がスロット・エッジが上段', '角・エッジともスロット']

it.skipIf(!process.env.GEN_F2L)('generate f2l.ts', async () => {
  const kpuzzle = await cube3x3x3.kpuzzle()
  const states = enumerateF2LStates(kpuzzle)
  const cases = states.map((s) => ({ group: s.group, alg: solveF2L(s.pattern) }))
  cases.sort(
    (a, b) =>
      GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) ||
      a.alg.split(' ').length - b.alg.split(' ').length ||
      a.alg.localeCompare(b.alg),
  )
  const lines = cases.map(
    (c, i) => `  { id: 'f2l-${i + 1}', set: 'F2L', name: 'F2L ${i + 1}', group: '${c.group}', alg: "${c.alg}" },`,
  )
  const src = `// 生成ファイル（scripts/gen-f2l.test.ts）。FRスロットのF2L 41ケース。番号はこのアプリ独自の順。
import type { CaseDef } from './data'

export const F2L_CASES: CaseDef[] = [
${lines.join('\n')}
]
`
  writeFileSync(new URL('../src/cases/f2l.ts', import.meta.url), src)
  console.log(`${cases.length} cases`)
}, 120_000)
