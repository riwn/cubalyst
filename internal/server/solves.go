package server

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"cubalyst/internal/solves"
)

const defaultListLimit = 50

func (s *Server) handleCreateSolve(w http.ResponseWriter, r *http.Request) {
	var in solves.Solve
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	in.ID = 0
	if err := s.solves.Create(r.Context(), &in); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	created, err := s.solves.Get(r.Context(), in.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

type listResponse struct {
	Solves []solves.Solve `json:"solves"`
	Total  int            `json:"total"`
}

func (s *Server) handleListSolves(w http.ResponseWriter, r *http.Request) {
	f, err := parseFilter(r.URL.Query())
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	list, total, err := s.solves.List(r.Context(), f)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, listResponse{Solves: list, Total: total})
}

// parseFilter はクエリ文字列から一覧の条件を作る。
//
//	mode, case_id, step: 完全一致
//	from, to: RFC3339 または YYYY-MM-DD（to は排他的）
//	ids: カンマ区切り
//	limit: 既定50、0で無制限 / offset
//	include=moves,splits,analyses: 回転ログ・段階・解析の数も返す / order=asc: 古い順
func parseFilter(q url.Values) (solves.Filter, error) {
	f := solves.Filter{
		Mode:            q.Get("mode"),
		CaseID:          q.Get("case_id"),
		Step:            q.Get("step"),
		Limit:           defaultListLimit,
		IncludeMoves:    hasInclude(q, "moves"),
		IncludeSplits:   hasInclude(q, "splits"),
		IncludeAnalyses: hasInclude(q, "analyses"),
		Ascending:       q.Get("order") == "asc",
	}
	var err error
	if f.From, err = parseTimeParam(q.Get("from")); err != nil {
		return f, fmt.Errorf("from: %w", err)
	}
	if f.To, err = parseTimeParam(q.Get("to")); err != nil {
		return f, fmt.Errorf("to: %w", err)
	}
	if v := q.Get("limit"); v != "" {
		if f.Limit, err = strconv.Atoi(v); err != nil || f.Limit < 0 {
			return f, errors.New("limit must be a non-negative integer")
		}
	}
	if v := q.Get("offset"); v != "" {
		if f.Offset, err = strconv.Atoi(v); err != nil || f.Offset < 0 {
			return f, errors.New("offset must be a non-negative integer")
		}
	}
	if v := q.Get("ids"); v != "" {
		for p := range strings.SplitSeq(v, ",") {
			id, err := strconv.ParseInt(strings.TrimSpace(p), 10, 64)
			if err != nil {
				return f, fmt.Errorf("ids: invalid id %q", p)
			}
			f.IDs = append(f.IDs, id)
		}
	}
	return f, nil
}

// hasInclude は include=moves,splits のような指定に name が含まれるかを返す。
func hasInclude(q url.Values, name string) bool {
	for _, v := range q["include"] {
		for p := range strings.SplitSeq(v, ",") {
			if strings.TrimSpace(p) == name {
				return true
			}
		}
	}
	return false
}

func parseTimeParam(v string) (time.Time, error) {
	if v == "" {
		return time.Time{}, nil
	}
	if t, err := time.Parse(time.RFC3339Nano, v); err == nil {
		return t, nil
	}
	return time.ParseInLocation("2006-01-02", v, time.Local)
}

func (s *Server) handleGetSolve(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	solve, err := s.solves.Get(r.Context(), id)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, solve)
}

type updateSolveRequest struct {
	Penalty *string `json:"penalty"`
	Note    *string `json:"note"`
}

func (s *Server) handleUpdateSolve(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var in updateSolveRequest
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	solve, err := s.solves.Update(r.Context(), id, in.Penalty, in.Note)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, solve)
}

func (s *Server) handleDeleteSolve(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	if err := s.solves.Delete(r.Context(), id); err != nil {
		writeStoreError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func pathID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, errors.New("invalid id"))
		return 0, false
	}
	return id, true
}

func writeStoreError(w http.ResponseWriter, err error) {
	if errors.Is(err, solves.ErrNotFound) {
		writeError(w, http.StatusNotFound, err)
		return
	}
	writeError(w, http.StatusBadRequest, err)
}

const maxBodyBytes = 32 << 20

func decodeJSON(r *http.Request, v any) error {
	dec := json.NewDecoder(http.MaxBytesReader(nil, r.Body, maxBodyBytes))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		return fmt.Errorf("invalid JSON: %w", err)
	}
	return nil
}

func writeError(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]string{"error": err.Error()})
}
