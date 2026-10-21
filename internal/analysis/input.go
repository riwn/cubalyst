package analysis

import (
	"fmt"
	"math"
	"sort"
	"strings"

	"cubalyst/internal/export"
	"cubalyst/internal/settings"
	"cubalyst/internal/solves"
)

// SystemPrompt は解析の前提と出力の形式。
const SystemPrompt = `あなたはルービックキューブ（3x3、CFOP法）のスピードキュービングのコーチです。
渡されるデータは、スマートキューブ（GAN）で記録した実測値をアプリが集計したものです。

前提:
- 時間はすべて秒。回転ログはキューブが報告した90度回転の列で、180度回転（R2）は同じ面の2手（R R）として数えています
- 解法・回転の記号は、解く人の持ち方（入力に記載）での面の名前に変換済みです。スクランブルだけはWCAの向き（白上・緑前）です
- 「認識」はその段階の最初の手までの待ち時間（直前の段階の終わりから）、「実行」は最初の手から段階完了までです
- 持ち替え（y回転など）はスマートキューブでは検出できないため、長い「間」として現れることがあります
- データにない数値を推測で作らないでください。断定できないことは推測であると書いてください

出力:
- 日本語のMarkdown。見出しは「##」から
- まず結論（最も伸びしろが大きい点）を2〜3行で
- 次に、根拠となる数値を挙げながら具体的な改善点（手数過多、認識の遅れ、TPS、回転の偏り、持ち替えなど）
- 最後に、次に何を練習するとよいか（このアプリにはOLL/PLL/F2Lのケース単発練習と、Cross/F2L/OLL/PLLのステップ練習があります）
- 全体で800〜1500字程度`

var stageNames = map[string]string{
	"cross": "Cross", "f2l1": "F2L 1", "f2l2": "F2L 2", "f2l3": "F2L 3", "f2l4": "F2L 4", "oll": "OLL", "pll": "PLL",
}

func sec(ms float64) string { return fmt.Sprintf("%.2f", ms/1000) }

func tps(moves int, ms float64) string {
	if ms <= 0 {
		return "-"
	}
	return fmt.Sprintf("%.2f", float64(moves)/(ms/1000))
}

// mergeMoves は同じ面の連続（R R → R2、R R R → R'）をまとめて読みやすくする。
func mergeMoves(moves []solves.Move) string {
	type turn struct {
		face   byte
		amount int
	}
	var out []turn
	for _, m := range moves {
		if m.Move == "" {
			continue
		}
		amount := 1
		switch {
		case strings.HasSuffix(m.Move, "'"):
			amount = 3
		case strings.Contains(m.Move, "2"):
			amount = 2
		}
		face := m.Move[0]
		if n := len(out); n > 0 && out[n-1].face == face {
			out[n-1].amount = (out[n-1].amount + amount) % 4
			if out[n-1].amount == 0 {
				out = out[:n-1]
			}
			continue
		}
		out = append(out, turn{face, amount})
	}
	parts := make([]string, len(out))
	for i, t := range out {
		parts[i] = string(t.face) + map[int]string{1: "", 2: "2", 3: "'"}[t.amount]
	}
	return strings.Join(parts, " ")
}

// stagePhase は1段階の認識時間と実行時間（ms）。
type stagePhase struct {
	stage       string
	durationMS  float64
	recognition float64
	execution   float64
	moves       int
}

func phases(s solves.Solve) []stagePhase {
	var out []stagePhase
	for _, sp := range s.Splits {
		p := stagePhase{stage: sp.Stage, durationMS: float64(sp.EndMS - sp.StartMS), moves: sp.MoveCount}
		if sp.MoveCount > 0 && sp.StartIndex < len(s.Moves) {
			first := s.Moves[sp.StartIndex].T
			p.recognition = math.Max(0, first-float64(sp.StartMS))
			p.execution = math.Max(0, float64(sp.EndMS)-first)
		}
		out = append(out, p)
	}
	return out
}

// SolveInput は単一ソルブ解析の入力。recent は比較用の直近ソルブ（段階・回転ログ付き）。
// 回転の記号は設定の持ち方に合わせて変換する。
func SolveInput(s solves.Solve, recent []solves.Solve, st settings.Settings) string {
	s = export.WithFrame(s, st.Frame())
	crossColor := st.CrossColor
	var b strings.Builder
	eff := export.EffectiveMS(s)
	fmt.Fprintf(&b, "# 解析対象のソルブ（#%d）\n", s.ID)
	fmt.Fprintf(&b, "- 種類: %s", s.Mode)
	if s.CaseID != nil {
		fmt.Fprintf(&b, "（ケース %s）", *s.CaseID)
	}
	if s.Step != nil {
		fmt.Fprintf(&b, "（ステップ練習 %s）", *s.Step)
	}
	fmt.Fprintf(&b, "\n- タイム: %s", export.FormatTime(eff))
	if s.Penalty != "" {
		fmt.Fprintf(&b, "（ペナルティ %s、実測 %s）", s.Penalty, export.FormatTime(s.TotalMS))
	}
	fmt.Fprintf(&b, "\n- 手数: %d（TPS %s）\n- クロス色: %s\n- 持ち方（解法の表記）: %s\n- スクランブル（白上・緑前）: %s\n",
		len(s.Moves), tps(len(s.Moves), float64(s.TotalMS)), crossColor, st.HoldDescription(), s.Scramble)

	if ph := phases(s); len(ph) > 0 {
		b.WriteString("\n## 段階ごと\n| 段階 | 所要 | 認識 | 実行 | 手数 | TPS(実行) | 解法 |\n|---|---|---|---|---|---|---|\n")
		for i, p := range ph {
			sp := s.Splits[i]
			alg := mergeMoves(s.Moves[min(sp.StartIndex, len(s.Moves)):min(sp.EndIndex, len(s.Moves))])
			if alg == "" {
				alg = "(スキップ)"
			}
			fmt.Fprintf(&b, "| %s | %s | %s | %s | %d | %s | %s |\n", stageNames[p.stage], sec(p.durationMS),
				sec(p.recognition), sec(p.execution), p.moves, tps(p.moves, p.execution), alg)
		}
		b.WriteString("\n解法は同じ面の続きをまとめた表記です（R R → R2、R R R → R'、R R' は打ち消して消える）。" +
			"R2 を2手として数えても手数より少ないときは、その差が打ち消しで消えた手（回して戻した手）です。\n")
	} else if len(s.Moves) > 0 {
		fmt.Fprintf(&b, "\n## 解法\n%s\n", mergeMoves(s.Moves))
	}

	if pauses := longPauses(s, 5); len(pauses) > 0 {
		b.WriteString("\n## 長い間（手と手の間隔、上位）\n")
		for _, p := range pauses {
			fmt.Fprintf(&b, "- %s秒（%d手目の前、%s中、直前の手 %s → 次の手 %s）\n", sec(p.gap), p.index+1, stageNames[p.stage], p.before, p.after)
		}
	}

	if dist := faceDistribution(s.Moves); dist != "" {
		fmt.Fprintf(&b, "\n## 面ごとの回転数（90度単位）\n%s\n", dist)
	}

	if cmp := recentStageAverages(recent); cmp != "" {
		fmt.Fprintf(&b, "\n## 比較：直近%dソルブ（フルソルブ）の段階別平均\n%s", countWithSplits(recent), cmp)
	}
	return b.String()
}

type pause struct {
	gap           float64
	index         int
	stage, before string
	after         string
}

func longPauses(s solves.Solve, n int) []pause {
	var out []pause
	for i := 1; i < len(s.Moves); i++ {
		gap := s.Moves[i].T - s.Moves[i-1].T
		if gap < 300 {
			continue
		}
		stage := ""
		for _, sp := range s.Splits {
			if i >= sp.StartIndex && i < sp.EndIndex {
				stage = sp.Stage
				break
			}
		}
		out = append(out, pause{gap: gap, index: i, stage: stage, before: s.Moves[i-1].Move, after: s.Moves[i].Move})
	}
	sort.Slice(out, func(a, b int) bool { return out[a].gap > out[b].gap })
	if len(out) > n {
		out = out[:n]
	}
	return out
}

func faceDistribution(moves []solves.Move) string {
	if len(moves) == 0 {
		return ""
	}
	counts := map[byte][2]int{}
	for _, m := range moves {
		if m.Move == "" {
			continue
		}
		c := counts[m.Move[0]]
		if strings.HasSuffix(m.Move, "'") {
			c[1]++
		} else {
			c[0]++
		}
		counts[m.Move[0]] = c
	}
	var parts []string
	for _, f := range []byte("URFDLB") {
		c := counts[f]
		total := c[0] + c[1]
		parts = append(parts, fmt.Sprintf("%c: %d（%.0f%%、時計回り%d/反時計回り%d）", f, total, 100*float64(total)/float64(len(moves)), c[0], c[1]))
	}
	return "- " + strings.Join(parts, "\n- ")
}

func countWithSplits(list []solves.Solve) int {
	n := 0
	for _, s := range list {
		if len(s.Splits) == len(solves.Stages) {
			n++
		}
	}
	return n
}

type stageAgg struct {
	dur, rec, exec, moves []float64
}

func aggregate(list []solves.Solve) (map[string]*stageAgg, int) {
	agg := map[string]*stageAgg{}
	n := 0
	for _, s := range list {
		if len(s.Splits) != len(solves.Stages) || s.Penalty == solves.PenaltyDNF {
			continue
		}
		n++
		for _, p := range phases(s) {
			a := agg[p.stage]
			if a == nil {
				a = &stageAgg{}
				agg[p.stage] = a
			}
			a.dur = append(a.dur, p.durationMS)
			a.rec = append(a.rec, p.recognition)
			a.exec = append(a.exec, p.execution)
			a.moves = append(a.moves, float64(p.moves))
		}
	}
	return agg, n
}

func mean(xs []float64) float64 {
	if len(xs) == 0 {
		return 0
	}
	s := 0.0
	for _, x := range xs {
		s += x
	}
	return s / float64(len(xs))
}

func stdev(xs []float64) float64 {
	if len(xs) < 2 {
		return 0
	}
	m := mean(xs)
	s := 0.0
	for _, x := range xs {
		s += (x - m) * (x - m)
	}
	return math.Sqrt(s / float64(len(xs)-1))
}

func stageTable(agg map[string]*stageAgg) string {
	var b strings.Builder
	b.WriteString("| 段階 | 平均所要 | ばらつき(SD) | 平均認識 | 平均実行 | 平均手数 | TPS(実行) |\n|---|---|---|---|---|---|---|\n")
	for _, st := range solves.Stages {
		a := agg[st]
		if a == nil {
			continue
		}
		exec := mean(a.exec)
		mv := mean(a.moves)
		t := "-"
		if exec > 0 {
			t = fmt.Sprintf("%.2f", mv/(exec/1000))
		}
		fmt.Fprintf(&b, "| %s | %s | %s | %s | %s | %.1f | %s |\n", stageNames[st], sec(mean(a.dur)), sec(stdev(a.dur)),
			sec(mean(a.rec)), sec(exec), mv, t)
	}
	return b.String()
}

func recentStageAverages(list []solves.Solve) string {
	agg, n := aggregate(list)
	if n == 0 {
		return ""
	}
	return stageTable(agg)
}

// TrendInput は傾向分析の入力。list は古い順。
func TrendInput(list []solves.Solve, mode string, st settings.Settings) string {
	crossColor := st.CrossColor
	var b strings.Builder
	times := make([]int64, len(list))
	dnf := 0
	for i, s := range list {
		times[i] = export.EffectiveMS(s)
		if times[i] < 0 {
			dnf++
		}
	}
	fmt.Fprintf(&b, "# 傾向分析の対象\n- 種類: %s\n- 件数: %d（DNF %d）\n- クロス色: %s\n", mode, len(list), dnf, crossColor)
	if len(list) > 0 {
		fmt.Fprintf(&b, "- 期間: %s 〜 %s\n", list[0].SolvedAt.Format("2006-01-02"), list[len(list)-1].SolvedAt.Format("2006-01-02"))
	}

	var valid []float64
	for _, t := range times {
		if t >= 0 {
			valid = append(valid, float64(t))
		}
	}
	if len(valid) > 0 {
		sorted := append([]float64(nil), valid...)
		sort.Float64s(sorted)
		fmt.Fprintf(&b, "\n## タイム\n- 平均: %s / 中央値: %s / ベスト: %s / ワースト: %s / ばらつき(SD): %s\n",
			sec(mean(valid)), sec(sorted[len(sorted)/2]), sec(sorted[0]), sec(sorted[len(sorted)-1]), sec(stdev(valid)))
		fmt.Fprintf(&b, "- 現在の ao5: %s / ao12: %s / ベスト ao5: %s / ベスト ao12: %s\n",
			formatAvg(AverageOf(lastN(times, 5))), formatAvg(AverageOf(lastN(times, 12))),
			formatAvg(bestAverage(times, 5)), formatAvg(bestAverage(times, 12)))
	}

	if agg, n := aggregate(list); n > 0 {
		fmt.Fprintf(&b, "\n## 段階別（%dソルブの平均）\n%s", n, stageTable(agg))
		half := len(list) / 2
		if half >= 5 {
			a1, n1 := aggregate(list[:half])
			a2, n2 := aggregate(list[half:])
			if n1 > 0 && n2 > 0 {
				fmt.Fprintf(&b, "\n## 前半（古い%d件）\n%s\n## 後半（新しい%d件）\n%s", n1, stageTable(a1), n2, stageTable(a2))
			}
		}
		fmt.Fprintf(&b, "\n## 各ソルブで最も時間を使った段階（F2Lは4スロット合計）\n%s\n", slowestStages(list))
	} else if len(list) > 0 {
		b.WriteString("\n（段階の記録はありません）\n")
	}
	if mode == solves.ModeCase {
		fmt.Fprintf(&b, "\n## ケース別\n%s", caseTable(list))
	}
	return b.String()
}

func lastN(xs []int64, n int) []int64 {
	if len(xs) < n {
		return nil
	}
	return xs[len(xs)-n:]
}

func bestAverage(times []int64, n int) int64 {
	best := int64(-2)
	for i := 0; i+n <= len(times); i++ {
		a := AverageOf(times[i : i+n])
		if a >= 0 && (best < 0 || a < best) {
			best = a
		}
	}
	return best
}

func formatAvg(ms int64) string {
	switch {
	case ms == -2:
		return "-"
	case ms < 0:
		return "DNF"
	}
	return sec(float64(ms))
}

// AverageOf はWCA方式の平均（最良と最悪を除く。DNF=-1を2つ以上含めばDNF=-1、件数不足は-2）。10ms単位に丸める。
func AverageOf(times []int64) int64 {
	if len(times) < 3 {
		return -2
	}
	sorted := make([]float64, len(times))
	dnf := 0
	for i, t := range times {
		if t < 0 {
			dnf++
			sorted[i] = math.Inf(1)
		} else {
			sorted[i] = float64(t)
		}
	}
	if dnf >= 2 {
		return -1
	}
	sort.Float64s(sorted)
	sum := 0.0
	for _, t := range sorted[1 : len(sorted)-1] {
		sum += t
	}
	avg := sum / float64(len(sorted)-2)
	return int64(math.Round(avg/10) * 10)
}

func slowestStages(list []solves.Solve) string {
	counts := map[string]int{}
	n := 0
	for _, s := range list {
		if len(s.Splits) != len(solves.Stages) || s.Penalty == solves.PenaltyDNF {
			continue
		}
		group := map[string]int64{}
		for _, sp := range s.Splits {
			g := sp.Stage
			if strings.HasPrefix(g, "f2l") {
				g = "F2L"
			}
			group[g] += sp.EndMS - sp.StartMS
		}
		bestG, bestV := "", int64(-1)
		for g, v := range group {
			if v > bestV || (v == bestV && g < bestG) {
				bestG, bestV = g, v
			}
		}
		counts[bestG]++
		n++
	}
	var parts []string
	for _, g := range []string{"cross", "F2L", "oll", "pll"} {
		label := g
		if l, ok := stageNames[g]; ok {
			label = l
		}
		parts = append(parts, fmt.Sprintf("%s: %d件", label, counts[g]))
	}
	return "- " + strings.Join(parts, " / ")
}

func caseTable(list []solves.Solve) string {
	type agg struct {
		n   int
		sum float64
	}
	byCase := map[string]*agg{}
	for _, s := range list {
		if s.CaseID == nil {
			continue
		}
		t := export.EffectiveMS(s)
		if t < 0 {
			continue
		}
		a := byCase[*s.CaseID]
		if a == nil {
			a = &agg{}
			byCase[*s.CaseID] = a
		}
		a.n++
		a.sum += float64(t)
	}
	ids := make([]string, 0, len(byCase))
	for id := range byCase {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(a, b int) bool {
		return byCase[ids[a]].sum/float64(byCase[ids[a]].n) > byCase[ids[b]].sum/float64(byCase[ids[b]].n)
	})
	var b strings.Builder
	b.WriteString("| ケース | 回数 | 平均 |\n|---|---|---|\n")
	for _, id := range ids {
		a := byCase[id]
		fmt.Fprintf(&b, "| %s | %d | %s |\n", id, a.n, sec(a.sum/float64(a.n)))
	}
	return b.String()
}
