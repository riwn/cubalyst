package stagecases

import (
	"context"
	"database/sql"
	"path/filepath"
	"strings"
	"testing"

	"github.com/riwn/cubalyst/internal/cube"
	"github.com/riwn/cubalyst/internal/db"
	"github.com/riwn/cubalyst/internal/solves"
)

func openDB(t *testing.T) *sql.DB {
	t.Helper()
	database, err := db.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { database.Close() })
	if err := db.Migrate(context.Background(), database); err != nil {
		t.Fatal(err)
	}
	return database
}

func loadCases(t *testing.T, database *sql.DB) *Cases {
	t.Helper()
	cs, err := LoadCases(context.Background(), database)
	if err != nil {
		t.Fatal(err)
	}
	return cs
}

type caseRow struct{ id, set, alg, pattern string }

func caseRows(t *testing.T, database *sql.DB) []caseRow {
	t.Helper()
	rows, err := database.Query(`SELECT id, case_set, alg, pattern FROM cases ORDER BY sort`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var out []caseRow
	for rows.Next() {
		var r caseRow
		if err := rows.Scan(&r.id, &r.set, &r.alg, &r.pattern); err != nil {
			t.Fatal(err)
		}
		out = append(out, r)
	}
	return out
}

func casePattern(t *testing.T, database *sql.DB, id string) cube.State {
	t.Helper()
	for _, r := range caseRows(t, database) {
		if r.id == id {
			s, err := cube.ParseState(r.pattern)
			if err != nil {
				t.Fatal(err)
			}
			return s
		}
	}
	t.Fatalf("case %s not found", id)
	return cube.State{}
}

// ケースの状態（cases.pattern）が、それぞれ自分のケースとして判定される（署名が重ならない）。
// U を回した状態（前 AUF）でも同じケースになる。
func TestFindIdentifiesEveryCase(t *testing.T) {
	database := openDB(t)
	cs := loadCases(t, database)
	rows := caseRows(t, database)
	if len(rows) != 57+21+41 {
		t.Fatalf("cases = %d", len(rows))
	}
	for _, r := range rows {
		s, err := cube.ParseState(r.pattern)
		if err != nil {
			t.Fatal(err)
		}
		for _, a := range []string{"", "U", "U2", "U'"} {
			c := cs.Find(r.set, s.MustApply(fields(a)...))
			if c == nil || c.ID != r.id {
				t.Errorf("%s with %q: found %v", r.id, a, c)
			}
		}
	}
}

// F2L の手順は U・R・F だけなので、完成状態に逆手順を当てると cases.pattern（web の cubing.js で作った状態）と一致する。
// キューブのモデル（シールの並びと回転）が web と同じであることの確認。
func TestF2LPatternsMatchAlgorithms(t *testing.T) {
	database := openDB(t)
	for _, r := range caseRows(t, database) {
		if r.set != "F2L" {
			continue
		}
		got := cube.Solved().MustApply(cube.InverseAlg(strings.Fields(r.alg))...)
		if got.String() != r.pattern {
			t.Errorf("%s: %s\nwant %s", r.id, got, r.pattern)
		}
	}
}

// solveOf は、開始状態 start から moves を回して完成するソルブを作る（クロスは黄＝キューブ自身の D なので、持ち替えなしで標準の向き）。
func solveOf(t *testing.T, moves string, splits []solves.Split) solves.Solve {
	t.Helper()
	var ms []solves.Move
	for i, m := range strings.Fields(moves) {
		ms = append(ms, solves.Move{Move: m, T: float64(i+1) * 500})
	}
	return solves.Solve{ID: 1, Mode: solves.ModeFull, Moves: ms, Splits: splits}
}

func stage(name string, from, to int) solves.Split {
	return solves.Split{Stage: name, StartIndex: from, EndIndex: to, MoveCount: to - from, StartMS: int64(from) * 500, EndMS: int64(to) * 500}
}

func TestAnalyzeF2LPair(t *testing.T) {
	cs := loadCases(t, openDB(t))
	// F2L 8（R U2 R' U' R U R'）：上段で隣り合っているが色が合っていない（クロスの色が上）
	moves := "R U U R' U' R U R'"
	s := solveOf(t, moves, []solves.Split{stage("f2l4", 0, 8)})
	got, err := Analyze(s, cs, "yellow")
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Pairs) != 1 {
		t.Fatalf("pairs = %+v", got.Pairs)
	}
	p := got.Pairs[0]
	if p.Case == nil || p.Case.ID != "f2l-8" || p.Case.Moves != 8 {
		t.Errorf("case = %+v", p.Case)
	}
	if p.Shape != ShapeWrong || p.CrossFacing != "up" {
		t.Errorf("shape = %s %s", p.Shape, p.CrossFacing)
	}
	if p.Slot != "緑・赤" {
		t.Errorf("slot = %s", p.Slot)
	}
	if p.Path[0] != ShapeWrong || p.Path[len(p.Path)-1] != ShapeSolved || p.MovesToPair == 0 || p.Rewrong || p.BrokeOther {
		t.Errorf("path = %v, to pair %d, rewrong %v, broke %v", p.Path, p.MovesToPair, p.Rewrong, p.BrokeOther)
	}
	if p.Moves != 8 || p.NetMoves != 8 || p.Cancelled != 0 || p.RecognitionMS != 500 {
		t.Errorf("moves = %d net %d cancelled %d recognition %d", p.Moves, p.NetMoves, p.Cancelled, p.RecognitionMS)
	}
}

func TestAnalyzeCancelled(t *testing.T) {
	cs := loadCases(t, openDB(t))
	// F2L 2（R U R'）の前に、U を回して戻す
	s := solveOf(t, "U U' U R U R'", []solves.Split{stage("f2l4", 0, 6)})
	got, err := Analyze(s, cs, "yellow")
	if err != nil {
		t.Fatal(err)
	}
	p := got.Pairs[0]
	if p.Moves != 6 || p.NetMoves != 4 || p.Cancelled != 2 {
		t.Errorf("moves %d net %d cancelled %d", p.Moves, p.NetMoves, p.Cancelled)
	}
}

func TestFillPath(t *testing.T) {
	p := Pair{Shape: ShapeWrong}
	fillPath(&p, []string{ShapeApart, ShapeApart, ShapeWrong, "c-U/e-other", ShapePaired, ShapeSolved, "c-other/e-other", ShapeSolved})
	want := []string{ShapeWrong, ShapeApart, ShapeWrong, "c-U/e-other", ShapePaired, ShapeSolved, "c-other/e-other", ShapeSolved}
	if strings.Join(p.Path, ",") != strings.Join(want, ",") {
		t.Errorf("path = %v", p.Path)
	}
	if !p.Rewrong || !p.BrokeOther || p.MovesToPair != 5 {
		t.Errorf("rewrong %v broke %v to pair %d", p.Rewrong, p.BrokeOther, p.MovesToPair)
	}
}

func TestAnalyzeLastLayer(t *testing.T) {
	database := openDB(t)
	cs := loadCases(t, database)
	tperm := "R U R' U' R' F R2 U' R' U' R U R' F'"
	ua := "R U' R U R U R U' R' U' R2"
	// T パームのあとに Ua パーム（2-look）。開始状態は Ua の状態に T パームの逆を当てたもの
	moves := strings.Fields(tperm + " " + ua)
	start := casePattern(t, database, "pll-Ua").MustApply(cube.InverseAlg(strings.Fields(tperm))...)
	if start.MustApply(moves...) != cube.Solved() {
		t.Fatal("fixture does not solve the cube")
	}
	s := solveOf(t, strings.Join(moves, " "), []solves.Split{stage("pll", 0, len(moves))})
	got, err := Analyze(s, cs, "yellow")
	if err != nil {
		t.Fatal(err)
	}
	if got.PLL == nil || len(got.PLL.Steps) != 2 || got.PLL.Steps[1].ID != "pll-Ua" || got.PLL.Repeated {
		t.Fatalf("pll = %+v", got.PLL)
	}
	if got.PLL.Steps[0].ID == "" {
		t.Errorf("first step not identified: %+v", got.PLL.Steps)
	}

	// T パームだけ（1-look）
	s = solveOf(t, tperm, []solves.Split{stage("pll", 0, len(strings.Fields(tperm)))})
	got, err = Analyze(s, cs, "yellow")
	if err != nil {
		t.Fatal(err)
	}
	if len(got.PLL.Steps) != 1 || got.PLL.Steps[0].ID != "pll-T" {
		t.Errorf("pll = %+v", got.PLL.Steps)
	}
}

// OLL・PLL の集計：認識は最初の手まで、多い手数は1つの手順で揃えた回だけ
func TestSummaryLastLayer(t *testing.T) {
	cs := loadCases(t, openDB(t))
	// キューブの記録と同じく 180度は2手
	tperm := "R U R' U' R' F R R U' R' U' R U R' F'"
	ua := "R U' R U R U R U' R' U' R R"
	n := len(strings.Fields(tperm))
	one := solveOf(t, tperm, []solves.Split{stage("pll", 0, n)})
	// 2-look（T パームのあとに Ua）。段階の始まりを 300ms 早めて、認識を 800ms にする
	two := solveOf(t, tperm+" "+ua, nil)
	two.ID = 2
	sp := stage("pll", 0, len(two.Moves))
	sp.StartMS = -300
	two.Splits = []solves.Split{sp}
	r, err := AnalyzeAll([]solves.Solve{one, two, one}, cs, "yellow")
	if err != nil {
		t.Fatal(err)
	}
	if len(r.Summary.PLL) != 2 {
		t.Fatalf("pll = %+v", r.Summary.PLL)
	}
	tst, other := r.Summary.PLL[0], r.Summary.PLL[1]
	if tst.ID != "pll-T" || tst.Count != 2 || tst.AvgRecognitionMS != 500 || tst.AvgMoves != float64(n) || tst.AvgSteps != 1 {
		t.Errorf("T = %+v", tst)
	}
	if tst.AvgExtra == nil || *tst.AvgExtra != 0 {
		t.Errorf("T extra = %v", tst.AvgExtra)
	}
	// 2-look の回は多い手数に入れない
	if other.Count != 1 || other.AvgRecognitionMS != 800 || other.AvgSteps != 2 || other.AvgExtra != nil {
		t.Errorf("2-look = %+v", other)
	}
}

func TestAnalyzeCrossColorWhite(t *testing.T) {
	cs := loadCases(t, openDB(t))
	// クロスが白（キューブ自身の U）のとき：x2 で持ち替えて見る。キューブ自身の向きでの R D R' は、見た向きでの R U R'
	moves := "R D R'"
	s := solveOf(t, moves, []solves.Split{stage("f2l4", 0, 3)})
	got, err := Analyze(s, cs, "white")
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Pairs) != 1 || got.Pairs[0].Case == nil || got.Pairs[0].Case.ID != "f2l-2" {
		t.Fatalf("pairs = %+v", got.Pairs)
	}
}

func TestNetMoves(t *testing.T) {
	cases := map[string]int{
		"R U R'":        3,
		"R R' U":        1,
		"U U":           2,
		"R L R'":        1,
		"U D U'":        1,
		"R U U' R'":     0,
		"R U R' U' U U": 4,
	}
	for in, want := range cases {
		if got := netMoves(strings.Fields(in)); got != want {
			t.Errorf("netMoves(%q) = %d, want %d", in, got, want)
		}
	}
}

func TestSummary(t *testing.T) {
	cs := loadCases(t, openDB(t))
	a := solveOf(t, "R U U R' U' R U R'", []solves.Split{stage("f2l4", 0, 8)})
	b := solveOf(t, "R U R'", []solves.Split{stage("f2l4", 0, 3)})
	b.ID = 2
	r, err := AnalyzeAll([]solves.Solve{a, b}, cs, "yellow")
	if err != nil {
		t.Fatal(err)
	}
	if r.Summary.Pairs != 2 || len(r.Summary.F2LShapes) != 2 || len(r.Summary.F2LCases) != 2 {
		t.Fatalf("summary = %+v", r.Summary)
	}
	var share float64
	for _, st := range r.Summary.F2LShapes {
		share += st.ShareMS
		if st.AvgExtra == nil || *st.AvgExtra != 0 {
			t.Errorf("%s extra = %v", st.Label, st.AvgExtra)
		}
	}
	if share < 99.9 || share > 100.1 {
		t.Errorf("share = %.1f", share)
	}
}
