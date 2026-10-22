// Package solves はソルブ記録の保存と取得を扱う。
package solves

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
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
	// ModeAssist は補助付きフルソルブ（練習。ケースと手順を画面に出しながら解く）。タイマーの記録とは分ける。
	ModeAssist = "assist"
)

// Penalty の値。空文字はペナルティなし。
const (
	PenaltyNone  = ""
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

// Stages はCFOPの段階（順序どおり）。
var Stages = []string{"cross", "f2l1", "f2l2", "f2l3", "f2l4", "oll", "pll"}

// Split はCFOPの1段階の区切り。
type Split struct {
	Stage      string `json:"stage"`
	StartMS    int64  `json:"start_ms"`
	EndMS      int64  `json:"end_ms"`
	MoveCount  int    `json:"move_count"`
	StartIndex int    `json:"start_index"` // 回転ログ上の範囲 [StartIndex, EndIndex)
	EndIndex   int    `json:"end_index"`
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
	Splits   []Split   `json:"splits,omitempty"`
	// Analyses はこのソルブを対象にした解析の数（一覧で include=analyses のときだけ）。
	Analyses *AnalysisCounts `json:"analyses,omitempty"`
}

// AnalysisCounts はソルブを対象にした解析の数（単体・まとめ）。
type AnalysisCounts struct {
	Solve int `json:"solve"`
	Multi int `json:"multi"`
}

// Validate は保存前の値を検証する。
func (s *Solve) Validate() error {
	switch s.Mode {
	case ModeFull, ModeCase, ModeStep, ModeAssist:
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
	return ValidateSplits(s.Splits, len(s.Moves))
}

// ValidateSplits は段階の値を検証する。moveCount は回転ログの手数。
func ValidateSplits(splits []Split, moveCount int) error {
	seen := map[string]bool{}
	for _, sp := range splits {
		if !isStage(sp.Stage) {
			return fmt.Errorf("invalid stage %q", sp.Stage)
		}
		if seen[sp.Stage] {
			return fmt.Errorf("duplicated stage %q", sp.Stage)
		}
		seen[sp.Stage] = true
		if sp.EndMS < sp.StartMS || sp.EndIndex < sp.StartIndex || sp.StartIndex < 0 || sp.EndIndex > moveCount {
			return fmt.Errorf("stage %s: invalid range", sp.Stage)
		}
	}
	return nil
}

func isStage(s string) bool {
	for _, st := range Stages {
		if st == s {
			return true
		}
	}
	return false
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
	tx, err := st.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	res, err := tx.ExecContext(ctx, `INSERT INTO solves
		(mode, solved_at, total_ms, penalty, scramble, moves, case_id, step, note)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		s.Mode, s.SolvedAt.UTC().Format(timeLayout), s.TotalMS, s.Penalty, s.Scramble,
		string(moves), s.CaseID, s.Step, s.Note)
	if err != nil {
		return err
	}
	if s.ID, err = res.LastInsertId(); err != nil {
		return err
	}
	if err := insertSplits(ctx, tx, s.ID, s.Splits); err != nil {
		return err
	}
	return tx.Commit()
}

func insertSplits(ctx context.Context, tx *sql.Tx, solveID int64, splits []Split) error {
	for _, sp := range splits {
		if _, err := tx.ExecContext(ctx, `INSERT INTO solve_splits
			(solve_id, stage, start_ms, end_ms, move_count, start_index, end_index)
			VALUES (?, ?, ?, ?, ?, ?, ?)`,
			solveID, sp.Stage, sp.StartMS, sp.EndMS, sp.MoveCount, sp.StartIndex, sp.EndIndex); err != nil {
			return err
		}
	}
	return nil
}

// ReplaceSplits はソルブの段階をすべて置き換える（段階の再計算用）。
func (st *Store) ReplaceSplits(ctx context.Context, id int64, splits []Split) error {
	s, err := st.Get(ctx, id)
	if err != nil {
		return err
	}
	if err := ValidateSplits(splits, len(s.Moves)); err != nil {
		return err
	}
	tx, err := st.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `DELETE FROM solve_splits WHERE solve_id = ?`, id); err != nil {
		return err
	}
	if err := insertSplits(ctx, tx, id, splits); err != nil {
		return err
	}
	return tx.Commit()
}

// loadSplits は複数ソルブの段階をまとめて読み込む。
func (st *Store) loadSplits(ctx context.Context, list []Solve) error {
	if len(list) == 0 {
		return nil
	}
	index := make(map[int64]int, len(list))
	args := make([]any, len(list))
	for i, s := range list {
		index[s.ID] = i
		args[i] = s.ID
	}
	// SQLiteの変数上限を避けるため、件数が多いときは全件から絞り込む
	q := `SELECT solve_id, stage, start_ms, end_ms, move_count, start_index, end_index FROM solve_splits`
	if len(list) <= 500 {
		q += ` WHERE solve_id IN (` + strings.TrimSuffix(strings.Repeat("?,", len(list)), ",") + `)`
	} else {
		args = nil
	}
	rows, err := st.db.QueryContext(ctx, q, args...)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var id int64
		var sp Split
		if err := rows.Scan(&id, &sp.Stage, &sp.StartMS, &sp.EndMS, &sp.MoveCount, &sp.StartIndex, &sp.EndIndex); err != nil {
			return err
		}
		if i, ok := index[id]; ok {
			list[i].Splits = append(list[i].Splits, sp)
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	for i := range list {
		sortSplits(list[i].Splits)
	}
	return nil
}

func sortSplits(splits []Split) {
	order := map[string]int{}
	for i, st := range Stages {
		order[st] = i
	}
	sort.Slice(splits, func(a, b int) bool { return order[splits[a].Stage] < order[splits[b].Stage] })
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
	// IncludeSplits が true の場合、Splits も読み込む。
	IncludeSplits bool
	// IncludeAnalyses が true の場合、Analyses（解析の数）も読み込む。
	IncludeAnalyses bool
	// Sort は並べ替えの基準（SortKeys のどれか）。空なら日時。
	Sort string
	// Ascending が true なら昇順（日時なら古い順）、false なら降順。
	Ascending bool
}

// SortKeys は List の並べ替えの基準と、その値を出す SQL の式。値が NULL の行（DNF、段階の無いソルブなど）は、
// 昇順・降順のどちらでも最後に並べる。同じ値どうしは新しい順。
var SortKeys = map[string]string{
	"date":  "solved_at",
	"time":  "CASE penalty WHEN 'DNF' THEN NULL WHEN '+2' THEN total_ms + 2000 ELSE total_ms END",
	"moves": "(SELECT SUM(move_count) FROM solve_splits WHERE solve_id = solves.id)",
	"cross": splitSum("'cross'"),
	"f2l":   splitSum("'f2l1', 'f2l2', 'f2l3', 'f2l4'"),
	"oll":   splitSum("'oll'"),
	"pll":   splitSum("'pll'"),
}

// splitSum は、指定した段階にかかった時間の合計を出す SQL の式。
func splitSum(stages string) string {
	return "(SELECT SUM(end_ms - start_ms) FROM solve_splits WHERE solve_id = solves.id AND stage IN (" + stages + "))"
}

// orderBy は List の ORDER BY 句。
func (f Filter) orderBy() string {
	dir := "DESC"
	if f.Ascending {
		dir = "ASC"
	}
	expr, ok := SortKeys[f.Sort]
	if !ok || f.Sort == "date" {
		return " ORDER BY solved_at " + dir + ", id " + dir
	}
	return " ORDER BY (" + expr + ") IS NULL, " + expr + " " + dir + ", solved_at DESC, id DESC"
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
	q := `SELECT id, mode, solved_at, total_ms, penalty, scramble, ` + movesCol + `, case_id, step, note
		FROM solves` + where + f.orderBy()
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
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	rows.Close()
	if f.IncludeSplits {
		if err := st.loadSplits(ctx, out); err != nil {
			return nil, 0, err
		}
	}
	if f.IncludeAnalyses {
		if err := st.loadAnalysisCounts(ctx, out); err != nil {
			return nil, 0, err
		}
	}
	return out, total, nil
}

// loadAnalysisCounts はソルブごとの解析の数を読み込む。
func (st *Store) loadAnalysisCounts(ctx context.Context, list []Solve) error {
	if len(list) == 0 {
		return nil
	}
	idx := map[int64]int{}
	args := make([]any, len(list))
	for i, s := range list {
		idx[s.ID] = i
		args[i] = s.ID
		list[i].Analyses = &AnalysisCounts{}
	}
	rows, err := st.db.QueryContext(ctx, `SELECT l.solve_id, SUM(a.kind = 'solve'), SUM(a.kind = 'multi')
		FROM analysis_solves l JOIN analyses a ON a.id = l.analysis_id
		WHERE l.solve_id IN (`+strings.TrimSuffix(strings.Repeat("?,", len(list)), ",")+`)
		GROUP BY l.solve_id`, args...)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var id int64
		var c AnalysisCounts
		if err := rows.Scan(&id, &c.Solve, &c.Multi); err != nil {
			return err
		}
		*list[idx[id]].Analyses = c
	}
	return rows.Err()
}

// Get は1件取得する。
func (st *Store) Get(ctx context.Context, id int64) (Solve, error) {
	row := st.db.QueryRowContext(ctx, `SELECT id, mode, solved_at, total_ms, penalty, scramble, moves, case_id, step, note
		FROM solves WHERE id = ?`, id)
	s, err := scanSolve(row)
	if errors.Is(err, sql.ErrNoRows) {
		return Solve{}, ErrNotFound
	}
	if err != nil {
		return Solve{}, err
	}
	list := []Solve{s}
	if err := st.loadSplits(ctx, list); err != nil {
		return Solve{}, err
	}
	return list[0], nil
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

// Exists は同じ solved_at・scramble・total_ms のソルブがあるかを返す（import時の重複判定）。
func (st *Store) Exists(ctx context.Context, s Solve) (bool, error) {
	var n int
	err := st.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM solves WHERE solved_at = ? AND scramble = ? AND total_ms = ?`,
		s.SolvedAt.UTC().Format(timeLayout), s.Scramble, s.TotalMS).Scan(&n)
	return n > 0, err
}
