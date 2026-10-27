package solves

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestGyroAndHolds(t *testing.T) {
	ctx := context.Background()
	st, _ := newStore(t)
	at := time.Date(2026, 10, 27, 1, 2, 3, 0, time.UTC)

	// ジャイロの無いソルブ：gyro・holds は空のまま
	plain := sample(at, 1000)
	if err := st.Create(ctx, plain); err != nil {
		t.Fatal(err)
	}
	got, err := st.Get(ctx, plain.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Gyro != nil || got.Holds != nil {
		t.Fatalf("plain solve has gyro: %+v %+v", got.Gyro, got.Holds)
	}

	s := sample(at.Add(time.Minute), 1000)
	s.Gyro = []GyroSample{{-90, 1, 0, 0, 0}, {0, 1, 0, 0, 0}, {90, 0.7071, 0, 0, 0.7071}}
	s.Holds = &Holds{
		Start:   Hold{Bottom: "white", Front: "red"},
		Changes: []HoldChange{{Index: 1, StartT: 40, EndT: 160, Bottom: "white", Front: "green", Rot: "y"}},
	}
	if err := st.Create(ctx, s); err != nil {
		t.Fatal(err)
	}
	got, err = st.Get(ctx, s.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Gyro) != 3 || got.Gyro[2][4] != 0.7071 || got.Holds == nil || got.Holds.Changes[0].Rot != "y" {
		t.Fatalf("unexpected: %+v %+v", got.Gyro, got.Holds)
	}
	if h := got.Holds.HoldAt(0); h.Front != "red" {
		t.Fatalf("HoldAt(0) = %+v", h)
	}
	if h := got.Holds.HoldAt(1); h.Front != "green" {
		t.Fatalf("HoldAt(1) = %+v", h)
	}

	// 一覧：gyro は include=moves のときだけ、holds はいつも
	list, _, err := st.List(ctx, Filter{IDs: []int64{s.ID}})
	if err != nil {
		t.Fatal(err)
	}
	if list[0].Gyro != nil || list[0].Holds == nil {
		t.Fatalf("list without moves: %+v %+v", list[0].Gyro, list[0].Holds)
	}
	list, _, err = st.List(ctx, Filter{IDs: []int64{s.ID}, IncludeMoves: true})
	if err != nil {
		t.Fatal(err)
	}
	if len(list[0].Gyro) != 3 {
		t.Fatalf("list with moves: %+v", list[0].Gyro)
	}

	// 置き換え
	if err := st.ReplaceHolds(ctx, s.ID, nil); err != nil {
		t.Fatal(err)
	}
	if got, _ := st.Get(ctx, s.ID); got.Holds != nil || len(got.Gyro) != 3 {
		t.Fatalf("after clearing holds: %+v", got)
	}
	if err := st.ReplaceHolds(ctx, plain.ID, &Holds{Start: Hold{Bottom: "white", Front: "red"}}); !errors.Is(err, ErrNoGyro) {
		t.Fatalf("holds without gyro: %v", err)
	}
}

func TestHoldsValidate(t *testing.T) {
	ok := Hold{Bottom: "white", Front: "red"}
	cases := map[string]*Holds{
		"bad start":     {Start: Hold{Bottom: "white", Front: "yellow"}},
		"index too big": {Start: ok, Changes: []HoldChange{{Index: 3, Bottom: "white", Front: "green", Rot: "y"}}},
		"index order": {Start: ok, Changes: []HoldChange{
			{Index: 2, Bottom: "white", Front: "green", Rot: "y"},
			{Index: 1, Bottom: "white", Front: "red", Rot: "y'"},
		}},
		"empty rot": {Start: ok, Changes: []HoldChange{{Index: 1, Bottom: "white", Front: "green"}}},
		"end first": {Start: ok, Changes: []HoldChange{{Index: 1, StartT: 10, EndT: 5, Bottom: "white", Front: "green", Rot: "y"}}},
	}
	for name, h := range cases {
		if err := h.Validate(2); err == nil {
			t.Errorf("%s: want error", name)
		}
	}
	if err := (&Holds{Start: ok, Changes: []HoldChange{{Index: 2, Bottom: "white", Front: "green", Rot: "y"}}}).Validate(2); err != nil {
		t.Fatal(err)
	}
}
