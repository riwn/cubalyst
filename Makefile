.PHONY: dev-server dev-web build build-web build-server run test web-deps clean

# 手元のGo（1.24）で固定する。自動ツールチェーンダウンロードを無効化。
export GOTOOLCHAIN := local

BIN := bin/cubalyst

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
