-- cubalyst:foreign-keys-off
-- ソルブの種類に assist（補助付きフルソルブ）を足す。CHECK 制約を変えるため solves を作り直す
-- （solve_splits・analysis_solves から参照されているので、外部キーを止めて行う）。

CREATE TABLE solves_new (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    mode       TEXT    NOT NULL CHECK (mode IN ('full', 'case', 'step', 'assist')),
    solved_at  TEXT    NOT NULL,                 -- RFC3339（UTC、ミリ秒）
    total_ms   INTEGER NOT NULL CHECK (total_ms >= 0),
    penalty    TEXT    NOT NULL DEFAULT '' CHECK (penalty IN ('', '+2', 'DNF')),
    scramble   TEXT    NOT NULL,
    moves      TEXT    NOT NULL DEFAULT '[]',    -- JSON: [{"move","cube_ts","local_ts","t"}]
    case_id    TEXT,                             -- ケース練習・覚えた手順のステップ練習のケースID
    step       TEXT,                             -- ステップ練習の段階
    note       TEXT    NOT NULL DEFAULT '',
    created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO solves_new (id, mode, solved_at, total_ms, penalty, scramble, moves, case_id, step, note, created_at)
SELECT id, mode, solved_at, total_ms, penalty, scramble, moves, case_id, step, note, created_at FROM solves;

DROP TABLE solves;
ALTER TABLE solves_new RENAME TO solves;

CREATE INDEX solves_mode_solved_at ON solves (mode, solved_at);
CREATE INDEX solves_solved_at ON solves (solved_at);

-- 0006 のトリガーは solves と一緒に消えるので作り直す
CREATE TRIGGER solves_delete_single_analyses BEFORE DELETE ON solves
BEGIN
    DELETE FROM analyses
    WHERE kind = 'solve' AND id IN (SELECT analysis_id FROM analysis_solves WHERE solve_id = OLD.id);
END;
