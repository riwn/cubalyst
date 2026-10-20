package db

import (
	"context"
	"path/filepath"
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
