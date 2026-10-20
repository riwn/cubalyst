// Package solves はソルブ記録の保存と取得を扱う。
package solves

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

// ErrNotFound は指定したソルブが存在しないことを表す。
var ErrNotFound = errors.New("solve not found")

// Mode はソルブの種類。
const (
	ModeFull = "full"
	ModeCase = "case"
	ModeStep = "step"
)

// Penalty の値。空文字はペナルティなし。
const (
	PenaltyNone = ""
	PenaltyPlus2 = "+2"
	PenaltyDNF   = "DNF"
)

// Move は回転ログの1手。
type Move struct {
	Move    string   `json:"move"`
	CubeTS  *float64 `json:"cube_ts"`  // キューブ側タイムスタンプ
	LocalTS *float64 `json:"local_ts"` // PC側タイムスタンプ
	T       float64  `json:"t"`        // 補正後の、ソルブ開始からの相対ms
}

// Solve は1回のソルブ。
type Solve struct {
	ID       int64     `json:"id"`
	Mode     string    `json:"mode"`
	SolvedAt time.Time `json:"solved_at"`
	TotalMS  int64     `json:"total_ms"`
	Penalty  string    `json:"penalty"`
	Scramble string    `json:"scramble"`
	Moves    []Move    `json:"moves,omitempty"`
	CaseID   *string   `json:"case_id"`
	Step     *string   `json:"step"`
	Note     string    `json:"note"`
}

// Validate は保存前の値を検証する。
func (s *Solve) Validate() error {
	switch s.Mode {
	case ModeFull, ModeCase, ModeStep:
	default:
		return fmt.Errorf("invalid mode %q", s.Mode)
	}
	if err := validatePenalty(s.Penalty); err != nil {
		return err
	}
	if s.TotalMS < 0 {
		return errors.New("total_ms must be >= 0")
	}
	if s.SolvedAt.IsZero() {
		return errors.New("solved_at is required")
	}
	if s.Mode == ModeCase && (s.CaseID == nil || *s.CaseID == "") {
		return errors.New("case_id is required for case mode")
	}
	if s.Mode == ModeStep && (s.Step == nil || *s.Step == "") {
		return errors.New("step is required for step mode")
	}
	for i, m := range s.Moves {
		if m.Move == "" {
			return fmt.Errorf("moves[%d]: move is empty", i)
		}
	}
	return nil
}

func validatePenalty(p string) error {
	switch p {
	case PenaltyNone, PenaltyPlus2, PenaltyDNF:
		return nil
	}
	return fmt.Errorf("invalid penalty %q", p)
}

const timeLayout = "2006-01-02T15:04:05.000Z07:00"

// Store はsolvesテーブルへのアクセスを提供する。
type Store struct {
	db *sql.DB
}

func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

// Create はソルブを保存し、採番したIDを設定して返す。
func (st *Store) Create(ctx context.Context, s *Solve) error {
	if err := s.Validate(); err != nil {
		return err
	}
	moves, err := json.Marshal(nonNilMoves(s.Moves))
	if err != nil {
		return err
	}
	res, err := st.db.ExecContext(ctx, `INSERT INTO solves
		(mode, solved_at, total_ms, penalty, scramble, moves, case_id, step, note)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		s.Mode, s.SolvedAt.UTC().Format(timeLayout), s.TotalMS, s.Penalty, s.Scramble,
		string(moves), s.CaseID, s.Step, s.Note)
	if err != nil {
		return err
	}
	s.ID, err = res.LastInsertId()
	return err
}

func nonNilMoves(m []Move) []Move {
	if m == nil {
		return []Move{}
	}
	return m
}

// Filter は一覧の絞り込み条件。ゼロ値の項目は条件にしない。
type Filter struct {
	Mode   string
	From   time.Time // solved_at >= From
	To     time.Time // solved_at < To
	CaseID string
	Step   string
	IDs    []int64
	Limit  int // 0なら無制限
	Offset int
	// IncludeMoves が false の場合、Moves を読み込まない。
	IncludeMoves bool
	// Ascending が true なら古い順、false なら新しい順。
	Ascending bool
}

func (f Filter) where() (string, []any) {
	var conds []string
	var args []any
	if f.Mode != "" {
		conds = append(conds, "mode = ?")
		args = append(args, f.Mode)
	}
	if !f.From.IsZero() {
		conds = append(conds, "solved_at >= ?")
		args = append(args, f.From.UTC().Format(timeLayout))
	}
	if !f.To.IsZero() {
		conds = append(conds, "solved_at < ?")
		args = append(args, f.To.UTC().Format(timeLayout))
	}
	if f.CaseID != "" {
		conds = append(conds, "case_id = ?")
		args = append(args, f.CaseID)
	}
	if f.Step != "" {
		conds = append(conds, "step = ?")
		args = append(args, f.Step)
	}
	if len(f.IDs) > 0 {
		conds = append(conds, "id IN ("+strings.TrimSuffix(strings.Repeat("?,", len(f.IDs)), ",")+")")
		for _, id := range f.IDs {
			args = append(args, id)
		}
	}
	if len(conds) == 0 {
		return "", nil
	}
	return " WHERE " + strings.Join(conds, " AND "), args
}

// List は条件に合うソルブと、ページングを無視した総件数を返す。
func (st *Store) List(ctx context.Context, f Filter) ([]Solve, int, error) {
	where, args := f.where()
	var total int
	if err := st.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM solves"+where, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	movesCol := "'[]'"
	if f.IncludeMoves {
		movesCol = "moves"
	}
	order := "DESC"
	if f.Ascending {
		order = "ASC"
	}
	q := `SELECT id, mode, solved_at, total_ms, penalty, scramble, ` + movesCol + `, case_id, step, note
		FROM solves` + where + ` ORDER BY solved_at ` + order + `, id ` + order
	if f.Limit > 0 {
		q += fmt.Sprintf(" LIMIT %d OFFSET %d", f.Limit, f.Offset)
	}
	rows, err := st.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := []Solve{}
	for rows.Next() {
		s, err := scanSolve(rows)
		if err != nil {
			return nil, 0, err
		}
		if !f.IncludeMoves {
			s.Moves = nil
		}
		out = append(out, s)
	}
	return out, total, rows.Err()
}

// Get は1件取得する。
func (st *Store) Get(ctx context.Context, id int64) (Solve, error) {
	row := st.db.QueryRowContext(ctx, `SELECT id, mode, solved_at, total_ms, penalty, scramble, moves, case_id, step, note
		FROM solves WHERE id = ?`, id)
	s, err := scanSolve(row)
	if errors.Is(err, sql.ErrNoRows) {
		return Solve{}, ErrNotFound
	}
	return s, err
}

// Update はペナルティとメモを更新する。nil の項目は変更しない。
func (st *Store) Update(ctx context.Context, id int64, penalty, note *string) (Solve, error) {
	if penalty != nil {
		if err := validatePenalty(*penalty); err != nil {
			return Solve{}, err
		}
	}
	res, err := st.db.ExecContext(ctx, `UPDATE solves SET
		penalty = COALESCE(?, penalty),
		note = COALESCE(?, note)
		WHERE id = ?`, penalty, note, id)
	if err != nil {
		return Solve{}, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return Solve{}, ErrNotFound
	}
	return st.Get(ctx, id)
}

// Delete は1件削除する。
func (st *Store) Delete(ctx context.Context, id int64) error {
	res, err := st.db.ExecContext(ctx, `DELETE FROM solves WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

type scanner interface {
	Scan(dest ...any) error
}

func scanSolve(r scanner) (Solve, error) {
	var s Solve
	var solvedAt, moves string
	var caseID, step sql.NullString
	if err := r.Scan(&s.ID, &s.Mode, &solvedAt, &s.TotalMS, &s.Penalty, &s.Scramble, &moves, &caseID, &step, &s.Note); err != nil {
		return Solve{}, err
	}
	t, err := time.Parse(time.RFC3339Nano, solvedAt)
	if err != nil {
		return Solve{}, fmt.Errorf("solve %d: parse solved_at: %w", s.ID, err)
	}
	s.SolvedAt = t
	if err := json.Unmarshal([]byte(moves), &s.Moves); err != nil {
		return Solve{}, fmt.Errorf("solve %d: parse moves: %w", s.ID, err)
	}
	if caseID.Valid {
		s.CaseID = &caseID.String
	}
	if step.Valid {
		s.Step = &step.String
	}
	return s, nil
}
