// Package server はHTTPのルーティングとハンドラを提供する。
package server

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	"cubalyst/internal/db"
)

// Server はAPIとビルド済みフロントエンドを配信する。
type Server struct {
	db        *sql.DB
	staticDir string
}

func New(database *sql.DB, staticDir string) *Server {
	return &Server{db: database, staticDir: staticDir}
}

// Handler はルーティング済みのハンドラを返す。
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", s.handleHealth)
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
	})
	mux.Handle("/", s.staticHandler())
	return logRequests(mux)
}

type healthResponse struct {
	Status        string `json:"status"`
	DB            string `json:"db"`
	SchemaVersion int    `json:"schema_version"`
	Error         string `json:"error,omitempty"`
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if err := s.db.PingContext(ctx); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, healthResponse{Status: "error", DB: "error", Error: err.Error()})
		return
	}
	v, err := db.SchemaVersion(ctx, s.db)
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, healthResponse{Status: "error", DB: "error", Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, healthResponse{Status: "ok", DB: "ok", SchemaVersion: v})
}

// staticHandler はstaticDir配下のファイルを返し、存在しないパスはSPAとしてindex.htmlにフォールバックする。
func (s *Server) staticHandler() http.Handler {
	files := http.FileServer(http.Dir(s.staticDir))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		index := filepath.Join(s.staticDir, "index.html")
		if _, err := os.Stat(index); err != nil {
			http.Error(w, "frontend is not built; run `make build` or use the Vite dev server on :5173", http.StatusNotFound)
			return
		}
		p := path.Clean("/" + r.URL.Path)
		if p != "/" {
			if fi, err := os.Stat(filepath.Join(s.staticDir, filepath.FromSlash(strings.TrimPrefix(p, "/")))); err == nil && !fi.IsDir() {
				files.ServeHTTP(w, r)
				return
			}
		}
		http.ServeFile(w, r, index)
	})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("write json: %v", err)
	}
}

func logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		if strings.HasPrefix(r.URL.Path, "/api/") {
			log.Printf("%s %s (%s)", r.Method, r.URL.Path, time.Since(start).Round(time.Microsecond))
		}
	})
}
