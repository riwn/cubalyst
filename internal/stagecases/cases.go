package stagecases

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"github.com/riwn/cubalyst/internal/cube"
)

// Case はケースのマスタ（cases テーブル）の1件。
type Case struct {
	ID   string
	Set  string
	Name string
	// Moves は標準手順の手数（180度は2手。持ち替えは数えない）。
	Moves int
	sig   string
}

// LoadCases はケースのマスタを読み、判定に使う署名を作る。
func LoadCases(ctx context.Context, db *sql.DB) (*Cases, error) {
	rows, err := db.QueryContext(ctx, `SELECT id, case_set, name, alg, pattern FROM cases ORDER BY sort`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	cs := &Cases{byID: map[string]*Case{}, bySig: map[string]*Case{}}
	for rows.Next() {
		var c Case
		var alg, pattern string
		if err := rows.Scan(&c.ID, &c.Set, &c.Name, &alg, &pattern); err != nil {
			return nil, err
		}
		st, err := cube.ParseState(pattern)
		if err != nil {
			return nil, fmt.Errorf("case %s: %w", c.ID, err)
		}
		c.Moves = algLength(alg)
		c.sig = signature(c.Set, st)
		cs.byID[c.ID] = &c
		cs.bySig[c.Set+":"+c.sig] = &c
	}
	return cs, rows.Err()
}

// Cases はケースのマスタと、署名からの引き当て。
type Cases struct {
	byID  map[string]*Case
	bySig map[string]*Case
}

// Find は、標準の向き（下＝クロス、上＝最終層）の状態 s のケース。見つからなければ nil。
// F2L は前右スロットのペアで判定する。
func (cs *Cases) Find(set string, s cube.State) *Case {
	return cs.bySig[set+":"+signature(set, s)]
}

// ByID は ID からケースを引く。
func (cs *Cases) ByID(id string) *Case { return cs.byID[id] }

func algLength(alg string) int {
	n := 0
	for _, m := range strings.Fields(alg) {
		switch m[0] {
		case 'x', 'y', 'z':
			continue
		}
		if strings.Contains(m, "2") {
			n += 2
		} else {
			n++
		}
	}
	return n
}

var auf = []string{"", "U", "U2", "U'"}

// signature はケースの同一性を判定する署名（web/src/cases/geometry.ts の caseSignature と同じ考え方）。
//
//	OLL：前 AUF を除いた上面の向き / PLL：前後の AUF を除いた並び / F2L：前 AUF を除いた前右ペアの位置と向き
func signature(set string, s cube.State) string {
	var variants []string
	switch set {
	case "OLL":
		for _, a := range auf {
			variants = append(variants, ollString(s.MustApply(fields(a)...)))
		}
	case "PLL":
		cycle := map[byte]byte{'F': 'R', 'R': 'B', 'B': 'L', 'L': 'F'}
		for _, a := range auf {
			p := []byte(pllString(s.MustApply(fields(a)...)))
			for range 4 {
				variants = append(variants, string(p))
				for i, c := range p {
					if n, ok := cycle[c]; ok {
						p[i] = n
					}
				}
			}
		}
	default:
		for _, a := range auf {
			t := s.MustApply(fields(a)...)
			corner := t.PieceAt("DFR")
			edge := t.PieceAt("FR")
			variants = append(variants, fmt.Sprintf("%d/%d", facing(t, corner, 'D'), facing(t, edge, 'F')))
		}
	}
	best := variants[0]
	for _, v := range variants[1:] {
		if v < best {
			best = v
		}
	}
	return best
}

// facing は、場所 sl にあるピースの、色 color のシールの facelet 番号。
func facing(s cube.State, sl cube.Slot, color byte) int {
	for _, f := range sl.Facelets {
		if s[f] == color {
			return f
		}
	}
	return -1
}

// 上面9枚と、F・R・B・L 面の上段3枚ずつ。
var llTop = []int{0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 18, 19, 20, 36, 37, 38, 45, 46, 47}
var llSides = []int{9, 10, 11, 18, 19, 20, 36, 37, 38, 45, 46, 47}

func ollString(s cube.State) string {
	b := make([]byte, len(llTop))
	for i, f := range llTop {
		b[i] = '.'
		if s[f] == 'U' {
			b[i] = 'x'
		}
	}
	return string(b)
}

func pllString(s cube.State) string {
	b := make([]byte, len(llSides))
	for i, f := range llSides {
		b[i] = s[f]
	}
	return string(b)
}

func fields(s string) []string {
	if s == "" {
		return nil
	}
	return strings.Fields(s)
}
