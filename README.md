# Cubalyst

スマートキューブをPCとBluetoothで接続し、ソルブの記録・統計・再生・練習・LLM解析を行うWebアプリ。各自が自分のPCで動かして使います。
詳細は [cubalyst-spec.md](cubalyst-spec.md) を参照。

**ローカル起動専用**のアプリです。サーバーは `127.0.0.1` にのみバインドし（ループバック以外を指定すると起動を拒否します）、認証はありません。

## 必要なもの

- Go 1.24 以上
- Node.js 22 以上 / npm
- GNU make と bash（`make dev` などで使います）
- ブラウザ：Chrome または Edge（Web Bluetooth に対応しているもの）
- Bluetooth が使えるPC（キューブとつなぐのはブラウザを開くPCです）

## はじめかた

```
git clone https://github.com/riwn/cubalyst.git
cd cubalyst
make dev
```

`make dev` は、初回にフロントエンドの依存（`web/node_modules`）を入れてから、GoサーバーとVite devサーバーをまとめて起動します。
`Local: http://127.0.0.1:5173/` と表示されたら、同じPCのブラウザで <http://localhost:5173> を開きます。Ctrl+C で両方止まります。

記録は `data/cubalyst.db`（SQLite）に保存されます。ファイルがなければ起動時に作られます。

> `npm install` が `git@github.com: Permission denied (publickey)` で失敗する場合：依存の1つ（smartcube-web-bluetooth）を GitHub から取得しており、`package-lock.json` には SSH の URL で記録されています。GitHub に SSH 鍵を登録していないときは、次を実行してから入れ直すと https で取得します。
>
> ```
> git config --global url."https://github.com/".insteadOf ssh://git@github.com/
> ```

### 起動のしかた

| 方法 | コマンド | 開くURL | 用途 |
|---|---|---|---|
| 開発用 | `make dev` | <http://localhost:5173> | フロントの変更がすぐ反映される（Viteが `/api` をGoサーバーへ中継） |
| 本番相当 | `make build` のあと `make run` | <http://localhost:8080> | ビルド済みのフロントもGoサーバーが配信するので、ポートは1つ |

GoサーバーとViteを別々のターミナルで起動したい場合は、`make dev-server`（Goサーバー :8080）と `make dev-web`（Vite :5173）を使います。

### 別のマシンでサーバーを動かす場合

Web Bluetooth は**セキュアコンテキスト（`localhost` または HTTPS）でしか動きません**。
サーバーを別のマシン（自宅サーバーやLinuxの開発機など）で動かし、ブラウザからLANのIPアドレスで開くと、Bluetoothが使えません。
この場合は、ブラウザを開くPCからSSHのポートフォワードで接続し、`localhost` として開きます（`<server>` はサーバーのホスト名です）。

```
ssh -L 5173:localhost:5173 <server>
```

そのSSHセッションのまま、サーバー側のリポジトリで `make dev` を実行し、手元のブラウザで <http://localhost:5173> を開きます。
本番相当で動かすときは、`5173` を `8080` に読み替えてください。

> SSHのターミナルに `channel N: open failed: connect failed: Connection refused` と出るのは、サーバー側でViteが動いていないときにブラウザがアクセスした場合です。Viteを起動すれば出なくなります（Viteを止めている間は、開いているタブを閉じておくと出ません）。

サーバーは `127.0.0.1` にしか待ち受けないので、ポートフォワードを使わずに他のマシンから直接つなぐことはできません。

### 同じLANのほかの端末から使う

サーバーを据え置きで常時動かし、同じLANのPCやスマホから `https://<サーバーのIP>` で開けるようにすることもできます。Cubalyst を systemd で常駐させ、Caddy で HTTPS 化する手順を [docs/lan.md](docs/lan.md) にまとめています。

## キューブの接続

タイマー画面の「Connect」を押し、Chromeのデバイス選択でキューブを選びます。

キューブとの通信には [smartcube-web-bluetooth](https://github.com/poliva/smartcube-web-bluetooth) を使っており、GAN / MoYu / QiYi / GiiKER / GoCube のスマートキューブに対応しています。実機で動作を確かめているのは GAN i4 です。

GAN系のキューブは通信の暗号化にMACアドレスを使います。取得方法は次のどちらかです。

- **自動取得（推奨）**：Chromeで `chrome://flags/#enable-experimental-web-platform-features` を有効にして再起動する。キューブのアドバタイズからMACアドレスを読み取ります。
- **手入力**：自動取得できなかったときは入力欄が出ます。MACアドレスは `chrome://bluetooth-internals` や、OSのBluetooth設定（Windowsなら「設定 → Bluetoothとデバイス」）で確認できます。入力した値はブラウザに保存され、次回からは聞かれません。

接続後は回転・facelets・バッテリーが画面に表示され、3Dキューブが実機に同期します。

- **状態リセット**：実機を完成状態にしてから押すと、実機とアプリの状態を完成状態にそろえ直します。
- **実機の状態を取得**：実機からfaceletsを取り直します。アプリ側の状態とズレていれば、実機の状態に合わせます。

キューブの接続状態は、ヘッダー右上のボタン（未接続なら「Connect」、接続中はデバイス名とバッテリー）から確認・操作できます。
サーバーの状態とデバッグ表示の切り替えは、その右の ⚙ メニューにあります。

### モック接続

実機がなくても「モック接続」で動作確認できます。⚙ メニューで「デバッグ表示」をオンにすると、ヘッダーに「モック接続」ボタンが出ます。

- 画面のボタン、またはキーボードの `U R F D L B`（Shiftで逆回転）で回せます。
- 回転ログを貼り付けて、記録時の間隔どおりに再生できます（0.5x〜4x）。形式は `"R U R' U'"` のような回転記号か、JSON配列 `[{"move":"R","cubeTimestamp":1000,"localTimestamp":20}, ...]` です。
- 回転ログ欄の「JSONをコピー」で、実機の回転ログをそのまま再生用に保存できます。

## 機能

| 画面 | できること |
|---|---|
| タイマー | スクランブル（進捗ハイライト・間違えたときの戻し手順）、WCA方式のインスペクション（15秒、超過で+2/DNF）、最初の回転で計測開始・完成で停止、+2/DNF、ao5/ao12 |
| 練習 | 手順練習（OLL 57 / PLL 21 / F2L 41 から1つ選び、その手順を何度も回して1回ごとの時間を計測。揃っていなくてもよい）、ステップ練習（Cross / F2L / OLL / PLL の直前状態から） |
| 履歴 | 一覧（フィルタ・ページング）、詳細（CFOPのステップタイム・割合のグラフ・解法・TPS、再生、メモ、Claudeによる解析）、export |
| 統計 | ベスト記録、推移（single/ao5/ao12）、分布、段階別統計、Claudeによる傾向分析 |
| 設定 | クロス色、インスペクション、持ち方（解法の表記の向き）、ステップの再計算、export（JSON/CSV/テキスト）、import（JSON） |

### 持ち方と解法の表記

スマートキューブは、キューブ自身の向き（白上・緑前）で回転を記録します。設定の「持ち方（下の色・前の色）」に合わせて、
解法の表示・再生（3D表示の向きも）・テキストのリコン・Claudeに渡すデータの記号を読み替えます。
保存されている回転ログ（JSON export を含む）はキューブ自身の向きのままで、スクランブルは常に白上・緑前（WCA）です。

各フェーズの実装計画は `docs/plans/` にあります。

## Claudeによる解析

ソルブ詳細の「このソルブを解析」と、統計の「傾向を分析」で Claude API を使います。サーバーを `ANTHROPIC_API_KEY` 付きで起動してください。

```
ANTHROPIC_API_KEY=sk-ant-... make dev
```

APIキーは [Claude Console](https://platform.claude.com/) で作成できます。

- モデルは既定で `claude-opus-5-5`、effort は `high` です（下の環境変数で変更できます）。1回の解析でおおよそ十数円〜数十円のAPI利用料がかかります（使ったトークン数は結果の横に表示されます）
- 安全分類による拒否に備えて、サーバー側フォールバック（`fallbacks: "default"`）を有効にしています
- 解析に渡したデータ（入力）と結果は `analyses` テーブルに保存され、画面の「入力データ」で確認できます
- APIキーなしで画面だけ確かめたいときは `CUBALYST_CLAUDE_MOCK=1` で起動すると、決まった文面を返すモックになります（課金なし）

### MCP で解析する（API キーなし）

`cubalyst mcp` を Claude Code や Claude Desktop に MCP サーバーとして登録すると、チャットで Claude にソルブを解析させ、結果をアプリに保存できます。API キーは要らず、Claude のプランの利用枠で動きます。登録のしかたは [docs/mcp.md](docs/mcp.md) にまとめています。

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
internal/mcpserver/    MCP サーバー（`cubalyst mcp`。HTTP API を呼んでツールとして公開）
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
| POST | `/api/analyses` | アプリの外で書いた解析結果の保存（`{"kind":"solve","solve_id":1,"result":"..."}`、傾向は `"params":{"mode":"full","limit":50}`） |
| GET | `/api/solves/{id}/analysis-input` | ソルブの解析に渡す入力データ（MCP 用） |
| GET | `/api/analysis-input/trend` | 傾向分析に渡す入力データ（`mode` `limit`、MCP 用） |

### ケースのマスタ

`web/src/cases/data.ts` が正です。変更したら次でマイグレーションのシード（`internal/db/migrations/0004_cases.sql`）を作り直します（テストで一致を確認しています）。F2L の41ケースは `npm run gen:f2l` で数え上げと手順探索から生成しています。

```
cd web && npm run gen:cases
```

## バックアップ

DBは単一ファイルなので、サーバーを止めてから `data/cubalyst.db` をコピーするだけです。
（WALモードのため、起動中は `cubalyst.db-wal` / `cubalyst.db-shm` も存在します。停止すると本体ファイルに統合されます。）

## ライセンス

[MIT License](LICENSE) です。

依存しているライブラリやフォントは、それぞれのライセンスに従います。たとえば、cubing.js は MPL-2.0 または GPL-3.0-or-later、同梱しているフォント（Saira Semi Condensed、BIZ UDPゴシック）は SIL Open Font License 1.1 です。
