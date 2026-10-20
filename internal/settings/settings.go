// Package settings はアプリ設定（settingsテーブルのkey-value）を扱う。
package settings

import (
	"context"
	"database/sql"
	"fmt"
)

// Settings はアプリ設定。
type Settings struct {
	// CrossColor はクロスの色（white/yellow/green/blue/red/orange）。
	CrossColor string `json:"cross_color"`
}

// Defaults は未設定時の値。
var Defaults = Settings{CrossColor: "white"}

var crossColors = map[string]bool{"white": true, "yellow": true, "green": true, "blue": true, "red": true, "orange": true}

func (s Settings) Validate() error {
	if !crossColors[s.CrossColor] {
		return fmt.Errorf("invalid cross_color %q", s.CrossColor)
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
		}
	}
	return s, rows.Err()
}

// Put は設定を保存する。
func (st *Store) Put(ctx context.Context, s Settings) error {
	if err := s.Validate(); err != nil {
		return err
	}
	_, err := st.db.ExecContext(ctx, `INSERT INTO settings (key, value) VALUES ('cross_color', ?)
		ON CONFLICT (key) DO UPDATE SET value = excluded.value,
		updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`, s.CrossColor)
	return err
}
