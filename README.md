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

2. nuc上で、ターミナルを2つ使ってそれぞれ起動する：

   ```
   make dev-server   # Goサーバー（127.0.0.1:8080）
   make dev-web      # Vite devサーバー（127.0.0.1:5173）
   ```

3. Windowsのブラウザで <http://localhost:5173> を開く。

Viteのdevサーバーが `/api` をGoサーバーへプロキシします。

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

## 設定

フラグまたは環境変数で指定できます（フラグが優先）。

| フラグ | 環境変数 | 既定値 | 内容 |
|---|---|---|---|
| `-addr` | `CUBALYST_ADDR` | `127.0.0.1:8080` | 待ち受けアドレス（ループバックのみ） |
| `-db` | `CUBALYST_DB` | `./data/cubalyst.db` | SQLiteファイルのパス |
| `-static` | `CUBALYST_STATIC` | `./web/dist` | ビルド済みフロントエンドのディレクトリ |
| — | `ANTHROPIC_API_KEY` | — | Claude APIキー（Phase 8で使用） |

Goサーバーのポートを変えた場合は、Vite側にも `CUBALYST_API=http://127.0.0.1:<port>` を渡してください。

## 開発

```
make test    # go vet / go test / フロントの型チェックとlint
make clean   # ビルド成果物を削除
```

### ディレクトリ構成

```
cmd/cubalyst/          エントリポイント
internal/config/       フラグ・環境変数の読み込み
internal/db/           SQLite接続とマイグレーション
internal/db/migrations マイグレーションSQL（バイナリに埋め込み、起動時に適用）
internal/server/       HTTPルーティング・APIハンドラ・静的配信
web/                   フロントエンド（Vite + React + TypeScript）
data/                  DBファイル置き場（git管理外）
```

### マイグレーション

`internal/db/migrations/NNNN_name.sql` を追加すると、次回起動時に番号順で適用されます。
適用済みの番号は `schema_migrations` テーブルに記録されます。適用済みのファイルは書き換えず、変更は新しいファイルで行ってください。

### API

| メソッド | パス | 内容 |
|---|---|---|
| GET | `/api/health` | サーバーとDBの状態。正常時 `200 {"status":"ok","db":"ok","schema_version":1}`、DB異常時 `503` |

## バックアップ

DBは単一ファイルなので、サーバーを止めてから `data/cubalyst.db` をコピーするだけです。
（WALモードのため、起動中は `cubalyst.db-wal` / `cubalyst.db-shm` も存在します。停止すると本体ファイルに統合されます。）
