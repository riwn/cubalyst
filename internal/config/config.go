// Package config はフラグと環境変数からアプリの設定を読み込む。
package config

import (
	"flag"
	"fmt"
	"net"
	"os"
)

// Config はサーバーの起動設定。
type Config struct {
	Addr      string // 待ち受けアドレス（ループバックのみ許可）
	DBPath    string // SQLiteファイルのパス
	StaticDir string // ビルド済みフロントエンドのディレクトリ
}

// Load はコマンドライン引数と環境変数から設定を作る。優先順位はフラグ > 環境変数 > 既定値。
func Load(args []string) (Config, error) {
	fs := flag.NewFlagSet("cubalyst", flag.ContinueOnError)
	var c Config
	fs.StringVar(&c.Addr, "addr", envOr("CUBALYST_ADDR", "127.0.0.1:8080"), "listen address (loopback only)")
	fs.StringVar(&c.DBPath, "db", envOr("CUBALYST_DB", "./data/cubalyst.db"), "SQLite database file")
	fs.StringVar(&c.StaticDir, "static", envOr("CUBALYST_STATIC", "./web/dist"), "built frontend directory")
	if err := fs.Parse(args); err != nil {
		return Config{}, err
	}
	if err := checkLoopback(c.Addr); err != nil {
		return Config{}, err
	}
	return c, nil
}

// checkLoopback はローカル専用アプリとして、ループバック以外へのバインドを拒否する。
func checkLoopback(addr string) error {
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		return fmt.Errorf("invalid addr %q: %w", addr, err)
	}
	if host == "localhost" {
		return nil
	}
	ip := net.ParseIP(host)
	if ip == nil || !ip.IsLoopback() {
		return fmt.Errorf("addr %q is not a loopback address; cubalyst binds to 127.0.0.1 only", addr)
	}
	return nil
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
