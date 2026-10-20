package server

import (
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
}

// handleListCases は GET /api/cases（?set=OLL などで絞り込み）。
func (s *Server) handleListCases(w http.ResponseWriter, r *http.Request) {
	q := `SELECT id, case_set, name, case_group, alg, pattern FROM cases`
	var args []any
	if set := r.URL.Query().Get("set"); set != "" {
		q += ` WHERE case_set = ?`
		args = append(args, set)
	}
	rows, err := s.db.QueryContext(r.Context(), q+` ORDER BY sort`, args...)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	defer rows.Close()
	out := []Case{}
	for rows.Next() {
		var c Case
		if err := rows.Scan(&c.ID, &c.Set, &c.Name, &c.Group, &c.Alg, &c.Pattern); err != nil {
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
