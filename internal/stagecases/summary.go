package stagecases

import (
	"cmp"
	"slices"
	"strings"

	"github.com/riwn/cubalyst/internal/solves"
)

// Result は対象のソルブすべての判定と集計。
type Result struct {
	CrossColor string  `json:"cross_color"`
	SolveIDs   []int64 `json:"solve_ids"`
	Solves     []Solve `json:"solves"`
	Summary    Summary `json:"summary"`
}

// Summary は形・ケースごとの集計。
type Summary struct {
	Pairs     int         `json:"pairs"`
	F2LShapes []ShapeStat `json:"f2l_shapes"`
	F2LCases  []CaseStat  `json:"f2l_cases"`
	OLL       []LLStat    `json:"oll"`
	PLL       []LLStat    `json:"pll"`
}

// ShapeStat は F2L の始めたときの形ごとの集計。
type ShapeStat struct {
	Shape       string  `json:"shape"`
	CrossFacing string  `json:"cross_facing,omitempty"`
	Label       string  `json:"label"`
	Count       int     `json:"count"`
	AvgMS       float64 `json:"avg_ms"`
	MedianMS    float64 `json:"median_ms"`
	AvgMoves    float64 `json:"avg_moves"`
	// AvgExtra は、標準手順の手数より多く回した手数の平均（ケースを判定できたペアだけ）。判定できたペアが無ければ nil。
	AvgExtra     *float64 `json:"avg_extra"`
	AvgCancelled float64  `json:"avg_cancelled"`
	// AvgMovesToPair はペアができるまでの手数の平均（ペアを作って入れたものだけ）。
	AvgMovesToPair float64 `json:"avg_moves_to_pair"`
	Rewrong        int     `json:"rewrong"`
	BrokeOther     int     `json:"broke_other"`
	// ShareMS は F2L 全体の時間に占める割合（%）。
	ShareMS float64 `json:"share_ms"`
}

// CaseStat は F2L ケースごとの集計。
type CaseStat struct {
	CaseRef
	Shape       string  `json:"shape"`
	CrossFacing string  `json:"cross_facing,omitempty"`
	Count       int     `json:"count"`
	AvgMS       float64 `json:"avg_ms"`
	AvgMoves    float64 `json:"avg_moves"`
	AvgExtra    float64 `json:"avg_extra"`
	Rewrong     int     `json:"rewrong"`
}

// LLStat は OLL・PLL の始めたときのケースごとの集計。
type LLStat struct {
	CaseRef
	Count    int     `json:"count"`
	AvgMS    float64 `json:"avg_ms"`
	AvgSteps float64 `json:"avg_steps"`
	// Repeated は、同じケースが2回以上出てきた（やり直した）回数。
	Repeated int `json:"repeated"`
}

// AnalyzeAll は対象のソルブをすべて判定して集計する。
func AnalyzeAll(list []solves.Solve, cases *Cases, crossColor string) (Result, error) {
	r := Result{CrossColor: crossColor, SolveIDs: []int64{}, Solves: []Solve{}}
	for _, s := range list {
		a, err := Analyze(s, cases, crossColor)
		if err != nil {
			return r, err
		}
		r.SolveIDs = append(r.SolveIDs, s.ID)
		r.Solves = append(r.Solves, a)
	}
	r.Summary = summarize(r.Solves)
	return r, nil
}

func summarize(list []Solve) Summary {
	var pairs []Pair
	var olls, plls []*LastLayer
	for _, s := range list {
		pairs = append(pairs, s.Pairs...)
		if s.OLL != nil && len(s.OLL.Steps) > 0 {
			olls = append(olls, s.OLL)
		}
		if s.PLL != nil && len(s.PLL.Steps) > 0 {
			plls = append(plls, s.PLL)
		}
	}
	sum := Summary{Pairs: len(pairs), F2LShapes: []ShapeStat{}, F2LCases: []CaseStat{}, OLL: llStats(olls), PLL: llStats(plls)}
	var total float64
	for _, p := range pairs {
		total += float64(p.MS)
	}

	type shapeKey struct{ shape, facing string }
	byShape := map[shapeKey][]Pair{}
	byCase := map[string][]Pair{}
	for _, p := range pairs {
		k := shapeKey{p.Shape, p.CrossFacing}
		byShape[k] = append(byShape[k], p)
		if p.Case != nil {
			byCase[p.Case.ID] = append(byCase[p.Case.ID], p)
		}
	}
	for k, g := range byShape {
		st := ShapeStat{Shape: k.shape, CrossFacing: k.facing, Label: ShapeLabel(k.shape, k.facing), Count: len(g)}
		var ms, mv, canc, extra, toPair []float64
		for _, p := range g {
			ms = append(ms, float64(p.MS))
			mv = append(mv, float64(p.Moves))
			canc = append(canc, float64(p.Cancelled))
			if p.Case != nil {
				extra = append(extra, float64(p.Moves-p.Case.Moves))
			}
			if p.MovesToPair > 0 {
				toPair = append(toPair, float64(p.MovesToPair))
			}
			if p.Rewrong {
				st.Rewrong++
			}
			if p.BrokeOther {
				st.BrokeOther++
			}
		}
		st.AvgMS, st.MedianMS, st.AvgMoves, st.AvgCancelled, st.AvgMovesToPair = mean(ms), median(ms), mean(mv), mean(canc), mean(toPair)
		if len(extra) > 0 {
			e := mean(extra)
			st.AvgExtra = &e
		}
		if total > 0 {
			st.ShareMS = sumOf(ms) / total * 100
		}
		sum.F2LShapes = append(sum.F2LShapes, st)
	}
	slices.SortFunc(sum.F2LShapes, func(a, b ShapeStat) int {
		return cmp.Or(cmp.Compare(b.Count, a.Count), strings.Compare(a.Label, b.Label))
	})
	for _, g := range byCase {
		c := CaseStat{CaseRef: *g[0].Case, Shape: g[0].Shape, CrossFacing: g[0].CrossFacing, Count: len(g)}
		var ms, mv, extra []float64
		for _, p := range g {
			ms = append(ms, float64(p.MS))
			mv = append(mv, float64(p.Moves))
			extra = append(extra, float64(p.Moves-p.Case.Moves))
			if p.Rewrong {
				c.Rewrong++
			}
		}
		c.AvgMS, c.AvgMoves, c.AvgExtra = mean(ms), mean(mv), mean(extra)
		sum.F2LCases = append(sum.F2LCases, c)
	}
	slices.SortFunc(sum.F2LCases, func(a, b CaseStat) int {
		return cmp.Or(cmp.Compare(b.Count, a.Count), cmp.Compare(b.AvgExtra, a.AvgExtra), strings.Compare(a.ID, b.ID))
	})
	return sum
}

func llStats(list []*LastLayer) []LLStat {
	by := map[string][]*LastLayer{}
	var order []string
	for _, ll := range list {
		id := ll.Steps[0].ID
		if _, ok := by[id]; !ok {
			order = append(order, id)
		}
		by[id] = append(by[id], ll)
	}
	out := []LLStat{}
	for _, id := range order {
		g := by[id]
		st := LLStat{CaseRef: g[0].Steps[0], Count: len(g)}
		var ms, steps []float64
		for _, ll := range g {
			ms = append(ms, float64(ll.MS))
			steps = append(steps, float64(len(ll.Steps)))
			if ll.Repeated {
				st.Repeated++
			}
		}
		st.AvgMS, st.AvgSteps = mean(ms), mean(steps)
		out = append(out, st)
	}
	slices.SortFunc(out, func(a, b LLStat) int {
		return cmp.Or(cmp.Compare(b.Count, a.Count), cmp.Compare(b.AvgMS, a.AvgMS), strings.Compare(a.ID, b.ID))
	})
	return out
}

// ShapeLabel は形の表示名。
func ShapeLabel(shape, facing string) string {
	label := map[string]string{
		ShapeSolved:       "揃っている",
		ShapePaired:       "ペアができている",
		ShapeWrong:        "くっついているが色が合っていない",
		ShapeApart:        "上段で離れている",
		"c-own/e-U":       "角がスロット・エッジが上段",
		"c-U/e-own":       "角が上段・エッジがスロット",
		"c-own/e-own":     "角・エッジともスロット（向きが違う）",
		"c-U/e-other":     "角が上段・エッジが別のスロット",
		"c-other/e-U":     "角が別のスロット・エッジが上段",
		"c-other/e-other": "角・エッジとも別のスロット",
		"c-own/e-other":   "角がスロット・エッジが別のスロット",
		"c-other/e-own":   "角が別のスロット・エッジがスロット",
	}[shape]
	if label == "" {
		label = shape
	}
	switch facing {
	case "up":
		label += "（クロスの色が上）"
	case "side":
		label += "（クロスの色が横）"
	}
	return label
}

func sumOf(xs []float64) float64 {
	var s float64
	for _, x := range xs {
		s += x
	}
	return s
}

func mean(xs []float64) float64 {
	if len(xs) == 0 {
		return 0
	}
	return sumOf(xs) / float64(len(xs))
}

func median(xs []float64) float64 {
	if len(xs) == 0 {
		return 0
	}
	s := slices.Clone(xs)
	slices.Sort(s)
	if len(s)%2 == 1 {
		return s[len(s)/2]
	}
	return (s[len(s)/2-1] + s[len(s)/2]) / 2
}
