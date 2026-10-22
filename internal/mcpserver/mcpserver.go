// Package mcpserver は Cubalyst のデータを MCP のツールとして公開する（`cubalyst mcp`）。
//
// DB には直接触らず、動いている Cubalyst の HTTP API を呼ぶ。MCP に対応した AI ツール（Claude Code など）から
// ソルブを読み、AI 自身が書いた解析結果をアプリに保存できる（API キーは要らない）。
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

	"github.com/riwn/cubalyst/internal/analysis"
	"github.com/riwn/cubalyst/internal/solves"
)

// Instructions は接続した AI に渡す前提。
const Instructions = `Cubalyst は、スマートキューブで記録したルービックキューブ（3x3、CFOP法）のソルブを集計するアプリです。
このサーバーのツールで、ソルブの記録を読み、解析結果をアプリに保存できます。

解析には2種類あります。
- 単体：1回のソルブの解析（get_solve で読み、save_analysis に kind=solve で保存）
- まとめ：複数のソルブをまとめた解析（get_solves で読み、save_analysis に kind=multi と、get_solves が返した solve_ids で保存）
複数のソルブを見て書いた解析は、必ず「まとめ」として保存してください（どれか1件の単体として保存しない）。

解析を頼まれたときの流れ:
1. 対象を決める。ソルブの ID や「直近のソルブ」「直近10件」のように決まるなら、そのまま進む。
   決まらないときは、解析を始める前に list_solves の一覧（単体の解析済みか、まとめに含まれているかも出る）を見せて、
   どのソルブを単体で解析するか、どの範囲をまとめて解析するかを選んでもらう
2. 入力データを取る（必要なら list_analyses で過去の解析も見る）
3. 下の「解析の前提と出力」に沿って解析する
4. 解析を頼まれたときは save_analysis で保存する。保存した結果はアプリの「解析」画面に出る

解析の前提と出力:
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
	s := mcp.NewServer(&mcp.Implementation{Name: "cubalyst", Version: "1.1.0"}, &mcp.ServerOptions{Instructions: Instructions})
	t := tools{c}

	mcp.AddTool(s, &mcp.Tool{
		Name: "list_solves",
		Description: "ソルブの一覧を新しい順に返す（ID、日時、タイム、手数、CFOP の段階ごとの時間、単体の解析済みか、まとめ解析に含まれているか）。" +
			"最後のまとめ解析も返す。解析の対象を選んでもらうときに使う。",
		Annotations: &mcp.ToolAnnotations{ReadOnlyHint: true},
	}, t.listSolves)
	mcp.AddTool(s, &mcp.Tool{
		Name: "get_solve",
		Description: "1回のソルブを単体で解析するための入力データ（段階ごとの時間・手数・TPS・回転ログ・直近の平均との比較など）を返す。" +
			"solve_id を省くと直近のフルソルブ。",
		Annotations: &mcp.ToolAnnotations{ReadOnlyHint: true},
	}, t.getSolve)
	mcp.AddTool(s, &mcp.Tool{
		Name: "get_solves",
		Description: "複数のソルブをまとめて解析するための入力データ（タイムの推移、段階ごとの平均・ばらつき、前半と後半の比較など）と、" +
			"対象にしたソルブの ID を返す。対象は solve_ids、または mode と期間（from・to）と件数（limit）で選ぶ（既定は直近50件のフルソルブ）。",
		Annotations: &mcp.ToolAnnotations{ReadOnlyHint: true},
	}, t.getSolves)
	mcp.AddTool(s, &mcp.Tool{
		Name:        "list_analyses",
		Description: "保存済みの解析結果を新しい順に返す。kind（solve / multi）や solve_id（そのソルブを対象にした単体・まとめの解析）で絞り込める。",
		Annotations: &mcp.ToolAnnotations{ReadOnlyHint: true},
	}, t.listAnalyses)
	mcp.AddTool(s, &mcp.Tool{
		Name: "save_analysis",
		Description: "解析結果（Markdown）をアプリに保存する。単体は kind=solve と solve_id、まとめは kind=multi と solve_ids（get_solves が返したもの）と title。" +
			"入力データはサーバーが対象のソルブから作り直して一緒に保存する。保存した結果はアプリの「解析」画面に出る。",
		Annotations: &mcp.ToolAnnotations{DestructiveHint: ptr(false)},
	}, t.saveAnalysis)

	s.AddPrompt(&mcp.Prompt{
		Name:        "analyze_solve",
		Description: "ソルブを1回解析して、単体の解析として保存する",
		Arguments:   []*mcp.PromptArgument{{Name: "solve_id", Description: "ソルブの ID（省くと直近のフルソルブ）"}},
	}, func(_ context.Context, req *mcp.GetPromptRequest) (*mcp.GetPromptResult, error) {
		target := "直近のフルソルブ"
		if id := strings.TrimSpace(req.Params.Arguments["solve_id"]); id != "" {
			target = "ソルブ #" + id
		}
		return prompt(fmt.Sprintf("Cubalyst の%sを get_solve で読み、改善点を解析してください。終わったら save_analysis に kind=solve で保存してください。", target)), nil
	})
	s.AddPrompt(&mcp.Prompt{
		Name:        "analyze_recent",
		Description: "直近 N 件をまとめて解析して、まとめの解析として保存する",
		Arguments:   []*mcp.PromptArgument{{Name: "limit", Description: "対象の件数（既定 20）"}},
	}, func(_ context.Context, req *mcp.GetPromptRequest) (*mcp.GetPromptResult, error) {
		limit := strings.TrimSpace(req.Params.Arguments["limit"])
		if limit == "" {
			limit = "20"
		}
		return prompt(fmt.Sprintf("Cubalyst の直近%s件のフルソルブを get_solves でまとめて読み、伸びしろの大きい段階と練習方針を分析してください。"+
			"終わったら save_analysis に kind=multi と、get_solves が返した solve_ids、見出し（title）を付けて保存してください。", limit)), nil
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

func localTime(t time.Time) string { return t.Local().Format("2006-01-02 15:04") }

type tools struct{ c *Client }

type listSolvesArgs struct {
	Mode   string `json:"mode,omitempty" jsonschema:"full（フルソルブ、既定）/ case（手順練習）/ step（ステップ練習）/ assist（補助付きフルソルブ）"`
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
	q := url.Values{"mode": {a.Mode}, "limit": {strconv.Itoa(a.Limit)}, "offset": {strconv.Itoa(max(a.Offset, 0))}, "include": {"moves,splits,analyses"}}
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
	var multi []analysis.Analysis
	if err := t.c.do(ctx, http.MethodGet, "/api/analyses", url.Values{"kind": {analysis.KindMulti}, "limit": {"1"}}, nil, &multi); err != nil {
		return nil, nil, err
	}

	var b strings.Builder
	fmt.Fprintf(&b, "%s のソルブ 全%d件のうち %d〜%d件目（新しい順）\n", a.Mode, res.Total, a.Offset+1, a.Offset+len(res.Solves))
	if len(multi) > 0 {
		fmt.Fprintf(&b, "最後のまとめ解析: 「%s」（%s、%d件）\n", multi[0].Title, localTime(multi[0].CreatedAt), len(multi[0].SolveIDs))
	} else {
		b.WriteString("最後のまとめ解析: まだなし\n")
	}
	b.WriteByte('\n')
	for _, s := range res.Solves {
		b.WriteString(solveLine(s))
		b.WriteByte('\n')
	}
	return text(b.String()), nil, nil
}

// solveLine はソルブ1件を1行で表す。
func solveLine(s solves.Solve) string {
	parts := []string{fmt.Sprintf("#%d", s.ID), localTime(s.SolvedAt), formatResult(s.TotalMS, s.Penalty), fmt.Sprintf("%d手", len(s.Moves))}
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
	if c := s.Analyses; c != nil {
		if c.Solve > 0 {
			parts = append(parts, fmt.Sprintf("単体解析済み（%d回）", c.Solve))
		} else {
			parts = append(parts, "単体は未解析")
		}
		if c.Multi > 0 {
			parts = append(parts, fmt.Sprintf("まとめ解析に%d件含まれる", c.Multi))
		}
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
	Input    string  `json:"input"`
	Request  string  `json:"request"`
	SolveIDs []int64 `json:"solve_ids"`
	Title    string  `json:"title"`
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
	return text(fmt.Sprintf("ソルブ #%d の単体解析用データ\n\n%s\n\n---\n依頼の例: %s\n保存するときは save_analysis に kind=solve, solve_id=%d を渡す。",
		a.SolveID, in.Input, in.Request, a.SolveID)), nil, nil
}

type getSolvesArgs struct {
	SolveIDs []int64 `json:"solve_ids,omitempty" jsonschema:"対象のソルブの ID。指定したらこれだけを対象にする"`
	Mode     string  `json:"mode,omitempty" jsonschema:"full（既定）/ case / step。solve_ids がないとき"`
	From     string  `json:"from,omitempty" jsonschema:"期間の始まり（YYYY-MM-DD、その日を含む）。solve_ids がないとき"`
	To       string  `json:"to,omitempty" jsonschema:"期間の終わり（YYYY-MM-DD、その日を含まない）。solve_ids がないとき"`
	Limit    int     `json:"limit,omitempty" jsonschema:"直近何件を対象にするか（既定 50。期間を指定したときは期間内すべて、最大 1000）"`
	Title    string  `json:"title,omitempty" jsonschema:"見出し（例: 直近20件のフルソルブ、10/22 の練習）。省くと件数と期間"`
}

func (t tools) getSolves(ctx context.Context, _ *mcp.CallToolRequest, a getSolvesArgs) (*mcp.CallToolResult, any, error) {
	q := url.Values{}
	if len(a.SolveIDs) > 0 {
		ids := make([]string, len(a.SolveIDs))
		for i, id := range a.SolveIDs {
			ids[i] = strconv.FormatInt(id, 10)
		}
		q.Set("ids", strings.Join(ids, ","))
	} else {
		for k, v := range map[string]string{"mode": a.Mode, "from": a.From, "to": a.To} {
			if v != "" {
				q.Set(k, v)
			}
		}
		if a.Limit > 0 {
			q.Set("limit", strconv.Itoa(a.Limit))
		}
	}
	if a.Title != "" {
		q.Set("title", a.Title)
	}
	var in analysisInput
	if err := t.c.do(ctx, http.MethodGet, "/api/analysis-input", q, nil, &in); err != nil {
		return nil, nil, err
	}
	ids := make([]string, len(in.SolveIDs))
	for i, id := range in.SolveIDs {
		ids[i] = strconv.FormatInt(id, 10)
	}
	return text(fmt.Sprintf("まとめ解析用データ「%s」（%d件）\n\n%s\n\n---\n依頼の例: %s\n"+
		"保存するときは save_analysis に kind=multi, solve_ids=[%s], title=%q を渡す（見出しは内容に合わせて変えてよい）。",
		in.Title, len(in.SolveIDs), in.Input, in.Request, strings.Join(ids, ","), in.Title)), nil, nil
}

type listAnalysesArgs struct {
	SolveID int64  `json:"solve_id,omitempty" jsonschema:"このソルブを対象にした解析（単体・まとめ）だけを返す"`
	Kind    string `json:"kind,omitempty" jsonschema:"solve（単体）/ multi（まとめ）"`
	Limit   int    `json:"limit,omitempty" jsonschema:"件数（既定 5）"`
}

func (t tools) listAnalyses(ctx context.Context, _ *mcp.CallToolRequest, a listAnalysesArgs) (*mcp.CallToolResult, any, error) {
	if a.Limit <= 0 {
		a.Limit = 5
	}
	q := url.Values{"limit": {strconv.Itoa(a.Limit)}}
	if a.Kind != "" {
		q.Set("kind", a.Kind)
	}
	if a.SolveID > 0 {
		q.Set("solve_id", strconv.FormatInt(a.SolveID, 10))
	}
	var list []analysis.Analysis
	if err := t.c.do(ctx, http.MethodGet, "/api/analyses", q, nil, &list); err != nil {
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
		fmt.Fprintf(&b, "解析 #%d（%s、%s、%s）\n\n%s", an.ID, target(an), localTime(an.CreatedAt), an.Model, an.Result)
	}
	return text(b.String()), nil, nil
}

// target は解析の対象を短く表す。
func target(an analysis.Analysis) string {
	if an.Kind == analysis.KindSolve {
		if len(an.SolveIDs) == 0 {
			return "単体（ソルブは削除済み）"
		}
		return fmt.Sprintf("単体：ソルブ #%d", an.SolveIDs[0])
	}
	ids := make([]string, len(an.SolveIDs))
	for i, id := range an.SolveIDs {
		ids[i] = fmt.Sprintf("#%d", id)
	}
	return fmt.Sprintf("まとめ「%s」：%d件 %s", an.Title, len(an.SolveIDs), strings.Join(ids, " "))
}

type saveAnalysisArgs struct {
	Kind     string  `json:"kind" jsonschema:"solve（単体）か multi（まとめ）"`
	SolveID  int64   `json:"solve_id,omitempty" jsonschema:"単体のときの、ソルブの ID"`
	SolveIDs []int64 `json:"solve_ids,omitempty" jsonschema:"まとめのときの、対象にしたソルブの ID（get_solves が返したもの。2件以上）"`
	Title    string  `json:"title,omitempty" jsonschema:"まとめのときの見出し（例: 直近20件のフルソルブ）"`
	Result   string  `json:"result" jsonschema:"解析結果（日本語の Markdown、見出しは ## から）"`
	Model    string  `json:"model,omitempty" jsonschema:"解析したモデルの名前（例: Claude Opus 5.5）"`
}

func (t tools) saveAnalysis(ctx context.Context, _ *mcp.CallToolRequest, a saveAnalysisArgs) (*mcp.CallToolResult, any, error) {
	r := analysis.SaveRequest{Kind: a.Kind, SolveID: a.SolveID, SolveIDs: a.SolveIDs, Title: a.Title, Result: a.Result, Model: a.Model}
	var saved analysis.Analysis
	if err := t.c.do(ctx, http.MethodPost, "/api/analyses", nil, r, &saved); err != nil {
		return nil, nil, err
	}
	where := fmt.Sprintf("アプリの「解析」画面（/analyses/%d）", saved.ID)
	if saved.Kind == analysis.KindSolve {
		where += fmt.Sprintf("と、ソルブ #%d の詳細画面", a.SolveID)
	}
	return text(fmt.Sprintf("解析 #%d（%s）として保存しました。%sに表示されます。", saved.ID, target(saved), where)), nil, nil
}
