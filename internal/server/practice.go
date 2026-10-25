package server

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"time"

	"github.com/riwn/cubalyst/internal/practice"
	"github.com/riwn/cubalyst/internal/solves"
)

// practicePeriod は ?period=week|day（既定は week）と ?date=YYYY-MM-DD|yesterday（その日までの期間、既定は今日）。
func practicePeriod(q url.Values, now time.Time) (practice.Period, error) {
	date := now
	switch v := q.Get("date"); v {
	case "":
	case "yesterday":
		date = now.AddDate(0, 0, -1)
	default:
		d, err := time.ParseInLocation("2006-01-02", v, time.Local)
		if err != nil {
			return practice.Period{}, errors.New("date は YYYY-MM-DD か yesterday で指定してください")
		}
		date = d
	}
	return practice.NewPeriod(q.Get("period"), date)
}

// practiceData は、期間のソルブ（すべての種類、段階付き）、期間より前のフルソルブ、ケースの名前を読む。
func (s *Server) practiceData(ctx context.Context, p practice.Period) (cur, before []solves.Solve, cases map[string]string, err error) {
	cur, _, err = s.solves.List(ctx, solves.Filter{From: p.From, To: p.To, IncludeSplits: true, Ascending: true})
	if err != nil {
		return nil, nil, nil, err
	}
	before, _, err = s.solves.List(ctx, solves.Filter{Mode: solves.ModeFull, To: p.From, Ascending: true})
	if err != nil {
		return nil, nil, nil, err
	}
	cases = map[string]string{}
	rows, err := s.db.QueryContext(ctx, `SELECT id, name FROM cases`)
	if err != nil {
		return nil, nil, nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id, name string
		if err := rows.Scan(&id, &name); err != nil {
			return nil, nil, nil, err
		}
		cases[id] = name
	}
	return cur, before, cases, rows.Err()
}

// handlePracticeStats は期間の練習の集計（?period=week|day、?date=YYYY-MM-DD|yesterday）。
func (s *Server) handlePracticeStats(w http.ResponseWriter, r *http.Request) {
	p, err := practicePeriod(r.URL.Query(), time.Now())
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	cur, before, cases, err := s.practiceData(r.Context(), p)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, practice.Compute(p, cur, before, cases))
}
