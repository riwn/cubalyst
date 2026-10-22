package db

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"
	"testing"
)

func TestMigrateIsIdempotent(t *testing.T) {
	ctx := context.Background()
	database, err := Open(filepath.Join(t.TempDir(), "sub", "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()

	ms, err := loadMigrations()
	if err != nil {
		t.Fatal(err)
	}
	want := ms[len(ms)-1].version

	for i := range 2 {
		if err := Migrate(ctx, database); err != nil {
			t.Fatalf("migrate #%d: %v", i+1, err)
		}
		got, err := SchemaVersion(ctx, database)
		if err != nil {
			t.Fatal(err)
		}
		if got != want {
			t.Fatalf("migrate #%d: schema version = %d, want %d", i+1, got, want)
		}
	}

	var n int
	if err := database.QueryRow(`SELECT COUNT(*) FROM schema_migrations`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != len(ms) {
		t.Fatalf("schema_migrations rows = %d, want %d", n, len(ms))
	}
	if _, err := database.Exec(`INSERT INTO settings (key, value) VALUES ('cross_color', 'white')`); err != nil {
		t.Fatalf("settings table not usable: %v", err)
	}
}

func TestOpenEnablesPragmas(t *testing.T) {
	database, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()

	var mode string
	if err := database.QueryRow(`PRAGMA journal_mode`).Scan(&mode); err != nil {
		t.Fatal(err)
	}
	if mode != "wal" {
		t.Errorf("journal_mode = %q, want wal", mode)
	}
	var fk int
	if err := database.QueryRow(`PRAGMA foreign_keys`).Scan(&fk); err != nil {
		t.Fatal(err)
	}
	if fk != 1 {
		t.Errorf("foreign_keys = %d, want 1", fk)
	}
}

// 0006：今までの解析（単体・傾向分析）が、種類と対象のソルブを付けて移される
func TestMigrateAnalysisTargets(t *testing.T) {
	ctx := context.Background()
	database, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	if _, err := database.ExecContext(ctx, `CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL,
		applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))`); err != nil {
		t.Fatal(err)
	}
	ms, err := loadMigrations()
	if err != nil {
		t.Fatal(err)
	}
	for _, m := range ms {
		if m.version < 6 {
			if err := apply(ctx, database, m); err != nil {
				t.Fatal(err)
			}
		}
	}
	exec := func(q string, args ...any) {
		t.Helper()
		if _, err := database.ExecContext(ctx, q, args...); err != nil {
			t.Fatal(err)
		}
	}
	// フルソルブ #1〜#4（#3 は傾向分析のあと）と、ケース練習 #5
	for i, at := range []string{"2026-10-20T10:00:00.000Z", "2026-10-20T11:00:00.000Z", "2026-10-22T10:00:00.000Z", "2026-10-20T12:00:00.000Z"} {
		exec(`INSERT INTO solves (id, mode, solved_at, total_ms, scramble) VALUES (?, 'full', ?, 1000, '')`, i+1, at)
	}
	exec(`INSERT INTO solves (id, mode, solved_at, total_ms, scramble) VALUES (5, 'case', '2026-10-20T12:30:00.000Z', 1000, '')`)
	exec(`INSERT INTO analyses (id, kind, solve_id, input, result, model, input_tokens, created_at) VALUES (1, 'solve', 2, 'in', 'r1', 'm', 10, '2026-10-21T00:00:00.000Z')`)
	exec(`INSERT INTO analyses (id, kind, params, input, result, model, created_at) VALUES (2, 'trend', '{"mode":"full","limit":2}', 'in', 'r2', 'm', '2026-10-21T00:00:00.000Z')`)

	if err := Migrate(ctx, database); err != nil {
		t.Fatal(err)
	}
	rows, err := database.QueryContext(ctx, `SELECT a.id, a.kind, a.title, group_concat(l.solve_id) FROM analyses a
		JOIN analysis_solves l ON l.analysis_id = a.id GROUP BY a.id ORDER BY a.id`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var got []string
	for rows.Next() {
		var id int
		var kind, title, ids string
		if err := rows.Scan(&id, &kind, &title, &ids); err != nil {
			t.Fatal(err)
		}
		got = append(got, fmt.Sprintf("%d %s %q %s", id, kind, title, ids))
	}
	// 傾向分析は、作った時点の直近2件のフルソルブ（#2 と #4。#3 は後、#5 はケース練習）
	want := []string{`1 solve "" 2`, `2 multi "直近2件" 2,4`}
	if strings.Join(got, "\n") != strings.Join(want, "\n") {
		t.Fatalf("got\n%s\nwant\n%s", strings.Join(got, "\n"), strings.Join(want, "\n"))
	}
}

// 0008：solves を作り直しても、段階・解析の結び付き・トリガーが残り、assist を保存できる
func TestMigrateAssistModeKeepsReferences(t *testing.T) {
	ctx := context.Background()
	database, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	if _, err := database.ExecContext(ctx, `CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL,
		applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))`); err != nil {
		t.Fatal(err)
	}
	ms, err := loadMigrations()
	if err != nil {
		t.Fatal(err)
	}
	for _, m := range ms {
		if m.version < 8 {
			if err := apply(ctx, database, m); err != nil {
				t.Fatal(err)
			}
		}
	}
	exec := func(q string, args ...any) {
		t.Helper()
		if _, err := database.ExecContext(ctx, q, args...); err != nil {
			t.Fatal(err)
		}
	}
	count := func(q string) int {
		t.Helper()
		var n int
		if err := database.QueryRowContext(ctx, q).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	exec(`INSERT INTO solves (id, mode, solved_at, total_ms, scramble) VALUES (1, 'full', '2026-10-20T10:00:00.000Z', 1000, 'R')`)
	exec(`INSERT INTO solve_splits (solve_id, stage, start_ms, end_ms, move_count, start_index, end_index) VALUES (1, 'cross', 0, 500, 3, 0, 3)`)
	exec(`INSERT INTO analyses (id, kind, input, result, model) VALUES (1, 'solve', 'in', 'r', 'm')`)
	exec(`INSERT INTO analysis_solves (analysis_id, solve_id) VALUES (1, 1)`)

	if err := Migrate(ctx, database); err != nil {
		t.Fatal(err)
	}
	if n := count(`SELECT COUNT(*) FROM solve_splits`) + count(`SELECT COUNT(*) FROM analysis_solves`); n != 2 {
		t.Fatalf("references lost: %d", n)
	}
	var fk int
	if err := database.QueryRowContext(ctx, `PRAGMA foreign_keys`).Scan(&fk); err != nil || fk != 1 {
		t.Fatalf("foreign_keys after migration: %d %v", fk, err)
	}
	exec(`INSERT INTO solves (id, mode, solved_at, total_ms, scramble) VALUES (2, 'assist', '2026-10-20T11:00:00.000Z', 1000, 'R')`)
	if _, err := database.ExecContext(ctx, `INSERT INTO solves (mode, solved_at, total_ms, scramble) VALUES ('other', 'x', 1, '')`); err == nil {
		t.Fatal("unknown mode should be rejected")
	}
	// ソルブを消すと、段階と単体の解析も消える（外部キーとトリガーが効いている）
	exec(`DELETE FROM solves WHERE id = 1`)
	if n := count(`SELECT COUNT(*) FROM solve_splits`) + count(`SELECT COUNT(*) FROM analyses`); n != 0 {
		t.Fatalf("cascade after migration: %d", n)
	}
}
