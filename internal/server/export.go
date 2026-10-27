package server

import (
	"bytes"
	"fmt"
	"net/http"
	"time"

	"github.com/riwn/cubalyst/internal/export"
	"github.com/riwn/cubalyst/internal/settings"
	"github.com/riwn/cubalyst/internal/solves"
)

func (s *Server) handleGetSettings(w http.ResponseWriter, r *http.Request) {
	st, err := s.settings.Get(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, st)
}

func (s *Server) handlePutSettings(w http.ResponseWriter, r *http.Request) {
	in := settings.Defaults
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if err := s.settings.Put(r.Context(), in); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	s.handleGetSettings(w, r)
}

func (s *Server) handleReplaceSplits(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var in []solves.Split
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if err := s.solves.ReplaceSplits(r.Context(), id, in); err != nil {
		writeStoreError(w, err)
		return
	}
	solve, err := s.solves.Get(r.Context(), id)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, solve)
}

// handleReplaceHolds は PUT /api/solves/{id}/holds（持ち替えの再計算用）。本文が null なら記録なしにする。
func (s *Server) handleReplaceHolds(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var in *solves.Holds
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if err := s.solves.ReplaceHolds(r.Context(), id, in); err != nil {
		writeStoreError(w, err)
		return
	}
	solve, err := s.solves.Get(r.Context(), id)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, solve)
}

// handleExport は GET /api/export?format=json|csv|txt ＋一覧と同じフィルタ（limit は既定で無制限、古い順）。
func (s *Server) handleExport(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	f, err := parseFilter(q)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if q.Get("limit") == "" {
		f.Limit = 0
	}
	if q.Get("order") == "" {
		f.Ascending = true
	}
	f.IncludeMoves = true
	f.IncludeSplits = true
	list, _, err := s.solves.List(r.Context(), f)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}

	now := time.Now()
	var buf bytes.Buffer
	var contentType, ext string
	switch format := q.Get("format"); format {
	case "", "json":
		err, contentType, ext = export.WriteJSON(&buf, list, now), "application/json", "json"
	case "csv":
		err, contentType, ext = export.WriteCSV(&buf, list), "text/csv", "csv"
	case "txt":
		var st settings.Settings
		if st, err = s.settings.Get(r.Context()); err == nil {
			err = export.WriteText(&buf, list, time.Local, st.Frame(), st.HoldDescription())
		}
		contentType, ext = "text/plain", "txt"
	default:
		writeError(w, http.StatusBadRequest, fmt.Errorf("unknown format %q", format))
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	w.Header().Set("Content-Type", contentType+"; charset=utf-8")
	w.Header().Set("Content-Disposition",
		fmt.Sprintf(`attachment; filename="cubalyst-%s.%s"`, now.Format("20060102-150405"), ext))
	w.Write(buf.Bytes())
}

type importResponse struct {
	Imported int      `json:"imported"`
	Skipped  int      `json:"skipped"`
	Errors   []string `json:"errors"`
}

// handleImport は JSON export を読み込む。重複（同じ solved_at・scramble・total_ms）はスキップする。
func (s *Server) handleImport(w http.ResponseWriter, r *http.Request) {
	doc, err := export.ReadJSON(http.MaxBytesReader(w, r.Body, maxBodyBytes))
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	res := importResponse{Errors: []string{}}
	for i, sv := range doc.Solves {
		if err := sv.Validate(); err != nil {
			res.Errors = append(res.Errors, fmt.Sprintf("solves[%d]: %v", i, err))
			continue
		}
		dup, err := s.solves.Exists(r.Context(), sv)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		if dup {
			res.Skipped++
			continue
		}
		sv.ID = 0
		if err := s.solves.Create(r.Context(), &sv); err != nil {
			res.Errors = append(res.Errors, fmt.Sprintf("solves[%d]: %v", i, err))
			continue
		}
		res.Imported++
	}
	writeJSON(w, http.StatusOK, res)
}
