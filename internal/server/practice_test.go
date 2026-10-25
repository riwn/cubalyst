package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestPracticeStats(t *testing.T) {
	h := newTestServer(t, t.TempDir())
	for _, q := range []string{"period=month", "date=2026/01/07"} {
		if rec := do(t, h, http.MethodGet, "/api/stats/practice?"+q, ""); rec.Code != http.StatusBadRequest {
			t.Errorf("%s: %d", q, rec.Code)
		}
	}
	body := `{"mode":"full","solved_at":"` + time.Now().UTC().Format(time.RFC3339) + `","total_ms":18520}`
	if rec := do(t, h, http.MethodPost, "/api/solves", body); rec.Code != http.StatusCreated {
		t.Fatalf("create: %d %s", rec.Code, rec.Body)
	}
	rec := do(t, h, http.MethodGet, "/api/stats/practice?period=day", "")
	var got struct {
		Period struct{ Kind, From, To string }
		Count  int
		Full   struct {
			BestMS  int64 `json:"best_ms"`
			NewBest bool  `json:"new_best"`
		}
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil || rec.Code != 200 {
		t.Fatalf("%d %s", rec.Code, rec.Body)
	}
	today := time.Now().Format(time.DateOnly)
	if got.Period.Kind != "day" || got.Period.From != today || got.Count != 1 || got.Full.BestMS != 18520 || got.Full.NewBest {
		t.Errorf("%+v", got)
	}
	// リバースプロキシ（Caddy）を通っても読める（通知用の API とは違い、ふつうの読み取り）
	req := httptest.NewRequest(http.MethodGet, "/api/stats/practice?date=yesterday", nil)
	req.Header.Set("X-Forwarded-For", "192.0.2.1")
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"count":0`) {
		t.Errorf("昨日: %d %s", rec.Code, rec.Body)
	}
}
