# MCP で Claude から解析する（API キーなし）

`cubalyst mcp` は、Cubalyst の記録を [MCP](https://modelcontextprotocol.io/) のツールとして公開する小さなサーバーです。
Claude Code や Claude Desktop に登録すると、チャットで「直近のソルブを解析して」と頼むだけで、Claude がソルブを読んで解析し、結果をアプリに保存します。

アプリの「このソルブを解析」ボタンと違って **API キーは要りません**。使った分は、Claude のプランの利用枠から差し引かれます。

```
Claude Code / Claude Desktop
   │ 標準入出力（MCP）
   ▼
 cubalyst mcp
   │ HTTP（http://127.0.0.1:8090）
   ▼
 Cubalyst のサーバー（いつもの常駐サービス）
```

`cubalyst mcp` は DB に直接触らず、動いている Cubalyst の API を呼ぶだけです。サーバーが止まっていると、ツールは「接続できません」というエラーを返します。

## できること

| ツール | 内容 |
|---|---|
| `list_solves` | ソルブの一覧（ID、日時、タイム、手数、Cross / F2L / OLL / PLL ごとの時間） |
| `get_solve` | 1回のソルブの解析用データ（アプリ内の解析で Claude に渡しているものと同じ）。ID を省くと直近のフルソルブ |
| `get_trend` | 直近 N 件の傾向分析用データ |
| `list_analyses` | 保存済みの解析結果 |
| `save_analysis` | 解析結果（Markdown）を保存する。単一ソルブはソルブの詳細画面、傾向は統計画面に表示される |

解析の観点と出力の形式（日本語の Markdown、結論から書く、など）は、アプリ内の解析と同じものを、接続時に Claude へ渡しています。

決まった頼み方を、プロンプトとしても用意しています。

- `analyze_solve`（引数 `solve_id`、省くと直近）：1回のソルブを解析して保存する
- `analyze_trend`（引数 `limit`、既定 50）：傾向を分析して保存する

Claude Code では `/mcp__cubalyst__analyze_solve` のように、スラッシュコマンドとして呼べます。

## 使う前に

- Cubalyst のサーバーが動いていること。`cubalyst mcp` は既定で `http://127.0.0.1:8090` につなぎます。ほかのアドレスなら `-api` か環境変数 `CUBALYST_API` で指定します（例：開発用のサーバーなら `-api http://127.0.0.1:8080`）
- `cubalyst mcp` は、サーバーと同じマシンで動かします（API は `127.0.0.1` でしか待ち受けていないため）
- サーバーが、MCP 用の API（`/api/solves/{id}/analysis-input` など）を含む版であること

以下、`<cubalyst>` を、サーバーのマシン上の `cubalyst` バイナリの絶対パスに読み替えてください（常駐サービスの `ExecStart` に書いてあるもの）。

## Claude Code（サーバーと同じマシン）

サーバーのマシンで次を実行します。どのディレクトリからでも使えるように、ユーザー全体（`-s user`）に登録します。

```bash
claude mcp add -s user cubalyst -- <cubalyst> mcp
```

`claude mcp list` で `cubalyst` が `✓ Connected` になっていれば使えます。Claude Code のセッションで、例えば次のように頼みます。

- 「cubalyst で直近のソルブを解析して」
- 「直近 30 件の傾向を見て、何を練習すべきか教えて。結果は保存して」
- `/mcp__cubalyst__analyze_solve 12`

ツールを使うたびに許可を求められます。毎回許可したくなければ、確認のときに「今後は聞かない」を選んでください。

やめるときは `claude mcp remove -s user cubalyst` です。

## Claude Desktop（別の PC から SSH 越し）

Claude Desktop は、MCP サーバーを自分の PC で起動します。そこで、PC から SSH でサーバーのマシンに入り、`cubalyst mcp` を起動させます。標準入出力が SSH 越しにそのままつながります。

### 1. パスワードなしで SSH できるようにする

Claude Desktop からはパスワードを入力できないので、鍵認証で、聞かれずにログインできる状態にしておきます。PC のターミナルで次が、何も聞かれずに `cubalyst` の使い方（エラーでも可）を表示すれば大丈夫です。

```bash
ssh <サーバー> <cubalyst> mcp -h
```

`<サーバー>` は `ssh` に渡す接続先です（`~/.ssh/config` の `Host` 名、または `ユーザー名@IPアドレス`）。

### 2. 設定ファイルに足す

Claude Desktop の「設定 → 開発者 → 設定を編集」で開く `claude_desktop_config.json` に、次を足します（Windows では `%APPDATA%\Claude\claude_desktop_config.json`）。

```json
{
  "mcpServers": {
    "cubalyst": {
      "command": "ssh",
      "args": ["-T", "-o", "BatchMode=yes", "<サーバー>", "<cubalyst>", "mcp"]
    }
  }
}
```

- `-T`：端末を割り当てない（MCP の通信に余計な文字が混ざらないように）
- `-o BatchMode=yes`：パスワードなどを聞かれる状態なら、待たずにすぐ失敗させる
- Windows で `ssh` が見つからないと言われたら、`"command"` を `"C:\\Windows\\System32\\OpenSSH\\ssh.exe"` にします

保存したら Claude Desktop を一度終了して起動し直します（ウィンドウを閉じるだけでなく、タスクトレイからも終了）。チャット入力欄のツールの一覧に `cubalyst` が出ていれば使えます。

うまくつながらないときは、Claude Desktop のログ（Windows では `%APPDATA%\Claude\logs\mcp-server-cubalyst.log`）にエラーが出ます。

## 注意

- **claude.ai（ブラウザ）や Claude のスマホアプリからは使えません。** これらのカスタムコネクタは Anthropic のサーバーから接続しに来るので、インターネットに公開していないサーバーには届きません
- Claude が書いた解析結果はそのまま保存されます。画面では、アプリ内の解析と同じ場所に、モデル名「Claude（MCP）」（または Claude が名乗ったモデル名）で表示されます。不要なら画面の「⋯」から削除できます
- `cubalyst mcp` が呼ぶのは、記録の読み出しと解析結果の追加だけです。ソルブの削除や書き換えはできません
