package server

import (
	"errors"
	"net/http"
)

// Case はケース練習のマスタの1件。
type Case struct {
	ID      string `json:"id"`
	Set     string `json:"set"`
	Name    string `json:"name"`
	Group   string `json:"group"`
	Alg     string `json:"alg"`
	Pattern string `json:"pattern"`
	// Learned は手順練習で「覚えた」と印を付けたか。
	Learned bool `json:"learned"`
}

// handleListCases は GET /api/cases（?set=OLL などで絞り込み）。
func (s *Server) handleListCases(w http.ResponseWriter, r *http.Request) {
	q := `SELECT c.id, c.case_set, c.name, c.case_group, c.alg, c.pattern, l.case_id IS NOT NULL
		FROM cases c LEFT JOIN learned_cases l ON l.case_id = c.id`
	var args []any
	if set := r.URL.Query().Get("set"); set != "" {
		q += ` WHERE c.case_set = ?`
		args = append(args, set)
	}
	rows, err := s.db.QueryContext(r.Context(), q+` ORDER BY c.sort`, args...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	defer rows.Close()
	out := []Case{}
	for rows.Next() {
		var c Case
		if err := rows.Scan(&c.ID, &c.Set, &c.Name, &c.Group, &c.Alg, &c.Pattern, &c.Learned); err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		out = append(out, c)
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// handlePutCaseLearned は PUT /api/cases/{id}/learned（{"learned": true|false}）。
func (s *Server) handlePutCaseLearned(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var in struct {
		Learned *bool `json:"learned"`
	}
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if in.Learned == nil {
		writeError(w, http.StatusBadRequest, errors.New("learned is required"))
		return
	}
	var exists bool
	if err := s.db.QueryRowContext(r.Context(), `SELECT COUNT(*) > 0 FROM cases WHERE id = ?`, id).Scan(&exists); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	if !exists {
		writeError(w, http.StatusNotFound, errors.New("case not found"))
		return
	}
	q := `DELETE FROM learned_cases WHERE case_id = ?`
	if *in.Learned {
		q = `INSERT OR IGNORE INTO learned_cases (case_id) VALUES (?)`
	}
	if _, err := s.db.ExecContext(r.Context(), q, id); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"id": id, "learned": *in.Learned})
}
