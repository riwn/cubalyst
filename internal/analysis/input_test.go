package analysis

import (
	"strings"
	"testing"
	"time"

	"cubalyst/internal/solves"
)

func mv(moves string, step float64) []solves.Move {
	var out []solves.Move
	for i, m := range strings.Fields(moves) {
		out = append(out, solves.Move{Move: m, T: float64(i) * step})
	}
	return out
}

func TestMergeMoves(t *testing.T) {
	cases := map[string]string{
		"R R U U U F":   "R2 U' F",
		"R R' U":        "U",
		"R R R R":       "",
		"U2 U":          "U'",
		"R U R' U' R U": "R U R' U' R U",
	}
	for in, want := range cases {
		if got := mergeMoves(mv(in, 100)); got != want {
			t.Errorf("mergeMoves(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestAverageOf(t *testing.T) {
	if got := AverageOf([]int64{10000, 11000, 12000, 13000, 14000}); got != 12000 {
		t.Errorf("ao5 = %d", got)
	}
	if got := AverageOf([]int64{10000, -1, 12000, 9000, 13000}); got != 11670 {
		t.Errorf("ao5 with DNF = %d", got)
	}
	if got := AverageOf([]int64{10000, -1, -1, 9000, 13000}); got != -1 {
		t.Errorf("ao5 with 2 DNF = %d", got)
	}
	if got := AverageOf([]int64{1, 2}); got != -2 {
		t.Errorf("too few = %d", got)
	}
}

func fullSolve(id int64, scale float64) solves.Solve {
	// 7段階×4手、各手100ms間隔。段階の頭に500msの認識を入れる
	var moves []solves.Move
	var splits []solves.Split
	t := 0.0
	for i, st := range solves.Stages {
		start := t
		if i > 0 {
			t += 500 * scale
		}
		startIdx := len(moves)
		for k := 0; k < 4; k++ {
			moves = append(moves, solves.Move{Move: []string{"R", "U", "R'", "U'"}[k], T: t})
			t += 100 * scale
		}
		splits = append(splits, solves.Split{Stage: st, StartMS: int64(start), EndMS: int64(t - 100*scale), MoveCount: 4, StartIndex: startIdx, EndIndex: len(moves)})
	}
	return solves.Solve{ID: id, Mode: solves.ModeFull, SolvedAt: time.Date(2026, 10, 1, 0, 0, int(id), 0, time.UTC),
		TotalMS: int64(t - 100*scale), Scramble: "R U", Moves: moves, Splits: splits}
}

func TestSolveInput(t *testing.T) {
	s := fullSolve(7, 1)
	in := SolveInput(s, []solves.Solve{fullSolve(1, 1), fullSolve(2, 2)}, "white")
	for _, want := range []string{
		"#7", "クロス色: white", "| Cross |", "| F2L 2 | 0.80 | 0.50 | 0.30 | 4 |", "R U R' U'",
		"長い間", "0.60秒", "面ごとの回転数", "R: 14（50%", "直近2ソルブ",
	} {
		if !strings.Contains(in, want) {
			t.Errorf("SolveInput missing %q\n%s", want, in)
		}
	}
}

func TestTrendInput(t *testing.T) {
	var list []solves.Solve
	for i := range 12 {
		s := fullSolve(int64(i+1), 1+float64(12-i)/10)
		if i == 3 {
			s.Penalty = solves.PenaltyDNF
		}
		list = append(list, s)
	}
	in := TrendInput(list, "full", "white")
	for _, want := range []string{"件数: 12（DNF 1）", "現在の ao5", "## 段階別（11ソルブの平均）", "## 前半", "## 後半", "最も時間を使った段階", "F2L: 11件"} {
		if !strings.Contains(in, want) {
			t.Errorf("TrendInput missing %q\n%s", want, in)
		}
	}
}
