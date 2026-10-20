# Phase 8 実装計画：Claudeによる解析

## ゴール
単一ソルブと傾向分析の結果が表示・保存される。

## 方針
- Goサーバーから Claude API を呼ぶ（公式 Go SDK `github.com/anthropics/anthropic-sdk-go`）
  - APIキーは環境変数 `ANTHROPIC_API_KEY`。未設定なら解析APIは 503 を返し、画面に設定方法を表示する
  - モデルは既定で `claude-opus-5-5`（`CUBALYST_CLAUDE_MODEL` で変更可）、effort は `high`（`CUBALYST_CLAUDE_EFFORT`）
  - 安全分類による拒否（`stop_reason: refusal`）に備え、サーバー側フォールバック（`fallbacks: "default"`）を有効にする
  - 応答は1回で返す（max_tokens 16000、非ストリーミング）。拒否・上限到達はエラーとして扱う
- **数値の集計はサーバー側で行い、整形したテキストを渡す**（モデルに生ログを計算させない）
  - 単一ソルブ：段階ごとの時間・手数・TPS、認識時間（前の段階の終わり〜最初の手）と実行時間、
    長い間（ポーズ）の上位、面ごとの回転数の偏り、段階ごとの解法、直近50ソルブの段階別平均との比較
  - 傾向分析：直近N件の平均・ao5/ao12（WCA方式）・ばらつき・DNF率、段階別の平均と前半/後半の比較、
    各ソルブで一番時間を使った段階の分布
- 解析結果は `analyses` テーブル（マイグレーション `0005_analyses.sql`）に、渡した入力・モデル・トークン数とともに保存
- テストでは LLM をインターフェースにしてフェイクに差し替える（実際のAPIは呼ばない）

## API
- `GET /api/analysis/status`：設定済みか、使用モデル
- `POST /api/solves/{id}/analyses`：単一ソルブを解析して保存 / `GET /api/solves/{id}/analyses`：一覧
- `POST /api/analyses/trend`（`{"mode":"full","limit":50}`）：傾向分析 / `GET /api/analyses?kind=trend`：一覧
- `DELETE /api/analyses/{id}`

## 画面
- ソルブ詳細：「Claudeで解析」ボタン、過去の解析結果（Markdown表示）
- 統計：傾向分析（対象件数を指定）と過去の結果
