package server

import (
	"errors"
	"net/http"
	"regexp"
	"strconv"
	"strings"
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
	// CustomAlgs は手順練習でケースに追加した手順（追加した順）。
	CustomAlgs []CaseAlg `json:"custom_algs"`
}

// CaseAlg はケースに追加した手順。
type CaseAlg struct {
	ID  int64  `json:"id"`
	Alg string `json:"alg"`
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
		c.CustomAlgs = []CaseAlg{}
		out = append(out, c)
	}
	if err := rows.Err(); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	if err := s.attachCustomAlgs(r, out); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) attachCustomAlgs(r *http.Request, cases []Case) error {
	idx := map[string]int{}
	for i, c := range cases {
		idx[c.ID] = i
	}
	rows, err := s.db.QueryContext(r.Context(), `SELECT id, case_id, alg FROM case_algs ORDER BY id`)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var a CaseAlg
		var caseID string
		if err := rows.Scan(&a.ID, &caseID, &a.Alg); err != nil {
			return err
		}
		if i, ok := idx[caseID]; ok {
			cases[i].CustomAlgs = append(cases[i].CustomAlgs, a)
		}
	}
	return rows.Err()
}

// algMove は手順の1手（面・ワイドムーブ・スライス・持ち替え。後ろに ' か 2）。括弧は画面で外してから送る。
var algMove = regexp.MustCompile(`^[URFDLBurfdlbMESxyz](2|')?$`)

const maxAlgMoves = 60

// normalizeAlg は手順の空白をそろえ、手の書き方を確かめる。
func normalizeAlg(alg string) (string, error) {
	moves := strings.Fields(alg)
	if len(moves) == 0 {
		return "", errors.New("alg is required")
	}
	if len(moves) > maxAlgMoves {
		return "", errors.New("alg is too long")
	}
	for _, m := range moves {
		if !algMove.MatchString(m) {
			return "", errors.New("invalid move: " + m)
		}
	}
	return strings.Join(moves, " "), nil
}

// handlePostCaseAlg は POST /api/cases/{id}/algs（{"alg": "R U R' U'"}）。ケースに手順を追加する。
func (s *Server) handlePostCaseAlg(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var in struct {
		Alg string `json:"alg"`
	}
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	alg, err := normalizeAlg(in.Alg)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	var standard string
	if err := s.db.QueryRowContext(r.Context(), `SELECT alg FROM cases WHERE id = ?`, id).Scan(&standard); err != nil {
		writeError(w, http.StatusNotFound, errors.New("case not found"))
		return
	}
	if alg == standard {
		writeError(w, http.StatusConflict, errors.New("alg already exists"))
		return
	}
	res, err := s.db.ExecContext(r.Context(), `INSERT OR IGNORE INTO case_algs (case_id, alg) VALUES (?, ?)`, id, alg)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		writeError(w, http.StatusConflict, errors.New("alg already exists"))
		return
	}
	algID, err := res.LastInsertId()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"id": algID, "case_id": id, "alg": alg})
}

// handleDeleteCaseAlg は DELETE /api/cases/{id}/algs/{algId}。追加した手順を消す。
func (s *Server) handleDeleteCaseAlg(w http.ResponseWriter, r *http.Request) {
	algID, err := strconv.ParseInt(r.PathValue("algId"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, errors.New("invalid alg id"))
		return
	}
	res, err := s.db.ExecContext(r.Context(), `DELETE FROM case_algs WHERE id = ? AND case_id = ?`, algID, r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		writeError(w, http.StatusNotFound, errors.New("alg not found"))
		return
	}
	w.WriteHeader(http.StatusNoContent)
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
