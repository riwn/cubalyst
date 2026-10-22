package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func do(t *testing.T, h http.Handler, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	var req *http.Request
	if body == "" {
		req = httptest.NewRequest(method, path, nil)
	} else {
		req = httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestSolvesAPI(t *testing.T) {
	h := newTestServer(t, t.TempDir())

	body := `{"mode":"full","solved_at":"2026-10-21T01:02:03.456Z","total_ms":15234,"penalty":"",
		"scramble":"R U","moves":[{"move":"R","cube_ts":100,"local_ts":5,"t":0},{"move":"U","cube_ts":null,"local_ts":300,"t":290}],
		"case_id":null,"step":null,"note":""}`
	rec := do(t, h, http.MethodPost, "/api/solves", body)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create: %d %s", rec.Code, rec.Body)
	}
	var created struct {
		ID    int64 `json:"id"`
		Moves []struct {
			Move   string   `json:"move"`
			CubeTS *float64 `json:"cube_ts"`
		} `json:"moves"`
	}
	json.Unmarshal(rec.Body.Bytes(), &created)
	if created.ID == 0 || len(created.Moves) != 2 || created.Moves[1].CubeTS != nil {
		t.Fatalf("unexpected created: %s", rec.Body)
	}

	if rec := do(t, h, http.MethodPost, "/api/solves", `{"mode":"bogus","solved_at":"2026-10-21T00:00:00Z"}`); rec.Code != http.StatusBadRequest {
		t.Fatalf("invalid create: %d", rec.Code)
	}
	if rec := do(t, h, http.MethodPost, "/api/solves", `{"mode":"full","unknown":1}`); rec.Code != http.StatusBadRequest {
		t.Fatalf("unknown field: %d", rec.Code)
	}

	rec = do(t, h, http.MethodGet, "/api/solves?mode=full", "")
	var list struct {
		Solves []map[string]any `json:"solves"`
		Total  int              `json:"total"`
	}
	json.Unmarshal(rec.Body.Bytes(), &list)
	if rec.Code != http.StatusOK || list.Total != 1 || list.Solves[0]["moves"] != nil {
		t.Fatalf("list: %d %s", rec.Code, rec.Body)
	}
	rec = do(t, h, http.MethodGet, "/api/solves?include=moves", "")
	json.Unmarshal(rec.Body.Bytes(), &list)
	if list.Solves[0]["moves"] == nil {
		t.Fatalf("list with moves: %s", rec.Body)
	}
	if rec := do(t, h, http.MethodGet, "/api/solves?limit=-1", ""); rec.Code != http.StatusBadRequest {
		t.Fatalf("bad limit: %d", rec.Code)
	}
	if rec := do(t, h, http.MethodGet, "/api/solves?sort=bogus", ""); rec.Code != http.StatusBadRequest {
		t.Fatalf("bad sort: %d", rec.Code)
	}
	if rec := do(t, h, http.MethodGet, "/api/solves?sort=time&order=asc", ""); rec.Code != http.StatusOK {
		t.Fatalf("sort by time: %d %s", rec.Code, rec.Body)
	}
	if rec := do(t, h, http.MethodGet, "/api/solves?from=2026-10-22", ""); !strings.Contains(rec.Body.String(), `"total":0`) {
		t.Fatalf("from filter: %s", rec.Body)
	}

	rec = do(t, h, http.MethodPatch, "/api/solves/1", `{"penalty":"DNF"}`)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"penalty":"DNF"`) {
		t.Fatalf("patch: %d %s", rec.Code, rec.Body)
	}
	if rec := do(t, h, http.MethodPatch, "/api/solves/999", `{"note":"x"}`); rec.Code != http.StatusNotFound {
		t.Fatalf("patch missing: %d", rec.Code)
	}

	if rec := do(t, h, http.MethodDelete, "/api/solves/1", ""); rec.Code != http.StatusNoContent {
		t.Fatalf("delete: %d", rec.Code)
	}
	if rec := do(t, h, http.MethodGet, "/api/solves/1", ""); rec.Code != http.StatusNotFound {
		t.Fatalf("get deleted: %d", rec.Code)
	}
}
