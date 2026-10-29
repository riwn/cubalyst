// Package cube は 3x3 キューブの状態（シールの並び）を扱う。
//
// 状態は54文字の facelets（URFDLB、各面 row-major。Kociemba 形式。web/src/cube/facelets.ts と同じ並び）で、
// 各シールの色を「完成状態でそのシールがある面の文字」で表す。
//
//	U: 0-8（B側が上）, R: 9-17, F: 18-26, D: 27-35（F側が上）, L: 36-44, B: 45-53
//
// 回転は空間に固定した向きで当てる（R は今 x=+1 にある層を回す）。持ち替え（x・y・z）はシールごと動かすので、
// 当てたあとは Relabel で、センターの色から面の名前を付け直して見る。
package cube

import (
	"fmt"
	"strings"
)

// State はシールの並び。
type State [54]byte

// Faces は facelets の面の順。
const Faces = "URFDLB"

// FaceOf は facelet の番号から面の文字を返す。
func FaceOf(i int) byte { return Faces[i/9] }

// Solved は完成状態。
func Solved() State {
	var s State
	for i := range s {
		s[i] = FaceOf(i)
	}
	return s
}

// ParseState は54文字の facelets を読む。
func ParseState(f string) (State, error) {
	var s State
	if len(f) != len(s) {
		return s, fmt.Errorf("facelets must be %d characters", len(s))
	}
	copy(s[:], f)
	return s, nil
}

func (s State) String() string { return string(s[:]) }

// Slot はピースの場所と、そこにあるシールの facelet 番号（web/src/cube/facelets.ts と同じ）。
type Slot struct {
	Name     string
	Facelets []int
}

var CornerSlots = []Slot{
	{"UFR", []int{8, 20, 9}},
	{"URB", []int{2, 11, 45}},
	{"UBL", []int{0, 47, 36}},
	{"ULF", []int{6, 38, 18}},
	{"DRF", []int{29, 15, 26}},
	{"DFL", []int{27, 24, 44}},
	{"DLB", []int{33, 42, 53}},
	{"DBR", []int{35, 51, 17}},
}

var EdgeSlots = []Slot{
	{"UF", []int{7, 19}},
	{"UR", []int{5, 10}},
	{"UB", []int{1, 46}},
	{"UL", []int{3, 37}},
	{"DF", []int{28, 25}},
	{"DR", []int{32, 16}},
	{"DB", []int{34, 52}},
	{"DL", []int{30, 43}},
	{"FR", []int{23, 12}},
	{"FL", []int{21, 41}},
	{"BR", []int{48, 14}},
	{"BL", []int{50, 39}},
}

// CenterOf は面のセンターの facelet 番号。
func CenterOf(face byte) int { return strings.IndexByte(Faces, face)*9 + 4 }

type vec [3]int

func (a vec) dot(b vec) int { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2] }

func (a vec) cross(b vec) vec {
	return vec{a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0]}
}

// 各面の外向きの向き（x=右、y=上、z=前）。
var faceNormal = map[byte]vec{'U': {0, 1, 0}, 'D': {0, -1, 0}, 'R': {1, 0, 0}, 'L': {-1, 0, 0}, 'F': {0, 0, 1}, 'B': {0, 0, -1}}

// シールの位置（各座標 -1〜1）と向き。
var stickerPos, stickerNormal [54]vec

func init() {
	for i := range 54 {
		r, c := (i%9)/3, i%3
		var p vec
		switch FaceOf(i) {
		case 'U':
			p = vec{c - 1, 1, r - 1}
		case 'R':
			p = vec{1, 1 - r, 1 - c}
		case 'F':
			p = vec{c - 1, 1 - r, 1}
		case 'D':
			p = vec{c - 1, -1, 1 - r}
		case 'L':
			p = vec{-1, 1 - r, c - 1}
		case 'B':
			p = vec{1 - c, 1 - r, -1}
		}
		stickerPos[i] = p
		stickerNormal[i] = faceNormal[FaceOf(i)]
	}
	for _, t := range []struct {
		name  string
		axis  vec
		layer func(int) bool // 回す軸方向の座標で、回す層を選ぶ
	}{
		{"U", faceNormal['U'], func(d int) bool { return d == 1 }},
		{"D", faceNormal['D'], func(d int) bool { return d == 1 }},
		{"R", faceNormal['R'], func(d int) bool { return d == 1 }},
		{"L", faceNormal['L'], func(d int) bool { return d == 1 }},
		{"F", faceNormal['F'], func(d int) bool { return d == 1 }},
		{"B", faceNormal['B'], func(d int) bool { return d == 1 }},
		{"x", faceNormal['R'], func(int) bool { return true }},
		{"y", faceNormal['U'], func(int) bool { return true }},
		{"z", faceNormal['F'], func(int) bool { return true }},
	} {
		quarter[t.name] = permutation(t.axis, t.layer)
	}
}

// quarter は時計回り90度の回転での、シールの行き先（perm[i] は i にあったシールが移る番号）。
var quarter = map[string][54]int{}

// permutation は axis の向きから見て時計回りに90度回したときの、シールの行き先。
func permutation(axis vec, layer func(int) bool) [54]int {
	// 時計回り = axis まわりに -90 度：v → -(axis × v) + axis (axis·v)
	rot := func(v vec) vec {
		c := axis.cross(v)
		d := axis.dot(v)
		return vec{-c[0] + axis[0]*d, -c[1] + axis[1]*d, -c[2] + axis[2]*d}
	}
	var perm [54]int
	for i := range 54 {
		perm[i] = i
		if !layer(stickerPos[i].dot(axis)) {
			continue
		}
		p, n := rot(stickerPos[i]), rot(stickerNormal[i])
		for j := range 54 {
			if stickerPos[j] == p && stickerNormal[j] == n {
				perm[i] = j
				break
			}
		}
	}
	return perm
}

// Move は1手（U R F D L B と、持ち替え x y z。後ろに ' か 2）を当てた状態を返す。
func (s State) Move(m string) (State, error) {
	if m == "" {
		return s, fmt.Errorf("empty move")
	}
	perm, ok := quarter[m[:1]]
	if !ok {
		return s, fmt.Errorf("unsupported move %q", m)
	}
	n := 1
	switch m[1:] {
	case "":
	case "'":
		n = 3
	case "2", "2'":
		n = 2
	default:
		return s, fmt.Errorf("unsupported move %q", m)
	}
	for range n {
		var next State
		for i, j := range perm {
			next[j] = s[i]
		}
		s = next
	}
	return s, nil
}

// Apply は手を順に当てる。
func (s State) Apply(moves ...string) (State, error) {
	var err error
	for _, m := range moves {
		if s, err = s.Move(m); err != nil {
			return s, err
		}
	}
	return s, nil
}

// MustApply は Apply で、失敗したら panic する（手が決まっている内部の用途向け）。
func (s State) MustApply(moves ...string) State {
	s, err := s.Apply(moves...)
	if err != nil {
		panic(err)
	}
	return s
}

// Inverse は1手の逆。
func Inverse(m string) string {
	switch {
	case strings.HasSuffix(m, "2'"):
		return m[:len(m)-1]
	case strings.HasSuffix(m, "2"):
		return m
	case strings.HasSuffix(m, "'"):
		return m[:len(m)-1]
	}
	return m + "'"
}

// InverseAlg は手順の逆。
func InverseAlg(moves []string) []string {
	out := make([]string, len(moves))
	for i, m := range moves {
		out[len(moves)-1-i] = Inverse(m)
	}
	return out
}

// Relabel はシールの色を、今その色のセンターがある面の文字に付け直す。持ち替えたあとの見た目になる。
func (s State) Relabel() State {
	name := map[byte]byte{}
	for _, f := range []byte(Faces) {
		name[s[CenterOf(f)]] = f
	}
	var out State
	for i, c := range s {
		out[i] = name[c]
	}
	return out
}

// Rotate は持ち替え（x y z の組み合わせ）を当てて、面の名前を付け直した状態を返す。
func (s State) Rotate(rotation string) State {
	return s.MustApply(strings.Fields(rotation)...).Relabel()
}

// DownRotation は、今 face にある面を下に持ってくる持ち替え。
func DownRotation(face byte) string {
	return map[byte]string{'D': "", 'U': "x2", 'F': "x'", 'B': "x", 'R': "z", 'L': "z'"}[face]
}

// PieceAt は、色の組 colors（順不同）のピースがある場所。見つからなければ空の Slot。
func (s State) PieceAt(colors string) Slot {
	slots := EdgeSlots
	if len(colors) == 3 {
		slots = CornerSlots
	}
	for _, sl := range slots {
		if sameSet(s.colorsAt(sl), colors) {
			return sl
		}
	}
	return Slot{}
}

func (s State) colorsAt(sl Slot) string {
	b := make([]byte, len(sl.Facelets))
	for i, f := range sl.Facelets {
		b[i] = s[f]
	}
	return string(b)
}

func sameSet(a, b string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range len(b) {
		if !strings.ContainsRune(a, rune(b[i])) {
			return false
		}
	}
	return true
}

// Sticker は、場所 sl のシールのうち、面 face を向いているものの色。
func (s State) Sticker(sl Slot, face byte) byte {
	for _, f := range sl.Facelets {
		if FaceOf(f) == face {
			return s[f]
		}
	}
	return 0
}

// SolvedAt はその場所のピースが揃っている（色が面の名前と合っている）か。
func (s State) SolvedAt(sl Slot) bool {
	for _, f := range sl.Facelets {
		if s[f] != FaceOf(f) {
			return false
		}
	}
	return true
}

// SlotByName は名前から場所を引く。
func SlotByName(name string) Slot {
	for _, sl := range append(append([]Slot{}, CornerSlots...), EdgeSlots...) {
		if sl.Name == name {
			return sl
		}
	}
	return Slot{}
}
