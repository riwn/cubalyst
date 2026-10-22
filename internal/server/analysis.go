package server

import (
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/riwn/cubalyst/internal/analysis"
	"github.com/riwn/cubalyst/internal/solves"
)

// 解析は MCP でつないだ AI が行う。サーバーは入力データを渡し、書かれた結果を保存する。

type analysisInput struct {
	Input    string  `json:"input"`
	System   string  `json:"system"`
	Request  string  `json:"request"`
	SolveIDs []int64 `json:"solve_ids"`
	Title    string  `json:"title,omitempty"`
}

// handleSolveAnalysisInput は単一ソルブの解析に渡す入力データを返す。
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
	writeJSON(w, http.StatusOK, analysisInput{Input: input, System: analysis.SystemPrompt, Request: analysis.SolveRequest, SolveIDs: []int64{id}})
}

// handleMultiAnalysisInput はまとめ解析に渡す入力データを返す。
//
//	ids: カンマ区切り（指定したらそれだけ）/ mode, from, to, limit: 一覧と同じ / title: 見出し
func (s *Server) handleMultiAnalysisInput(w http.ResponseWriter, r *http.Request) {
	sel, err := parseSelection(r.URL.Query())
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	m, err := s.analysis.MultiInput(r.Context(), sel, strings.TrimSpace(r.URL.Query().Get("title")))
	if err != nil {
		writeAnalysisError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, analysisInput{Input: m.Input, System: analysis.SystemPrompt, Request: analysis.MultiRequest, SolveIDs: m.SolveIDs, Title: m.Title})
}

func parseSelection(q url.Values) (analysis.Selection, error) {
	// 期間・ID・件数の書式は一覧と同じ
	f, err := parseFilter(q)
	if err != nil {
		return analysis.Selection{}, err
	}
	sel := analysis.Selection{IDs: f.IDs, Mode: f.Mode, From: f.From, To: f.To}
	if q.Get("limit") != "" {
		sel.Limit = f.Limit
	}
	return sel, nil
}

// handleSaveAnalysis は AI が書いた解析結果を保存する。
func (s *Server) handleSaveAnalysis(w http.ResponseWriter, r *http.Request) {
	var in analysis.SaveRequest
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	a, err := s.analysis.Save(r.Context(), in)
	if err != nil {
		writeAnalysisError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, a)
}

// handleListAnalyses は解析結果の一覧を返す（kind=solve|multi、solve_id、limit）。
func (s *Server) handleListAnalyses(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	f := analysis.ListFilter{Kind: q.Get("kind"), Limit: 20}
	if f.Kind != "" && f.Kind != analysis.KindSolve && f.Kind != analysis.KindMulti {
		writeError(w, http.StatusBadRequest, errors.New("kind must be solve or multi"))
		return
	}
	if v := q.Get("limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 0 {
			writeError(w, http.StatusBadRequest, errors.New("limit must be a non-negative integer"))
			return
		}
		f.Limit = n
	}
	if v := q.Get("solve_id"); v != "" {
		n, err := strconv.ParseInt(v, 10, 64)
		if err != nil || n <= 0 {
			writeError(w, http.StatusBadRequest, errors.New("solve_id must be a positive integer"))
			return
		}
		f.SolveID = n
	}
	list, err := s.analysis.List(r.Context(), f)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, list)
}

func (s *Server) handleGetAnalysis(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	a, err := s.analysis.Get(r.Context(), id)
	if err != nil {
		writeAnalysisError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, a)
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
	case errors.Is(err, solves.ErrNotFound), errors.Is(err, analysis.ErrNotFound):
		writeError(w, http.StatusNotFound, err)
	default:
		writeError(w, http.StatusBadRequest, err)
	}
}
