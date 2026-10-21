// Package notation は回転記号の座標系の変換を扱う。
//
// スマートキューブは、キューブ自身の向き（GAN標準配色：白U・黄D・緑F・青B・赤R・橙L）で回転を報告する。
// 解く人は「下の色・前の色」で持っているので、表示するときはその持ち方での面の名前に読み替える。
// 持ち替えは回転なので、面の名前が入れ替わるだけで、回転方向（' や 2）はそのまま。
package notation

import (
	"fmt"
	"strings"
)

// ColorFace はGAN標準配色での、色とキューブ自身の面の対応。
var ColorFace = map[string]byte{"white": 'U', "yellow": 'D', "green": 'F', "blue": 'B', "red": 'R', "orange": 'L'}

var faceVec = map[byte][3]int{
	'U': {0, 1, 0}, 'D': {0, -1, 0},
	'F': {0, 0, 1}, 'B': {0, 0, -1},
	'R': {1, 0, 0}, 'L': {-1, 0, 0},
}

// Frame はキューブ自身の面 → 持ち方での面 の対応。
type Frame map[byte]byte

func neg(v [3]int) [3]int { return [3]int{-v[0], -v[1], -v[2]} }

func cross(a, b [3]int) [3]int {
	return [3]int{a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0]}
}

// NewFrame は「下の色・前の色」で持ったときの対応を作る。前の色は下の色と隣り合っている必要がある。
func NewFrame(bottom, front string) (Frame, error) {
	bf, ok := ColorFace[bottom]
	if !ok {
		return nil, fmt.Errorf("invalid bottom color %q", bottom)
	}
	ff, ok := ColorFace[front]
	if !ok {
		return nil, fmt.Errorf("invalid front color %q", front)
	}
	b, f := faceVec[bf], faceVec[ff]
	if b[0]*f[0]+b[1]*f[1]+b[2]*f[2] != 0 {
		return nil, fmt.Errorf("front color %q must be adjacent to bottom color %q", front, bottom)
	}
	up := neg(b)
	right := cross(up, f) // 右手系：R = U × F
	user := map[[3]int]byte{up: 'U', b: 'D', f: 'F', neg(f): 'B', right: 'R', neg(right): 'L'}
	frame := Frame{}
	for face, v := range faceVec {
		frame[face] = user[v]
	}
	return frame, nil
}

// Identity はキューブ自身の向きのまま（変換しない）。
var Identity = Frame{'U': 'U', 'D': 'D', 'F': 'F', 'B': 'B', 'R': 'R', 'L': 'L'}

// Move は1手を持ち方での記号に変換する（"R'" → "U'" など）。外層回転以外はそのまま返す。
func (f Frame) Move(m string) string {
	if m == "" {
		return m
	}
	to, ok := f[m[0]]
	if !ok {
		return m
	}
	return string(to) + m[1:]
}

// Alg は空白区切りの手順を変換する。
func (f Frame) Alg(alg string) string {
	parts := strings.Fields(alg)
	for i, p := range parts {
		parts[i] = f.Move(p)
	}
	return strings.Join(parts, " ")
}

// RightColor は持ち方での右の面の色（表示用）。
func RightColor(bottom, front string) string {
	frame, err := NewFrame(bottom, front)
	if err != nil {
		return ""
	}
	for color, face := range ColorFace {
		if frame[face] == 'R' {
			return color
		}
	}
	return ""
}
