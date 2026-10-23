// Package notify は、決まった時刻に Discord へ送る「練習のまとめ」の本文を作る。
//
// 送る時刻と送り先は、呼ぶ側（hatodokei の「外部から取得」のジョブなど）が決める。
// ここは、期間のソルブから Discord の Webhook の形の本文を作るだけ。
package notify

import (
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/riwn/cubalyst/internal/analysis"
	"github.com/riwn/cubalyst/internal/export"
	"github.com/riwn/cubalyst/internal/solves"
)

// Payload は呼ぶ側に返す本文（{"message": ...}）。
type Payload struct {
	Message Message `json:"message"`
}

// Message は Discord のメッセージ。
type Message struct {
	Content string  `json:"content,omitempty"`
	Embeds  []Embed `json:"embeds,omitempty"`
}

// Embed は Discord の埋め込み。
type Embed struct {
	Title       string  `json:"title,omitempty"`
	Description string  `json:"description,omitempty"`
	Timestamp   string  `json:"timestamp,omitempty"`
	Color       int     `json:"color,omitempty"`
	Fields      []Field `json:"fields,omitempty"`
}

// Field は埋め込みの項目。
type Field struct {
	Name   string `json:"name"`
	Value  string `json:"value"`
	Inline bool   `json:"inline,omitempty"`
}

const (
	colorNormal = 0x3498db // 青
	colorPB     = 0xf1c40f // 金：自己ベストを更新した
)

// Period はまとめる期間 [From, To)。
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

var weekdays = []string{"日", "月", "火", "水", "木", "金", "土"}

func dateLabel(t time.Time) string {
	return fmt.Sprintf("%d/%d（%s）", t.Month(), t.Day(), weekdays[t.Weekday()])
}

func (p Period) title() string {
	if p.Kind == "week" {
		last := p.To.AddDate(0, 0, -1)
		return fmt.Sprintf("🧊 1週間の練習　%d/%d〜%d/%d", p.From.Month(), p.From.Day(), last.Month(), last.Day())
	}
	return "🧊 " + dateLabel(p.From) + " の練習"
}

func (p Period) prevLabel() string {
	if p.Kind == "week" {
		return "前の週"
	}
	return "前の日"
}

// sec はミリ秒を「18.52」「1:02.34」にする。
func sec(ms float64) string {
	if ms >= 60000 {
		m := int(ms / 60000)
		return fmt.Sprintf("%d:%05.2f", m, (ms-float64(m)*60000)/1000)
	}
	return fmt.Sprintf("%.2f", ms/1000)
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

// stageTimes は、段階がそろったフルソルブ（DNF を除く）の Cross・F2L・OLL・PLL の時間（ms）と、手数・TPS の平均。
func stageTimes(list []solves.Solve) (avg map[string]float64, moves, tps float64, n int) {
	sum := map[string]float64{}
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
		sum["Cross"] += end["cross"]
		sum["F2L"] += end["f2l4"] - end["cross"]
		sum["OLL"] += end["oll"] - end["f2l4"]
		sum["PLL"] += end["pll"] - end["oll"]
		moves += float64(mc)
		tps += float64(mc) / (float64(s.TotalMS) / 1000)
		n++
	}
	if n == 0 {
		return nil, 0, 0, 0
	}
	avg = map[string]float64{}
	for k, v := range sum {
		avg[k] = v / float64(n)
	}
	return avg, moves / float64(n), tps / float64(n), n
}

// Summary は、期間（cur）の練習のまとめを作る。練習が1回も無ければ nil（送らない）。
//
//	cur     期間のソルブ（すべての種類、段階付き、古い順）
//	before  期間より前のフルソルブ（古い順）。自己ベストと、前の期間との比較に使う
//	cases   ケースの ID → 名前
func Summary(p Period, cur, before []solves.Solve, cases map[string]string, now time.Time) *Payload {
	if len(cur) == 0 {
		return nil
	}
	var desc []string
	var fields []Field
	color := colorNormal

	// フルソルブ
	times := fullTimes(cur)
	if len(times) > 0 {
		dnf := len(times) - len(valid(times))
		b, m := best(times), mean(times)
		ao5, ao12 := bestAverage(times, 5), bestAverage(times, 12)
		lines := []string{fmt.Sprintf("%d 回", len(times))}
		if dnf > 0 {
			lines[0] += fmt.Sprintf("（DNF %d）", dnf)
		}
		if b >= 0 {
			lines = append(lines, "ベスト **"+sec(float64(b))+"**", "平均 "+sec(m))
		}
		if ao5 >= 0 {
			lines = append(lines, "ao5 ベスト "+sec(float64(ao5)))
		}
		if ao12 >= 0 {
			lines = append(lines, "ao12 ベスト "+sec(float64(ao12)))
		}
		fields = append(fields, Field{Name: "⏱️ フルソルブ", Value: strings.Join(lines, "\n"), Inline: true})

		head := fmt.Sprintf("フルソルブ %d 回", len(times))
		if b >= 0 {
			head += "・ベスト **" + sec(float64(b)) + "**"
		}
		desc = append(desc, head)

		// 自己ベスト（前に記録があるときだけ）
		beforeTimes := fullTimes(before)
		if pb := best(beforeTimes); b >= 0 && pb >= 0 && b < pb {
			desc = append(desc, fmt.Sprintf("🎉 自己ベスト更新！ 単発 %s（これまで %s）", sec(float64(b)), sec(float64(pb))))
			color = colorPB
		}
		if pb5 := bestAverage(beforeTimes, 5); ao5 >= 0 && pb5 >= 0 && ao5 < pb5 {
			desc = append(desc, fmt.Sprintf("🎉 ao5 の自己ベスト更新！ %s（これまで %s）", sec(float64(ao5)), sec(float64(pb5))))
			color = colorPB
		}

		// 前の期間との比較
		prev := p.Previous()
		var prevList []solves.Solve
		for _, s := range before {
			if !s.SolvedAt.Before(prev.From) && s.SolvedAt.Before(prev.To) {
				prevList = append(prevList, s)
			}
		}
		if pm := mean(fullTimes(prevList)); !math.IsNaN(m) && !math.IsNaN(pm) {
			d := (m - pm) / 1000
			switch {
			case d <= -0.005:
				desc = append(desc, fmt.Sprintf("平均は%sより %.2f 秒速い 📈", p.prevLabel(), -d))
			case d >= 0.005:
				desc = append(desc, fmt.Sprintf("平均は%sより %.2f 秒遅い", p.prevLabel(), d))
			default:
				desc = append(desc, "平均は"+p.prevLabel()+"と同じ")
			}
		}

		// 段階ごと
		if avg, mv, tp, n := stageTimes(cur); n > 0 {
			var parts []string
			for _, k := range []string{"Cross", "F2L", "OLL", "PLL"} {
				parts = append(parts, fmt.Sprintf("%s %s", k, sec(avg[k])))
			}
			fields = append(fields, Field{Name: fmt.Sprintf("🧩 段階ごとの平均（%d 回）", n),
				Value: strings.Join(parts, "\n") + fmt.Sprintf("\n手数 %.1f・TPS %.2f", mv, tp), Inline: true})
		}
	}

	// 1週間なら日ごと（練習した日だけ）
	if p.Kind == "week" {
		if days := daily(p, cur); len(days) > 0 {
			fields = append(fields, Field{Name: fmt.Sprintf("📅 日ごと（%d / 7 日）", len(days)), Value: strings.Join(days, "\n")})
		}
	}

	// 練習（ケース・段階・補助付き）
	caseCount := map[string]int{}
	stepCount := map[string]int{}
	assist, caseN, stepN := 0, 0, 0
	for _, s := range cur {
		switch s.Mode {
		case solves.ModeCase:
			caseN++
			if s.CaseID != nil {
				caseCount[*s.CaseID]++
			}
		case solves.ModeStep:
			stepN++
			if s.Step != nil {
				stepCount[*s.Step]++
			}
		case solves.ModeAssist:
			assist++
		}
	}
	var practice []string
	if caseN > 0 {
		practice = append(practice, fmt.Sprintf("ケース練習 %d 回（%d ケース）%s", caseN, len(caseCount), top(caseCount, cases, 3)))
	}
	if stepN > 0 {
		practice = append(practice, fmt.Sprintf("段階練習 %d 回%s", stepN, top(stepCount, nil, 4)))
	}
	if assist > 0 {
		practice = append(practice, fmt.Sprintf("補助付きフルソルブ %d 回", assist))
	}
	if len(practice) > 0 {
		fields = append(fields, Field{Name: "🎯 練習", Value: strings.Join(practice, "\n")})
		if len(times) == 0 {
			desc = append(desc, "フルソルブはなし。"+strings.SplitN(practice[0], "（", 2)[0]+" など")
		}
	}

	return &Payload{Message: Message{Embeds: []Embed{{
		Title:       p.title(),
		Description: strings.Join(desc, "\n"),
		Timestamp:   now.Format(time.RFC3339),
		Color:       color,
		Fields:      fields,
	}}}}
}

// daily は、練習した日ごとの「10/17（金）　フル 12 回・ベスト 18.52　練習 8 回」。
func daily(p Period, cur []solves.Solve) []string {
	var out []string
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
		line := "`" + dateLabel(d) + "`"
		if times := fullTimes(day); len(times) > 0 {
			line += fmt.Sprintf("　フル %d 回", len(times))
			if b := best(times); b >= 0 {
				line += "・ベスト " + sec(float64(b))
			}
		}
		if other := len(day) - len(fullTimes(day)); other > 0 {
			line += fmt.Sprintf("　練習 %d 回", other)
		}
		out = append(out, line)
	}
	return out
}

// top は、回数の多いものから n 個を「：OLL 21 ×4、…」の形にする。names があれば ID を名前にする。
func top(count map[string]int, names map[string]string, n int) string {
	keys := make([]string, 0, len(count))
	for k := range count {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool {
		if count[keys[i]] != count[keys[j]] {
			return count[keys[i]] > count[keys[j]]
		}
		return keys[i] < keys[j]
	})
	if len(keys) > n {
		keys = keys[:n]
	}
	var parts []string
	for _, k := range keys {
		name := k
		if v, ok := names[k]; ok && v != "" {
			name = v
		}
		parts = append(parts, fmt.Sprintf("%s ×%d", name, count[k]))
	}
	if len(parts) == 0 {
		return ""
	}
	return "：" + strings.Join(parts, "、")
}
