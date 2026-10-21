package mcpserver

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"cubalyst/internal/db"
	"cubalyst/internal/server"
)

const solve = `{"mode":"full","solved_at":"2026-10-21T01:02:03.456Z","total_ms":3000,"penalty":"",
	"scramble":"R U","moves":[{"move":"U","cube_ts":1,"local_ts":1,"t":0},{"move":"R","cube_ts":2,"local_ts":2,"t":1000},
	{"move":"U","cube_ts":3,"local_ts":3,"t":3000}],"case_id":null,"step":null,"note":"memo",
	"splits":[{"stage":"cross","start_ms":0,"end_ms":1000,"move_count":2,"start_index":0,"end_index":2},
	{"stage":"f2l1","start_ms":1000,"end_ms":3000,"move_count":1,"start_index":2,"end_index":3}]}`

// connect は本物の HTTP サーバー（一時 DB）につないだ MCP サーバーへのセッションを返す。
func connect(t *testing.T, solves ...string) (*mcp.ClientSession, string) {
	t.Helper()
	database, err := db.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { database.Close() })
	ctx := context.Background()
	if err := db.Migrate(ctx, database); err != nil {
		t.Fatal(err)
	}
	api := httptest.NewServer(server.New(database, t.TempDir(), nil).Handler())
	t.Cleanup(api.Close)
	for _, s := range solves {
		res, err := http.Post(api.URL+"/api/solves", "application/json", strings.NewReader(s))
		if err != nil || res.StatusCode != http.StatusCreated {
			t.Fatalf("create solve: %v %v", err, res.Status)
		}
		res.Body.Close()
	}

	st, ct := mcp.NewInMemoryTransports()
	if _, err := New(NewClient(api.URL)).Connect(ctx, st, nil); err != nil {
		t.Fatal(err)
	}
	cs, err := mcp.NewClient(&mcp.Implementation{Name: "test"}, nil).Connect(ctx, ct, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cs.Close() })
	return cs, api.URL
}

// call はツールを呼び、本文とエラーかどうかを返す。
func call(t *testing.T, cs *mcp.ClientSession, name string, args map[string]any) (string, bool) {
	t.Helper()
	res, err := cs.CallTool(context.Background(), &mcp.CallToolParams{Name: name, Arguments: args})
	if err != nil {
		t.Fatalf("%s: %v", name, err)
	}
	var b strings.Builder
	for _, c := range res.Content {
		if tc, ok := c.(*mcp.TextContent); ok {
			b.WriteString(tc.Text)
		}
	}
	return b.String(), res.IsError
}

func TestTools(t *testing.T) {
	cs, _ := connect(t, solve, solve)
	if !strings.Contains(cs.InitializeResult().Instructions, "コーチ") {
		t.Fatalf("instructions: %q", cs.InitializeResult().Instructions)
	}

	out, isErr := call(t, cs, "list_solves", nil)
	if isErr || !strings.Contains(out, "全2件") || !strings.Contains(out, "#2") || !strings.Contains(out, "3.00  3手  Cross 1.00 / F2L 2.00") ||
		!strings.Contains(out, "最後の傾向分析: まだなし") || strings.Count(out, "未解析") != 2 {
		t.Fatalf("list_solves: %s", out)
	}

	out, isErr = call(t, cs, "get_solve", nil)
	if isErr || !strings.Contains(out, "ソルブ #2 の解析用データ") || !strings.Contains(out, "| Cross |") {
		t.Fatalf("get_solve latest: %s", out)
	}
	if out, isErr = call(t, cs, "get_solve", map[string]any{"solve_id": 99}); !isErr || !strings.Contains(out, "not found") {
		t.Fatalf("get_solve missing: %s", out)
	}

	out, isErr = call(t, cs, "get_trend", map[string]any{"limit": 10})
	if isErr || !strings.Contains(out, "直近10件（full）") {
		t.Fatalf("get_trend: %s", out)
	}

	out, isErr = call(t, cs, "save_analysis", map[string]any{"kind": "solve", "solve_id": 1, "result": "## 結論\nクロスが長い"})
	if isErr || !strings.Contains(out, "解析 #1") || !strings.Contains(out, "/history/1") {
		t.Fatalf("save solve: %s", out)
	}
	out, isErr = call(t, cs, "save_analysis", map[string]any{"kind": "trend", "limit": 10, "result": "傾向", "model": "Claude Opus 5.5"})
	if isErr || !strings.Contains(out, "統計画面") {
		t.Fatalf("save trend: %s", out)
	}
	if out, isErr = call(t, cs, "save_analysis", map[string]any{"kind": "solve", "solve_id": 1, "result": ""}); !isErr {
		t.Fatalf("save empty: %s", out)
	}

	// 解析済みかどうかと、最後の傾向分析が一覧に出る
	out, _ = call(t, cs, "list_solves", nil)
	lines := strings.Split(out, "\n")
	if !strings.Contains(out, `最後の傾向分析: `) || !strings.Contains(out, `"limit":10`) {
		t.Fatalf("list_solves trend: %s", out)
	}
	var solve1, solve2 string
	for _, l := range lines {
		switch {
		case strings.HasPrefix(l, "#1 "):
			solve1 = l
		case strings.HasPrefix(l, "#2 "):
			solve2 = l
		}
	}
	if !strings.Contains(solve1, "解析済み（1回") || !strings.Contains(solve2, "未解析") {
		t.Fatalf("list_solves analyzed marks:\n%s", out)
	}

	out, _ = call(t, cs, "list_analyses", map[string]any{"solve_id": 1})
	if !strings.Contains(out, "ソルブ #1") || !strings.Contains(out, "Claude（MCP）") || strings.Contains(out, "傾向") {
		t.Fatalf("list_analyses solve: %s", out)
	}
	out, _ = call(t, cs, "list_analyses", map[string]any{"kind": "trend"})
	if !strings.Contains(out, `"limit":10`) || !strings.Contains(out, "Claude Opus 5.5") {
		t.Fatalf("list_analyses trend: %s", out)
	}
}

func TestEmptyAndUnreachable(t *testing.T) {
	cs, _ := connect(t)
	if out, isErr := call(t, cs, "get_solve", nil); !isErr || !strings.Contains(out, "まだありません") {
		t.Fatalf("get_solve empty: %s", out)
	}
	if out, _ := call(t, cs, "list_analyses", nil); !strings.Contains(out, "ありません") {
		t.Fatalf("list_analyses empty: %s", out)
	}

	// サーバーが止まっているときは、その旨をツールのエラーとして返す
	st, ct := mcp.NewInMemoryTransports()
	ctx := context.Background()
	if _, err := New(NewClient("http://127.0.0.1:1")).Connect(ctx, st, nil); err != nil {
		t.Fatal(err)
	}
	down, err := mcp.NewClient(&mcp.Implementation{Name: "test"}, nil).Connect(ctx, ct, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer down.Close()
	if out, isErr := call(t, down, "list_solves", nil); !isErr || !strings.Contains(out, "接続できません") {
		t.Fatalf("unreachable: %s", out)
	}
}

func TestPrompts(t *testing.T) {
	cs, _ := connect(t)
	res, err := cs.GetPrompt(context.Background(), &mcp.GetPromptParams{Name: "analyze_solve", Arguments: map[string]string{"solve_id": "7"}})
	if err != nil {
		t.Fatal(err)
	}
	if tc := res.Messages[0].Content.(*mcp.TextContent); !strings.Contains(tc.Text, "ソルブ #7") || !strings.Contains(tc.Text, "save_analysis") {
		t.Fatalf("analyze_solve: %s", tc.Text)
	}
	res, err = cs.GetPrompt(context.Background(), &mcp.GetPromptParams{Name: "analyze_trend"})
	if err != nil {
		t.Fatal(err)
	}
	if tc := res.Messages[0].Content.(*mcp.TextContent); !strings.Contains(tc.Text, "直近50件") {
		t.Fatalf("analyze_trend: %s", tc.Text)
	}
}
