-- 解析の種類を「単体（solve）」と「まとめ（multi）」に分け、解析が対象にしたソルブを analysis_solves に記録する。
-- 解析は MCP 経由の Claude が書くようになり、アプリから Claude API を呼ばなくなったので、トークン数の列は消す。

CREATE TABLE analyses_new (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    kind       TEXT    NOT NULL CHECK (kind IN ('solve', 'multi')),
    title      TEXT    NOT NULL DEFAULT '',             -- まとめの見出し（「直近10件のフルソルブ」など）
    params     TEXT    NOT NULL DEFAULT '{}',           -- JSON（対象の選び方。表示用）
    input      TEXT    NOT NULL,                        -- Claudeに渡した整形済みデータ
    result     TEXT    NOT NULL,                        -- 解析結果（Markdown）
    model      TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO analyses_new (id, kind, title, params, input, result, model, created_at)
SELECT id,
       CASE kind WHEN 'trend' THEN 'multi' ELSE 'solve' END,
       CASE kind WHEN 'trend' THEN '直近' || json_extract(params, '$.limit') || '件' ELSE '' END,
       params, input, result, model, created_at
FROM analyses;

-- 対象のソルブ。単体は solve_id、傾向分析は「作った時点で条件に合っていた直近N件」を復元する
CREATE TEMP TABLE analysis_links AS
SELECT id AS analysis_id, solve_id FROM analyses WHERE kind = 'solve' AND solve_id IS NOT NULL
UNION
SELECT analysis_id, solve_id FROM (
    SELECT a.id AS analysis_id, s.id AS solve_id,
           ROW_NUMBER() OVER (PARTITION BY a.id ORDER BY s.solved_at DESC, s.id DESC) AS rn,
           json_extract(a.params, '$.limit') AS lim
    FROM analyses a
    JOIN solves s ON s.mode = json_extract(a.params, '$.mode') AND s.solved_at <= a.created_at
    WHERE a.kind = 'trend'
) WHERE rn <= lim;

DROP TABLE analyses;
ALTER TABLE analyses_new RENAME TO analyses;

CREATE TABLE analysis_solves (
    analysis_id INTEGER NOT NULL REFERENCES analyses (id) ON DELETE CASCADE,
    solve_id    INTEGER NOT NULL REFERENCES solves (id) ON DELETE CASCADE,
    PRIMARY KEY (analysis_id, solve_id)
);

INSERT INTO analysis_solves (analysis_id, solve_id) SELECT analysis_id, solve_id FROM analysis_links;
DROP TABLE analysis_links;

CREATE INDEX analyses_kind_created ON analyses (kind, created_at);
CREATE INDEX analysis_solves_solve ON analysis_solves (solve_id);

-- ソルブを消したら、そのソルブの単体の解析も消す（まとめの解析は残し、対象から外すだけ）
CREATE TRIGGER solves_delete_single_analyses BEFORE DELETE ON solves
BEGIN
    DELETE FROM analyses
    WHERE kind = 'solve' AND id IN (SELECT analysis_id FROM analysis_solves WHERE solve_id = OLD.id);
END;
