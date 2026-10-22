# 開発者向けの情報

Cubalyst を動かす・手を入れるための詳しい情報です。使い方の紹介は [README](../README.md) を見てください。

## 必要なもの

- Go 1.24 以上
- Node.js 22 以上 / npm
- GNU make と bash（`make dev` などで使います）
- ブラウザ：Chrome または Edge（Web Bluetooth に対応しているもの）

> `npm install` が `git@github.com: Permission denied (publickey)` で失敗する場合：依存の1つ（smartcube-web-bluetooth）を GitHub から取得しており、`package-lock.json` には SSH の URL で記録されています。GitHub に SSH 鍵を登録していないときは、次を実行してから入れ直すと https で取得します。
>
> ```
> git config --global url."https://github.com/".insteadOf ssh://git@github.com/
> ```

## 起動のしかた

| 方法 | コマンド | 開くURL | 用途 |
|---|---|---|---|
| 開発用 | `make dev` | <http://localhost:5173> | フロントの変更がすぐ反映される（Viteが `/api` をGoサーバーへ中継） |
| 本番相当 | `make build` のあと `make run` | <http://localhost:8080> | ビルド済みのフロントもGoサーバーが配信するので、ポートは1つ |

GoサーバーとViteを別々のターミナルで起動したい場合は、`make dev-server`（Goサーバー :8080）と `make dev-web`（Vite :5173）を使います。

## 別のマシンでサーバーを動かす場合

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

## モック接続

実機がなくても「モック接続」で動作確認できます。⚙ メニューで「デバッグ表示」をオンにすると、ヘッダーに「モック接続」ボタンが出ます。

- 画面のボタン、またはキーボードの `U R F D L B`（Shiftで逆回転）で回せます。
- 回転ログを貼り付けて、記録時の間隔どおりに再生できます（0.5x〜4x）。形式は `"R U R' U'"` のような回転記号か、JSON配列 `[{"move":"R","cubeTimestamp":1000,"localTimestamp":20}, ...]` です。
- 回転ログ欄の「JSONをコピー」で、実機の回転ログをそのまま再生用に保存できます。

## 持ち方と解法の表記

スマートキューブは、キューブ自身の向き（白上・緑前）で回転を記録します。設定の「持ち方（下の色・前の色）」に合わせて、
解法の表示・再生（3D表示の向きも）・テキストのリコン・Claudeに渡すデータの記号を読み替えます。
保存されている回転ログ（JSON export を含む）はキューブ自身の向きのままで、スクランブルは常に白上・緑前（WCA）です。

各フェーズの実装計画は `docs/plans/` にあります。

## 設定

フラグまたは環境変数で指定できます（フラグが優先）。

| フラグ | 環境変数 | 既定値 | 内容 |
|---|---|---|---|
| `-addr` | `CUBALYST_ADDR` | `127.0.0.1:8080` | 待ち受けアドレス（ループバックのみ） |
| `-db` | `CUBALYST_DB` | `./data/cubalyst.db` | SQLiteファイルのパス |
| `-static` | `CUBALYST_STATIC` | `./web/dist` | ビルド済みフロントエンドのディレクトリ |

Goサーバーのポートを変えた場合は、Vite側にも `CUBALYST_API=http://127.0.0.1:<port>` を渡してください。

## テストとビルド

```
make test    # go vet / go test / フロントの型チェック・lint・vitest
make clean   # ビルド成果物を削除
```

## ディレクトリ構成

```
cmd/cubalyst/          エントリポイント
internal/config/       フラグ・環境変数の読み込み
internal/db/           SQLite接続とマイグレーション
internal/db/migrations マイグレーションSQL（バイナリに埋め込み、起動時に適用）
internal/server/       HTTPルーティング・APIハンドラ・静的配信
internal/solves/       ソルブと段階区切りの保存
internal/export/       export（JSON / CSV / テキスト）と import
internal/settings/     設定（クロス色）
internal/analysis/     解析（入力データの集計・整形、Claude が書いた結果の保存）
internal/mcpserver/    MCP サーバー（`cubalyst mcp`。HTTP API を呼んでツールとして公開）
skills/                Claude 用のスキル（MCP を使った解析の進め方）と、その入れ方（install.sh）
web/                   フロントエンド（Vite + React + TypeScript）
web/src/cube/          キューブ接続（実機・モック）、状態管理、facelets変換、時計ズレ補正
web/src/solve/         スクランブル追跡、計測セッション、CFOP段階検出、統計
web/src/cases/         ケース練習（マスタ・手順の検証・出題）
web/src/steps/         ステップ練習の出題
web/src/assist/        補助付きフルソルブのケース判定
web/src/replay/        ソルブ再生
web/src/components/    画面部品
web/src/pages/         画面
data/                  DBファイル置き場（git管理外）
```

## マイグレーション

`internal/db/migrations/NNNN_name.sql` を追加すると、次回起動時に番号順で適用されます。
適用済みの番号は `schema_migrations` テーブルに記録されます。適用済みのファイルは書き換えず、変更は新しいファイルで行ってください。

ほかの表から参照されている表を作り直すとき（CHECK 制約の変更など）は、ファイルに `-- cubalyst:foreign-keys-off` と書きます。外部キーを止めて適用し、適用後に `PRAGMA foreign_key_check` で整合を確かめます（止めずに作り直すと、参照している行が ON DELETE CASCADE で消えます）。

## API

| メソッド | パス | 内容 |
|---|---|---|
| GET | `/api/health` | サーバーとDBの状態。DB異常時 `503` |
| GET / POST | `/api/solves` | ソルブ一覧（`mode`（full / case / step / assist）`from` `to` `case_id` `step` `ids` `limit` `offset` `include=moves,splits,analyses` `order=asc`）/ 保存 |
| GET / PATCH / DELETE | `/api/solves/{id}` | 取得 / ペナルティ・メモの更新 / 削除 |
| PUT | `/api/solves/{id}/splits` | 段階区切りの置き換え（再計算用） |
| GET / PUT | `/api/settings` | 設定（クロス色） |
| GET | `/api/export?format=json\|csv\|txt` | export（一覧と同じフィルタ） |
| POST | `/api/import` | JSON export の取り込み（重複はスキップ） |
| GET | `/api/cases` | ケース練習のマスタ（`set=OLL` など。「覚えた」の印 `learned` も返す） |
| PUT | `/api/cases/{id}/learned` | 「覚えた」の印を付ける・外す（`{"learned": true}`） |
| GET / POST | `/api/analyses` | 解析結果の一覧（`kind=solve\|multi` `solve_id` `limit`）/ 保存（単体 `{"kind":"solve","solve_id":1,"result":"..."}`、まとめ `{"kind":"multi","solve_ids":[1,2],"title":"...","result":"..."}`） |
| GET / DELETE | `/api/analyses/{id}` | 解析結果の取得 / 削除 |
| GET | `/api/solves/{id}/analysis-input` | 単体の解析に渡す入力データ（MCP 用） |
| GET | `/api/analysis-input` | まとめの解析に渡す入力データと対象のソルブ（`ids` または `mode` `from` `to` `limit`、`title`。MCP 用） |

## ケースのマスタ

`web/src/cases/data.ts` が正です。変更したら次でマイグレーションのシード（`internal/db/migrations/0004_cases.sql`）を作り直します（テストで一致を確認しています）。F2L の41ケースは `npm run gen:f2l` で数え上げと手順探索から生成しています。

```
cd web && npm run gen:cases
```

## バックアップ

DBは単一ファイルなので、サーバーを止めてから `data/cubalyst.db` をコピーするだけです。`deploy/release.sh` で常駐させている場合、本番の DB は `~/deploy/cubalyst/data/cubalyst.db` です（`systemctl --user stop cubalyst` で止めてからコピーします）。
（WALモードのため、起動中は `cubalyst.db-wal` / `cubalyst.db-shm` も存在します。停止すると本体ファイルに統合されます。）
