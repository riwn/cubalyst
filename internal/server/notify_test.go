package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestNotifySummary(t *testing.T) {
	h := newTestServer(t, t.TempDir())

	// 練習が無ければ 204（送らない）
	if rec := do(t, h, http.MethodGet, "/api/notify/summary?date=2026-01-07", ""); rec.Code != http.StatusNoContent {
		t.Fatalf("練習なし: %d %s", rec.Code, rec.Body)
	}
	// リバースプロキシを通った要求は断る
	req := httptest.NewRequest(http.MethodGet, "/api/notify/summary", nil)
	req.Header.Set("X-Forwarded-For", "192.0.2.1")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("X-Forwarded-For: %d", rec.Code)
	}
	for _, q := range []string{"period=month", "date=2026/01/07"} {
		if rec := do(t, h, http.MethodGet, "/api/notify/summary?"+q, ""); rec.Code != http.StatusBadRequest {
			t.Errorf("%s: %d", q, rec.Code)
		}
	}

	// 今日のフルソルブ → 既定（1週間）のまとめに入る
	body := `{"mode":"full","solved_at":"` + time.Now().UTC().Format(time.RFC3339) + `","total_ms":18520}`
	if rec := do(t, h, http.MethodPost, "/api/solves", body); rec.Code != http.StatusCreated {
		t.Fatalf("create: %d %s", rec.Code, rec.Body)
	}
	rec = do(t, h, http.MethodGet, "/api/notify/summary", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("summary: %d %s", rec.Code, rec.Body)
	}
	var got struct {
		Message struct {
			Embeds []struct {
				Title       string `json:"title"`
				Description string `json:"description"`
			} `json:"embeds"`
		} `json:"message"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil || len(got.Message.Embeds) != 1 {
		t.Fatalf("body=%s err=%v", rec.Body, err)
	}
	e := got.Message.Embeds[0]
	if !strings.HasPrefix(e.Title, "🧊 1週間の練習") || !strings.Contains(e.Description, "フルソルブ 1 回・ベスト **18.52**") {
		t.Errorf("embed = %+v", e)
	}
}
