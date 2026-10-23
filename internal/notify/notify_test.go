package notify

import (
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

func fieldsText(e Embed) string {
	var b strings.Builder
	for _, f := range e.Fields {
		b.WriteString(f.Name + "\n" + f.Value + "\n")
	}
	return b.String()
}

func TestWeekly(t *testing.T) {
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
	pl := Summary(p, cur, before, map[string]string{"oll-21": "OLL 21", "pll-Ub": "PLL Ub"}, at(23, 21))
	e := pl.Message.Embeds[0]
	if e.Title != "🧊 1週間の練習　10/17〜10/23" || e.Color != colorPB {
		t.Errorf("title=%q color=%x", e.Title, e.Color)
	}
	for _, want := range []string{
		"フルソルブ 5 回・ベスト **17.00**",
		"🎉 自己ベスト更新！ 単発 17.00（これまで 19.00）",
		"平均は前の週より 0.50 秒速い 📈", // (18+21+17+20)/4 = 19.00、前の週 19.50
	} {
		if !strings.Contains(e.Description, want) {
			t.Errorf("説明に %q がありません\n%s", want, e.Description)
		}
	}
	all := fieldsText(e)
	for _, want := range []string{
		"5 回（DNF 1）\nベスト **17.00**\n平均 19.00\nao5 ベスト 19.67", // 17・DNF を除いた 18・21・20
		"🧩 段階ごとの平均（4 回）\nCross 2.00\nF2L 8.00\nOLL 3.00\nPLL 2.00\n手数 49.0",
		"📅 日ごと（3 / 7 日）\n`10/18（日）`　フル 3 回・ベスト 18.00\n`10/20（火）`　フル 2 回・ベスト 17.00　練習 3 回\n`10/21（水）`　練習 2 回",
		"ケース練習 3 回（2 ケース）：OLL 21 ×2、PLL Ub ×1",
		"段階練習 1 回：cross ×1",
		"補助付きフルソルブ 1 回",
	} {
		if !strings.Contains(all, want) {
			t.Errorf("%q がありません\n%s", want, all)
		}
	}
	if strings.Contains(all, "ao12") {
		t.Error("12 回に満たないのに ao12 がある")
	}
}

func TestNoPractice(t *testing.T) {
	p, _ := NewPeriod("week", at(23, 21))
	if Summary(p, nil, []solves.Solve{full(at(1, 20), 20000, "")}, nil, at(23, 21)) != nil {
		t.Error("練習が無いのに本文がある")
	}
}

func TestDayPracticeOnly(t *testing.T) {
	p, _ := NewPeriod("day", at(23, 21))
	pl := Summary(p, []solves.Solve{practice(at(23, 20), solves.ModeCase, "oll-1")}, nil, nil, at(23, 21))
	e := pl.Message.Embeds[0]
	if e.Title != "🧊 10/23（金） の練習" || e.Description != "フルソルブはなし。ケース練習 1 回 など" || e.Color != colorNormal {
		t.Errorf("title=%q desc=%q", e.Title, e.Description)
	}
	if strings.Contains(fieldsText(e), "日ごと") {
		t.Error("1日のまとめに日ごとの欄がある")
	}
	if _, err := NewPeriod("month", at(23, 21)); err == nil {
		t.Error("month を受け付けた")
	}
}

func TestSec(t *testing.T) {
	for ms, want := range map[float64]string{17000: "17.00", 9876: "9.88", 62340: "1:02.34"} {
		if got := sec(ms); got != want {
			t.Errorf("sec(%v) = %q, want %q", ms, got, want)
		}
	}
}
