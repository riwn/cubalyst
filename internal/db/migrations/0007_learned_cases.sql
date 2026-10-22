-- 手順練習で「覚えた」と印を付けたケース。ステップ練習で覚えた手順だけを出すのに使う。
CREATE TABLE learned_cases (
    case_id    TEXT NOT NULL PRIMARY KEY REFERENCES cases (id) ON DELETE CASCADE,
    learned_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
