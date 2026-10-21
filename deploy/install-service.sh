#!/usr/bin/env bash
# Cubalyst をビルドし、systemd のユーザーサービスとして登録・起動する（sudo 不要）。
# ログアウト中やOS起動直後も動かすには、別途 `sudo loginctl enable-linger $USER` が要る。
#
#   deploy/install-service.sh [待ち受けアドレス]   既定：127.0.0.1:8090
#
# 更新するときも同じコマンドを実行すればよい（ビルドし直して再起動する）。
set -euo pipefail

ADDR="${1:-127.0.0.1:8090}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"

cd "$REPO"
make build

mkdir -p "$UNIT_DIR" "${XDG_CONFIG_HOME:-$HOME/.config}/cubalyst"
sed -e "s|@REPO@|$REPO|g" -e "s|@ADDR@|$ADDR|g" deploy/cubalyst.service.in >"$UNIT_DIR/cubalyst.service"

systemctl --user daemon-reload
systemctl --user enable cubalyst.service
systemctl --user restart cubalyst.service

echo "起動しました：http://$ADDR （状態は systemctl --user status cubalyst、ログは journalctl --user -u cubalyst）"
if [ "$(loginctl show-user "$USER" -p Linger --value 2>/dev/null)" != "yes" ]; then
  echo "注意：ログアウトすると止まります。常駐させるには次を実行してください：sudo loginctl enable-linger $USER"
fi
