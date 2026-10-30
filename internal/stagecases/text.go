package stagecases

import (
	"fmt"
	"sort"
	"strings"
)

// DetailLimit は、ソルブごとの表を出す件数の上限。これより多いときは集計と、目立つペアだけを出す。
const DetailLimit = 10

// shortLabel は形の移り変わりで使う短い名前。
var shortLabel = map[string]string{
	ShapeSolved:       "入る",
	ShapePaired:       "ペア",
	ShapeWrong:        "色違いでくっつく",
	ShapeApart:        "離れている",
	"c-own/e-U":       "角がスロット",
	"c-U/e-own":       "エッジがスロット",
	"c-own/e-own":     "両方スロット",
	"c-U/e-other":     "エッジが別スロット",
	"c-other/e-U":     "角が別スロット",
	"c-other/e-other": "両方別スロット",
	"c-own/e-other":   "角がスロット・エッジが別スロット",
	"c-other/e-own":   "角が別スロット・エッジがスロット",
}

func pathText(path []string) string {
	parts := make([]string, len(path))
	for i, p := range path {
		parts[i] = shortLabel[p]
		if parts[i] == "" {
			parts[i] = p
		}
	}
	return strings.Join(parts, " → ")
}

func secs(ms float64) string { return fmt.Sprintf("%.2f", ms/1000) }

func caseText(c *CaseRef) string {
	if c == nil {
		return "-"
	}
	return fmt.Sprintf("%s（%d手）", c.Name, c.Moves)
}

func stepsText(steps []CaseRef) string {
	parts := make([]string, len(steps))
	for i, s := range steps {
		parts[i] = s.Name
		if s.ID == "" {
			parts[i] = "判定できない形"
		}
	}
	return strings.Join(parts, " → ")
}

// Text は判定結果を、AI に渡す Markdown にする。
func Text(r Result) string {
	var b strings.Builder
	fmt.Fprintf(&b, "# 段階ごとのケース（%d件、クロス：%s）\n", len(r.Solves), ColorLabels[r.CrossColor])
	b.WriteString(`
- 回転ログを再生して、各段階を始めたときのキューブの形を判定したもの（持ち方やジャイロの有無に関係なく正確）
- F2L：その段階で揃えたペアについて、始めたときの形とケース（アプリの F2L 41ケースの番号。標準手順の手数つき）、1手ごとの形の移り変わり
  - 「色違いでくっつく」は、上段で角とエッジが隣り合っているのに、色が合っていない（ペアになっていない）形
  - クロスの色が上／横は、角が上段にあるときの、角のクロスの色のシールの向き
  - 「また色違い」は、色違いの形から離したあと、また色が合わないままくっついた回
  - 「崩した」は、ペアが一度入ったのに、ほかのペアかクロスを崩していて、段階が終わらなかった回
- 手数は90度を1手（180度は2手）。打ち消しは、回して戻したなどで消えた手数
- OLL・PLL：手順の切れ目（F2L が揃っている状態）ごとのケース。1つなら1つの手順、2つなら 2-look。同じケースが2回出たらやり直し
`)
	sum := r.Summary
	if len(r.Solves) > 1 {
		b.WriteString("\n## F2L：始めたときの形ごと\n")
		b.WriteString("| 形 | 回数 | F2Lの時間の割合 | 平均時間 | 中央値 | 平均手数 | 標準手順より多い手数 | 打ち消し | ペアまで | また色違い | 崩した |\n")
		b.WriteString("|---|---|---|---|---|---|---|---|---|---|---|\n")
		for _, s := range sum.F2LShapes {
			extra := "-"
			if s.AvgExtra != nil {
				extra = fmt.Sprintf("%+.1f", *s.AvgExtra)
			}
			toPair := "-"
			if s.AvgMovesToPair > 0 {
				toPair = fmt.Sprintf("%.1f", s.AvgMovesToPair)
			}
			fmt.Fprintf(&b, "| %s | %d | %.0f%% | %s | %s | %.1f | %s | %.1f | %s | %d | %d |\n",
				s.Label, s.Count, s.ShareMS, secs(s.AvgMS), secs(s.MedianMS), s.AvgMoves, extra, s.AvgCancelled, toPair, s.Rewrong, s.BrokeOther)
		}
		if len(sum.F2LCases) > 0 {
			b.WriteString("\n## F2L：ケースごと（多い順。2回以上）\n")
			b.WriteString("| ケース | 形 | 回数 | 平均時間 | 認識 | 平均手数 | 標準手順 | 多い手数 | また色違い |\n|---|---|---|---|---|---|---|---|---|\n")
			for _, c := range sum.F2LCases {
				if c.Count < 2 {
					continue
				}
				fmt.Fprintf(&b, "| %s | %s | %d | %s | %s | %.1f | %d | %+.1f | %d |\n",
					c.Name, ShapeLabel(c.Shape, c.CrossFacing), c.Count, secs(c.AvgMS), secs(c.AvgRecognitionMS), c.AvgMoves, c.Moves, c.AvgExtra, c.Rewrong)
			}
		}
		for _, x := range []struct {
			name string
			list []LLStat
		}{{"OLL", sum.OLL}, {"PLL", sum.PLL}} {
			if len(x.list) == 0 {
				continue
			}
			fmt.Fprintf(&b, "\n## %s：始めたときのケースごと\n", x.name)
			b.WriteString("| ケース | 回数 | 平均時間 | 認識 | 平均手数 | 標準手順より多い手数（1-look、AUF 込み） | 平均の手順の数 | やり直し |\n|---|---|---|---|---|---|---|---|\n")
			for _, s := range x.list {
				name := s.Name
				if s.ID == "" {
					name = "判定できない形"
				}
				extra := "-"
				if s.AvgExtra != nil {
					extra = fmt.Sprintf("%+.1f", *s.AvgExtra)
				}
				fmt.Fprintf(&b, "| %s | %d | %s | %s | %.1f | %s | %.1f | %d |\n",
					name, s.Count, secs(s.AvgMS), secs(s.AvgRecognitionMS), s.AvgMoves, extra, s.AvgSteps, s.Repeated)
			}
		}
	}

	if len(r.Solves) <= DetailLimit {
		for _, s := range r.Solves {
			writeSolve(&b, s)
		}
		return b.String()
	}

	// 件数が多いときは、目立つペアだけ
	type ref struct {
		id int64
		p  Pair
	}
	var all []ref
	for _, s := range r.Solves {
		for _, p := range s.Pairs {
			all = append(all, ref{s.ID, p})
		}
	}
	sort.SliceStable(all, func(i, j int) bool { return all[i].p.Moves > all[j].p.Moves })
	b.WriteString("\n## 手数の多いペア（上位10）\n| ソルブ | 段階 | 始めたときの形 | ケース | 所要 | 手数（打ち消し） | 形の移り変わり |\n|---|---|---|---|---|---|---|\n")
	for i, x := range all {
		if i >= 10 {
			break
		}
		fmt.Fprintf(&b, "| #%d | %s | %s | %s | %s | %d（%d） | %s |\n", x.id, x.p.Stage, ShapeLabel(x.p.Shape, x.p.CrossFacing),
			caseText(x.p.Case), secs(float64(x.p.MS)), x.p.Moves, x.p.Cancelled, pathText(x.p.Path))
	}
	var rewrong, broke []string
	for _, x := range all {
		if x.p.Rewrong {
			rewrong = append(rewrong, fmt.Sprintf("#%d %s", x.id, x.p.Stage))
		}
		if x.p.BrokeOther {
			broke = append(broke, fmt.Sprintf("#%d %s", x.id, x.p.Stage))
		}
	}
	if len(rewrong) > 0 {
		fmt.Fprintf(&b, "\n- また色違いでくっついたペア：%s\n", strings.Join(rewrong, "、"))
	}
	if len(broke) > 0 {
		fmt.Fprintf(&b, "- 一度入ったのに、ほかを崩していたペア：%s\n", strings.Join(broke, "、"))
	}
	var lls []string
	for _, s := range r.Solves {
		for _, ll := range []*LastLayer{s.OLL, s.PLL} {
			if ll != nil && (ll.Repeated || len(ll.Steps) >= 3) {
				lls = append(lls, fmt.Sprintf("#%d %s：%s", s.ID, strings.ToUpper(ll.Stage), stepsText(ll.Steps)))
			}
		}
	}
	if len(lls) > 0 {
		b.WriteString("- 手順を3つ以上使った・やり直した最後の段：\n")
		for _, l := range lls {
			fmt.Fprintf(&b, "  - %s\n", l)
		}
	}
	return b.String()
}

func writeSolve(b *strings.Builder, s Solve) {
	fmt.Fprintf(b, "\n## ソルブ #%d（%s）\n", s.ID, secs(float64(s.TotalMS)))
	if len(s.Pairs) > 0 {
		b.WriteString("| 段階 | スロット | 始めたときの形 | ケース（標準手順） | 所要 | 認識 | 手数（打ち消し） | ペアまで | 形の移り変わり |\n")
		b.WriteString("|---|---|---|---|---|---|---|---|---|\n")
		for _, p := range s.Pairs {
			toPair := "-"
			if p.MovesToPair > 0 {
				toPair = fmt.Sprintf("%d手", p.MovesToPair)
			}
			path := pathText(p.Path)
			if p.Rewrong {
				path += "（また色違い）"
			}
			if p.BrokeOther {
				path += "（ほかを崩した）"
			}
			fmt.Fprintf(b, "| %s | %s | %s | %s | %s | %s | %d（%d） | %s | %s |\n", strings.ToUpper(p.Stage[:3])+" "+p.Stage[3:], p.Slot,
				ShapeLabel(p.Shape, p.CrossFacing), caseText(p.Case), secs(float64(p.MS)), secs(float64(p.RecognitionMS)),
				p.Moves, p.Cancelled, toPair, path)
		}
	}
	for _, ll := range []*LastLayer{s.OLL, s.PLL} {
		if ll == nil || len(ll.Steps) == 0 {
			continue
		}
		note := fmt.Sprintf("手順 %d つ", len(ll.Steps))
		if ll.Repeated {
			note += "、同じケースに戻った（やり直し）"
		}
		fmt.Fprintf(b, "- %s：%s（%s、%s秒、%d手）\n", strings.ToUpper(ll.Stage), stepsText(ll.Steps), note, secs(float64(ll.MS)), ll.Moves)
	}
}
