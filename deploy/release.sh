#!/usr/bin/env bash
# Cubalyst を開発用のリポジトリとは別の場所（デプロイ先）にビルドし、
# systemd のユーザーサービスとして切り替えて起動する（sudo 不要）。
#
#   deploy/release.sh [ref]        ref をデプロイする。既定は origin/main（GitHub の main）
#   deploy/release.sh --rollback   ひとつ前にデプロイした版に戻す
#   deploy/release.sh --status     いま動いている版を表示する
#
# 作業中のファイルではなく、コミット済みの ref を git archive で取り出してビルドするので、
# 開発中の変更（未コミットのものも含む）は、デプロイするまで本番に出ない。
#
# デプロイ先（既定 ~/deploy/cubalyst、CUBALYST_DEPLOY_DIR で変更可）：
#   releases/<日時>-<コミット>/   ビルド済みの版（新しい方から3つ残す）
#   current -> releases/...        動いている版
#   data/cubalyst.db               本番の DB（版をまたいで共有）
#
# ログアウト中やOS起動直後も動かすには、別途 `sudo loginctl enable-linger $USER` が要る。
set -euo pipefail

ADDR="${CUBALYST_PROD_ADDR:-127.0.0.1:8090}"
DEPLOY="${CUBALYST_DEPLOY_DIR:-$HOME/deploy/cubalyst}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
KEEP=3

current_release() { readlink -f "$DEPLOY/current" 2>/dev/null || true; }

describe() {
  local rel=$1
  [ -n "$rel" ] && [ -f "$rel/REVISION" ] && cat "$rel/REVISION" || echo "（なし）"
}

# current を $1 に切り替えて再起動し、応答を確かめる
switch_to() {
  local rel=$1
  ln -sfn "$rel" "$DEPLOY/current.tmp"
  mv -Tf "$DEPLOY/current.tmp" "$DEPLOY/current"
  systemctl --user restart cubalyst.service
  for _ in $(seq 1 15); do
    if curl -fsS "http://$ADDR/api/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

install_unit() {
  mkdir -p "$UNIT_DIR" "${XDG_CONFIG_HOME:-$HOME/.config}/cubalyst"
  sed -e "s|@DEPLOY@|$DEPLOY|g" -e "s|@ADDR@|$ADDR|g" "$REPO/deploy/cubalyst.service.in" >"$UNIT_DIR/cubalyst.service"
  systemctl --user daemon-reload
  systemctl --user enable -q cubalyst.service
}

# 本番の DB が無ければ、開発用のリポジトリの DB をコピーして始める（最初の1回だけ）。
# 動いているサービスを止めてから、SQLite のバックアップ機能で WAL の中身ごと写す
init_db() {
  [ -e "$DEPLOY/data/cubalyst.db" ] && return 0
  mkdir -p "$DEPLOY/data"
  local src="$REPO/data/cubalyst.db"
  [ -e "$src" ] || return 0
  systemctl --user stop cubalyst.service 2>/dev/null || true
  python3 - "$src" "$DEPLOY/data/cubalyst.db" <<'EOF'
import sqlite3, sys
src, dst = sqlite3.connect(sys.argv[1]), sqlite3.connect(sys.argv[2])
src.backup(dst)
dst.close()
src.close()
EOF
  echo "本番の DB を作りました：$src → $DEPLOY/data/cubalyst.db"
}

prune() {
  local cur keep=0
  cur=$(current_release)
  for rel in $(ls -1d "$DEPLOY"/releases/*/ 2>/dev/null | sort -r); do
    rel=${rel%/}
    if [ "$rel" = "$cur" ] || [ $keep -lt $KEEP ]; then
      keep=$((keep + 1))
      continue
    fi
    rm -rf "$rel"
  done
}

case "${1:-}" in
  --status)
    echo "動いている版：$(describe "$(current_release)")"
    systemctl --user is-active cubalyst.service || true
    exit 0
    ;;
  --rollback)
    cur=$(current_release)
    prev=$(ls -1d "$DEPLOY"/releases/*/ 2>/dev/null | sed 's|/$||' | sort | awk -v cur="$cur" '$0 == cur { print last; exit } { last = $0 }')
    if [ -z "$prev" ]; then
      echo "戻せる版がありません（今の版：$(describe "$cur")）" >&2
      exit 1
    fi
    switch_to "$prev" || { echo "戻した版が応答しません。journalctl --user -u cubalyst を確かめてください" >&2; exit 1; }
    echo "戻しました：$(describe "$prev")"
    exit 0
    ;;
  -*)
    sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'
    exit 2
    ;;
esac

REF="${1:-origin/main}"
cd "$REPO"
git fetch -q origin
SHA=$(git rev-parse --verify -q "$REF^{commit}") || { echo "ref が見つかりません：$REF" >&2; exit 1; }
REL="$DEPLOY/releases/$(date +%Y%m%d-%H%M%S)-${SHA:0:12}"

echo "ビルドします：$REF（$(git log -1 --format='%h %s' "$SHA")）→ $REL"
mkdir -p "$REL"
git archive "$SHA" | tar -x -C "$REL"
# ビルドのログは長いので、失敗したときだけ表示する
if ! (cd "$REL/web" && npm ci --no-audit --no-fund --loglevel=error && npm run build) >"$REL/build.log" 2>&1; then
  cat "$REL/build.log" >&2
  echo "ビルドに失敗しました（本番は変えていません）：$REL" >&2
  exit 1
fi
rm -rf "$REL/web/node_modules"
(cd "$REL" && GOTOOLCHAIN=local go build -o bin/cubalyst ./cmd/cubalyst)
git log -1 --format="%h %s（%ci、$REF）" "$SHA" >"$REL/REVISION"

PREV=$(current_release)
install_unit
init_db
if switch_to "$REL"; then
  echo "デプロイしました：$(describe "$REL")"
  echo "  http://$ADDR （状態は deploy/release.sh --status、ログは journalctl --user -u cubalyst）"
  prune
else
  echo "新しい版が応答しません。journalctl --user -u cubalyst を確かめてください" >&2
  if [ -n "$PREV" ] && [ "$PREV" != "$REL" ]; then
    switch_to "$PREV" && echo "前の版に戻しました：$(describe "$PREV")" >&2
  fi
  exit 1
fi

if [ "$(loginctl show-user "$USER" -p Linger --value 2>/dev/null)" != "yes" ]; then
  echo "注意：ログアウトすると止まります。常駐させるには次を実行してください：sudo loginctl enable-linger $USER"
fi
