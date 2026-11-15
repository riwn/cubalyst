-- 手順練習で、ケースに追加した手順（標準手順と web/src/cases/algs.ts の別手順のほかに選べる手順）。
-- 手順は標準の向き（上面＝最終層、下面＝クロス、F2LはFRスロット）で、括弧を外した手の並び。
-- そのケースを解けるかは、追加する前に画面（web/src/cases/alg-import.ts）で確かめる。
CREATE TABLE case_algs (
    id         INTEGER PRIMARY KEY,
    case_id    TEXT NOT NULL REFERENCES cases (id) ON DELETE CASCADE,
    alg        TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (case_id, alg)
);
