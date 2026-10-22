.PHONY: dev dev-server dev-web build build-web build-server run test web-deps clean

# dev ターゲットで wait -n を使うため bash にする。
SHELL := /bin/bash

# go.mod の版（1.27）の手元のGoで固定する。自動ツールチェーンダウンロードを無効化。
export GOTOOLCHAIN := local

BIN := bin/cubalyst

# 開発用：GoサーバーとVite devサーバーを同時に起動する。
# Ctrl+C で両方止まる。どちらかが落ちたらもう一方も止める。
# シグナルを確実に届けるため、go run / npm を挟まず本体を直接起動する。
dev: web-deps build-server
	@trap 'kill $$(jobs -p) 2>/dev/null; wait' EXIT; \
	trap 'exit 0' INT TERM; \
	./$(BIN) & \
	(cd web && exec ./node_modules/.bin/vite) & \
	wait -n

# 開発用：Goサーバー（127.0.0.1:8080）
dev-server:
	go run ./cmd/cubalyst

# 開発用：Vite devサーバー（127.0.0.1:5173、/api をGoへプロキシ）
dev-web: web-deps
	cd web && npm run dev

web-deps:
	@test -d web/node_modules || (cd web && npm install)

build: build-web build-server

build-web: web-deps
	cd web && npm run build

build-server:
	go build -o $(BIN) ./cmd/cubalyst

# 本番相当：ビルド済みのフロントとAPIを :8080 で配信
run:
	./$(BIN)

test: web-deps
	go vet ./...
	go test ./...
	cd web && npm run typecheck && npm run lint && npm test

clean:
	rm -rf bin web/dist
