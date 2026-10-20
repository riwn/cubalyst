package server

import (
	"context"
	"encoding/json"
	"net/http"
	"path/filepath"
	"strings"
	"testing"

	"cubalyst/internal/analysis"
	"cubalyst/internal/db"
)

type fakeLLM struct {
	prompts []string
}

func (f *fakeLLM) Model() string { return "fake-model" }

func (f *fakeLLM) Complete(_ context.Context, system, prompt string) (analysis.Completion, error) {
	f.prompts = append(f.prompts, prompt)
	return analysis.Completion{Text: "## 結論\nF2Lが遅い", Model: "fake-model", InputTokens: 100, OutputTokens: 20}, nil
}

func newAnalysisServer(t *testing.T, llm analysis.LLM) http.Handler {
	t.Helper()
	database, err := db.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { database.Close() })
	if err := db.Migrate(context.Background(), database); err != nil {
		t.Fatal(err)
	}
	return New(database, t.TempDir(), llm).Handler()
}

func TestAnalysisNotConfigured(t *testing.T) {
	h := newAnalysisServer(t, nil)
	if rec := do(t, h, http.MethodGet, "/api/analysis/status", ""); !strings.Contains(rec.Body.String(), `"configured":false`) {
		t.Fatalf("status: %s", rec.Body)
	}
	do(t, h, http.MethodPost, "/api/solves", solveWithSplits)
	if rec := do(t, h, http.MethodPost, "/api/solves/1/analyses", ""); rec.Code != http.StatusServiceUnavailable || !strings.Contains(rec.Body.String(), "ANTHROPIC_API_KEY") {
		t.Fatalf("analyze without key: %d %s", rec.Code, rec.Body)
	}
}

func TestAnalysisFlow(t *testing.T) {
	llm := &fakeLLM{}
	h := newAnalysisServer(t, llm)
	if rec := do(t, h, http.MethodGet, "/api/analysis/status", ""); !strings.Contains(rec.Body.String(), `"model":"fake-model"`) {
		t.Fatalf("status: %s", rec.Body)
	}
	do(t, h, http.MethodPost, "/api/solves", solveWithSplits)

	rec := do(t, h, http.MethodPost, "/api/solves/1/analyses", "")
	if rec.Code != http.StatusCreated {
		t.Fatalf("analyze: %d %s", rec.Code, rec.Body)
	}
	var a analysis.Analysis
	json.Unmarshal(rec.Body.Bytes(), &a)
	if a.Kind != "solve" || *a.SolveID != 1 || a.Result == "" || a.InputTokens != 100 || !strings.Contains(a.Input, "| Cross |") {
		t.Fatalf("analysis: %+v", a)
	}
	if !strings.Contains(llm.prompts[0], "改善点") {
		t.Fatalf("prompt: %s", llm.prompts[0])
	}
	if rec := do(t, h, http.MethodPost, "/api/solves/99/analyses", ""); rec.Code != http.StatusNotFound {
		t.Fatalf("missing solve: %d", rec.Code)
	}

	rec = do(t, h, http.MethodPost, "/api/analyses/trend", `{"mode":"full","limit":10}`)
	if rec.Code != http.StatusCreated || !strings.Contains(rec.Body.String(), `"kind":"trend"`) {
		t.Fatalf("trend: %d %s", rec.Code, rec.Body)
	}
	if rec := do(t, h, http.MethodPost, "/api/analyses/trend", `{"mode":"case","limit":10}`); rec.Code != http.StatusBadGateway {
		t.Fatalf("trend with no solves: %d %s", rec.Code, rec.Body)
	}

	var list []analysis.Analysis
	json.Unmarshal(do(t, h, http.MethodGet, "/api/solves/1/analyses", "").Body.Bytes(), &list)
	if len(list) != 1 {
		t.Fatalf("solve analyses: %d", len(list))
	}
	json.Unmarshal(do(t, h, http.MethodGet, "/api/analyses?kind=trend", "").Body.Bytes(), &list)
	if len(list) != 1 || list[0].Kind != "trend" {
		t.Fatalf("trend analyses: %+v", list)
	}

	// ソルブを消すと解析も消える
	do(t, h, http.MethodDelete, "/api/solves/1", "")
	json.Unmarshal(do(t, h, http.MethodGet, "/api/analyses?kind=solve", "").Body.Bytes(), &list)
	if len(list) != 0 {
		t.Fatalf("cascade delete: %+v", list)
	}
	if rec := do(t, h, http.MethodDelete, "/api/analyses/2", ""); rec.Code != http.StatusNoContent {
		t.Fatalf("delete analysis: %d", rec.Code)
	}
}
