-- CFOPの段階ごとの区切り。回転ログ（solves.moves）から再計算できる派生データ。
CREATE TABLE solve_splits (
    solve_id    INTEGER NOT NULL REFERENCES solves (id) ON DELETE CASCADE,
    stage       TEXT    NOT NULL CHECK (stage IN ('cross', 'f2l1', 'f2l2', 'f2l3', 'f2l4', 'oll', 'pll')),
    start_ms    INTEGER NOT NULL,   -- ソルブ開始からの相対ms
    end_ms      INTEGER NOT NULL,
    move_count  INTEGER NOT NULL,
    start_index INTEGER NOT NULL,   -- 回転ログ上の範囲 [start_index, end_index)
    end_index   INTEGER NOT NULL,
    PRIMARY KEY (solve_id, stage)
);
