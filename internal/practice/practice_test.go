package practice

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/riwn/cubalyst/internal/solves"
)

var tz = time.FixedZone("JST", 9*60*60)

func at(day, hour int) time.Time { return time.Date(2026, 10, day, hour, 0, 0, 0, tz) }

// full は段階付きのフルソルブ（Cross 2・F2L 8・OLL 3・PLL 2 秒、各段階 7 手）。
func full(t time.Time, ms int64, penalty string) solves.Solve {
	ends := []int64{2000, 4000, 6000, 8000, 10000, 13000, 15000}
	var sp []solves.Split
	for i, st := range solves.Stages {
		sp = append(sp, solves.Split{Stage: st, EndMS: ends[i], MoveCount: 7})
	}
	return solves.Solve{Mode: solves.ModeFull, SolvedAt: t, TotalMS: ms, Penalty: penalty, Splits: sp}
}

func practice(t time.Time, mode, id string) solves.Solve {
	s := solves.Solve{Mode: mode, SolvedAt: t, TotalMS: 3000}
	switch mode {
	case solves.ModeCase:
		s.CaseID = &id
	case solves.ModeStep:
		s.Step = &id
	}
	return s
}

func i64(p *int64) int64 {
	if p == nil {
		return -1
	}
	return *p
}

func TestWeek(t *testing.T) {
	p, err := NewPeriod("", at(23, 21)) // 既定は1週間：10/17〜10/23
	if err != nil || p.Kind != "week" || !p.From.Equal(time.Date(2026, 10, 17, 0, 0, 0, 0, tz)) {
		t.Fatalf("period = %+v, %v", p, err)
	}
	before := []solves.Solve{
		full(at(10, 20), 20000, ""), // 前の週（10/10〜10/16）
		full(at(14, 20), 19000, ""),
	}
	cur := []solves.Solve{
		full(at(18, 20), 18000, ""),
		full(at(18, 21), 21000, ""),
		full(at(18, 22), 30000, solves.PenaltyDNF),
		full(at(20, 20), 17000, ""),
		full(at(20, 21), 18000, solves.PenaltyPlus2), // 実効 20.00
		practice(at(20, 22), solves.ModeCase, "oll-21"),
		practice(at(20, 22), solves.ModeCase, "oll-21"),
		practice(at(20, 23), solves.ModeCase, "pll-Ub"),
		practice(at(21, 20), solves.ModeStep, "cross"),
		practice(at(21, 21), solves.ModeAssist, ""),
	}
	st := Compute(p, cur, before, map[string]string{"oll-21": "OLL 21", "pll-Ub": "PLL Ub"})
	if st.Period != (PeriodJSON{Kind: "week", From: "2026-10-17", To: "2026-10-24"}) || st.Count != 10 {
		t.Errorf("period=%+v count=%d", st.Period, st.Count)
	}

	f := st.Full
	// 17・DNF を除いた 18・21・20 の平均が ao5（10ms 単位に丸める）
	if f.Count != 5 || f.DNF != 1 || i64(f.BestMS) != 17000 || *f.MeanMS != 19000 || i64(f.BestAo5MS) != 19670 || f.BestAo12MS != nil {
		t.Errorf("full = %+v", f)
	}
	if i64(f.PreviousBestMS) != 19000 || !f.NewBest || f.PreviousBestAo5MS != nil || f.NewBestAo5 {
		t.Errorf("自己ベスト: %+v", f)
	}
	if *f.PreviousPeriodMeanMS != 19500 {
		t.Errorf("前の週の平均 = %v", *f.PreviousPeriodMeanMS)
	}
	if s := st.Stages; s.Count != 4 || s.CrossMS != 2000 || s.F2LMS != 8000 || s.OLLMS != 3000 || s.PLLMS != 2000 || s.Moves != 49 {
		t.Errorf("stages = %+v", s)
	}

	if len(st.Days) != 3 {
		t.Fatalf("days = %+v", st.Days)
	}
	for i, want := range []Day{
		{Date: "2026-10-18", FullCount: 3, OtherCount: 0},
		{Date: "2026-10-20", FullCount: 2, OtherCount: 3},
		{Date: "2026-10-21", FullCount: 0, OtherCount: 2},
	} {
		got := st.Days[i]
		if got.Date != want.Date || got.FullCount != want.FullCount || got.OtherCount != want.OtherCount {
			t.Errorf("days[%d] = %+v", i, got)
		}
	}
	if i64(st.Days[0].BestMS) != 18000 || i64(st.Days[1].BestMS) != 17000 || st.Days[2].BestMS != nil {
		t.Errorf("日ごとのベスト %v %v %v", st.Days[0].BestMS, st.Days[1].BestMS, st.Days[2].BestMS)
	}

	pr := st.Practice
	if pr.CaseCount != 3 || len(pr.Cases) != 2 || pr.Cases[0] != (Item{ID: "oll-21", Name: "OLL 21", Count: 2}) || pr.Cases[1].Name != "PLL Ub" {
		t.Errorf("cases = %+v", pr)
	}
	if pr.StepCount != 1 || pr.Steps[0] != (Item{ID: "cross", Count: 1}) || pr.AssistCount != 1 {
		t.Errorf("steps = %+v", pr)
	}
}

func TestEmptyAndDay(t *testing.T) {
	p, _ := NewPeriod("week", at(23, 21))
	st := Compute(p, nil, []solves.Solve{full(at(1, 20), 20000, "")}, nil)
	if st.Count != 0 || st.Full != nil || st.Stages != nil {
		t.Errorf("練習なし: %+v", st)
	}
	// JSON では、無いものは null、並びは空の配列
	b, _ := json.Marshal(st)
	for _, want := range []string{`"full":null`, `"stages":null`, `"days":[]`, `"cases":[]`, `"steps":[]`} {
		if !strings.Contains(string(b), want) {
			t.Errorf("%s がない: %s", want, b)
		}
	}

	p, _ = NewPeriod("day", at(23, 21))
	if p.From != at(23, 0) || p.Previous().From != at(22, 0) {
		t.Errorf("day = %+v", p)
	}
	if _, err := NewPeriod("month", at(23, 21)); err == nil {
		t.Error("month を受け付けた")
	}
}
