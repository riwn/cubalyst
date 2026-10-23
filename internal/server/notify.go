package server

import (
	"errors"
	"net/http"
	"time"

	"github.com/riwn/cubalyst/internal/notify"
	"github.com/riwn/cubalyst/internal/solves"
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
	q := r.URL.Query()
	now := time.Now()
	date := now
	switch v := q.Get("date"); v {
	case "":
	case "yesterday":
		date = now.AddDate(0, 0, -1)
	default:
		d, err := time.ParseInLocation("2006-01-02", v, time.Local)
		if err != nil {
			writeError(w, http.StatusBadRequest, errors.New("date は YYYY-MM-DD か yesterday で指定してください"))
			return
		}
		date = d
	}
	p, err := notify.NewPeriod(q.Get("period"), date)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	ctx := r.Context()
	cur, _, err := s.solves.List(ctx, solves.Filter{From: p.From, To: p.To, IncludeSplits: true, Ascending: true})
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	before, _, err := s.solves.List(ctx, solves.Filter{Mode: solves.ModeFull, To: p.From, Ascending: true})
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	cases := map[string]string{}
	rows, err := s.db.QueryContext(ctx, `SELECT id, name FROM cases`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var id, name string
		if err := rows.Scan(&id, &name); err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		cases[id] = name
	}

	payload := notify.Summary(p, cur, before, cases, now)
	if payload == nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	writeJSON(w, http.StatusOK, payload)
}
