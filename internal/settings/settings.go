// Package settings はアプリ設定（settingsテーブルのkey-value）を扱う。
package settings

import (
	"context"
	"database/sql"
	"fmt"

	"cubalyst/internal/notation"
)

// Settings はアプリ設定。
type Settings struct {
	// CrossColor はクロスの色（white/yellow/green/blue/red/orange）。
	CrossColor string `json:"cross_color"`
	// HoldBottom / HoldFront は解くときの持ち方（下の色・前の色）。解法の表記をこの向きに合わせる。
	HoldBottom string `json:"hold_bottom"`
	HoldFront  string `json:"hold_front"`
	// Inspection はフルソルブでWCA方式の15秒インスペクションを使うか。
	Inspection bool `json:"inspection"`
}

// Defaults は未設定時の値。
var Defaults = Settings{CrossColor: "white", HoldBottom: "white", HoldFront: "green", Inspection: true}

// Frame は持ち方での記号への変換。
func (s Settings) Frame() notation.Frame {
	f, err := notation.NewFrame(s.HoldBottom, s.HoldFront)
	if err != nil {
		return notation.Identity
	}
	return f
}

// HoldDescription は持ち方の説明（解析の入力などに使う）。
func (s Settings) HoldDescription() string {
	return fmt.Sprintf("下が%s・前が%s（右は%s）", colorJa[s.HoldBottom], colorJa[s.HoldFront],
		colorJa[notation.RightColor(s.HoldBottom, s.HoldFront)])
}

var colorJa = map[string]string{"white": "白", "yellow": "黄", "green": "緑", "blue": "青", "red": "赤", "orange": "橙"}

var crossColors = map[string]bool{"white": true, "yellow": true, "green": true, "blue": true, "red": true, "orange": true}

func (s Settings) Validate() error {
	if !crossColors[s.CrossColor] {
		return fmt.Errorf("invalid cross_color %q", s.CrossColor)
	}
	if _, err := notation.NewFrame(s.HoldBottom, s.HoldFront); err != nil {
		return err
	}
	return nil
}

type Store struct {
	db *sql.DB
}

func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

// Get は保存済みの設定を既定値に重ねて返す。
func (st *Store) Get(ctx context.Context) (Settings, error) {
	s := Defaults
	rows, err := st.db.QueryContext(ctx, `SELECT key, value FROM settings`)
	if err != nil {
		return s, err
	}
	defer rows.Close()
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			return s, err
		}
		switch k {
		case "cross_color":
			s.CrossColor = v
		case "hold_bottom":
			s.HoldBottom = v
		case "hold_front":
			s.HoldFront = v
		case "inspection":
			s.Inspection = v == "1"
		}
	}
	return s, rows.Err()
}

// Put は設定を保存する。
func (st *Store) Put(ctx context.Context, s Settings) error {
	if err := s.Validate(); err != nil {
		return err
	}
	tx, err := st.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	inspection := "0"
	if s.Inspection {
		inspection = "1"
	}
	for k, v := range map[string]string{"cross_color": s.CrossColor, "hold_bottom": s.HoldBottom, "hold_front": s.HoldFront, "inspection": inspection} {
		if _, err := tx.ExecContext(ctx, `INSERT INTO settings (key, value) VALUES (?, ?)
			ON CONFLICT (key) DO UPDATE SET value = excluded.value,
			updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`, k, v); err != nil {
			return err
		}
	}
	return tx.Commit()
}
