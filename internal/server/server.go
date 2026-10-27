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

	"github.com/riwn/cubalyst/docs"
	"github.com/riwn/cubalyst/internal/analysis"
	"github.com/riwn/cubalyst/internal/db"
	"github.com/riwn/cubalyst/internal/settings"
	"github.com/riwn/cubalyst/internal/solves"
)

// Server はAPIとビルド済みフロントエンドを配信する。
type Server struct {
	db        *sql.DB
	staticDir string
	solves    *solves.Store
	settings  *settings.Store
	analysis  *analysis.Service
}

// New はサーバーを作る。
func New(database *sql.DB, staticDir string) *Server {
	return &Server{
		db:        database,
		staticDir: staticDir,
		solves:    solves.NewStore(database),
		settings:  settings.NewStore(database),
		analysis:  analysis.NewService(database),
	}
}

// Handler はルーティング済みのハンドラを返す。
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", s.handleHealth)
	mux.HandleFunc("GET /api/openapi.yaml", handleOpenAPI)
	mux.HandleFunc("POST /api/solves", s.handleCreateSolve)
	mux.HandleFunc("GET /api/solves", s.handleListSolves)
	mux.HandleFunc("GET /api/solves/{id}", s.handleGetSolve)
	mux.HandleFunc("PATCH /api/solves/{id}", s.handleUpdateSolve)
	mux.HandleFunc("DELETE /api/solves/{id}", s.handleDeleteSolve)
	mux.HandleFunc("PUT /api/solves/{id}/splits", s.handleReplaceSplits)
	mux.HandleFunc("PUT /api/solves/{id}/holds", s.handleReplaceHolds)
	mux.HandleFunc("GET /api/settings", s.handleGetSettings)
	mux.HandleFunc("PUT /api/settings", s.handlePutSettings)
	mux.HandleFunc("GET /api/export", s.handleExport)
	mux.HandleFunc("POST /api/import", s.handleImport)
	mux.HandleFunc("GET /api/cases", s.handleListCases)
	mux.HandleFunc("PUT /api/cases/{id}/learned", s.handlePutCaseLearned)
	mux.HandleFunc("GET /api/analyses", s.handleListAnalyses)
	mux.HandleFunc("POST /api/analyses", s.handleSaveAnalysis)
	mux.HandleFunc("GET /api/analyses/{id}", s.handleGetAnalysis)
	mux.HandleFunc("DELETE /api/analyses/{id}", s.handleDeleteAnalysis)
	mux.HandleFunc("GET /api/solves/{id}/analysis-input", s.handleSolveAnalysisInput)
	mux.HandleFunc("GET /api/analysis-input", s.handleMultiAnalysisInput)
	mux.HandleFunc("GET /api/stats/practice", s.handlePracticeStats)
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
	})
	mux.Handle("/", s.staticHandler())
	// 認証が無いので、ほかのサイトを開いたブラウザから、書き込み系のAPIを勝手に呼ばれないようにする
	// （Sec-Fetch-Site / Origin を見て、別オリジンからの GET・HEAD・OPTIONS 以外を 403 にする）。
	// ブラウザ以外（MCPサーバーや curl）からの呼び出しは、これらのヘッダーが無いので通る
	return logRequests(http.NewCrossOriginProtection().Handler(mux))
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

// handleOpenAPI は API の仕様書（docs/openapi.yaml）を返す。
func handleOpenAPI(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/yaml; charset=utf-8")
	w.Write(docs.OpenAPI)
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
