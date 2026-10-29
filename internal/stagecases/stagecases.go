// Package stagecases は、フルソルブの回転ログを再生して、各段階を始めたときのキューブの形を判定する。
//
//   - F2L：その段階で揃えたペアの、始めたときの形（41ケースのどれか、くっついているが色が合っていない、
//     片方が別のスロットにある など）と、1手ごとの形の移り変わり
//   - OLL・PLL：始めたときのケースと、手順の切れ目（F2L が揃っている状態）ごとのケースの並び（1-look か 2-look か、やり直したか）
//
// 回転ログはキューブ自身の向きで記録しているので、持ち方やジャイロの有無に関係なく判定できる。
package stagecases

import (
	"fmt"
	"strings"
	"time"

	"github.com/riwn/cubalyst/internal/cube"
	"github.com/riwn/cubalyst/internal/notation"
	"github.com/riwn/cubalyst/internal/solves"
)

// ペアの形（前右スロットに持ってきて見たとき）。
const (
	ShapeSolved = "solved" // 揃っている
	ShapePaired = "paired" // 上段でペア（1x1x2）ができている
	ShapeWrong  = "wrong"  // 上段で隣り合っているが、色が合っていない
	ShapeApart  = "apart"  // 角もエッジも上段で、離れている
	// それ以外は "c-{U|own|other}/e-{U|own|other}"（角・エッジが 上段 / このスロット / 別のスロット）
)

// Pair は F2L の1ペア（1段階）。
type Pair struct {
	Stage string `json:"stage"`
	// Slot はスロットの2色（例: 緑・赤）。
	Slot string `json:"slot"`
	// Case は始めたときのケース（F2L 41ケース）。片方が別のスロットにあるなどで当てはまらなければ nil。
	Case *CaseRef `json:"case"`
	// Shape は始めたときの形、CrossFacing は角が上段にあるときのクロスの色の向き（up：上 / side：横）。
	Shape       string `json:"shape"`
	CrossFacing string `json:"cross_facing,omitempty"`
	MS          int64  `json:"ms"`
	// RecognitionMS は最初の手までの時間。
	RecognitionMS int64 `json:"recognition_ms"`
	Moves         int   `json:"moves"`
	// NetMoves は打ち消しのあとの手数（180度は2手）、Cancelled は打ち消された手数。
	NetMoves  int `json:"net_moves"`
	Cancelled int `json:"cancelled"`
	// MovesToPair は上段でペアができるまでの手数（ペアを作らずに入ったときは 0）。
	MovesToPair int `json:"moves_to_pair"`
	// Path は形の移り変わり（同じ形が続くところはまとめる。最初は始めたときの形）。
	Path []string `json:"path"`
	// Rewrong は、色が合っていない形から離したあと、また色が合わないままくっついたか。
	Rewrong bool `json:"rewrong"`
	// BrokeOther は、このペアが一度入ったのに、ほかのペアかクロスを崩していて、段階が終わらなかったか。
	BrokeOther bool `json:"broke_other"`
}

// CaseRef はケースの ID と名前。
type CaseRef struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	// Moves は標準手順の手数（180度は2手）。
	Moves int `json:"moves,omitempty"`
}

// LastLayer は OLL か PLL の段階。
type LastLayer struct {
	Stage         string `json:"stage"`
	MS            int64  `json:"ms"`
	RecognitionMS int64  `json:"recognition_ms"`
	Moves         int    `json:"moves"`
	NetMoves      int    `json:"net_moves"`
	// Steps は手順の切れ目（F2L が揃っている状態）ごとのケース。最初が始めたときのケース。
	// 1つなら1つの手順で揃えた。判定できなかった切れ目は ID が空。
	Steps []CaseRef `json:"steps"`
	// Repeated は同じケースが2回以上出てきたか（手順の間違いでやり直したなど）。
	Repeated bool `json:"repeated"`
}

// Solve は1回のソルブの判定結果。
type Solve struct {
	ID       int64      `json:"id"`
	SolvedAt time.Time  `json:"solved_at"`
	TotalMS  int64      `json:"total_ms"`
	Penalty  string     `json:"penalty"`
	Pairs    []Pair     `json:"pairs"`
	OLL      *LastLayer `json:"oll,omitempty"`
	PLL      *LastLayer `json:"pll,omitempty"`
}

var slotRotations = []string{"", "y'", "y", "y2"}

// colorName はキューブ自身の面 → 色。
var colorName = func() map[byte]string {
	m := map[byte]string{}
	for color, face := range notation.ColorFace {
		m[face] = color
	}
	return m
}()

// ColorLabels は色の表示名。
var ColorLabels = map[string]string{"white": "白", "yellow": "黄", "green": "緑", "blue": "青", "red": "赤", "orange": "橙"}

// Analyze は1回のソルブを判定する。段階の区切りが無いソルブは Pairs が空になる。
func Analyze(s solves.Solve, cases *Cases, crossColor string) (Solve, error) {
	out := Solve{ID: s.ID, SolvedAt: s.SolvedAt, TotalMS: s.TotalMS, Penalty: s.Penalty, Pairs: []Pair{}}
	if len(s.Moves) == 0 || len(s.Splits) == 0 {
		return out, nil
	}
	face, ok := notation.ColorFace[crossColor]
	if !ok {
		return out, fmt.Errorf("invalid cross color %q", crossColor)
	}
	moves := make([]string, len(s.Moves))
	for i, m := range s.Moves {
		moves[i] = m.Move
	}
	// 開始状態は「完成状態に回転ログの逆手順を当てた状態」（web の computeSplits と同じ）
	start, err := cube.Solved().Apply(cube.InverseAlg(moves)...)
	if err != nil {
		return out, fmt.Errorf("solve #%d: %w", s.ID, err)
	}
	states := make([]cube.State, len(moves)+1)
	states[0] = start
	for i, m := range moves {
		states[i+1] = states[i].MustApply(m)
	}
	down := cube.DownRotation(face)
	view := func(i int) cube.State { return states[i].Rotate(down) }
	slotView := func(v cube.State, k int) cube.State { return v.Rotate(slotRotations[k]) }
	slotNames := make([]string, 4)
	for k, r := range slotRotations {
		raw := cube.Solved().MustApply(fields(down + " " + r)...)
		slotNames[k] = ColorLabels[colorName[raw[cube.CenterOf('F')]]] + "・" + ColorLabels[colorName[raw[cube.CenterOf('R')]]]
	}

	for _, sp := range s.Splits {
		if sp.MoveCount == 0 || sp.StartIndex >= len(moves) || sp.EndIndex > len(moves) {
			continue
		}
		base := stageBase{
			ms:          sp.EndMS - sp.StartMS,
			recognition: max(0, int64(s.Moves[sp.StartIndex].T)-sp.StartMS),
			moves:       sp.MoveCount,
			net:         netMoves(moves[sp.StartIndex:sp.EndIndex]),
		}
		switch {
		case strings.HasPrefix(sp.Stage, "f2l"):
			a, b := view(sp.StartIndex), view(sp.EndIndex)
			target := -1
			for k := range slotRotations {
				if !pairSolved(slotView(a, k)) && pairSolved(slotView(b, k)) {
					target = k
					break
				}
			}
			if target < 0 {
				continue
			}
			p := Pair{Stage: sp.Stage, Slot: slotNames[target], MS: base.ms, RecognitionMS: base.recognition,
				Moves: base.moves, NetMoves: base.net, Cancelled: base.moves - base.net}
			startView := slotView(a, target)
			p.Shape, p.CrossFacing = shapeOf(startView)
			if c := cases.Find("F2L", startView); c != nil {
				p.Case = &CaseRef{ID: c.ID, Name: c.Name, Moves: c.Moves}
			}
			trace := make([]string, 0, sp.EndIndex-sp.StartIndex)
			for i := sp.StartIndex + 1; i <= sp.EndIndex; i++ {
				sh, _ := shapeOf(slotView(view(i), target))
				trace = append(trace, sh)
			}
			fillPath(&p, trace)
			out.Pairs = append(out.Pairs, p)
		case sp.Stage == "oll" || sp.Stage == "pll":
			ll := &LastLayer{Stage: sp.Stage, MS: base.ms, RecognitionMS: base.recognition, Moves: base.moves, NetMoves: base.net}
			set := strings.ToUpper(sp.Stage)
			seen := map[string]bool{}
			last := ""
			for i := sp.StartIndex; i < sp.EndIndex; i++ {
				v := view(i)
				if !llClean(v, set) {
					continue
				}
				ref := CaseRef{}
				if c := cases.Find(set, v); c != nil {
					ref = CaseRef{ID: c.ID, Name: c.Name, Moves: c.Moves}
				}
				key := ref.ID
				if key == "" {
					key = "?" + v.String()
				}
				if key == last {
					continue
				}
				if seen[key] {
					ll.Repeated = true
				}
				seen[key] = true
				last = key
				ll.Steps = append(ll.Steps, ref)
			}
			if sp.Stage == "oll" {
				out.OLL = ll
			} else {
				out.PLL = ll
			}
		}
	}
	return out, nil
}

type stageBase struct {
	ms, recognition int64
	moves, net      int
}

// pairSolved は前右スロット（DRF の角と FR のエッジ）が揃っているか。
func pairSolved(v cube.State) bool {
	return v.SolvedAt(cube.SlotByName("DRF")) && v.SolvedAt(cube.SlotByName("FR"))
}

var crossEdges = []string{"DF", "DR", "DB", "DL"}

// f2lDone は F2L まで揃っているか（クロスと4ペア）。
func f2lDone(v cube.State) bool {
	for _, e := range crossEdges {
		if !v.SolvedAt(cube.SlotByName(e)) {
			return false
		}
	}
	for k := range slotRotations {
		if !pairSolved(v.Rotate(slotRotations[k])) {
			return false
		}
	}
	return true
}

func ollDone(v cube.State) bool {
	for i := range 9 {
		if v[i] != 'U' {
			return false
		}
	}
	return true
}

// llClean は手順の切れ目（そのケースを判定できる状態）か。PLL では、U を回すだけで揃う状態は除く。
func llClean(v cube.State, set string) bool {
	if !f2lDone(v) {
		return false
	}
	if set == "OLL" {
		return !ollDone(v)
	}
	if !ollDone(v) {
		return false
	}
	for _, a := range auf {
		if v.MustApply(fields(a)...).Relabel() == cube.Solved() {
			return false
		}
	}
	return true
}

// shapeOf は前右スロットのペアの形。角が上段にあれば、クロスの色（D）の向きも返す。
func shapeOf(v cube.State) (string, string) {
	if pairSolved(v) {
		return ShapeSolved, ""
	}
	c := v.PieceAt("DFR")
	e := v.PieceAt("FR")
	cu, eu := c.Name[0] == 'U', e.Name[0] == 'U'
	facingDir := ""
	if cu {
		facingDir = "side"
		if v.Sticker(c, 'U') == 'D' {
			facingDir = "up"
		}
	}
	if cu && eu {
		side := e.Name[1]
		if strings.IndexByte(c.Name, side) < 0 {
			return ShapeApart, facingDir
		}
		if v.Sticker(c, side) == v.Sticker(e, side) && v.Sticker(c, 'U') == v.Sticker(e, 'U') {
			return ShapePaired, facingDir
		}
		return ShapeWrong, facingDir
	}
	loc := func(inU bool, name, own string) string {
		switch {
		case inU:
			return "U"
		case name == own:
			return "own"
		}
		return "other"
	}
	return "c-" + loc(cu, c.Name, "DRF") + "/e-" + loc(eu, e.Name, "FR"), facingDir
}

func fillPath(p *Pair, trace []string) {
	p.Path = []string{p.Shape}
	leftWrong := false
	for i, sh := range trace {
		if sh == ShapePaired && p.MovesToPair == 0 {
			p.MovesToPair = i + 1
		}
		if sh == ShapeSolved && i < len(trace)-1 {
			p.BrokeOther = true
		}
		if sh != p.Path[len(p.Path)-1] {
			if sh == ShapeWrong && leftWrong {
				p.Rewrong = true
			}
			if p.Path[len(p.Path)-1] == ShapeWrong {
				leftWrong = true
			}
			p.Path = append(p.Path, sh)
		}
	}
}

var opposite = map[byte]byte{'U': 'D', 'D': 'U', 'R': 'L', 'L': 'R', 'F': 'B', 'B': 'F'}

// netMoves は打ち消しのあとの手数（180度は2手）。同じ面の連続と、反対の面を挟んだ同じ面をまとめる
// （web/src/solve/notation.ts の simplify と同じ）。
func netMoves(moves []string) int {
	type turn struct {
		face   byte
		amount int
	}
	var out []turn
	for _, m := range moves {
		amount := 1
		switch {
		case strings.HasSuffix(m, "'"):
			amount = 3
		case strings.Contains(m, "2"):
			amount = 2
		}
		t := turn{m[0], amount}
		target := -1
		last := len(out) - 1
		if last >= 0 && out[last].face == t.face {
			target = last
		} else if last >= 1 && out[last].face == opposite[t.face] && out[last-1].face == t.face {
			target = last - 1
		}
		if target < 0 {
			out = append(out, t)
			continue
		}
		out[target].amount = (out[target].amount + t.amount) % 4
		if out[target].amount == 0 {
			out = append(out[:target], out[target+1:]...)
		}
	}
	n := 0
	for _, t := range out {
		if t.amount == 2 {
			n += 2
		} else {
			n++
		}
	}
	return n
}
