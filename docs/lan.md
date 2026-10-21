# 同じLANのほかの端末から使う（常時起動・HTTPS）

据え置きのサーバー（Linux）で Cubalyst を常時動かし、同じLANにあるPCやスマホのブラウザから開けるようにする手順です。

Web Bluetooth は**セキュアコンテキスト（`localhost` または HTTPS）でしか動きません**。そのため、LANのIPアドレスで開くときは HTTPS が必要です。
ここでは [Caddy](https://caddyserver.com/) を HTTPS の受け口にし、Caddy 自身の認証局（`tls internal`）で証明書を発行します。ドメインは要りませんが、ルート証明書を各端末に一度ずつ信頼させる必要があります。

```
PC・スマホ（LAN）
   │ https://<サーバーのIP>
   ▼
 ufw：LANのサブネットからの 443 番だけ許可
   ▼
 Caddy（443、自前の証明書）
   ▼
 Cubalyst（127.0.0.1:8090、systemd のユーザーサービス）
```

Cubalyst 自体は `127.0.0.1` で待ち受けたままです。LAN に出ているのは Caddy の 443 番だけです。

> **注意**：Cubalyst には認証がありません。この手順で公開すると、同じLANにいる人なら誰でも記録の閲覧・削除や、Claude による解析（APIキーを設定している場合は課金されます）ができます。自分しか使わないLAN（家庭用のVLANなど）で使ってください。
>
> iPhone / iPad の Safari は Web Bluetooth に対応していないので、キューブはつなげません（記録や統計は見られます）。キューブをつなげるのは、Windows / macOS / Android の Chrome と Edge です。

以下、`192.168.1.10` をサーバーのLAN側のIPアドレス、`192.168.1.0/24` をLANのサブネットに読み替えてください。
証明書はIPアドレスに対して発行するので、ルーターの DHCP 予約などで、サーバーのIPアドレスを固定しておきます。

## 1. Cubalyst を常駐させる

リポジトリで次を実行します（sudo は要りません）。ビルドして、systemd のユーザーサービス `cubalyst` として登録・起動します。

```
deploy/install-service.sh
```

- 待ち受けは `127.0.0.1:8090` です。開発用の `make dev`（:8080 / :5173）と同時に動かせます。どちらも同じDB（`data/cubalyst.db`）を使います。
- Claude による解析を使う場合は、`~/.config/cubalyst/env` に `ANTHROPIC_API_KEY=sk-ant-...` のように1行ずつ書き、`systemctl --user restart cubalyst` で再起動します。
- 状態は `systemctl --user status cubalyst`、ログは `journalctl --user -u cubalyst` で見られます。
- 更新するときは、`git pull` のあと、もう一度 `deploy/install-service.sh` を実行します。

ユーザーサービスは、そのままではログアウトすると止まります。ログインしていないとき（OS起動直後を含む）も動かすには、次を一度だけ実行します。

```
sudo loginctl enable-linger $USER
```

## 2. Caddy を入れる

Ubuntu / Debian では、Caddy の公式リポジトリから入れます（[公式の手順](https://caddyserver.com/docs/install#debian-ubuntu-raspbian)）。

```
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

Docker のコンテナとして動かす方法は使いません。Docker が公開したポートは ufw の制限をすり抜けるためです。

## 3. Caddy を設定する

[`deploy/Caddyfile.example`](../deploy/Caddyfile.example) のIPアドレスを書き換えて、`/etc/caddy/Caddyfile` に置きます。

```
sed 's/192\.168\.1\.10/<サーバーのIP>/g' deploy/Caddyfile.example | sudo tee /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

この設定では、次のことを行います。
- サーバーのLAN側のIPアドレスの 443 番だけで待ち受けます。80 番は使いません。
- Caddy 自身の認証局で証明書を発行します。
- `https://<サーバーのIP>/caddy-root.crt` で、端末に入れるルート証明書を配ります。
- それ以外のアクセスは、Cubalyst（`127.0.0.1:8090`）へ中継します。

## 4. ファイアウォールで絞る

LANのサブネットからの 443 番だけを許可します。

```
sudo ufw allow from 192.168.1.0/24 to 192.168.1.10 port 443 proto tcp comment cubalyst
sudo ufw status verbose
```

`Default: deny (incoming)` になっていることを確かめてください。`allow (incoming)` になっていると、この制限は効きません。
VLAN を分けている場合は、ルーター側でも、ほかの VLAN からサーバーへの通信を止めておくと二重に防げます。

## 5. 各端末にルート証明書を信頼させる

端末ごとに一度だけ行います。まず端末のブラウザで `https://<サーバーのIP>/caddy-root.crt` を開き、証明書をダウンロードします。この時点ではまだ信頼していないので、ブラウザに警告が出ます。「詳細設定」から先に進んでください。

- **Windows**：ダウンロードした `caddy-root.crt` をダブルクリック →「証明書のインストール」→「現在のユーザー」→「証明書をすべて次のストアに配置する」で「信頼されたルート証明機関」を選ぶ → 完了。確認の画面が出たら「はい」。そのあと Chrome / Edge をすべて閉じて開き直します。
- **macOS**：ダウンロードしたファイルを開いてキーチェーンに追加 →「キーチェーンアクセス」でその証明書（Caddy Local Authority）を開き、「信頼」を「常に信頼」にします。
- **Android**：「設定」→「セキュリティ」→「暗号化と認証情報」→「証明書のインストール」→「CA 証明書」で、ダウンロードしたファイルを選びます（メニューの名前は機種によって違います。設定アプリで「CA 証明書」と検索すると見つかります）。

ルート証明書の有効期限は10年です。サーバー側で Caddy のデータ（`/var/lib/caddy`）を消さない限り、入れ直す必要はありません。

## 6. つながるか確かめる

端末のブラウザで `https://<サーバーのIP>` を開きます。

- アドレスバーに警告が出なければ、証明書は信頼されています。
- ヘッダー右上の「Connect」が押せる状態なら、Web Bluetooth が使えます（使えないときは押せない状態になり、理由がツールチップに出ます）。

## やめるとき

```
systemctl --user disable --now cubalyst
sudo ufw delete allow from 192.168.1.0/24 to 192.168.1.10 port 443 proto tcp
sudo systemctl disable --now caddy
```

各端末に入れたルート証明書も、それぞれの証明書の管理画面から削除できます。
