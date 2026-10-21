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
	api := httptest.NewServer(server.New(database, t.TempDir()).Handler())
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
	cs, _ := connect(t, solve, solve, solve)
	if ins := cs.InitializeResult().Instructions; !strings.Contains(ins, "コーチ") || !strings.Contains(ins, "kind=multi") {
		t.Fatalf("instructions: %q", ins)
	}

	out, isErr := call(t, cs, "list_solves", nil)
	if isErr || !strings.Contains(out, "全3件") || !strings.Contains(out, "#3") || !strings.Contains(out, "3.00  3手  Cross 1.00 / F2L 2.00") ||
		!strings.Contains(out, "最後のまとめ解析: まだなし") || strings.Count(out, "単体は未解析") != 3 {
		t.Fatalf("list_solves: %s", out)
	}

	// 単体
	out, isErr = call(t, cs, "get_solve", nil)
	if isErr || !strings.Contains(out, "ソルブ #3 の単体解析用データ") || !strings.Contains(out, "| Cross |") || !strings.Contains(out, "kind=solve, solve_id=3") {
		t.Fatalf("get_solve latest: %s", out)
	}
	if out, isErr = call(t, cs, "get_solve", map[string]any{"solve_id": 99}); !isErr || !strings.Contains(out, "not found") {
		t.Fatalf("get_solve missing: %s", out)
	}
	out, isErr = call(t, cs, "save_analysis", map[string]any{"kind": "solve", "solve_id": 1, "result": "## 結論\nクロスが長い"})
	if isErr || !strings.Contains(out, "解析 #1（単体：ソルブ #1）") || !strings.Contains(out, "/analyses/1") {
		t.Fatalf("save solve: %s", out)
	}

	// まとめ：対象のソルブの ID を受け取り、そのまま保存する
	out, isErr = call(t, cs, "get_solves", map[string]any{"limit": 2, "title": "直近2件"})
	if isErr || !strings.Contains(out, "まとめ解析用データ「直近2件」（2件）") || !strings.Contains(out, "solve_ids=[2,3]") {
		t.Fatalf("get_solves: %s", out)
	}
	if out, isErr = call(t, cs, "get_solves", map[string]any{"solve_ids": []int{1, 3}}); isErr || !strings.Contains(out, "solve_ids=[1,3]") {
		t.Fatalf("get_solves by ids: %s", out)
	}
	if out, isErr = call(t, cs, "get_solves", map[string]any{"from": "2026-10-21", "to": "2026-10-22"}); isErr || !strings.Contains(out, "（3件）") {
		t.Fatalf("get_solves by date: %s", out)
	}
	out, isErr = call(t, cs, "save_analysis", map[string]any{"kind": "multi", "solve_ids": []int{2, 3}, "title": "直近2件", "result": "傾向", "model": "Claude Opus 5.5"})
	if isErr || !strings.Contains(out, "まとめ「直近2件」：2件 #2 #3") {
		t.Fatalf("save multi: %s", out)
	}
	if out, isErr = call(t, cs, "save_analysis", map[string]any{"kind": "multi", "solve_ids": []int{2}, "result": "x"}); !isErr || !strings.Contains(out, "kind=solve") {
		t.Fatalf("save multi with one solve: %s", out)
	}
	if out, isErr = call(t, cs, "save_analysis", map[string]any{"kind": "solve", "solve_id": 1, "result": ""}); !isErr {
		t.Fatalf("save empty: %s", out)
	}

	// 一覧に、単体の解析済みか・まとめに含まれるかと、最後のまとめ解析が出る
	out, _ = call(t, cs, "list_solves", nil)
	if !strings.Contains(out, "最後のまとめ解析: 「直近2件」") {
		t.Fatalf("list_solves multi: %s", out)
	}
	lines := map[string]string{}
	for _, l := range strings.Split(out, "\n") {
		if id, _, ok := strings.Cut(l, " "); ok && strings.HasPrefix(id, "#") {
			lines[id] = l
		}
	}
	if !strings.Contains(lines["#1"], "単体解析済み（1回）") || strings.Contains(lines["#1"], "まとめ") ||
		!strings.Contains(lines["#3"], "単体は未解析") || !strings.Contains(lines["#3"], "まとめ解析に1件含まれる") {
		t.Fatalf("list_solves marks:\n%s", out)
	}

	out, _ = call(t, cs, "list_analyses", map[string]any{"solve_id": 1})
	if !strings.Contains(out, "単体：ソルブ #1") || !strings.Contains(out, "Claude（MCP）") || strings.Contains(out, "まとめ") {
		t.Fatalf("list_analyses solve: %s", out)
	}
	out, _ = call(t, cs, "list_analyses", map[string]any{"kind": "multi"})
	if !strings.Contains(out, "まとめ「直近2件」") || !strings.Contains(out, "Claude Opus 5.5") {
		t.Fatalf("list_analyses multi: %s", out)
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
	res, err = cs.GetPrompt(context.Background(), &mcp.GetPromptParams{Name: "analyze_recent"})
	if err != nil {
		t.Fatal(err)
	}
	if tc := res.Messages[0].Content.(*mcp.TextContent); !strings.Contains(tc.Text, "直近20件") || !strings.Contains(tc.Text, "kind=multi") {
		t.Fatalf("analyze_recent: %s", tc.Text)
	}
}
