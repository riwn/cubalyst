package solves

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"cubalyst/internal/db"
)

func newStore(t *testing.T) (*Store, *sql.DB) {
	t.Helper()
	database, err := db.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { database.Close() })
	if err := db.Migrate(context.Background(), database); err != nil {
		t.Fatal(err)
	}
	return NewStore(database), database
}

func ptr[T any](v T) *T { return &v }

func sample(at time.Time, ms int64) *Solve {
	return &Solve{
		Mode:     ModeFull,
		SolvedAt: at,
		TotalMS:  ms,
		Scramble: "R U R' U'",
		Moves: []Move{
			{Move: "R", CubeTS: ptr(1000.0), LocalTS: ptr(10.0), T: 0},
			{Move: "U", CubeTS: ptr(1200.0), LocalTS: ptr(210.0), T: 200},
		},
	}
}

func TestCreateGetUpdateDelete(t *testing.T) {
	ctx := context.Background()
	st, _ := newStore(t)
	at := time.Date(2026, 10, 21, 1, 2, 3, 456_000_000, time.UTC)
	s := sample(at, 12345)
	if err := st.Create(ctx, s); err != nil {
		t.Fatal(err)
	}
	got, err := st.Get(ctx, s.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !got.SolvedAt.Equal(at) || got.TotalMS != 12345 || len(got.Moves) != 2 || *got.Moves[1].CubeTS != 1200 {
		t.Fatalf("unexpected solve: %+v", got)
	}

	updated, err := st.Update(ctx, s.ID, ptr(PenaltyPlus2), nil)
	if err != nil {
		t.Fatal(err)
	}
	if updated.Penalty != PenaltyPlus2 || updated.Note != "" {
		t.Fatalf("unexpected update: %+v", updated)
	}
	updated, err = st.Update(ctx, s.ID, nil, ptr("good"))
	if err != nil {
		t.Fatal(err)
	}
	if updated.Penalty != PenaltyPlus2 || updated.Note != "good" {
		t.Fatalf("unexpected update: %+v", updated)
	}
	if _, err := st.Update(ctx, s.ID, ptr("+3"), nil); err == nil {
		t.Fatal("expected invalid penalty error")
	}

	if err := st.Delete(ctx, s.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := st.Get(ctx, s.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
	if err := st.Delete(ctx, s.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

func TestValidate(t *testing.T) {
	at := time.Now()
	cases := map[string]*Solve{
		"bad mode":     {Mode: "x", SolvedAt: at},
		"case no id":   {Mode: ModeCase, SolvedAt: at},
		"step no step": {Mode: ModeStep, SolvedAt: at},
		"negative":     {Mode: ModeFull, SolvedAt: at, TotalMS: -1},
		"no time":      {Mode: ModeFull},
		"empty move":   {Mode: ModeFull, SolvedAt: at, Moves: []Move{{}}},
	}
	for name, s := range cases {
		if err := s.Validate(); err == nil {
			t.Errorf("%s: expected error", name)
		}
	}
}

func TestListFilters(t *testing.T) {
	ctx := context.Background()
	st, _ := newStore(t)
	base := time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC)
	for i := range 5 {
		if err := st.Create(ctx, sample(base.AddDate(0, 0, i), int64(10000+i))); err != nil {
			t.Fatal(err)
		}
	}
	caseSolve := sample(base, 3000)
	caseSolve.Mode = ModeCase
	caseSolve.CaseID = ptr("pll-t")
	if err := st.Create(ctx, caseSolve); err != nil {
		t.Fatal(err)
	}

	list, total, err := st.List(ctx, Filter{Mode: ModeFull, Limit: 2})
	if err != nil {
		t.Fatal(err)
	}
	if total != 5 || len(list) != 2 || list[0].TotalMS != 10004 || list[0].Moves != nil {
		t.Fatalf("unexpected list: total=%d %+v", total, list)
	}

	list, _, err = st.List(ctx, Filter{Mode: ModeFull, Ascending: true, IncludeMoves: true, Offset: 1, Limit: 1})
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 || list[0].TotalMS != 10001 || len(list[0].Moves) != 2 {
		t.Fatalf("unexpected list: %+v", list)
	}

	list, total, _ = st.List(ctx, Filter{From: base.AddDate(0, 0, 1), To: base.AddDate(0, 0, 3)})
	if total != 2 || len(list) != 2 {
		t.Fatalf("period filter: total=%d", total)
	}

	list, _, _ = st.List(ctx, Filter{CaseID: "pll-t"})
	if len(list) != 1 || list[0].Mode != ModeCase {
		t.Fatalf("case filter: %+v", list)
	}

	list, _, _ = st.List(ctx, Filter{IDs: []int64{1, 3}})
	if len(list) != 2 {
		t.Fatalf("ids filter: %+v", list)
	}
}
