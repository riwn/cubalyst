-- Claudeによる解析結果。kind=solve は単一ソルブ、kind=trend は直近N件の傾向分析。
CREATE TABLE analyses (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    kind          TEXT    NOT NULL CHECK (kind IN ('solve', 'trend')),
    solve_id      INTEGER REFERENCES solves (id) ON DELETE CASCADE,
    params        TEXT    NOT NULL DEFAULT '{}',  -- JSON（傾向分析の対象条件など）
    input         TEXT    NOT NULL,               -- Claudeに渡した整形済みデータ
    result        TEXT    NOT NULL,               -- 解析結果（Markdown）
    model         TEXT    NOT NULL,
    input_tokens  INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX analyses_solve ON analyses (solve_id);
CREATE INDEX analyses_kind_created ON analyses (kind, created_at);
