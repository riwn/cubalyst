// Package mcpserver は Cubalyst のデータを MCP のツールとして公開する（`cubalyst mcp`）。
//
// DB には直接触らず、動いている Cubalyst の HTTP API を呼ぶ。Claude Code や Claude Desktop から
// ソルブを読み、Claude 自身が書いた解析結果をアプリに保存できる（API キーは要らない）。
package mcpserver

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"cubalyst/internal/analysis"
	"cubalyst/internal/solves"
)

// Instructions は接続した Claude に渡す前提。解析の観点と出力の形式はアプリ内の解析と同じにする。
const Instructions = `Cubalyst は、スマートキューブで記録したルービックキューブ（3x3、CFOP法）のソルブを集計するアプリです。
このサーバーのツールで、ソルブの記録を読み、解析結果をアプリに保存できます。

解析を頼まれたときの流れ:
1. 対象を決める。ソルブの ID や「直近のソルブ」のように1つに決まるなら、そのまま進む（直近なら get_solve を solve_id なしで呼ぶ）。
   決まらないときは、解析を始める前に list_solves の一覧（解析済みかどうかも出る）を見せて、どれを解析するか（または傾向分析か）を選んでもらう
2. 単一ソルブは get_solve、傾向は get_trend で入力データを取る（必要なら list_analyses で過去の解析も見る）
3. 下の「解析の前提と出力」に沿って解析する
4. 保存を頼まれたとき、または解析を頼まれたときは save_analysis で保存する。保存した結果はアプリの画面に出る

解析の前提と出力（アプリ内の解析と同じ）:
` + analysis.SystemPrompt

// Client は Cubalyst の HTTP API を呼ぶ。
type Client struct {
	base string
	http *http.Client
}

// NewClient は base（例: http://127.0.0.1:8090）の API を呼ぶクライアントを作る。
func NewClient(base string) *Client {
	return &Client{base: strings.TrimRight(base, "/"), http: &http.Client{Timeout: 30 * time.Second}}
}

func (c *Client) do(ctx context.Context, method, path string, q url.Values, body, out any) error {
	u := c.base + path
	if len(q) > 0 {
		u += "?" + q.Encode()
	}
	var rd io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		rd = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, u, rd)
	if err != nil {
		return err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("Cubalyst（%s）に接続できません。サーバーが動いているか確認してください: %w", c.base, err)
	}
	defer res.Body.Close()
	data, err := io.ReadAll(res.Body)
	if err != nil {
		return err
	}
	if res.StatusCode >= 300 {
		var e struct {
			Error string `json:"error"`
		}
		if json.Unmarshal(data, &e) == nil && e.Error != "" {
			return errors.New(e.Error)
		}
		return fmt.Errorf("%s %s: %s", method, path, res.Status)
	}
	if out == nil {
		return nil
	}
	return json.Unmarshal(data, out)
}

// New は MCP サーバーを作る。
func New(c *Client) *mcp.Server {
	s := mcp.NewServer(&mcp.Implementation{Name: "cubalyst", Version: "1.0.0"}, &mcp.ServerOptions{Instructions: Instructions})
	t := tools{c}

	mcp.AddTool(s, &mcp.Tool{
		Name:        "list_solves",
		Description: "ソルブの一覧を新しい順に返す（ID、日時、タイム、手数、CFOP の段階ごとの時間、解析済みかどうか）。最後の傾向分析の日時も返す。解析の対象を選んでもらうときに使う。",
		Annotations: &mcp.ToolAnnotations{ReadOnlyHint: true},
	}, t.listSolves)
	mcp.AddTool(s, &mcp.Tool{
		Name: "get_solve",
		Description: "1回のソルブを解析するための入力データ（段階ごとの時間・手数・TPS・回転ログ・直近の平均との比較など）を返す。" +
			"solve_id を省くと直近のフルソルブ。",
		Annotations: &mcp.ToolAnnotations{ReadOnlyHint: true},
	}, t.getSolve)
	mcp.AddTool(s, &mcp.Tool{
		Name:        "get_trend",
		Description: "直近 N 件の傾向を分析するための入力データ（段階ごとの平均・ばらつき、平均タイムの推移、遅い段階など）を返す。",
		Annotations: &mcp.ToolAnnotations{ReadOnlyHint: true},
	}, t.getTrend)
	mcp.AddTool(s, &mcp.Tool{
		Name:        "list_analyses",
		Description: "保存済みの解析結果を新しい順に返す。solve_id を指定するとそのソルブの解析だけ。",
		Annotations: &mcp.ToolAnnotations{ReadOnlyHint: true},
	}, t.listAnalyses)
	mcp.AddTool(s, &mcp.Tool{
		Name: "save_analysis",
		Description: "解析結果（Markdown）をアプリに保存する。保存した結果は、単一ソルブならソルブの詳細画面、傾向なら統計画面に表示される。" +
			"入力データはサーバーが作り直して一緒に保存する。",
		Annotations: &mcp.ToolAnnotations{DestructiveHint: ptr(false)},
	}, t.saveAnalysis)

	s.AddPrompt(&mcp.Prompt{
		Name:        "analyze_solve",
		Description: "ソルブを1回解析して、結果をアプリに保存する",
		Arguments:   []*mcp.PromptArgument{{Name: "solve_id", Description: "ソルブの ID（省くと直近のフルソルブ）"}},
	}, func(_ context.Context, req *mcp.GetPromptRequest) (*mcp.GetPromptResult, error) {
		target := "直近のフルソルブ"
		if id := strings.TrimSpace(req.Params.Arguments["solve_id"]); id != "" {
			target = "ソルブ #" + id
		}
		return prompt(fmt.Sprintf("Cubalyst の%sを get_solve で読み、改善点を解析してください。終わったら save_analysis で保存してください。", target)), nil
	})
	s.AddPrompt(&mcp.Prompt{
		Name:        "analyze_trend",
		Description: "直近 N 件の傾向を分析して、結果をアプリに保存する",
		Arguments:   []*mcp.PromptArgument{{Name: "limit", Description: "対象の件数（既定 50）"}},
	}, func(_ context.Context, req *mcp.GetPromptRequest) (*mcp.GetPromptResult, error) {
		limit := strings.TrimSpace(req.Params.Arguments["limit"])
		if limit == "" {
			limit = "50"
		}
		return prompt(fmt.Sprintf("Cubalyst の直近%s件のフルソルブを get_trend で読み、伸びしろの大きい段階と練習方針を分析してください。終わったら save_analysis で保存してください。", limit)), nil
	})
	return s
}

func ptr[T any](v T) *T { return &v }

func prompt(text string) *mcp.GetPromptResult {
	return &mcp.GetPromptResult{Messages: []*mcp.PromptMessage{{Role: "user", Content: &mcp.TextContent{Text: text}}}}
}

func text(s string) *mcp.CallToolResult {
	return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: s}}}
}

type tools struct{ c *Client }

type listSolvesArgs struct {
	Mode   string `json:"mode,omitempty" jsonschema:"full（フルソルブ、既定）/ case（手順練習）/ step（ステップ練習）"`
	Limit  int    `json:"limit,omitempty" jsonschema:"件数（既定 20、最大 200）"`
	Offset int    `json:"offset,omitempty" jsonschema:"先頭から飛ばす件数"`
}

func (t tools) listSolves(ctx context.Context, _ *mcp.CallToolRequest, a listSolvesArgs) (*mcp.CallToolResult, any, error) {
	if a.Mode == "" {
		a.Mode = solves.ModeFull
	}
	if a.Limit <= 0 {
		a.Limit = 20
	}
	a.Limit = min(a.Limit, 200)
	q := url.Values{"mode": {a.Mode}, "limit": {strconv.Itoa(a.Limit)}, "offset": {strconv.Itoa(max(a.Offset, 0))}, "include": {"moves,splits"}}
	var res struct {
		Solves []solves.Solve `json:"solves"`
		Total  int            `json:"total"`
	}
	if err := t.c.do(ctx, http.MethodGet, "/api/solves", q, nil, &res); err != nil {
		return nil, nil, err
	}
	if len(res.Solves) == 0 {
		return text(fmt.Sprintf("%s のソルブはありません（全%d件）", a.Mode, res.Total)), nil, nil
	}
	var done []analysis.Analysis
	if err := t.c.do(ctx, http.MethodGet, "/api/analyses", url.Values{"kind": {"solve"}, "limit": {"0"}}, nil, &done); err != nil {
		return nil, nil, err
	}
	bySolve := map[int64][]analysis.Analysis{} // 新しい順
	for _, an := range done {
		if an.SolveID != nil {
			bySolve[*an.SolveID] = append(bySolve[*an.SolveID], an)
		}
	}
	var trend []analysis.Analysis
	if err := t.c.do(ctx, http.MethodGet, "/api/analyses", url.Values{"kind": {"trend"}, "limit": {"1"}}, nil, &trend); err != nil {
		return nil, nil, err
	}

	var b strings.Builder
	fmt.Fprintf(&b, "%s のソルブ 全%d件のうち %d〜%d件目（新しい順）\n", a.Mode, res.Total, a.Offset+1, a.Offset+len(res.Solves))
	if len(trend) > 0 {
		fmt.Fprintf(&b, "最後の傾向分析: %s（%s）\n", trend[0].CreatedAt.Local().Format("2006-01-02 15:04"), string(trend[0].Params))
	} else {
		b.WriteString("最後の傾向分析: まだなし\n")
	}
	b.WriteByte('\n')
	for _, s := range res.Solves {
		b.WriteString(solveLine(s, bySolve[s.ID]))
		b.WriteByte('\n')
	}
	return text(b.String()), nil, nil
}

// solveLine はソルブ1件を1行で表す。analyses はそのソルブの解析結果（新しい順）。
func solveLine(s solves.Solve, analyses []analysis.Analysis) string {
	parts := []string{fmt.Sprintf("#%d", s.ID), s.SolvedAt.Local().Format("2006-01-02 15:04"), formatResult(s.TotalMS, s.Penalty), fmt.Sprintf("%d手", len(s.Moves))}
	if s.CaseID != nil {
		parts = append(parts, "ケース "+*s.CaseID)
	}
	if s.Step != nil {
		parts = append(parts, "ステップ "+*s.Step)
	}
	if g := groupTimes(s.Splits); g != "" {
		parts = append(parts, g)
	}
	if s.Note != "" {
		parts = append(parts, "メモ: "+s.Note)
	}
	if len(analyses) > 0 {
		parts = append(parts, fmt.Sprintf("解析済み（%d回、最後 %s）", len(analyses), analyses[0].CreatedAt.Local().Format("01-02 15:04")))
	} else {
		parts = append(parts, "未解析")
	}
	return strings.Join(parts, "  ")
}

func formatResult(ms int64, penalty string) string {
	switch penalty {
	case solves.PenaltyDNF:
		return fmt.Sprintf("DNF(%.2f)", float64(ms)/1000)
	case solves.PenaltyPlus2:
		return fmt.Sprintf("%.2f+", float64(ms+2000)/1000)
	}
	return fmt.Sprintf("%.2f", float64(ms)/1000)
}

// groupTimes は段階の区切りを Cross / F2L / OLL / PLL ごとの秒数にまとめる。
func groupTimes(splits []solves.Split) string {
	if len(splits) == 0 {
		return ""
	}
	order := []string{"Cross", "F2L", "OLL", "PLL"}
	sum := map[string]int64{}
	for _, sp := range splits {
		g := strings.ToUpper(sp.Stage)
		switch {
		case sp.Stage == "cross":
			g = "Cross"
		case strings.HasPrefix(sp.Stage, "f2l"):
			g = "F2L"
		}
		sum[g] += sp.EndMS - sp.StartMS
	}
	var out []string
	for _, g := range order {
		if v, ok := sum[g]; ok {
			out = append(out, fmt.Sprintf("%s %.2f", g, float64(v)/1000))
		}
	}
	return strings.Join(out, " / ")
}

type analysisInput struct {
	Input   string               `json:"input"`
	Request string               `json:"request"`
	Params  analysis.TrendParams `json:"params"`
}

type getSolveArgs struct {
	SolveID int64 `json:"solve_id,omitempty" jsonschema:"ソルブの ID。省くと直近のフルソルブ"`
}

func (t tools) getSolve(ctx context.Context, _ *mcp.CallToolRequest, a getSolveArgs) (*mcp.CallToolResult, any, error) {
	if a.SolveID <= 0 {
		var res struct {
			Solves []solves.Solve `json:"solves"`
		}
		if err := t.c.do(ctx, http.MethodGet, "/api/solves", url.Values{"mode": {solves.ModeFull}, "limit": {"1"}}, nil, &res); err != nil {
			return nil, nil, err
		}
		if len(res.Solves) == 0 {
			return nil, nil, errors.New("フルソルブの記録がまだありません")
		}
		a.SolveID = res.Solves[0].ID
	}
	var in analysisInput
	if err := t.c.do(ctx, http.MethodGet, fmt.Sprintf("/api/solves/%d/analysis-input", a.SolveID), nil, nil, &in); err != nil {
		return nil, nil, err
	}
	return text(fmt.Sprintf("ソルブ #%d の解析用データ\n\n%s\n\n---\n依頼の例: %s\n保存するときは save_analysis に kind=solve, solve_id=%d を渡す。",
		a.SolveID, in.Input, in.Request, a.SolveID)), nil, nil
}

type getTrendArgs struct {
	Mode  string `json:"mode,omitempty" jsonschema:"full（既定）/ case / step"`
	Limit int    `json:"limit,omitempty" jsonschema:"直近何件を対象にするか（既定 50、最大 1000）"`
}

func (t tools) getTrend(ctx context.Context, _ *mcp.CallToolRequest, a getTrendArgs) (*mcp.CallToolResult, any, error) {
	q := url.Values{}
	if a.Mode != "" {
		q.Set("mode", a.Mode)
	}
	if a.Limit > 0 {
		q.Set("limit", strconv.Itoa(a.Limit))
	}
	var in analysisInput
	if err := t.c.do(ctx, http.MethodGet, "/api/analysis-input/trend", q, nil, &in); err != nil {
		return nil, nil, err
	}
	return text(fmt.Sprintf("直近%d件（%s）の傾向分析用データ\n\n%s\n\n---\n依頼の例: %s\n保存するときは save_analysis に kind=trend, mode=%s, limit=%d を渡す。",
		in.Params.Limit, in.Params.Mode, in.Input, in.Request, in.Params.Mode, in.Params.Limit)), nil, nil
}

type listAnalysesArgs struct {
	SolveID int64  `json:"solve_id,omitempty" jsonschema:"このソルブの解析だけを返す"`
	Kind    string `json:"kind,omitempty" jsonschema:"solve（単一ソルブ）/ trend（傾向）。solve_id を指定したときは無視"`
	Limit   int    `json:"limit,omitempty" jsonschema:"件数（既定 5）"`
}

func (t tools) listAnalyses(ctx context.Context, _ *mcp.CallToolRequest, a listAnalysesArgs) (*mcp.CallToolResult, any, error) {
	if a.Limit <= 0 {
		a.Limit = 5
	}
	var list []analysis.Analysis
	var err error
	if a.SolveID > 0 {
		err = t.c.do(ctx, http.MethodGet, fmt.Sprintf("/api/solves/%d/analyses", a.SolveID), nil, nil, &list)
		list = list[:min(len(list), a.Limit)]
	} else {
		q := url.Values{"limit": {strconv.Itoa(a.Limit)}}
		if a.Kind != "" {
			q.Set("kind", a.Kind)
		}
		err = t.c.do(ctx, http.MethodGet, "/api/analyses", q, nil, &list)
	}
	if err != nil {
		return nil, nil, err
	}
	if len(list) == 0 {
		return text("保存済みの解析結果はありません"), nil, nil
	}
	var b strings.Builder
	for i, an := range list {
		if i > 0 {
			b.WriteString("\n\n========\n\n")
		}
		target := "傾向 " + string(an.Params)
		if an.SolveID != nil {
			target = fmt.Sprintf("ソルブ #%d", *an.SolveID)
		}
		fmt.Fprintf(&b, "解析 #%d（%s、%s、%s）\n\n%s", an.ID, target, an.CreatedAt.Local().Format("2006-01-02 15:04"), an.Model, an.Result)
	}
	return text(b.String()), nil, nil
}

type saveAnalysisArgs struct {
	Kind    string `json:"kind" jsonschema:"solve（単一ソルブ）か trend（傾向）"`
	SolveID int64  `json:"solve_id,omitempty" jsonschema:"単一ソルブ（kind が solve）のときのソルブの ID"`
	Mode    string `json:"mode,omitempty" jsonschema:"傾向（kind が trend）のときの対象。get_trend に渡したもの（既定 full）"`
	Limit   int    `json:"limit,omitempty" jsonschema:"傾向（kind が trend）のときの件数。get_trend に渡したもの（既定 50）"`
	Result  string `json:"result" jsonschema:"解析結果（日本語の Markdown、見出しは ## から）"`
	Model   string `json:"model,omitempty" jsonschema:"解析したモデルの名前（例: Claude Opus 5.5）"`
}

func (t tools) saveAnalysis(ctx context.Context, _ *mcp.CallToolRequest, a saveAnalysisArgs) (*mcp.CallToolResult, any, error) {
	r := analysis.ExternalResult{Kind: a.Kind, SolveID: a.SolveID, Result: a.Result, Model: a.Model}
	if a.Kind == "trend" {
		r.Trend = analysis.TrendParams{Mode: a.Mode, Limit: a.Limit}
		if r.Trend.Limit <= 0 {
			r.Trend.Limit = 50
		}
	}
	var saved analysis.Analysis
	if err := t.c.do(ctx, http.MethodPost, "/api/analyses", nil, r, &saved); err != nil {
		return nil, nil, err
	}
	where := "統計画面"
	if saved.SolveID != nil {
		where = fmt.Sprintf("履歴のソルブ #%d の詳細画面（/history/%d）", *saved.SolveID, *saved.SolveID)
	}
	return text(fmt.Sprintf("解析 #%d として保存しました。%sに表示されます。", saved.ID, where)), nil, nil
}
