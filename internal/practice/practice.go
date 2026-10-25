// Package practice は、期間（1日か1週間）の練習を集計する。
//
// フルソルブのベスト・平均・ao5/ao12（WCA 方式）、それまでの自己ベストとの比べ、前の期間の平均、
// 段階ごとの平均、練習した日ごとの回数、ケース・段階・補助付きの練習の回数を出す。
// 文面にするのは呼ぶ側（通知の本文を作る kawaraban など）。数え方（+2・DNF の扱いなど）はここで決める。
package practice

import (
	"fmt"
	"math"
	"sort"
	"time"

	"github.com/riwn/cubalyst/internal/analysis"
	"github.com/riwn/cubalyst/internal/export"
	"github.com/riwn/cubalyst/internal/solves"
)

// Period は集計する期間 [From, To)。
type Period struct {
	Kind     string // day / week
	From, To time.Time
}

// NewPeriod は、date（その日を含む）までの7日（既定）か1日を期間にする。
func NewPeriod(kind string, date time.Time) (Period, error) {
	end := time.Date(date.Year(), date.Month(), date.Day(), 0, 0, 0, 0, date.Location()).AddDate(0, 0, 1)
	switch kind {
	case "", "week":
		return Period{Kind: "week", From: end.AddDate(0, 0, -7), To: end}, nil
	case "day":
		return Period{Kind: "day", From: end.AddDate(0, 0, -1), To: end}, nil
	}
	return Period{}, fmt.Errorf("period は day か week で指定してください")
}

// Previous は、比べるための1つ前の同じ長さの期間。
func (p Period) Previous() Period {
	return Period{Kind: p.Kind, From: p.From.Add(-p.To.Sub(p.From)), To: p.From}
}

// Stats は期間の集計。時間はミリ秒（フルソルブは +2 込み）。無いものは null。
type Stats struct {
	Period   PeriodJSON `json:"period"`
	Count    int        `json:"count"`  // 期間のソルブの数（すべての種類）
	Full     *Full      `json:"full"`   // フルソルブ。1回も無ければ null
	Stages   *Stages    `json:"stages"` // 段階ごとの平均。段階のそろったフルソルブが無ければ null
	Days     []Day      `json:"days"`   // 練習した日ごと（古い順）
	Practice Practice   `json:"practice"`
}

// PeriodJSON は期間（日付は YYYY-MM-DD、to は含まない）。
type PeriodJSON struct {
	Kind string `json:"kind"`
	From string `json:"from"`
	To   string `json:"to"`
}

// Full はフルソルブの集計。
type Full struct {
	Count      int      `json:"count"`
	DNF        int      `json:"dnf"`
	BestMS     *int64   `json:"best_ms"`
	MeanMS     *float64 `json:"mean_ms"` // DNF を除いた平均
	BestAo5MS  *int64   `json:"best_ao5_ms"`
	BestAo12MS *int64   `json:"best_ao12_ms"`
	// それまで（期間より前）の自己ベスト。期間より前に記録が無ければ null
	PreviousBestMS    *int64 `json:"previous_best_ms"`
	PreviousBestAo5MS *int64 `json:"previous_best_ao5_ms"`
	// 自己ベストを更新したか（前に記録があり、期間のベストの方が速い）
	NewBest    bool `json:"new_best"`
	NewBestAo5 bool `json:"new_best_ao5"`
	// 1つ前の同じ長さの期間の平均（DNF を除く）。無ければ null
	PreviousPeriodMeanMS *float64 `json:"previous_period_mean_ms"`
}

// Stages は、段階のそろったフルソルブ（DNF を除く）の段階ごとの平均。
type Stages struct {
	Count   int     `json:"count"`
	CrossMS float64 `json:"cross_ms"`
	F2LMS   float64 `json:"f2l_ms"`
	OLLMS   float64 `json:"oll_ms"`
	PLLMS   float64 `json:"pll_ms"`
	Moves   float64 `json:"moves"` // 手数
	TPS     float64 `json:"tps"`
}

// Day は練習した日1日。
type Day struct {
	Date       string `json:"date"`
	FullCount  int    `json:"full_count"`
	BestMS     *int64 `json:"best_ms"`     // フルソルブのベスト
	OtherCount int    `json:"other_count"` // フルソルブ以外の練習の数
}

// Practice は、フルソルブ以外の練習。
type Practice struct {
	CaseCount   int    `json:"case_count"`
	Cases       []Item `json:"cases"` // ケースごと（多い順）
	StepCount   int    `json:"step_count"`
	Steps       []Item `json:"steps"` // 段階ごと（多い順）
	AssistCount int    `json:"assist_count"`
}

// Item は練習した対象と回数。
type Item struct {
	ID    string `json:"id"`
	Name  string `json:"name,omitempty"` // ケースの名前
	Count int    `json:"count"`
}

// Compute は期間の集計を作る。
//
//	cur     期間のソルブ（すべての種類、段階付き、古い順）
//	before  期間より前のフルソルブ（古い順）。自己ベストと、前の期間との比較に使う
//	cases   ケースの ID → 名前
func Compute(p Period, cur, before []solves.Solve, cases map[string]string) Stats {
	st := Stats{
		Period: PeriodJSON{Kind: p.Kind, From: p.From.Format(time.DateOnly), To: p.To.Format(time.DateOnly)},
		Count:  len(cur),
		Days:   []Day{},
	}

	if times := fullTimes(cur); len(times) > 0 {
		f := &Full{Count: len(times), DNF: len(times) - len(valid(times))}
		b, m := best(times), mean(times)
		f.BestMS, f.MeanMS = ms(b), msf(m)
		ao5 := bestAverage(times, 5)
		f.BestAo5MS, f.BestAo12MS = ms(ao5), ms(bestAverage(times, 12))

		beforeTimes := fullTimes(before)
		pb, pb5 := best(beforeTimes), bestAverage(beforeTimes, 5)
		f.PreviousBestMS, f.PreviousBestAo5MS = ms(pb), ms(pb5)
		f.NewBest = b >= 0 && pb >= 0 && b < pb
		f.NewBestAo5 = ao5 >= 0 && pb5 >= 0 && ao5 < pb5

		prev := p.Previous()
		var prevList []solves.Solve
		for _, s := range before {
			if !s.SolvedAt.Before(prev.From) && s.SolvedAt.Before(prev.To) {
				prevList = append(prevList, s)
			}
		}
		f.PreviousPeriodMeanMS = msf(mean(fullTimes(prevList)))
		st.Full = f
	}
	st.Stages = stageTimes(cur)

	for d := p.From; d.Before(p.To); d = d.AddDate(0, 0, 1) {
		next := d.AddDate(0, 0, 1)
		var day []solves.Solve
		for _, s := range cur {
			t := s.SolvedAt.In(d.Location())
			if !t.Before(d) && t.Before(next) {
				day = append(day, s)
			}
		}
		if len(day) == 0 {
			continue
		}
		times := fullTimes(day)
		st.Days = append(st.Days, Day{Date: d.Format(time.DateOnly), FullCount: len(times), BestMS: ms(best(times)), OtherCount: len(day) - len(times)})
	}

	caseCount, stepCount := map[string]int{}, map[string]int{}
	for _, s := range cur {
		switch s.Mode {
		case solves.ModeCase:
			st.Practice.CaseCount++
			if s.CaseID != nil {
				caseCount[*s.CaseID]++
			}
		case solves.ModeStep:
			st.Practice.StepCount++
			if s.Step != nil {
				stepCount[*s.Step]++
			}
		case solves.ModeAssist:
			st.Practice.AssistCount++
		}
	}
	st.Practice.Cases = items(caseCount, cases)
	st.Practice.Steps = items(stepCount, nil)
	return st
}

// ms は、-1（無い）を null にする。
func ms(v int64) *int64 {
	if v < 0 {
		return nil
	}
	return &v
}

func msf(v float64) *float64 {
	if math.IsNaN(v) {
		return nil
	}
	return &v
}

// fullTimes は、フルソルブの実効のタイム（+2 込み、DNF は -1）を古い順に返す。
func fullTimes(list []solves.Solve) []int64 {
	var out []int64
	for _, s := range list {
		if s.Mode == solves.ModeFull {
			out = append(out, export.EffectiveMS(s))
		}
	}
	return out
}

func valid(times []int64) []int64 {
	var out []int64
	for _, t := range times {
		if t >= 0 {
			out = append(out, t)
		}
	}
	return out
}

func best(times []int64) int64 {
	b := int64(-1)
	for _, t := range valid(times) {
		if b < 0 || t < b {
			b = t
		}
	}
	return b
}

func mean(times []int64) float64 {
	v := valid(times)
	if len(v) == 0 {
		return math.NaN()
	}
	sum := 0.0
	for _, t := range v {
		sum += float64(t)
	}
	return sum / float64(len(v))
}

// bestAverage は、続く n 回の WCA 方式の平均のうち、いちばん速いもの（無ければ -1）。
func bestAverage(times []int64, n int) int64 {
	b := int64(-1)
	for i := 0; i+n <= len(times); i++ {
		if a := analysis.AverageOf(times[i : i+n]); a >= 0 && (b < 0 || a < b) {
			b = a
		}
	}
	return b
}

// stageTimes は、段階がそろったフルソルブ（DNF を除く）の Cross・F2L・OLL・PLL の時間と、手数・TPS の平均。
func stageTimes(list []solves.Solve) *Stages {
	var sum Stages
	for _, s := range list {
		if s.Mode != solves.ModeFull || s.Penalty == solves.PenaltyDNF || len(s.Splits) != len(solves.Stages) || s.TotalMS <= 0 {
			continue
		}
		end := map[string]float64{}
		mc := 0
		for _, sp := range s.Splits {
			end[sp.Stage] = float64(sp.EndMS)
			mc += sp.MoveCount
		}
		sum.CrossMS += end["cross"]
		sum.F2LMS += end["f2l4"] - end["cross"]
		sum.OLLMS += end["oll"] - end["f2l4"]
		sum.PLLMS += end["pll"] - end["oll"]
		sum.Moves += float64(mc)
		sum.TPS += float64(mc) / (float64(s.TotalMS) / 1000)
		sum.Count++
	}
	if sum.Count == 0 {
		return nil
	}
	n := float64(sum.Count)
	return &Stages{Count: sum.Count, CrossMS: sum.CrossMS / n, F2LMS: sum.F2LMS / n, OLLMS: sum.OLLMS / n, PLLMS: sum.PLLMS / n,
		Moves: sum.Moves / n, TPS: sum.TPS / n}
}

// items は、回数の多い順（同じなら ID 順）に並べる。names があれば名前を付ける。
func items(count map[string]int, names map[string]string) []Item {
	out := make([]Item, 0, len(count))
	for k, c := range count {
		out = append(out, Item{ID: k, Name: names[k], Count: c})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Count != out[j].Count {
			return out[i].Count > out[j].Count
		}
		return out[i].ID < out[j].ID
	})
	return out
}
