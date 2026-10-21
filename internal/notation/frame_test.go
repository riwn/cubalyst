package notation

import "testing"

func TestNewFrame(t *testing.T) {
	cases := []struct {
		bottom, front string
		want          string // キューブの U R F D L B がそれぞれ何になるか
		right         string
	}{
		// キューブ自身の向き（白上・緑前）＝黄を下・緑を前
		{"yellow", "green", "URFDLB", "red"},
		// 白下・緑前（z2）：上下・左右が入れ替わる
		{"white", "green", "DLFURB", "orange"},
		// 白下・赤前：実機の解析で推測された持ち方（キューブのD→U、F→R、R→F）
		{"white", "red", "DFRUBL", "green"},
	}
	for _, c := range cases {
		f, err := NewFrame(c.bottom, c.front)
		if err != nil {
			t.Fatal(err)
		}
		got := ""
		for _, face := range []byte("URFDLB") {
			got += string(f[face])
		}
		if got != c.want {
			t.Errorf("%s/%s: %s, want %s", c.bottom, c.front, got, c.want)
		}
		if r := RightColor(c.bottom, c.front); r != c.right {
			t.Errorf("%s/%s: right %s, want %s", c.bottom, c.front, r, c.right)
		}
	}
}

func TestNewFrameInvalid(t *testing.T) {
	for _, c := range [][2]string{{"white", "yellow"}, {"white", "white"}, {"pink", "green"}, {"white", "pink"}} {
		if _, err := NewFrame(c[0], c[1]); err == nil {
			t.Errorf("%v: expected error", c)
		}
	}
}

func TestFrameAlg(t *testing.T) {
	f, _ := NewFrame("white", "red")
	if got := f.Alg("D' F2 R U"); got != "U' R2 F D" {
		t.Errorf("Alg = %q", got)
	}
	if got := Identity.Alg("R U R'"); got != "R U R'" {
		t.Errorf("Identity = %q", got)
	}
}

// 全24通りの持ち方が、面の置換として正しい（6面すべてに別々の面が対応する）こと。
func TestAllFramesArePermutations(t *testing.T) {
	n := 0
	for b := range ColorFace {
		for fr := range ColorFace {
			f, err := NewFrame(b, fr)
			if err != nil {
				continue
			}
			n++
			seen := map[byte]bool{}
			for _, v := range f {
				seen[v] = true
			}
			if len(seen) != 6 {
				t.Errorf("%s/%s: not a permutation: %v", b, fr, f)
			}
		}
	}
	if n != 24 {
		t.Errorf("valid frames = %d, want 24", n)
	}
}
