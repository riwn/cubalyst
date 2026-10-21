package server

import (
	"errors"
	"net/http"
	"strconv"

	"cubalyst/internal/analysis"
	"cubalyst/internal/solves"
)

type analysisStatus struct {
	Configured bool   `json:"configured"`
	Model      string `json:"model"`
	Message    string `json:"message,omitempty"`
}

func (s *Server) handleAnalysisStatus(w http.ResponseWriter, r *http.Request) {
	ok, model := s.analysis.Configured()
	st := analysisStatus{Configured: ok, Model: model}
	if !ok {
		st.Message = analysis.ErrNotConfigured.Error()
	}
	writeJSON(w, http.StatusOK, st)
}

func (s *Server) handleAnalyzeSolve(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	a, err := s.analysis.AnalyzeSolve(r.Context(), id)
	if err != nil {
		writeAnalysisError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, a)
}

func (s *Server) handleListSolveAnalyses(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	list, err := s.analysis.List(r.Context(), "", id, 0)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, list)
}

func (s *Server) handleAnalyzeTrend(w http.ResponseWriter, r *http.Request) {
	in := analysis.TrendParams{Mode: solves.ModeFull, Limit: 50}
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	a, err := s.analysis.AnalyzeTrend(r.Context(), in)
	if err != nil {
		writeAnalysisError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, a)
}

// handleSolveAnalysisInput は単一ソルブの解析に渡す入力データを返す（MCP 経由で Claude が読む）。
func (s *Server) handleSolveAnalysisInput(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	input, err := s.analysis.SolveInput(r.Context(), id)
	if err != nil {
		writeAnalysisError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, analysisInput{Input: input, System: analysis.SystemPrompt, Request: analysis.SolveRequest})
}

// handleTrendAnalysisInput は直近N件の傾向分析に渡す入力データを返す。
func (s *Server) handleTrendAnalysisInput(w http.ResponseWriter, r *http.Request) {
	p := analysis.TrendParams{Mode: r.URL.Query().Get("mode"), Limit: 50}
	if v := r.URL.Query().Get("limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil {
			writeError(w, http.StatusBadRequest, errors.New("limit must be an integer"))
			return
		}
		p.Limit = n
	}
	input, p, err := s.analysis.TrendInput(r.Context(), p)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusOK, analysisInput{Input: input, System: analysis.SystemPrompt, Request: analysis.TrendRequest, Params: &p})
}

type analysisInput struct {
	Input   string                `json:"input"`
	System  string                `json:"system"`
	Request string                `json:"request"`
	Params  *analysis.TrendParams `json:"params,omitempty"`
}

// handleSaveAnalysis はアプリの外で書いた解析結果を保存する。
func (s *Server) handleSaveAnalysis(w http.ResponseWriter, r *http.Request) {
	var in analysis.ExternalResult
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	a, err := s.analysis.SaveExternal(r.Context(), in)
	if err != nil {
		if errors.Is(err, solves.ErrNotFound) {
			writeError(w, http.StatusNotFound, err)
		} else {
			writeError(w, http.StatusBadRequest, err)
		}
		return
	}
	writeJSON(w, http.StatusCreated, a)
}

func (s *Server) handleListAnalyses(w http.ResponseWriter, r *http.Request) {
	limit := 20
	if v := r.URL.Query().Get("limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 0 {
			writeError(w, http.StatusBadRequest, errors.New("limit must be a non-negative integer"))
			return
		}
		limit = n
	}
	list, err := s.analysis.List(r.Context(), r.URL.Query().Get("kind"), 0, limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, list)
}

func (s *Server) handleDeleteAnalysis(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	if err := s.analysis.Delete(r.Context(), id); err != nil {
		writeAnalysisError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func writeAnalysisError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, analysis.ErrNotConfigured):
		writeError(w, http.StatusServiceUnavailable, err)
	case errors.Is(err, solves.ErrNotFound), errors.Is(err, analysis.ErrNotFound):
		writeError(w, http.StatusNotFound, err)
	default:
		writeError(w, http.StatusBadGateway, err)
	}
}
