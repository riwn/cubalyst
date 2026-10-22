package server

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"cubalyst/internal/db"
)

func newTestServer(t *testing.T, staticDir string) http.Handler {
	t.Helper()
	database, err := db.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { database.Close() })
	if err := db.Migrate(context.Background(), database); err != nil {
		t.Fatal(err)
	}
	return New(database, staticDir).Handler()
}

func TestHealth(t *testing.T) {
	h := newTestServer(t, t.TempDir())
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/health", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body)
	}
	var res healthResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
		t.Fatal(err)
	}
	if res.Status != "ok" || res.DB != "ok" || res.SchemaVersion < 1 {
		t.Fatalf("unexpected response: %+v", res)
	}
}

func TestHealthDBDown(t *testing.T) {
	database, err := db.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	database.Close()
	rec := httptest.NewRecorder()
	New(database, t.TempDir()).Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/health", nil))
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", rec.Code)
	}
}

func TestStaticSPAFallback(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "index.html"), []byte("<!doctype html>index"), 0o644)
	os.MkdirAll(filepath.Join(dir, "assets"), 0o755)
	os.WriteFile(filepath.Join(dir, "assets", "app.js"), []byte("console.log(1)"), 0o644)
	h := newTestServer(t, dir)

	cases := []struct {
		path, wantBody string
		wantStatus     int
	}{
		{"/", "index", http.StatusOK},
		{"/history/42", "index", http.StatusOK},
		{"/assets/app.js", "console.log", http.StatusOK},
		{"/api/unknown", "not found", http.StatusNotFound},
	}
	for _, c := range cases {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, c.path, nil))
		if rec.Code != c.wantStatus || !strings.Contains(rec.Body.String(), c.wantBody) {
			t.Errorf("GET %s: status = %d, body = %q", c.path, rec.Code, rec.Body)
		}
	}
}

func TestCaseLearned(t *testing.T) {
	h := newTestServer(t, t.TempDir())
	learned := func() map[string]bool {
		var list []Case
		if err := json.Unmarshal(do(t, h, http.MethodGet, "/api/cases?set=PLL", "").Body.Bytes(), &list); err != nil {
			t.Fatal(err)
		}
		out := map[string]bool{}
		for _, c := range list {
			if c.Learned {
				out[c.ID] = true
			}
		}
		return out
	}
	if l := learned(); len(l) != 0 {
		t.Fatalf("initially learned: %v", l)
	}
	for range 2 { // 2回付けても1件
		if rec := do(t, h, http.MethodPut, "/api/cases/pll-T/learned", `{"learned":true}`); rec.Code != http.StatusOK {
			t.Fatalf("learn: %d %s", rec.Code, rec.Body)
		}
	}
	do(t, h, http.MethodPut, "/api/cases/pll-Ja/learned", `{"learned":true}`)
	if l := learned(); len(l) != 2 || !l["pll-T"] || !l["pll-Ja"] {
		t.Fatalf("after learn: %v", l)
	}
	do(t, h, http.MethodPut, "/api/cases/pll-T/learned", `{"learned":false}`)
	if l := learned(); len(l) != 1 || !l["pll-Ja"] {
		t.Fatalf("after unlearn: %v", l)
	}
	if rec := do(t, h, http.MethodPut, "/api/cases/nope/learned", `{"learned":true}`); rec.Code != http.StatusNotFound {
		t.Fatalf("missing case: %d", rec.Code)
	}
	if rec := do(t, h, http.MethodPut, "/api/cases/pll-T/learned", `{}`); rec.Code != http.StatusBadRequest {
		t.Fatalf("missing learned: %d", rec.Code)
	}
}
