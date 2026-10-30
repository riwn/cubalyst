package server

import (
	"errors"
	"net/http"

	"github.com/riwn/cubalyst/internal/stagecases"
)

// handleStageCases は、ソルブの回転ログを再生して、各段階を始めたときのケース（F2L のペアの形、OLL・PLL）を返す。
// 対象の選び方はまとめ解析（/api/analysis-input）と同じ。view=summary なら、ソルブごとの判定を省いて集計だけ返す。
func (s *Server) handleStageCases(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	sel, err := parseSelection(q)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	view := q.Get("view")
	if view != "" && view != "full" && view != "summary" {
		writeError(w, http.StatusBadRequest, errors.New("view must be full or summary"))
		return
	}
	list, err := s.analysis.Select(r.Context(), sel)
	if err != nil {
		writeAnalysisError(w, err)
		return
	}
	cases, err := stagecases.LoadCases(r.Context(), s.db)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	st, err := s.settings.Get(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	res, err := stagecases.AnalyzeAll(list, cases, st.CrossColor)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	if view == "summary" {
		res.Solves = []stagecases.Solve{}
	}
	writeJSON(w, http.StatusOK, res)
}
