package analysis

import (
	"strings"
	"testing"
	"time"

	"github.com/riwn/cubalyst/internal/settings"
	"github.com/riwn/cubalyst/internal/solves"
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
	// キューブ自身の向き（黄を下・緑を前）＝変換なし
	in := SolveInput(s, []solves.Solve{fullSolve(1, 1), fullSolve(2, 2)},
		settings.Settings{CrossColor: "white", HoldBottom: "yellow", HoldFront: "green"})
	for _, want := range []string{
		"#7", "クロス色: white", "| Cross |", "| F2L 2 | 0.80 | 0.50 | 0.30 | 4 |", "R U R' U'",
		"打ち消しで消えた手", "長い間", "0.60秒", "面ごとの回転数", "R: 14（50%", "直近2ソルブ", "持ち方（解法の表記）: 下が黄・前が緑（右は赤）",
	} {
		if !strings.Contains(in, want) {
			t.Errorf("SolveInput missing %q\n%s", want, in)
		}
	}
}

func TestMultiInput(t *testing.T) {
	var list []solves.Solve
	for i := range 12 {
		s := fullSolve(int64(i+1), 1+float64(12-i)/10)
		if i == 3 {
			s.Penalty = solves.PenaltyDNF
		}
		list = append(list, s)
	}
	in := MultiInput(list, "直近", settings.Defaults)
	for _, want := range []string{"件数: 12（DNF 1）", "現在の ao5", "## 段階別（11ソルブの平均）", "## 前半", "## 後半", "最も時間を使った段階", "F2L: 11件"} {
		if !strings.Contains(in, want) {
			t.Errorf("MultiInput missing %q\n%s", want, in)
		}
	}
}

func TestSolveInputConvertsToHoldFrame(t *testing.T) {
	// 白下・赤前：キューブの R → 持ち方では F、U → D
	in := SolveInput(fullSolve(7, 1), nil, settings.Settings{CrossColor: "white", HoldBottom: "white", HoldFront: "red"})
	for _, want := range []string{"F D F' D'", "F: 14（50%", "下が白・前が赤（右は緑）"} {
		if !strings.Contains(in, want) {
			t.Errorf("missing %q\n%s", want, in)
		}
	}
	if strings.Contains(in, "R U R' U'") {
		t.Errorf("moves should be converted\n%s", in)
	}
}

// withHolds は fullSolve に、F2L 2 の認識中（1400〜1650ms）の y の持ち替えを足す。
// 着手時は黄を下・緑を前（キューブ自身の向き）で、y のあとは前が赤になる。
func withHolds(s solves.Solve) solves.Solve {
	s.Gyro = []solves.GyroSample{{-100, 1, 0, 0, 0}}
	s.Holds = &solves.Holds{
		Start:   solves.Hold{Bottom: "yellow", Front: "green"},
		Changes: []solves.HoldChange{{Index: 8, StartT: 1400, EndT: 1650, Bottom: "yellow", Front: "red", Rot: "y"}},
	}
	return s
}

func TestSolveInputWithHolds(t *testing.T) {
	st := settings.Settings{CrossColor: "white", HoldBottom: "white", HoldFront: "red"}
	in := SolveInput(withHolds(fullSolve(7, 1)), nil, st)
	for _, want := range []string{
		"ジャイロで記録（着手時：下が黄・前が緑）", "持ち替えは 1 回",
		"| 段階 | 所要 | 認識 | うち持ち替え |",
		// F2L 2：認識 0.50 のうち持ち替え 0.25。y のあとは赤が前なので、キューブの R は F
		"| F2L 2 | 0.80 | 0.50 | 0.25 | 0.30 | 4 | 13.33 | 1回（0.25秒） | y F U F' U' |",
		"| F2L 1 | 0.80 | 0.50 | 0.00 | 0.30 | 4 | 13.33 | 0回（0.00秒） | R U R' U' |",
		"y の持ち替え 0.25秒を含む",
	} {
		if !strings.Contains(in, want) {
			t.Errorf("missing %q in:\n%s", want, in)
		}
	}

	// ジャイロのデータはあるが持ち替えを決められなかったソルブ
	s := fullSolve(8, 1)
	s.Gyro = []solves.GyroSample{{0, 1, 0, 0, 0}}
	if in := SolveInput(s, nil, st); !strings.Contains(in, "途中で途切れたため、持ち替えは記録なし") {
		t.Errorf("gyro without holds:\n%s", in)
	}
	// ワイドムーブかもしれない x は括弧で囲む
	s = withHolds(fullSolve(9, 1))
	s.Holds.Changes[0].Rot, s.Holds.Changes[0].Front, s.Holds.Changes[0].WithMove = "x", "white", true
	if in := SolveInput(s, nil, st); !strings.Contains(in, "[x]") {
		t.Errorf("with_move:\n%s", in)
	}
}

func TestMultiInputWithHolds(t *testing.T) {
	st := settings.Settings{CrossColor: "white", HoldBottom: "yellow", HoldFront: "green"}
	var list []solves.Solve
	for i := int64(1); i <= 4; i++ {
		list = append(list, withHolds(fullSolve(i, 1)))
	}
	list = append(list, fullSolve(5, 1))
	if in := MultiInput(list, "t", st); !strings.Contains(in, "5件中4件") || !strings.Contains(in, "持ち替えの数字は出していません") {
		t.Errorf("too few:\n%s", in)
	}
	list = append(list, withHolds(fullSolve(6, 1)))
	in := MultiInput(list, "t", st)
	for _, want := range []string{"6件中5件", "1ソルブあたり: 1.0回、0.25秒（うち段階の最初の手より前＝認識中 0.25秒）", "| F2L 2 | 1.00 | 0.25 | 0.25 |", "多い持ち替え: y 5回"} {
		if !strings.Contains(in, want) {
			t.Errorf("missing %q in:\n%s", want, in)
		}
	}
	// ジャイロを使ったことがなければ、持ち替えの節は出さない
	if in := MultiInput([]solves.Solve{fullSolve(1, 1)}, "t", st); strings.Contains(in, "持ち替え（ジャイロで記録）") {
		t.Errorf("no gyro:\n%s", in)
	}
}
