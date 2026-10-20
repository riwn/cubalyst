# Phase 2 実装計画：スクランブルとタイマー、ソルブのDB保存

## ゴール
フルソルブを計測して保存でき、リロード後も履歴に残る。

## バックエンド
- マイグレーション `0002_solves.sql`：`solves` テーブル
  - `id`, `mode`（full/case/step）, `solved_at`（RFC3339 UTC）, `total_ms`, `penalty`（''/'+2'/'DNF'）,
    `scramble`, `moves`（JSON）, `case_id`, `step`, `note`, `created_at`
  - `moves` の各要素：`{"move":"R","cube_ts":…,"local_ts":…,"t":…}`（t は補正後のソルブ開始からの相対ms）
- `internal/solves`：保存・一覧（フィルタ：mode/期間/case_id/step、ページング）・取得・更新（penalty/note）・削除
- API
  - `POST /api/solves` / `GET /api/solves` / `GET /api/solves/{id}` / `PATCH /api/solves/{id}` / `DELETE /api/solves/{id}`
  - 一覧は既定で `moves` を省略（`include=moves` で含める）

## フロントエンド
- スクランブル生成：cubing.js の `randomScrambleForEvent("333")`（ランダムステート）
- スクランブル追跡（`scramble-tracker.ts`）
  - スクランブルの各手の後の状態を前計算し、実機の状態と照合して進捗をハイライト
  - `R2` は90度回転2回なので、途中状態（R または R'）も許容
  - 間違えた手は「ずれ」として積み、逆手順（同じ面の連続は合成）を「戻す手順」として表示
  - スクランブル完了（目標状態と一致）を自動検知
- タイマー状態機械（`timer.ts`）：`scrambling → ready → running → done`
  - ready で最初の回転が来たら計測開始、完成状態に到達したら停止
  - 時間は補正後タイムスタンプ（最初の手から最後の手まで）
  - 停止したらソルブを保存し、次のスクランブルを生成
- 画面（タイマー）：スクランブル表示（進捗ハイライト・戻す手順）、大きなタイマー、直近の記録（+2/DNF/削除）、ao5/ao12
- `stats.ts`：WCA方式の ao5/ao12（DNF2つ以上でDNF、+2は2秒加算）

## テスト
- Go：solves のCRUDとフィルタ、APIハンドラ
- vitest：スクランブル追跡（正しい手順・R2の途中・間違い→戻す・完了）、タイマー状態機械、ao計算
- headless Chrome＋モック接続：スクランブルを回す→計測→完成→保存→リロードで残ることを確認
