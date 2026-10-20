// cases マイグレーションの生成（GEN_CASES=1 のときだけ実行）: npm run gen:cases
import { writeFileSync } from 'node:fs'
import { cube3x3x3 } from 'cubing/puzzles'
import { it } from 'vitest'
import { casesMigrationSQL } from '../src/cases/seed'

export const MIGRATION_PATH = new URL('../../internal/db/migrations/0004_cases.sql', import.meta.url)

it.skipIf(!process.env.GEN_CASES)('generate 0004_cases.sql', async () => {
  writeFileSync(MIGRATION_PATH, casesMigrationSQL(await cube3x3x3.kpuzzle()))
})
