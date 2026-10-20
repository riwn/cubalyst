-- ソルブの記録。回転ログ（moves）は生データとして必ず保存し、統計や段階分割はここから再計算できるようにする。
CREATE TABLE solves (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    mode       TEXT    NOT NULL CHECK (mode IN ('full', 'case', 'step')),
    solved_at  TEXT    NOT NULL,                 -- RFC3339（UTC、ミリ秒）
    total_ms   INTEGER NOT NULL CHECK (total_ms >= 0),
    penalty    TEXT    NOT NULL DEFAULT '' CHECK (penalty IN ('', '+2', 'DNF')),
    scramble   TEXT    NOT NULL,
    moves      TEXT    NOT NULL DEFAULT '[]',    -- JSON: [{"move","cube_ts","local_ts","t"}]
    case_id    TEXT,                             -- ケース練習のケースID
    step       TEXT,                             -- ステップ練習の段階
    note       TEXT    NOT NULL DEFAULT '',
    created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX solves_mode_solved_at ON solves (mode, solved_at);
CREATE INDEX solves_solved_at ON solves (solved_at);
