package solves

import (
	"errors"
	"fmt"

	"github.com/riwn/cubalyst/internal/notation"
)

// GyroSample はジャイロの1サンプル：[t, w, x, y, z]。t はソルブ開始からの相対ms（回転ログの T と同じ基準）、
// w〜z はキューブの向きのクォータニオン。
type GyroSample [5]float64

// Hold は持ち方（下の色・前の色）。
type Hold struct {
	Bottom string `json:"bottom"`
	Front  string `json:"front"`
}

// HoldChange は1回の持ち替え。
type HoldChange struct {
	// Index は回転ログで、この持ち替えより前にある手の数（Moves[Index] 以降が新しい持ち方）。
	Index  int     `json:"index"`
	StartT float64 `json:"start_t"` // 持ち替えを始める前の、最後の落ち着いた時刻
	EndT   float64 `json:"end_t"`   // 新しい持ち方で落ち着いた時刻
	Bottom string  `json:"bottom"`
	Front  string  `json:"front"`
	Rot    string  `json:"rot"` // y、x'、x y など
	// WithMove は L・R の回転と同時に起きた x 系（ワイドムーブやスライスの一部）。中心ごと向きが変わっただけで、
	// 解く人は持ち替えていないので、持ち替えの回数と時間には数えない。
	WithMove bool `json:"with_move"`
	// Slice は、WithMove のうち L・R の組と合わせてスライスになるもの（M、M'、M2）。SliceMoves はその L・R の手の添字。
	// 表記では、この手と持ち替えをまとめて SliceMoves[0] の位置に Slice の1語で書く。
	Slice      string `json:"slice,omitempty"`
	SliceMoves []int  `json:"slice_moves,omitempty"`
}

// IsRegrip は解く人が持ち替えたか（ワイドムーブやスライスで中心ごと回ったのではない）。
func (c HoldChange) IsRegrip() bool { return !c.WithMove }

// Slices はスライスの、最初の手の添字からその持ち替えへの対応と、スライスにまとめる手の添字。
func (h *Holds) Slices() (at map[int]HoldChange, used map[int]bool) {
	at, used = map[int]HoldChange{}, map[int]bool{}
	if h == nil {
		return at, used
	}
	for _, c := range h.Changes {
		if c.Slice == "" || len(c.SliceMoves) == 0 {
			continue
		}
		at[c.SliceMoves[0]] = c
		for _, i := range c.SliceMoves {
			used[i] = true
		}
	}
	return at, used
}

// Holds はジャイロから計算した、ソルブ中の持ち方の移り変わり。
type Holds struct {
	Start   Hold         `json:"start"`
	Changes []HoldChange `json:"changes"`
	// Estimated は、着手時の前の色を回した手の偏りから決めたか（false なら設定の前の色を仮定した）。
	Estimated bool `json:"estimated,omitempty"`
	// FromT は、持ち替えを記録し始めた時刻（ms）。着手の時点で傾けていたら、下が start の色で落ち着いたところから。
	// それより前の手は start の持ち方で書く。0 なら着手の時点から。
	FromT float64 `json:"from_t,omitempty"`
}

// Validate は持ち替えの値を検証する。moveCount は回転ログの手数。
func (h *Holds) Validate(moveCount int) error {
	if h == nil {
		return nil
	}
	if _, err := notation.NewFrame(h.Start.Bottom, h.Start.Front); err != nil {
		return fmt.Errorf("holds.start: %w", err)
	}
	if h.FromT < 0 {
		return fmt.Errorf("holds.from_t: negative")
	}
	prev := 0
	for i, c := range h.Changes {
		if c.Index < prev || c.Index > moveCount {
			return fmt.Errorf("holds.changes[%d]: invalid index %d", i, c.Index)
		}
		prev = c.Index
		if c.EndT < c.StartT {
			return fmt.Errorf("holds.changes[%d]: end_t before start_t", i)
		}
		if c.Rot == "" {
			return fmt.Errorf("holds.changes[%d]: rot is empty", i)
		}
		if _, err := notation.NewFrame(c.Bottom, c.Front); err != nil {
			return fmt.Errorf("holds.changes[%d]: %w", i, err)
		}
		if (c.Slice == "") != (len(c.SliceMoves) == 0) {
			return fmt.Errorf("holds.changes[%d]: slice and slice_moves must be set together", i)
		}
		for _, m := range c.SliceMoves {
			if m < 0 || m >= moveCount {
				return fmt.Errorf("holds.changes[%d]: invalid slice move %d", i, m)
			}
		}
	}
	return nil
}

// HoldAt は回転ログの i 手目（0 始まり）の時点の持ち方。
func (h *Holds) HoldAt(i int) Hold {
	cur := h.Start
	for _, c := range h.Changes {
		if c.Index > i {
			break
		}
		cur = Hold{Bottom: c.Bottom, Front: c.Front}
	}
	return cur
}

// ErrNoGyro はジャイロの生データが無いソルブに持ち替えを付けようとしたとき。
var ErrNoGyro = errors.New("solve has no gyro samples")
