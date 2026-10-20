# Phase 3 実装計画：CFOP段階検出、履歴一覧と詳細、export

## ゴール
段階タイムが記録・表示され、JSON / CSV / テキストで出力できる。

## 段階検出（フロントエンド `web/src/solve/cfop.ts`）
- facelets状態（センター固定）から各段階の完了を判定する
  - cross：クロス色の面のエッジ4つが正しい位置・向き
  - f2l1〜4：クロス完成に加えて、揃ったF2Lスロット（角＋中層エッジ）の数が1〜4に達した時点（揃った順）
  - oll：F2L完成＋反対面が全て同色 / pll：完成
- 各段階は「初めて条件を満たした手」で区切る。途中で崩れても記録は戻さない（単調）
- 段階スキップ（OLLスキップなど）は手数0・時間0の段階として記録する
- ソルブ開始状態は「完成状態に回転ログの逆手順を当てた状態」として求める（フルソルブは必ず完成で終わるため、
  スクランブルの追跡ずれや開始時に揃っていなかった場合でも、生ログだけから正しく再計算できる）
- クロス色は設定（既定：白）。色と面の対応は GAN標準配色（白U・黄D・緑F・青B・赤R・橙L）

## バックエンド
- マイグレーション `0003_solve_splits.sql`：`solve_splits`（solve_id, stage, start_ms, end_ms, move_count, start_index, end_index）
  - start_index/end_index は回転ログの範囲（段階ごとの解法を取り出すため）
- ソルブ作成時に splits も同じトランザクションで保存。`PUT /api/solves/{id}/splits` で置き換え（再計算用）
- 一覧は `include=splits` で段階も返す
- 設定：`GET /api/settings` / `PUT /api/settings`（cross_color）
- export：`GET /api/export?format=json|csv|txt`＋フィルタ（mode/from/to/ids）
  - json：`{version, exported_at, solves:[…moves, splits…]}`
  - csv：1ソルブ1行、段階ごとの所要時間と手数の列
  - txt：リコンストラクション形式（スクランブル＋段階ごとの解法＋タイム）
- import：`POST /api/import`（JSON export形式）。同じ solved_at・scramble・total_ms のソルブは重複としてスキップ

## フロントエンド
- 保存時に段階を計算して splits を付けて送る（フルソルブ）
- 履歴画面：フィルタ（モード・期間）、ページング、選択してexport
- 詳細画面：タイム・ペナルティ・メモ編集、スクランブル、段階表（時間・手数・TPS）、リコン、削除
- 設定画面：クロス色、段階の再計算（全ソルブ）、export / import

## テスト
- vitest：段階検出（既知のソルブで段階区切り、OLL/PLLスキップ、クロス色の変更）
- Go：splitsの保存・置換、export（json/csv/txt）、import（重複スキップ）
- headless Chrome：モックでソルブ→履歴→詳細で段階表示、export
