#!/usr/bin/env bash
# Claude 用のスキル（skills/ の下）を入れる。
#
#   skills/install.sh            Claude Code に入れる：~/.claude/skills/<名前> から、デプロイ済みの版
#                                （~/deploy/cubalyst/current/skills/<名前>）へシンボリックリンクを張る。
#                                デプロイするたびにスキルも新しくなる
#   skills/install.sh --dev      デプロイ済みの版ではなく、このリポジトリの作業中のファイルへリンクする
#   skills/install.sh --zip      Claude Desktop / claude.ai にアップロードする zip を skills/dist/ に作る
#   skills/install.sh --remove   Claude Code から外す（リンクを消すだけで、元のファイルは消さない）
#
# デプロイ先は CUBALYST_DEPLOY_DIR で変えられる（deploy/release.sh と同じ）。
set -euo pipefail

SKILLS="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY="${CUBALYST_DEPLOY_DIR:-$HOME/deploy/cubalyst}"
TARGET="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills"
MODE="${1:-}"

names() {
  for d in "$SKILLS"/*/; do
    [ -f "$d/SKILL.md" ] && basename "$d"
  done
}

case "$MODE" in
  --zip)
    mkdir -p "$SKILLS/dist"
    for name in $(names); do
      out="$SKILLS/dist/$name.zip"
      rm -f "$out"
      (cd "$SKILLS" && zip -qr "$out" "$name" -x '*/.*')
      echo "作成：$out"
    done
    ;;
  --remove)
    for name in $(names); do
      if [ -L "$TARGET/$name" ]; then
        rm -f "$TARGET/$name"
        echo "外しました：$TARGET/$name"
      fi
    done
    ;;
  "" | --dev)
    mkdir -p "$TARGET"
    for name in $(names); do
      if [ "$MODE" = --dev ]; then
        src="$SKILLS/$name"
      else
        src="$DEPLOY/current/skills/$name"
        if [ ! -f "$src/SKILL.md" ]; then
          echo "デプロイ済みの版に $name がありません（$src）。先に deploy/release.sh でデプロイするか、--dev を使ってください" >&2
          exit 1
        fi
      fi
      if [ -e "$TARGET/$name" ] && [ ! -L "$TARGET/$name" ]; then
        echo "$TARGET/$name がリンクではないファイルとして既にあるので、上書きしません" >&2
        exit 1
      fi
      ln -sfn "$src" "$TARGET/$name"
      echo "入れました：$TARGET/$name -> $src"
    done
    ;;
  *)
    sed -n '2,11p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
    exit 2
    ;;
esac
