// Command cubalyst はCubalystのローカルサーバーを起動する。
//
// `cubalyst mcp` は、動いているサーバーの API を使う MCP サーバーを標準入出力で起動する。
package main

import (
	"context"
	"errors"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/riwn/cubalyst/internal/config"
	"github.com/riwn/cubalyst/internal/db"
	"github.com/riwn/cubalyst/internal/mcpserver"
	"github.com/riwn/cubalyst/internal/server"
)

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

func run() error {
	if len(os.Args) > 1 && os.Args[1] == "mcp" {
		return runMCP(os.Args[2:])
	}
	cfg, err := config.Load(os.Args[1:])
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	database, err := db.Open(cfg.DBPath)
	if err != nil {
		return err
	}
	defer database.Close()
	if err := db.Migrate(ctx, database); err != nil {
		return err
	}
	v, err := db.SchemaVersion(ctx, database)
	if err != nil {
		return err
	}
	log.Printf("db: %s (schema version %d)", cfg.DBPath, v)

	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           server.New(database, cfg.StaticDir).Handler(),
		ReadHeaderTimeout: 10 * time.Second,
	}
	errCh := make(chan error, 1)
	go func() {
		log.Printf("listening on http://%s", cfg.Addr)
		errCh <- srv.ListenAndServe()
	}()

	select {
	case err := <-errCh:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
	case <-ctx.Done():
		log.Print("shutting down")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		return srv.Shutdown(shutdownCtx)
	}
	return nil
}

// runMCP は MCP サーバーを標準入出力で動かす。標準出力は MCP の通信に使うので、ログは標準エラーに出す。
func runMCP(args []string) error {
	fs := flag.NewFlagSet("cubalyst mcp", flag.ContinueOnError)
	api := fs.String("api", envOr("CUBALYST_API", "http://127.0.0.1:8090"), "Cubalyst の API の URL")
	if err := fs.Parse(args); err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	return mcpserver.New(mcpserver.NewClient(*api)).Run(ctx, &mcp.StdioTransport{})
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
