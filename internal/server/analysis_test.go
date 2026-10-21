package server

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"cubalyst/internal/analysis"
	"cubalyst/internal/solves"
)

func decode[T any](t *testing.T, body []byte) T {
	t.Helper()
	var v T
	if err := json.Unmarshal(body, &v); err != nil {
		t.Fatalf("decode: %v\n%s", err, body)
	}
	return v
}

// 解析は MCP 経由の Claude が書く。サーバーは入力データを渡し、書かれた結果を対象のソルブと一緒に保存する
func TestAnalysisFlow(t *testing.T) {
	h := newTestServer(t, t.TempDir())
	for range 3 {
		do(t, h, http.MethodPost, "/api/solves", solveWithSplits)
	}

	// 単体の入力データ
	rec := do(t, h, http.MethodGet, "/api/solves/1/analysis-input", "")
	in := decode[analysisInput](t, rec.Body.Bytes())
	if rec.Code != http.StatusOK || !strings.Contains(in.Input, "| Cross |") || in.System != analysis.SystemPrompt || len(in.SolveIDs) != 1 {
		t.Fatalf("solve input: %d %s", rec.Code, rec.Body)
	}
	if rec := do(t, h, http.MethodGet, "/api/solves/99/analysis-input", ""); rec.Code != http.StatusNotFound {
		t.Fatalf("missing solve input: %d", rec.Code)
	}

	// まとめの入力データ：件数・ID 指定。対象にしたソルブの ID が返る
	rec = do(t, h, http.MethodGet, "/api/analysis-input?limit=2", "")
	in = decode[analysisInput](t, rec.Body.Bytes())
	if rec.Code != http.StatusOK || len(in.SolveIDs) != 2 || in.SolveIDs[0] != 2 || !strings.Contains(in.Input, "対象のソルブ: #2 #3") || in.Title == "" {
		t.Fatalf("multi input by limit: %d %s", rec.Code, rec.Body)
	}
	rec = do(t, h, http.MethodGet, "/api/analysis-input?ids=1,3&title=%E7%B7%B4%E7%BF%92", "")
	in = decode[analysisInput](t, rec.Body.Bytes())
	if rec.Code != http.StatusOK || len(in.SolveIDs) != 2 || in.Title != "練習" || !strings.Contains(in.Input, "まとめ解析の対象（練習）") {
		t.Fatalf("multi input by ids: %d %s", rec.Code, rec.Body)
	}
	if rec := do(t, h, http.MethodGet, "/api/analysis-input?ids=1,99", ""); rec.Code != http.StatusNotFound || !strings.Contains(rec.Body.String(), "#99") {
		t.Fatalf("multi input with missing id: %d %s", rec.Code, rec.Body)
	}
	if rec := do(t, h, http.MethodGet, "/api/analysis-input?mode=case", ""); rec.Code != http.StatusBadRequest {
		t.Fatalf("multi input with no solves: %d", rec.Code)
	}

	// 保存
	rec = do(t, h, http.MethodPost, "/api/analyses", `{"kind":"solve","solve_id":1,"result":"## 結論\nクロスが長い"}`)
	a := decode[analysis.Analysis](t, rec.Body.Bytes())
	if rec.Code != http.StatusCreated || a.Kind != "solve" || len(a.SolveIDs) != 1 || a.SolveIDs[0] != 1 || a.Model != analysis.ExternalModel || !strings.Contains(a.Input, "| Cross |") {
		t.Fatalf("save solve: %d %s", rec.Code, rec.Body)
	}
	rec = do(t, h, http.MethodPost, "/api/analyses", `{"kind":"multi","solve_ids":[3,1],"title":"今日の練習","params":{"limit":2},"result":"まとめ","model":"Claude Opus 5.5"}`)
	m := decode[analysis.Analysis](t, rec.Body.Bytes())
	if rec.Code != http.StatusCreated || m.Kind != "multi" || m.Title != "今日の練習" || len(m.SolveIDs) != 2 || m.SolveIDs[0] != 1 || string(m.Params) != `{"limit":2}` {
		t.Fatalf("save multi: %d %s", rec.Code, rec.Body)
	}
	rec = do(t, h, http.MethodPost, "/api/analyses", `{"kind":"multi","solve_ids":[2,3],"result":"見出しなし"}`)
	if m2 := decode[analysis.Analysis](t, rec.Body.Bytes()); rec.Code != http.StatusCreated || !strings.HasPrefix(m2.Title, "2件（") {
		t.Fatalf("save multi without title: %d %s", rec.Code, rec.Body)
	}
	for body, code := range map[string]int{
		`{"kind":"solve","solve_id":1,"result":"  "}`:      http.StatusBadRequest,
		`{"kind":"trend","result":"x"}`:                    http.StatusBadRequest,
		`{"kind":"multi","solve_ids":[1],"result":"x"}`:    http.StatusBadRequest,
		`{"kind":"solve","solve_id":99,"result":"x"}`:      http.StatusNotFound,
		`{"kind":"multi","solve_ids":[1,99],"result":"x"}`: http.StatusNotFound,
	} {
		if rec := do(t, h, http.MethodPost, "/api/analyses", body); rec.Code != code {
			t.Errorf("%s: %d %s", body, rec.Code, rec.Body)
		}
	}

	// 一覧：種類・ソルブで絞り込む（ソルブで絞ると単体とまとめの両方）
	list := decode[[]analysis.Analysis](t, do(t, h, http.MethodGet, "/api/analyses?kind=multi", "").Body.Bytes())
	if len(list) != 2 {
		t.Fatalf("multi analyses: %+v", list)
	}
	list = decode[[]analysis.Analysis](t, do(t, h, http.MethodGet, "/api/analyses?solve_id=1", "").Body.Bytes())
	if len(list) != 2 || list[0].Kind != "multi" || list[1].Kind != "solve" {
		t.Fatalf("analyses of solve 1: %+v", list)
	}
	if rec := do(t, h, http.MethodGet, "/api/analyses?kind=trend", ""); rec.Code != http.StatusBadRequest {
		t.Fatalf("bad kind: %d", rec.Code)
	}
	if rec := do(t, h, http.MethodGet, "/api/analyses/2", ""); rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "今日の練習") {
		t.Fatalf("get analysis: %d %s", rec.Code, rec.Body)
	}

	// ソルブ一覧に解析の数が付く
	res := decode[listResponse](t, do(t, h, http.MethodGet, "/api/solves?include=analyses&order=asc", "").Body.Bytes())
	want := []solves.AnalysisCounts{{Solve: 1, Multi: 1}, {Solve: 0, Multi: 1}, {Solve: 0, Multi: 2}}
	for i, s := range res.Solves {
		if s.Analyses == nil || *s.Analyses != want[i] {
			t.Fatalf("solve %d analyses: %+v", s.ID, s.Analyses)
		}
	}
	if res := decode[listResponse](t, do(t, h, http.MethodGet, "/api/solves", "").Body.Bytes()); res.Solves[0].Analyses != nil {
		t.Fatal("analyses should be omitted without include")
	}

	// ソルブを消すと、単体の解析は消え、まとめの解析は残って対象から外れる
	do(t, h, http.MethodDelete, "/api/solves/1", "")
	if rec := do(t, h, http.MethodGet, "/api/analyses/1", ""); rec.Code != http.StatusNotFound {
		t.Fatalf("single analysis should be deleted with its solve: %d", rec.Code)
	}
	m = decode[analysis.Analysis](t, do(t, h, http.MethodGet, "/api/analyses/2", "").Body.Bytes())
	if len(m.SolveIDs) != 1 || m.SolveIDs[0] != 3 {
		t.Fatalf("multi analysis after delete: %+v", m.SolveIDs)
	}

	if rec := do(t, h, http.MethodDelete, "/api/analyses/2", ""); rec.Code != http.StatusNoContent {
		t.Fatalf("delete analysis: %d", rec.Code)
	}
	if rec := do(t, h, http.MethodDelete, "/api/analyses/2", ""); rec.Code != http.StatusNotFound {
		t.Fatalf("delete missing analysis: %d", rec.Code)
	}
}
