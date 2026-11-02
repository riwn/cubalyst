package server

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/riwn/cubalyst/internal/live"
)

// livePing は、見る側に生きているかを知らせる間隔（プロキシに切られないためでもある）。
var livePing = 15 * time.Second

type liveEventsRequest struct {
	Events []live.Event `json:"events"`
}

// handleLiveEvents は、メイン（キューブをつないだブラウザ）からタイマー画面の出来事を受け取る。
func (s *Server) handleLiveEvents(w http.ResponseWriter, r *http.Request) {
	var in liveEventsRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&in); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json: " + err.Error()})
		return
	}
	for i, e := range in.Events {
		if err := e.Validate(); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": fmt.Sprintf("events[%d]: %v", i, err)})
			return
		}
	}
	s.live.Publish(in.Events)
	w.WriteHeader(http.StatusNoContent)
}

// handleLiveStream は、見る側にメインの状態を SSE で送り続ける。最初に今の状態（snapshot）を送る。
func (s *Server) handleLiveStream(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "streaming is not supported"})
		return
	}
	snapshot, ch, unsubscribe := s.live.Subscribe()
	defer unsubscribe()
	if snapshot == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "shutting down"})
		return
	}
	h := w.Header()
	h.Set("Content-Type", "text/event-stream")
	h.Set("Cache-Control", "no-cache")
	h.Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	send := func(b []byte) bool {
		if _, err := fmt.Fprintf(w, "data: %s\n\n", b); err != nil {
			return false
		}
		flusher.Flush()
		return true
	}
	if !send(snapshot) {
		return
	}
	ticker := time.NewTicker(livePing)
	defer ticker.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case b, ok := <-ch:
			if !ok || !send(b) {
				return
			}
		case <-ticker.C:
			if !send(s.live.Ping()) {
				return
			}
		}
	}
}
