# Cubalyst

GANのスマートキューブ（GAN i4）をPCとBluetoothで接続し、ソルブの記録・統計・再生・練習・LLM解析を行う個人用Webアプリ。
詳細は [cubalyst-spec.md](cubalyst-spec.md) を参照。

**ローカル起動専用**のアプリです。サーバーは `127.0.0.1` にのみバインドし（ループバック以外を指定すると起動を拒否します）、認証はありません。

## 必要なもの

- Go 1.24 以上
- Node.js 22 以上 / npm
- クライアント側：Chrome または Edge（Web Bluetooth対応ブラウザ）

## 起動方法

### なぜSSHポートフォワードが必要か

Web Bluetoothは**セキュアコンテキスト（`localhost` または HTTPS）でしか動きません**。
サーバー（`nuc`）にLANのIPアドレスでアクセスするとBluetoothが使えないため、WindowsからSSHのポートフォワードで `localhost` として開きます。

### 開発時（Vite devサーバー :5173）

1. Windowsからポートフォワードしてnucに入る：

   ```
   ssh -L 5173:localhost:5173 nuc
   ```

2. そのSSHセッションのまま、nuc上でGoサーバーとVite devサーバーをまとめて起動する：

   ```
   cd ~/work/cubalyst
   make dev
   ```

   `Local: http://127.0.0.1:5173/` と表示されたら起動完了です。Ctrl+C で両方止まります。

3. Windowsのブラウザで <http://localhost:5173> を開く。

Viteのdevサーバーが `/api` をGoサーバーへプロキシします。
個別に起動したい場合は `make dev-server`（Goサーバー :8080）と `make dev-web`（Vite :5173）を別々のターミナルで実行します。

> SSHのターミナルに `channel N: open failed: connect failed: Connection refused` と出るのは、nuc側でViteが動いていないときにブラウザがアクセスした場合です。Viteを起動すれば出なくなります（Viteを止めている間は、開いているタブを閉じておくと出ません）。

### 本番相当（Goサーバー単体 :8080）

Goサーバーがビルド済みのフロントエンドも配信するので、ポートは1つで済みます。

1. Windowsからポートフォワードしてnucに入る：

   ```
   ssh -L 8080:localhost:8080 nuc
   ```

2. nuc上でビルドして起動する：

   ```
   make build
   make run
   ```

3. Windowsのブラウザで <http://localhost:8080> を開く。

## キューブの接続

タイマー画面の「Connect」を押し、Chromeのデバイス選択でキューブ（GAN i4 など）を選びます。

GAN系のキューブは通信の暗号化にMACアドレスを使います。取得方法は次のどちらかです。

- **自動取得（推奨）**：Chromeで `chrome://flags/#enable-experimental-web-platform-features` を有効にして再起動する。キューブのアドバタイズからMACアドレスを読み取ります。
- **手入力**：自動取得できなかったときは入力欄が出ます。MACアドレスはWindowsの「設定 → Bluetoothとデバイス」や `chrome://bluetooth-internals` で確認できます。入力した値はブラウザに保存され、次回からは聞かれません。

接続後は回転・facelets・バッテリーが画面に表示され、3Dキューブが実機に同期します。

- **状態リセット**：実機を完成状態にしてから押すと、実機とアプリの状態を完成状態にそろえ直します。
- **実機の状態を取得**：実機からfaceletsを取り直します。アプリ側の状態とズレていれば、実機の状態に合わせます。

### モック接続

実機がなくても「モック接続」で動作確認できます。

- 画面のボタン、またはキーボードの `U R F D L B`（Shiftで逆回転）で回せます。
- 回転ログを貼り付けて、記録時の間隔どおりに再生できます（0.5x〜4x）。形式は `"R U R' U'"` のような回転記号か、JSON配列 `[{"move":"R","cubeTimestamp":1000,"localTimestamp":20}, ...]` です。
- 回転ログ欄の「JSONをコピー」で、実機の回転ログをそのまま再生用に保存できます。

## 機能

| 画面 | できること |
|---|---|
| タイマー | スクランブル（進捗ハイライト・間違えたときの戻し手順）、最初の回転で計測開始・完成で停止、+2/DNF、ao5/ao12 |
| 練習 | ケース単発練習（OLL 57 / PLL 21 / F2L 41、選んだケースからランダム出題、ケース別成績）、ステップ練習（Cross / F2L / OLL / PLL の直前状態から） |
| 履歴 | 一覧（フィルタ・ページング）、詳細（CFOPの段階タイム・解法・TPS、再生、メモ、Claudeによる解析）、export |
| 統計 | ベスト記録、推移（single/ao5/ao12）、分布、段階別統計、Claudeによる傾向分析 |
| 設定 | クロス色、持ち方（解法の表記の向き）、段階の再計算、export（JSON/CSV/テキスト）、import（JSON） |

### 持ち方と解法の表記

スマートキューブは、キューブ自身の向き（GAN標準配色：白上・緑前）で回転を記録します。設定の「持ち方（下の色・前の色）」に合わせて、
解法の表示・再生（3D表示の向きも）・テキストのリコン・Claudeに渡すデータの記号を読み替えます。
保存されている回転ログ（JSON export を含む）はキューブ自身の向きのままで、スクランブルは常に白上・緑前（WCA）です。

各フェーズの実装計画は `docs/plans/` にあります。

## Claudeによる解析

ソルブ詳細の「このソルブを解析」と、統計の「傾向を分析」で Claude API を使います。サーバーを `ANTHROPIC_API_KEY` 付きで起動してください。

```
ANTHROPIC_API_KEY=sk-ant-... make dev
```

- モデルは既定で `claude-opus-5-5`、effort は `high` です（下の環境変数で変更できます）。1回の解析でおおよそ十数円〜数十円のAPI利用料がかかります（使ったトークン数は結果の横に表示されます）
- 安全分類による拒否に備えて、サーバー側フォールバック（`fallbacks: "default"`）を有効にしています
- 解析に渡したデータ（入力）と結果は `analyses` テーブルに保存され、画面の「入力データ」で確認できます
- APIキーなしで画面だけ確かめたいときは `CUBALYST_CLAUDE_MOCK=1` で起動すると、決まった文面を返すモックになります（課金なし）

## 設定

フラグまたは環境変数で指定できます（フラグが優先）。

| フラグ | 環境変数 | 既定値 | 内容 |
|---|---|---|---|
| `-addr` | `CUBALYST_ADDR` | `127.0.0.1:8080` | 待ち受けアドレス（ループバックのみ） |
| `-db` | `CUBALYST_DB` | `./data/cubalyst.db` | SQLiteファイルのパス |
| `-static` | `CUBALYST_STATIC` | `./web/dist` | ビルド済みフロントエンドのディレクトリ |
| — | `ANTHROPIC_API_KEY` | — | Claude APIキー（未設定なら解析機能だけ無効） |
| — | `ANTHROPIC_WORKSPACE_ID` | — | APIキーがワークスペースに紐付いていない場合に、使うワークスペースのID（`wrkspc_...`） |
| — | `CUBALYST_CLAUDE_MODEL` | `claude-opus-5-5` | 解析に使うモデル |
| — | `CUBALYST_CLAUDE_EFFORT` | `high` | effort（low / medium / high / xhigh / max） |
| — | `CUBALYST_CLAUDE_MOCK` | — | `1` で解析をモック応答にする（開発用） |

Goサーバーのポートを変えた場合は、Vite側にも `CUBALYST_API=http://127.0.0.1:<port>` を渡してください。

## 開発

```
make test    # go vet / go test / フロントの型チェック・lint・vitest
make clean   # ビルド成果物を削除
```

注意：お使いのzshで `make` が関数として定義されていて動かない場合は、`/usr/bin/make test` のようにフルパスで実行してください。

### ディレクトリ構成

```
cmd/cubalyst/          エントリポイント
internal/config/       フラグ・環境変数の読み込み
internal/db/           SQLite接続とマイグレーション
internal/db/migrations マイグレーションSQL（バイナリに埋め込み、起動時に適用）
internal/server/       HTTPルーティング・APIハンドラ・静的配信
internal/solves/       ソルブと段階区切りの保存
internal/export/       export（JSON / CSV / テキスト）と import
internal/settings/     設定（クロス色）
internal/analysis/     Claudeによる解析（入力データの集計・整形、API呼び出し、保存）
web/                   フロントエンド（Vite + React + TypeScript）
web/src/cube/          キューブ接続（実機・モック）、状態管理、facelets変換、時計ズレ補正
web/src/solve/         スクランブル追跡、計測セッション、CFOP段階検出、統計
web/src/cases/         ケース練習（マスタ・手順の検証・出題）
web/src/steps/         ステップ練習の出題
web/src/replay/        ソルブ再生
web/src/components/    画面部品
web/src/pages/         画面
data/                  DBファイル置き場（git管理外）
```

### マイグレーション

`internal/db/migrations/NNNN_name.sql` を追加すると、次回起動時に番号順で適用されます。
適用済みの番号は `schema_migrations` テーブルに記録されます。適用済みのファイルは書き換えず、変更は新しいファイルで行ってください。

### API

| メソッド | パス | 内容 |
|---|---|---|
| GET | `/api/health` | サーバーとDBの状態。DB異常時 `503` |
| GET / POST | `/api/solves` | ソルブ一覧（`mode` `from` `to` `case_id` `step` `ids` `limit` `offset` `include=moves,splits` `order=asc`）/ 保存 |
| GET / PATCH / DELETE | `/api/solves/{id}` | 取得 / ペナルティ・メモの更新 / 削除 |
| PUT | `/api/solves/{id}/splits` | 段階区切りの置き換え（再計算用） |
| GET / PUT | `/api/settings` | 設定（クロス色） |
| GET | `/api/export?format=json\|csv\|txt` | export（一覧と同じフィルタ） |
| POST | `/api/import` | JSON export の取り込み（重複はスキップ） |
| GET | `/api/cases` | ケース練習のマスタ（`set=OLL` など） |
| GET | `/api/analysis/status` | Claude API が使えるか |
| GET / POST | `/api/solves/{id}/analyses` | ソルブの解析結果一覧 / 解析の実行 |
| POST | `/api/analyses/trend` | 傾向分析（`{"mode":"full","limit":50}`） |
| GET / DELETE | `/api/analyses`, `/api/analyses/{id}` | 解析結果の一覧（`kind=trend`）/ 削除 |

### ケースのマスタ

`web/src/cases/data.ts` が正です。変更したら次でマイグレーションのシード（`internal/db/migrations/0004_cases.sql`）を作り直します（テストで一致を確認しています）。F2L の41ケースは `npm run gen:f2l` で数え上げと手順探索から生成しています。

```
cd web && npm run gen:cases
```

## バックアップ

DBは単一ファイルなので、サーバーを止めてから `data/cubalyst.db` をコピーするだけです。
（WALモードのため、起動中は `cubalyst.db-wal` / `cubalyst.db-shm` も存在します。停止すると本体ファイルに統合されます。）
