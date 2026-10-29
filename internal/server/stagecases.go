package server

import (
	"net/http"

	"github.com/riwn/cubalyst/internal/stagecases"
)

// handleStageCases は、ソルブの回転ログを再生して、各段階を始めたときのケース（F2L のペアの形、OLL・PLL）を返す。
// 対象の選び方はまとめ解析（/api/analysis-input）と同じ。
func (s *Server) handleStageCases(w http.ResponseWriter, r *http.Request) {
	sel, err := parseSelection(r.URL.Query())
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
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
	writeJSON(w, http.StatusOK, res)
}
