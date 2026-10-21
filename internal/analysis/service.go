package analysis

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"cubalyst/internal/settings"
	"cubalyst/internal/solves"
)

// ErrNotFound は指定した解析結果が存在しないことを表す。
var ErrNotFound = errors.New("analysis not found")

// Analysis は保存された解析結果。
type Analysis struct {
	ID           int64           `json:"id"`
	Kind         string          `json:"kind"`
	SolveID      *int64          `json:"solve_id"`
	Params       json.RawMessage `json:"params"`
	Input        string          `json:"input"`
	Result       string          `json:"result"`
	Model        string          `json:"model"`
	InputTokens  int64           `json:"input_tokens"`
	OutputTokens int64           `json:"output_tokens"`
	CreatedAt    time.Time       `json:"created_at"`
}

// TrendParams は傾向分析の対象条件。
type TrendParams struct {
	Mode  string `json:"mode"`
	Limit int    `json:"limit"`
}

// Service は解析の実行と保存を行う。llm が nil の場合、実行は ErrNotConfigured になる（一覧は見られる）。
type Service struct {
	db       *sql.DB
	llm      LLM
	solves   *solves.Store
	settings *settings.Store
}

func NewService(db *sql.DB, llm LLM) *Service {
	return &Service{db: db, llm: llm, solves: solves.NewStore(db), settings: settings.NewStore(db)}
}

// Configured はAPIが使えるか（とモデル名）を返す。
func (s *Service) Configured() (bool, string) {
	if s.llm == nil {
		return false, ""
	}
	return true, s.llm.Model()
}

// AnalyzeSolve は単一ソルブを解析して保存する。
func (s *Service) AnalyzeSolve(ctx context.Context, id int64) (Analysis, error) {
	if s.llm == nil {
		return Analysis{}, ErrNotConfigured
	}
	solve, err := s.solves.Get(ctx, id)
	if err != nil {
		return Analysis{}, err
	}
	recent, _, err := s.solves.List(ctx, solves.Filter{Mode: solves.ModeFull, Limit: 50, IncludeMoves: true, IncludeSplits: true})
	if err != nil {
		return Analysis{}, err
	}
	st, err := s.settings.Get(ctx)
	if err != nil {
		return Analysis{}, err
	}
	input := SolveInput(solve, recent, st)
	prompt := input + "\n\nこのソルブを解析し、改善点をコメントしてください。"
	return s.run(ctx, "solve", &id, json.RawMessage(`{}`), input, prompt)
}

// AnalyzeTrend は直近N件の傾向を分析して保存する。
func (s *Service) AnalyzeTrend(ctx context.Context, p TrendParams) (Analysis, error) {
	if s.llm == nil {
		return Analysis{}, ErrNotConfigured
	}
	if p.Mode == "" {
		p.Mode = solves.ModeFull
	}
	if p.Limit <= 0 || p.Limit > 1000 {
		return Analysis{}, errors.New("limit は1〜1000で指定してください")
	}
	list, _, err := s.solves.List(ctx, solves.Filter{Mode: p.Mode, Limit: p.Limit, IncludeMoves: true, IncludeSplits: true})
	if err != nil {
		return Analysis{}, err
	}
	if len(list) == 0 {
		return Analysis{}, errors.New("対象のソルブがありません")
	}
	// List は新しい順なので古い順にする
	for i, j := 0, len(list)-1; i < j; i, j = i+1, j-1 {
		list[i], list[j] = list[j], list[i]
	}
	st, err := s.settings.Get(ctx)
	if err != nil {
		return Analysis{}, err
	}
	input := TrendInput(list, p.Mode, st)
	prompt := input + "\n\nこの傾向を分析し、伸びしろの大きい段階と、これからの練習方針を提案してください。"
	params, _ := json.Marshal(p)
	return s.run(ctx, "trend", nil, params, input, prompt)
}

func (s *Service) run(ctx context.Context, kind string, solveID *int64, params json.RawMessage, input, prompt string) (Analysis, error) {
	c, err := s.llm.Complete(ctx, SystemPrompt, prompt)
	if err != nil {
		return Analysis{}, err
	}
	res, err := s.db.ExecContext(ctx, `INSERT INTO analyses (kind, solve_id, params, input, result, model, input_tokens, output_tokens)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, kind, solveID, string(params), input, c.Text, c.Model, c.InputTokens, c.OutputTokens)
	if err != nil {
		return Analysis{}, fmt.Errorf("save analysis: %w", err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return Analysis{}, err
	}
	return s.Get(ctx, id)
}

const selectAnalysis = `SELECT id, kind, solve_id, params, input, result, model, input_tokens, output_tokens, created_at FROM analyses`

func scanAnalysis(r interface{ Scan(...any) error }) (Analysis, error) {
	var a Analysis
	var solveID sql.NullInt64
	var params, created string
	if err := r.Scan(&a.ID, &a.Kind, &solveID, &params, &a.Input, &a.Result, &a.Model, &a.InputTokens, &a.OutputTokens, &created); err != nil {
		return a, err
	}
	if solveID.Valid {
		a.SolveID = &solveID.Int64
	}
	a.Params = json.RawMessage(params)
	t, err := time.Parse(time.RFC3339Nano, created)
	if err != nil {
		return a, err
	}
	a.CreatedAt = t
	return a, nil
}

func (s *Service) Get(ctx context.Context, id int64) (Analysis, error) {
	a, err := scanAnalysis(s.db.QueryRowContext(ctx, selectAnalysis+` WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return a, ErrNotFound
	}
	return a, err
}

// List は解析結果を新しい順に返す。solveID が0なら kind で絞り込む。
func (s *Service) List(ctx context.Context, kind string, solveID int64, limit int) ([]Analysis, error) {
	q := selectAnalysis
	var args []any
	switch {
	case solveID > 0:
		q += ` WHERE solve_id = ?`
		args = append(args, solveID)
	case kind != "":
		q += ` WHERE kind = ?`
		args = append(args, kind)
	}
	q += ` ORDER BY created_at DESC, id DESC`
	if limit > 0 {
		q += fmt.Sprintf(` LIMIT %d`, limit)
	}
	rows, err := s.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Analysis{}
	for rows.Next() {
		a, err := scanAnalysis(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (s *Service) Delete(ctx context.Context, id int64) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM analyses WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}
