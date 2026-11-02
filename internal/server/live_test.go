package server

import (
	"bufio"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

const solvedFacelets = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB"

func TestLiveEventsRejectsInvalid(t *testing.T) {
	h := newTestServer(t, t.TempDir())
	for _, body := range []string{`{`, `{"events":[{"type":"nope"}]}`, `{"events":[{"type":"move","move":"R"}]}`} {
		if rec := do(t, h, http.MethodPost, "/api/live/events", body); rec.Code != http.StatusBadRequest {
			t.Errorf("%s: status=%d", body, rec.Code)
		}
	}
	if rec := do(t, h, http.MethodPost, "/api/live/events", `{"events":[]}`); rec.Code != http.StatusNoContent {
		t.Errorf("空：status=%d %s", rec.Code, rec.Body)
	}
}

func TestLiveStream(t *testing.T) {
	ts := httptest.NewServer(newTestServer(t, t.TempDir()))
	defer ts.Close()

	res, err := http.Get(ts.URL + "/api/live/stream")
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if ct := res.Header.Get("Content-Type"); ct != "text/event-stream" {
		t.Fatalf("Content-Type=%q", ct)
	}
	lines := make(chan string)
	go func() {
		sc := bufio.NewScanner(res.Body)
		for sc.Scan() {
			if l, ok := strings.CutPrefix(sc.Text(), "data: "); ok {
				lines <- l
			}
		}
		close(lines)
	}()
	next := func() map[string]any {
		t.Helper()
		select {
		case l := <-lines:
			var m map[string]any
			if err := json.Unmarshal([]byte(l), &m); err != nil {
				t.Fatalf("%s: %v", l, err)
			}
			return m
		case <-time.After(5 * time.Second):
			t.Fatal("届かない")
		}
		return nil
	}

	if m := next(); m["type"] != "snapshot" || m["online"] != false {
		t.Fatalf("snapshot: %v", m)
	}
	body := `{"events":[{"type":"main","cube":"connected"},{"type":"move","move":"R","facelets":"` + solvedFacelets + `"}]}`
	req, _ := http.NewRequest(http.MethodPost, ts.URL+"/api/live/events", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	pr, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	pr.Body.Close()
	if pr.StatusCode != http.StatusNoContent {
		t.Fatalf("POST status=%d", pr.StatusCode)
	}
	if m := next(); m["type"] != "main" || m["online"] != true {
		t.Fatalf("main: %v", m)
	}
	if m := next(); m["type"] != "move" || m["move"] != "R" {
		t.Fatalf("move: %v", m)
	}
}
