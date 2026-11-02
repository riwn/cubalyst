package live

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

const solved = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB"

func newTestHub() (*Hub, *time.Time) {
	now := time.Date(2026, 11, 2, 12, 0, 0, 0, time.UTC)
	h := NewHub()
	h.now = func() time.Time { return now }
	return h, &now
}

func decode(t *testing.T, b []byte) Message {
	t.Helper()
	var m Message
	if err := json.Unmarshal(b, &m); err != nil {
		t.Fatalf("%s: %v", b, err)
	}
	return m
}

func recv(t *testing.T, ch <-chan []byte) Message {
	t.Helper()
	select {
	case b, ok := <-ch:
		if !ok {
			t.Fatal("チャネルが閉じた")
		}
		return decode(t, b)
	default:
		t.Fatal("出来事が届いていない")
	}
	return Message{}
}

func TestSnapshotBeforeMain(t *testing.T) {
	h, _ := newTestHub()
	snap, _, unsub := h.Subscribe()
	defer unsub()
	m := decode(t, snap)
	if m.Type != "snapshot" || m.Online == nil || *m.Online || m.Session != nil || m.AgeMS != 0 {
		t.Fatalf("%+v", m)
	}
}

func TestPublishAndSnapshot(t *testing.T) {
	h, now := newTestHub()
	_, ch, unsub := h.Subscribe()
	defer unsub()

	h.Publish([]Event{
		{Type: "main", Cube: "connected"},
		{Type: "move", Move: "R", Facelets: solved},
		{Type: "session", Session: json.RawMessage("{\n  \"phase\": \"running\"\n}")},
	})
	if m := recv(t, ch); m.Type != "main" || !*m.Online || m.Cube != "connected" {
		t.Fatalf("main: %+v", m)
	}
	if m := recv(t, ch); m.Type != "move" || m.Move != "R" || m.Facelets != solved {
		t.Fatalf("move: %+v", m)
	}
	if m := recv(t, ch); m.Type != "session" || string(m.Session) != `{"phase":"running"}` || m.AgeMS != 0 {
		t.Fatalf("session: %+v", m)
	}

	// あとから見始めた人には、今の状態と、タイマーの状態を受け取ってからの時間を送る
	*now = now.Add(1500 * time.Millisecond)
	snap, _, unsub2 := h.Subscribe()
	defer unsub2()
	m := decode(t, snap)
	if !*m.Online || m.Cube != "connected" || m.Facelets != solved || string(m.Session) != `{"phase":"running"}` || m.AgeMS != 1500 {
		t.Fatalf("snapshot: %+v", m)
	}
}

func TestOnline(t *testing.T) {
	h, now := newTestHub()
	_, ch, unsub := h.Subscribe()
	defer unsub()
	h.Publish([]Event{{Type: "main", Cube: "connected"}})
	recv(t, ch)

	*now = now.Add(StaleAfter - time.Second)
	if m := decode(t, h.Ping()); !*m.Online {
		t.Fatal("まだ生きているはず")
	}
	*now = now.Add(2 * time.Second)
	if m := decode(t, h.Ping()); *m.Online {
		t.Fatal("届かなくなったら、いなくなったとみなす")
	}

	// 何も無い POST（生きている知らせ）で戻る
	h.Publish(nil)
	if m := decode(t, h.Ping()); !*m.Online {
		t.Fatal("届いたら戻る")
	}

	h.Publish([]Event{{Type: "bye"}})
	if m := recv(t, ch); m.Type != "main" || *m.Online {
		t.Fatalf("bye: %+v", m)
	}
	if m := decode(t, h.Ping()); *m.Online {
		t.Fatal("閉じたらいない")
	}
}

func TestSlowSubscriberIsDropped(t *testing.T) {
	h, _ := newTestHub()
	_, ch, unsub := h.Subscribe()
	defer unsub()
	for range subscriberBuffer + 1 {
		h.Publish([]Event{{Type: "move", Move: "R", Facelets: solved}})
	}
	n := 0
	for range ch {
		n++
	}
	if n != subscriberBuffer {
		t.Fatalf("got %d", n)
	}
}

func TestClose(t *testing.T) {
	h, _ := newTestHub()
	_, ch, unsub := h.Subscribe()
	h.Close()
	if _, ok := <-ch; ok {
		t.Fatal("閉じるはず")
	}
	unsub() // 二重に閉じない
	if snap, _, _ := h.Subscribe(); snap != nil {
		t.Fatal("閉じたあとは受け付けない")
	}
}

func TestValidate(t *testing.T) {
	ok := []Event{
		{Type: "main", Cube: "disconnected"},
		{Type: "move", Move: "U'", Facelets: solved},
		{Type: "facelets", Facelets: solved},
		{Type: "session", Session: json.RawMessage(`{}`)},
		{Type: "bye"},
	}
	for _, e := range ok {
		if err := e.Validate(); err != nil {
			t.Errorf("%+v: %v", e, err)
		}
	}
	bad := []Event{
		{Type: "nope"},
		{Type: "main", Cube: "maybe"},
		{Type: "move", Facelets: solved},
		{Type: "move", Move: "R", Facelets: "UUU"},
		{Type: "facelets", Facelets: strings.Repeat("X", 54)},
		{Type: "session", Session: json.RawMessage(`[1]`)},
		{Type: "session"},
		{Type: "session", Session: json.RawMessage(`{"a":"` + strings.Repeat("x", maxSession) + `"}`)},
	}
	for _, e := range bad {
		if err := e.Validate(); err == nil {
			t.Errorf("%+v: エラーになるはず", e)
		}
	}
}
