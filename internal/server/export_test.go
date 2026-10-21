package server

import (
	"encoding/csv"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

const solveWithSplits = `{"mode":"full","solved_at":"2026-10-21T01:02:03.456Z","total_ms":3000,"penalty":"+2",
	"scramble":"R U","moves":[{"move":"U","cube_ts":1,"local_ts":1,"t":0},{"move":"R","cube_ts":2,"local_ts":2,"t":1000},
	{"move":"U","cube_ts":3,"local_ts":3,"t":3000}],"case_id":null,"step":null,"note":"memo",
	"splits":[{"stage":"cross","start_ms":0,"end_ms":1000,"move_count":2,"start_index":0,"end_index":2},
	{"stage":"pll","start_ms":1000,"end_ms":3000,"move_count":1,"start_index":2,"end_index":3}]}`

func TestSplitsExportImport(t *testing.T) {
	h := newTestServer(t, t.TempDir())
	if rec := do(t, h, http.MethodPost, "/api/solves", solveWithSplits); rec.Code != http.StatusCreated {
		t.Fatalf("create: %d %s", rec.Code, rec.Body)
	}
	rec := do(t, h, http.MethodGet, "/api/solves/1", "")
	if !strings.Contains(rec.Body.String(), `"stage":"pll"`) {
		t.Fatalf("get should include splits: %s", rec.Body)
	}
	rec = do(t, h, http.MethodGet, "/api/solves?include=splits", "")
	if !strings.Contains(rec.Body.String(), `"stage":"cross"`) || strings.Contains(rec.Body.String(), `"moves"`) {
		t.Fatalf("list include=splits: %s", rec.Body)
	}

	// 範囲外のsplitsは拒否
	bad := `[{"stage":"cross","start_ms":0,"end_ms":10,"move_count":1,"start_index":0,"end_index":9}]`
	if rec := do(t, h, http.MethodPut, "/api/solves/1/splits", bad); rec.Code != http.StatusBadRequest {
		t.Fatalf("bad splits: %d", rec.Code)
	}
	rep := `[{"stage":"cross","start_ms":0,"end_ms":3000,"move_count":3,"start_index":0,"end_index":3}]`
	rec = do(t, h, http.MethodPut, "/api/solves/1/splits", rep)
	if rec.Code != http.StatusOK || strings.Contains(rec.Body.String(), `"pll"`) {
		t.Fatalf("replace splits: %d %s", rec.Code, rec.Body)
	}
	do(t, h, http.MethodPut, "/api/solves/1/splits", `[{"stage":"cross","start_ms":0,"end_ms":1000,"move_count":2,"start_index":0,"end_index":2},
		{"stage":"pll","start_ms":1000,"end_ms":3000,"move_count":1,"start_index":2,"end_index":3}]`)

	// CSV
	rec = do(t, h, http.MethodGet, "/api/export?format=csv", "")
	rows, err := csv.NewReader(strings.NewReader(rec.Body.String())).ReadAll()
	if err != nil || len(rows) != 2 {
		t.Fatalf("csv: %v %q", err, rec.Body)
	}
	col := map[string]string{}
	for i, name := range rows[0] {
		col[name] = rows[1][i]
	}
	if col["effective_ms"] != "5000" || col["cross_ms"] != "1000" || col["pll_moves"] != "1" || col["oll_ms"] != "" {
		t.Fatalf("csv row: %v", col)
	}
	if !strings.Contains(rec.Header().Get("Content-Disposition"), ".csv") {
		t.Fatalf("content-disposition: %s", rec.Header())
	}

	// テキスト
	rec = do(t, h, http.MethodGet, "/api/export?format=txt", "")
	txt := rec.Body.String()
	// 既定の持ち方（白下・緑前）では、キューブの U→D、R→L と表記される。スクランブルはそのまま
	for _, want := range []string{"持ち方 下が白・前が緑（右は橙）", "5.000 (3.000+2)", "Scramble: R U", "Cross: D L  // 1.000, 2 moves", "PLL:   D", "Total: 3.000 / 3 moves", "Note: memo"} {
		if !strings.Contains(txt, want) {
			t.Errorf("txt missing %q:\n%s", want, txt)
		}
	}

	// JSON export → 別DBへimport（2回目は重複スキップ）
	rec = do(t, h, http.MethodGet, "/api/export?format=json", "")
	exported := rec.Body.String()
	h2 := newTestServer(t, t.TempDir())
	for i, want := range []string{`"imported":1,"skipped":0`, `"imported":0,"skipped":1`} {
		rec = do(t, h2, http.MethodPost, "/api/import", exported)
		if !strings.Contains(rec.Body.String(), want) {
			t.Fatalf("import #%d: %s", i+1, rec.Body)
		}
	}
	rec = do(t, h2, http.MethodGet, "/api/solves/1", "")
	var got struct {
		Moves  []any `json:"moves"`
		Splits []any `json:"splits"`
		Note   string
	}
	json.Unmarshal(rec.Body.Bytes(), &got)
	if len(got.Moves) != 3 || len(got.Splits) != 2 || got.Note != "memo" {
		t.Fatalf("imported solve: %s", rec.Body)
	}
	if rec := do(t, h2, http.MethodPost, "/api/import", `{"version":99,"solves":[]}`); rec.Code != http.StatusBadRequest {
		t.Fatalf("bad version: %d", rec.Code)
	}
}

func TestSettingsAPI(t *testing.T) {
	h := newTestServer(t, t.TempDir())
	if rec := do(t, h, http.MethodGet, "/api/settings", ""); !strings.Contains(rec.Body.String(), `"cross_color":"white"`) {
		t.Fatalf("default settings: %s", rec.Body)
	}
	if rec := do(t, h, http.MethodPut, "/api/settings", `{"cross_color":"yellow"}`); !strings.Contains(rec.Body.String(), `"yellow"`) {
		t.Fatalf("put settings: %s", rec.Body)
	}
	if rec := do(t, h, http.MethodPut, "/api/settings", `{"cross_color":"pink"}`); rec.Code != http.StatusBadRequest {
		t.Fatalf("invalid color: %d", rec.Code)
	}
	if rec := do(t, h, http.MethodPut, "/api/settings", `{"cross_color":"white","hold_bottom":"white","hold_front":"red"}`); !strings.Contains(rec.Body.String(), `"hold_front":"red"`) {
		t.Fatalf("put hold: %s", rec.Body)
	}
	// 前の色は下の色と隣り合っている必要がある
	if rec := do(t, h, http.MethodPut, "/api/settings", `{"cross_color":"white","hold_bottom":"white","hold_front":"yellow"}`); rec.Code != http.StatusBadRequest {
		t.Fatalf("invalid hold: %d", rec.Code)
	}
	if rec := do(t, h, http.MethodGet, "/api/settings", ""); !strings.Contains(rec.Body.String(), `"cross_color":"white","hold_bottom":"white","hold_front":"red"`) {
		t.Fatalf("persisted settings: %s", rec.Body)
	}
}

func TestCasesAPI(t *testing.T) {
	h := newTestServer(t, t.TempDir())
	var all []Case
	json.Unmarshal(do(t, h, http.MethodGet, "/api/cases", "").Body.Bytes(), &all)
	if len(all) != 57+21+41 {
		t.Fatalf("cases: %d", len(all))
	}
	var pll []Case
	json.Unmarshal(do(t, h, http.MethodGet, "/api/cases?set=PLL", "").Body.Bytes(), &pll)
	if len(pll) != 21 || pll[0].Set != "PLL" || len(pll[0].Pattern) != 54 || pll[0].Alg == "" {
		t.Fatalf("pll: %+v", pll)
	}
}
