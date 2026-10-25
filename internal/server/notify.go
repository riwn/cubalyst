package server

import (
	"errors"
	"net/http"
	"time"

	"github.com/riwn/cubalyst/internal/notify"
)

// 通知用の API。決まった時刻に Discord へ送る側（hatodokei の「外部から取得」のジョブなど）が、
// 同じマシンからリバースプロキシを通さずに呼ぶ。リバースプロキシを通った要求（X-Forwarded-For が付く）は断る。
func internalOnly(w http.ResponseWriter, r *http.Request) bool {
	if r.Header.Get("X-Forwarded-For") != "" {
		writeError(w, http.StatusForbidden, errors.New("通知用の API は、同じマシンからリバースプロキシを通さずに呼んでください"))
		return false
	}
	return true
}

// handleNotifySummary は練習のまとめ（?period=week|day、既定は week。?date=YYYY-MM-DD|yesterday、その日までの期間）。練習が無ければ 204。
func (s *Server) handleNotifySummary(w http.ResponseWriter, r *http.Request) {
	if !internalOnly(w, r) {
		return
	}
	now := time.Now()
	pp, err := practicePeriod(r.URL.Query(), now)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	cur, before, cases, err := s.practiceData(r.Context(), pp)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	p := notify.Period{Kind: pp.Kind, From: pp.From, To: pp.To}

	payload := notify.Summary(p, cur, before, cases, now)
	if payload == nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	writeJSON(w, http.StatusOK, payload)
}
