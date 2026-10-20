// cases テーブルのシード（マイグレーション 0004_cases.sql）を data.ts から作る。

import { Alg } from 'cubing/alg'
import type { KPuzzle } from 'cubing/kpuzzle'
import { patternToFacelets } from '../cube/facelets'
import { ALL_CASES } from './data'
import { applyNormalized } from './geometry'

/** ケースの状態（標準の向き）の facelets。画像生成用。 */
export function casePattern(kpuzzle: KPuzzle, alg: string): string {
  return patternToFacelets(applyNormalized(kpuzzle, new Alg(alg).invert().toString()))
}

const q = (s: string) => `'${s.replace(/'/g, "''")}'`

export function casesMigrationSQL(kpuzzle: KPuzzle): string {
  const rows = ALL_CASES.map(
    (c, i) =>
      `    (${q(c.id)}, ${q(c.set)}, ${q(c.name)}, ${q(c.group)}, ${q(c.alg)}, ${q(casePattern(kpuzzle, c.alg))}, ${i + 1})`,
  )
  return `-- 生成ファイル（web/src/cases/seed.ts、npm run gen:cases）。編集は web/src/cases/data.ts で行う。
-- ケース練習のマスタ。alg は標準の向き（上面＝最終層、下面＝クロス、F2LはFRスロット）の手順。
-- pattern はケースの状態（標準の向き）の54文字facelets（URFDLB）で、画像生成に使う。
CREATE TABLE cases (
    id         TEXT PRIMARY KEY,
    case_set   TEXT    NOT NULL CHECK (case_set IN ('OLL', 'PLL', 'F2L')),
    name       TEXT    NOT NULL,
    case_group TEXT    NOT NULL,
    alg        TEXT    NOT NULL,
    pattern    TEXT    NOT NULL,
    sort       INTEGER NOT NULL
);

INSERT INTO cases (id, case_set, name, case_group, alg, pattern, sort) VALUES
${rows.join(',\n')};
`
}
