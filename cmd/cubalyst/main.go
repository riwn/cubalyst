// Command cubalyst はCubalystのローカルサーバーを起動する。
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"cubalyst/internal/analysis"
	"cubalyst/internal/config"
	"cubalyst/internal/db"
	"cubalyst/internal/server"
)

func main() {
	if err := run(); err != nil {
		log.Fatal(err)
	}
}

func run() error {
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

	// Claude API（未設定でも起動はする。解析APIだけが使えない）
	var llm analysis.LLM
	if os.Getenv("CUBALYST_CLAUDE_MOCK") == "1" {
		llm = analysis.Mock{}
		log.Print("claude: mock (CUBALYST_CLAUDE_MOCK=1)")
	} else if c, err := analysis.NewClaudeFromEnv(); err == nil {
		llm = c
		log.Printf("claude: %s", c.Model())
	} else {
		log.Printf("claude: disabled (%v)", err)
	}

	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           server.New(database, cfg.StaticDir, llm).Handler(),
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
