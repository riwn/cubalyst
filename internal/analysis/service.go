package analysis

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"cubalyst/internal/settings"
	"cubalyst/internal/solves"
)

// ErrNotFound は指定した解析結果が存在しないことを表す。
var ErrNotFound = errors.New("analysis not found")

// 解析の種類。
const (
	KindSolve = "solve" // 1回のソルブの解析
	KindMulti = "multi" // 複数のソルブをまとめた解析
)

// Analysis は保存された解析結果。SolveIDs は解析の対象にしたソルブ（古い順。消されたソルブは含まない）。
type Analysis struct {
	ID        int64           `json:"id"`
	Kind      string          `json:"kind"`
	Title     string          `json:"title"`
	Params    json.RawMessage `json:"params"`
	SolveIDs  []int64         `json:"solve_ids"`
	Input     string          `json:"input"`
	Result    string          `json:"result"`
	Model     string          `json:"model"`
	CreatedAt time.Time       `json:"created_at"`
}

// Selection はまとめ解析の対象の選び方。IDs を指定したらそれだけ、なければ Mode・期間・件数で選ぶ。
type Selection struct {
	IDs   []int64   `json:"ids,omitempty"`
	Mode  string    `json:"mode,omitempty"`
	From  time.Time `json:"from,omitzero"`
	To    time.Time `json:"to,omitzero"`
	Limit int       `json:"limit,omitempty"`
}

// MaxMulti はまとめ解析の対象にできるソルブの上限。
const MaxMulti = 1000

// 解析を頼むときの指示（入力データのあとに付ける）。
const (
	SolveRequest = "このソルブを解析し、改善点をコメントしてください。"
	MultiRequest = "これらのソルブをまとめて分析し、伸びしろの大きい段階と、これからの練習方針を提案してください。"
)

// ExternalModel は、解析結果のモデル名が空のときに使う名前。
const ExternalModel = "AI（MCP）"

// Service は解析の入力データ作りと、解析結果の保存を行う。解析そのものはアプリの外（MCP でつないだ AI）で行う。
type Service struct {
	db       *sql.DB
	solves   *solves.Store
	settings *settings.Store
}

func NewService(db *sql.DB) *Service {
	return &Service{db: db, solves: solves.NewStore(db), settings: settings.NewStore(db)}
}

// SolveInput は単一ソルブの解析に渡す入力データを作る。
func (s *Service) SolveInput(ctx context.Context, id int64) (string, error) {
	solve, err := s.solves.Get(ctx, id)
	if err != nil {
		return "", err
	}
	recent, _, err := s.solves.List(ctx, solves.Filter{Mode: solves.ModeFull, Limit: 50, IncludeMoves: true, IncludeSplits: true})
	if err != nil {
		return "", err
	}
	st, err := s.settings.Get(ctx)
	if err != nil {
		return "", err
	}
	return SolveInput(solve, recent, st), nil
}

// Select はまとめ解析の対象のソルブを、回転ログと段階付きで古い順に返す。
func (s *Service) Select(ctx context.Context, sel Selection) ([]solves.Solve, error) {
	f := solves.Filter{IncludeMoves: true, IncludeSplits: true}
	if len(sel.IDs) > 0 {
		if len(sel.IDs) > MaxMulti {
			return nil, fmt.Errorf("対象は%d件までです", MaxMulti)
		}
		f.IDs = sel.IDs
	} else {
		f.Mode, f.From, f.To, f.Limit = sel.Mode, sel.From, sel.To, sel.Limit
		if f.Mode == "" {
			f.Mode = solves.ModeFull
		}
		if f.Limit <= 0 {
			f.Limit = 50
			if !f.From.IsZero() || !f.To.IsZero() {
				f.Limit = MaxMulti
			}
		}
		if f.Limit > MaxMulti {
			return nil, fmt.Errorf("limit は1〜%dで指定してください", MaxMulti)
		}
	}
	list, _, err := s.solves.List(ctx, f)
	if err != nil {
		return nil, err
	}
	if len(sel.IDs) > 0 && len(list) != len(uniq(sel.IDs)) {
		found := map[int64]bool{}
		for _, x := range list {
			found[x.ID] = true
		}
		var missing []string
		for _, id := range sel.IDs {
			if !found[id] {
				missing = append(missing, fmt.Sprintf("#%d", id))
			}
		}
		return nil, fmt.Errorf("%w: %s", solves.ErrNotFound, strings.Join(missing, " "))
	}
	if len(list) == 0 {
		return nil, errors.New("対象のソルブがありません")
	}
	sort.Slice(list, func(i, j int) bool {
		if !list[i].SolvedAt.Equal(list[j].SolvedAt) {
			return list[i].SolvedAt.Before(list[j].SolvedAt)
		}
		return list[i].ID < list[j].ID
	})
	return list, nil
}

func uniq(ids []int64) map[int64]bool {
	m := map[int64]bool{}
	for _, id := range ids {
		m[id] = true
	}
	return m
}

// Multi はまとめ解析に渡すもの。
type Multi struct {
	Input    string  `json:"input"`
	SolveIDs []int64 `json:"solve_ids"` // 対象にしたソルブ（古い順）
	Title    string  `json:"title"`     // 指定がなければ DefaultTitle
}

// MultiInput はまとめ解析に渡す入力データを作る。
func (s *Service) MultiInput(ctx context.Context, sel Selection, title string) (Multi, error) {
	list, err := s.Select(ctx, sel)
	if err != nil {
		return Multi{}, err
	}
	st, err := s.settings.Get(ctx)
	if err != nil {
		return Multi{}, err
	}
	if title == "" {
		title = DefaultTitle(list)
	}
	ids := make([]int64, len(list))
	for i, x := range list {
		ids[i] = x.ID
	}
	return Multi{Input: MultiInput(list, title, st), SolveIDs: ids, Title: title}, nil
}

// DefaultTitle はまとめ解析の見出しが空のときの見出し（「10件（10/21〜10/22）」）。
func DefaultTitle(list []solves.Solve) string {
	if len(list) == 0 {
		return ""
	}
	from := list[0].SolvedAt.Local().Format("1/2")
	to := list[len(list)-1].SolvedAt.Local().Format("1/2")
	if from == to {
		return fmt.Sprintf("%d件（%s）", len(list), from)
	}
	return fmt.Sprintf("%d件（%s〜%s）", len(list), from, to)
}

// SaveRequest は保存する解析結果。単体は SolveID、まとめは SolveIDs を指定する。
type SaveRequest struct {
	Kind     string          `json:"kind"`
	SolveID  int64           `json:"solve_id"`
	SolveIDs []int64         `json:"solve_ids"`
	Title    string          `json:"title"`
	Params   json.RawMessage `json:"params"` // 対象の選び方（表示用、任意）
	Result   string          `json:"result"` // Markdown
	Model    string          `json:"model"`  // 空なら ExternalModel
}

// Save は解析結果を保存する。入力データは対象のソルブから作り直して一緒に保存する。
func (s *Service) Save(ctx context.Context, r SaveRequest) (Analysis, error) {
	if strings.TrimSpace(r.Result) == "" {
		return Analysis{}, errors.New("result が空です")
	}
	model := strings.TrimSpace(r.Model)
	if model == "" {
		model = ExternalModel
	}
	params := r.Params
	if len(params) == 0 || string(params) == "null" {
		params = json.RawMessage(`{}`)
	} else if !json.Valid(params) {
		return Analysis{}, errors.New("params が JSON ではありません")
	}

	var input, title string
	var ids []int64
	switch r.Kind {
	case KindSolve:
		var err error
		if input, err = s.SolveInput(ctx, r.SolveID); err != nil {
			return Analysis{}, err
		}
		ids = []int64{r.SolveID}
	case KindMulti:
		if len(uniq(r.SolveIDs)) < 2 {
			return Analysis{}, errors.New("まとめ解析の solve_ids は2件以上で指定してください（1件なら kind=solve）")
		}
		m, err := s.MultiInput(ctx, Selection{IDs: r.SolveIDs}, strings.TrimSpace(r.Title))
		if err != nil {
			return Analysis{}, err
		}
		input, ids, title = m.Input, m.SolveIDs, m.Title
	default:
		return Analysis{}, fmt.Errorf("kind は solve か multi で指定してください（%q）", r.Kind)
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Analysis{}, err
	}
	defer tx.Rollback()
	res, err := tx.ExecContext(ctx, `INSERT INTO analyses (kind, title, params, input, result, model) VALUES (?, ?, ?, ?, ?, ?)`,
		r.Kind, title, string(params), input, r.Result, model)
	if err != nil {
		return Analysis{}, fmt.Errorf("save analysis: %w", err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return Analysis{}, err
	}
	for _, sid := range ids {
		if _, err := tx.ExecContext(ctx, `INSERT INTO analysis_solves (analysis_id, solve_id) VALUES (?, ?)`, id, sid); err != nil {
			return Analysis{}, fmt.Errorf("save analysis targets: %w", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return Analysis{}, err
	}
	return s.Get(ctx, id)
}

const selectAnalysis = `SELECT id, kind, title, params, input, result, model, created_at FROM analyses`

func scanAnalysis(r interface{ Scan(...any) error }) (Analysis, error) {
	var a Analysis
	var params, created string
	if err := r.Scan(&a.ID, &a.Kind, &a.Title, &params, &a.Input, &a.Result, &a.Model, &created); err != nil {
		return a, err
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
	if err != nil {
		return a, err
	}
	list := []Analysis{a}
	if err := s.loadTargets(ctx, list); err != nil {
		return a, err
	}
	return list[0], nil
}

// ListFilter は解析結果の一覧の条件。
type ListFilter struct {
	Kind    string // solve / multi。空ならすべて
	SolveID int64  // このソルブを対象にした解析だけ（単体・まとめとも）
	Limit   int    // 0なら無制限
}

// List は解析結果を新しい順に返す。
func (s *Service) List(ctx context.Context, f ListFilter) ([]Analysis, error) {
	q := selectAnalysis
	var conds []string
	var args []any
	if f.Kind != "" {
		conds = append(conds, `kind = ?`)
		args = append(args, f.Kind)
	}
	if f.SolveID > 0 {
		conds = append(conds, `id IN (SELECT analysis_id FROM analysis_solves WHERE solve_id = ?)`)
		args = append(args, f.SolveID)
	}
	if len(conds) > 0 {
		q += ` WHERE ` + strings.Join(conds, ` AND `)
	}
	q += ` ORDER BY created_at DESC, id DESC`
	if f.Limit > 0 {
		q += fmt.Sprintf(` LIMIT %d`, f.Limit)
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
	if err := rows.Err(); err != nil {
		return nil, err
	}
	rows.Close()
	return out, s.loadTargets(ctx, out)
}

// loadTargets は解析ごとの対象のソルブの ID を古い順に読み込む。
func (s *Service) loadTargets(ctx context.Context, list []Analysis) error {
	if len(list) == 0 {
		return nil
	}
	idx := map[int64]int{}
	args := make([]any, len(list))
	for i, a := range list {
		idx[a.ID] = i
		args[i] = a.ID
		list[i].SolveIDs = []int64{}
	}
	rows, err := s.db.QueryContext(ctx, `SELECT l.analysis_id, l.solve_id FROM analysis_solves l JOIN solves s ON s.id = l.solve_id
		WHERE l.analysis_id IN (`+strings.TrimSuffix(strings.Repeat("?,", len(list)), ",")+`)
		ORDER BY s.solved_at, s.id`, args...)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var aid, sid int64
		if err := rows.Scan(&aid, &sid); err != nil {
			return err
		}
		list[idx[aid]].SolveIDs = append(list[idx[aid]].SolveIDs, sid)
	}
	return rows.Err()
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
