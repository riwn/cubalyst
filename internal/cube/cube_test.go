package cube

import "testing"

func TestMoveFromSolved(t *testing.T) {
	cases := map[string]string{
		// Kociemba の展開図での、完成状態から1手回した状態
		"R": "UUFUUFUUFRRRRRRRRRFFDFFDFFDDDBDDBDDBLLLLLLLLLUBBUBBUBB",
		"U": "UUUUUUUUUBBBRRRRRRRRRFFFFFFDDDDDDDDDFFFLLLLLLLLLBBBBBB",
	}
	for m, want := range cases {
		got, err := Solved().Move(m)
		if err != nil {
			t.Fatal(err)
		}
		if got.String() != want {
			t.Errorf("%s:\n got %s\nwant %s", m, got, want)
		}
	}
}

func TestMoveOrders(t *testing.T) {
	for _, m := range []string{"U", "D", "R", "L", "F", "B", "x", "y", "z"} {
		s := Solved().MustApply(m, m, m, m)
		if s != Solved() {
			t.Errorf("%s^4 is not identity", m)
		}
		if Solved().MustApply(m, Inverse(m)) != Solved() {
			t.Errorf("%s %s is not identity", m, Inverse(m))
		}
		if Solved().MustApply(m+"2") != Solved().MustApply(m, m) {
			t.Errorf("%s2 differs from %s %s", m, m, m)
		}
	}
	sexy := []string{"R", "U", "R'", "U'"}
	s := Solved()
	for range 6 {
		s = s.MustApply(sexy...)
	}
	if s != Solved() {
		t.Error("(R U R' U')6 is not identity")
	}
}

func TestRotations(t *testing.T) {
	// x は R と L' を一緒に回したのと同じ（中層も動く）。面の名前を付け直せば完成状態のまま
	if got := Solved().Rotate("x"); got != Solved() {
		t.Errorf("rotated solved = %s", got)
	}
	// y で持ち替えてから R は、持ち替えずに B を回したのと同じ見た目
	a := Solved().MustApply("y", "R").Relabel()
	b := Solved().MustApply("B").Rotate("y")
	if a != b {
		t.Errorf("y R:\n%s\n%s", a, b)
	}
	for face, rot := range map[byte]string{'D': "", 'U': "x2", 'F': "x'", 'B': "x", 'R': "z", 'L': "z'"} {
		s := Solved().MustApply(splitFields(rot)...)
		if got := s[CenterOf('D')]; got != face {
			t.Errorf("DownRotation(%c) puts %c down", face, got)
		}
		if DownRotation(face) != rot {
			t.Errorf("DownRotation(%c) = %q", face, DownRotation(face))
		}
	}
}

func TestPieceAt(t *testing.T) {
	s := Solved().MustApply("R")
	if got := s.PieceAt("UFR").Name; got != "URB" {
		t.Errorf("UFR corner after R is at %s", got)
	}
	if got := s.PieceAt("FR").Name; got != "UR" {
		t.Errorf("FR edge after R is at %s", got)
	}
}

func splitFields(s string) []string {
	if s == "" {
		return nil
	}
	return []string{s}
}
