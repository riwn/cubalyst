package analysis

import (
	"fmt"
	"math"
	"sort"
	"strings"

	"github.com/riwn/cubalyst/internal/solves"
)

// 持ち替え（ジャイロで記録した y・x・z）を解析の入力に入れるための集計。

// minHoldSolves より少ないと、まとめ解析で持ち替えの数字を出さない。
const minHoldSolves = 5

// rotText は持ち替えの表記。L・R と同時の x 系は [x] のように括弧で囲む（ワイドムーブやスライスの一部かもしれない）。
func rotText(c solves.HoldChange) string {
	if c.WithMove {
		return "[" + c.Rot + "]"
	}
	return c.Rot
}

// changesIn は回転ログの [from, to) にある持ち替え（moves[from] の前のものを含む）。
func changesIn(s solves.Solve, from, to int) []solves.HoldChange {
	if s.Holds == nil {
		return nil
	}
	var out []solves.HoldChange
	for _, c := range s.Holds.Changes {
		if c.Index >= from && c.Index < to {
			out = append(out, c)
		}
	}
	return out
}

// algWithRotations は moves[from, to) の解法に持ち替えを入れた表記。同じ面の続きは持ち替えをまたがずにまとめる。
// s の回転ログは持ち方の記号に変換済みであること（export.WithFrame）。
func algWithRotations(s solves.Solve, from, to int) string {
	from, to = min(from, len(s.Moves)), min(to, len(s.Moves))
	var parts []string
	seg := from
	for _, c := range changesIn(s, from, to) {
		if m := mergeMoves(s.Moves[seg:c.Index]); m != "" {
			parts = append(parts, m)
		}
		parts = append(parts, rotText(c))
		seg = c.Index
	}
	if m := mergeMoves(s.Moves[seg:to]); m != "" {
		parts = append(parts, m)
	}
	return strings.Join(parts, " ")
}

// stageRotation は1段階の持ち替え：回数、合計の時間、そのうち最初の手より前（認識中）の時間（ms）。
type stageRotation struct {
	count       int
	ms, recogMS float64
}

func rotationOf(s solves.Solve, sp solves.Split) stageRotation {
	var r stageRotation
	first := float64(sp.EndMS)
	if sp.MoveCount > 0 && sp.StartIndex < len(s.Moves) {
		first = s.Moves[sp.StartIndex].T
	}
	for _, c := range changesIn(s, sp.StartIndex, sp.EndIndex) {
		r.count++
		r.ms += c.EndT - c.StartT
		if c.Index == sp.StartIndex {
			// 段階の始まりから最初の手までと重なる分
			r.recogMS += math.Max(0, math.Min(c.EndT, first)-math.Max(c.StartT, float64(sp.StartMS)))
		}
	}
	return r
}

// holdsLine は単体の解析の、持ち方と持ち替えの記録についての説明。
func holdsLine(s solves.Solve, holdDescription string) string {
	switch {
	case s.Holds != nil:
		front := "前の色は設定の持ち方を仮定"
		if s.Holds.Estimated {
			front = "前の色は回した手の偏りから推定"
		}
		return fmt.Sprintf("ジャイロで記録（着手時：%s。%s）。手の記号は、その時点の持ち方での面の名前です。持ち替えは %d 回",
			holdDescriptionOf(s.Holds.Start), front, len(s.Holds.Changes))
	case len(s.Gyro) > 0:
		return holdDescription + "（固定）。ジャイロのデータはあるが、着手時の下の色が設定と違うか途中で途切れたため、持ち替えは記録なし"
	default:
		return holdDescription + "（固定）。ジャイロを使っていないため、持ち替えは記録なし"
	}
}

var colorJa = map[string]string{"white": "白", "yellow": "黄", "green": "緑", "blue": "青", "red": "赤", "orange": "橙"}

func holdDescriptionOf(h solves.Hold) string {
	return fmt.Sprintf("下が%s・前が%s", colorJa[h.Bottom], colorJa[h.Front])
}

// pauseRotation は手と手の間（prev〜next の時刻）にある持ち替えの説明。無ければ空。
func pauseRotation(s solves.Solve, index int) string {
	var parts []string
	for _, c := range changesIn(s, index, index+1) {
		parts = append(parts, fmt.Sprintf("%s の持ち替え %s秒", rotText(c), sec(c.EndT-c.StartT)))
	}
	if len(parts) == 0 {
		return ""
	}
	return "、" + strings.Join(parts, "・") + "を含む"
}

// multiRotations はまとめ解析の、持ち替えの集計。記録のあるソルブが少なければ件数だけ。
func multiRotations(list []solves.Solve) string {
	var with []solves.Solve
	for _, s := range list {
		if s.Holds != nil && len(s.Splits) == len(solves.Stages) && s.Penalty != solves.PenaltyDNF {
			with = append(with, s)
		}
	}
	var b strings.Builder
	fmt.Fprintf(&b, "\n## 持ち替え（ジャイロで記録）\n- 記録のあるソルブ: %d件中%d件（段階がそろっていて DNF でないもの）\n", len(list), len(with))
	if len(with) < minHoldSolves {
		fmt.Fprintf(&b, "- 記録のあるソルブが%d件未満なので、持ち替えの数字は出していません\n", minHoldSolves)
		return b.String()
	}
	n := float64(len(with))
	total, totalMS, recogMS, withMove := 0, 0.0, 0.0, 0
	byStage := map[string]*stageRotation{}
	kinds := map[string]int{}
	for _, s := range with {
		for _, sp := range s.Splits {
			r := rotationOf(s, sp)
			a := byStage[sp.Stage]
			if a == nil {
				a = &stageRotation{}
				byStage[sp.Stage] = a
			}
			a.count += r.count
			a.ms += r.ms
			a.recogMS += r.recogMS
			recogMS += r.recogMS
		}
		for _, c := range s.Holds.Changes {
			total++
			totalMS += c.EndT - c.StartT
			kinds[c.Rot]++
			if c.WithMove {
				withMove++
			}
		}
	}
	fmt.Fprintf(&b, "- 1ソルブあたり: %.1f回、%s秒（うち段階の最初の手より前＝認識中 %s秒）\n",
		float64(total)/n, sec(totalMS/n), sec(recogMS/n))
	b.WriteString("\n| 段階 | 平均回数 | 平均時間 | うち認識中 |\n|---|---|---|---|\n")
	for _, st := range solves.Stages {
		a := byStage[st]
		if a == nil {
			continue
		}
		fmt.Fprintf(&b, "| %s | %.2f | %s | %s |\n", stageNames[st], float64(a.count)/n, sec(a.ms/n), sec(a.recogMS/n))
	}
	type kc struct {
		rot string
		n   int
	}
	var ks []kc
	for k, v := range kinds {
		ks = append(ks, kc{k, v})
	}
	sort.Slice(ks, func(i, j int) bool { return ks[i].n > ks[j].n || (ks[i].n == ks[j].n && ks[i].rot < ks[j].rot) })
	var parts []string
	for i, k := range ks {
		if i == 5 {
			break
		}
		parts = append(parts, fmt.Sprintf("%s %d回", k.rot, k.n))
	}
	if len(parts) > 0 {
		fmt.Fprintf(&b, "\n- 多い持ち替え: %s\n", strings.Join(parts, " / "))
	}
	if withMove > 0 {
		fmt.Fprintf(&b, "- うち L・R と同時の x 系（ワイドムーブやスライスの一部かもしれない）: %d回\n", withMove)
	}
	return b.String()
}
