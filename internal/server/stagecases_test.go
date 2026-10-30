package server

import (
	"net/http"
	"strings"
	"testing"

	"github.com/riwn/cubalyst/internal/stagecases"
)

func TestStageCasesView(t *testing.T) {
	h := newTestServer(t, t.TempDir())
	do(t, h, http.MethodPost, "/api/solves", solveWithSplits)

	rec := do(t, h, http.MethodGet, "/api/stage-cases?limit=10", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("full: %d %s", rec.Code, rec.Body)
	}
	if got := decode[stagecases.Result](t, rec.Body.Bytes()); len(got.Solves) != 1 {
		t.Errorf("full view solves = %d", len(got.Solves))
	}

	// 集計だけ：ソルブごとの判定は空、対象の ID は残る
	rec = do(t, h, http.MethodGet, "/api/stage-cases?limit=10&view=summary", "")
	got := decode[stagecases.Result](t, rec.Body.Bytes())
	if rec.Code != http.StatusOK || len(got.Solves) != 0 || len(got.SolveIDs) != 1 {
		t.Errorf("summary view: %d %s", rec.Code, rec.Body)
	}

	if rec := do(t, h, http.MethodGet, "/api/stage-cases?view=x", ""); rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), "view") {
		t.Errorf("bad view: %d %s", rec.Code, rec.Body)
	}
}
