// Package live は、キューブをつないだブラウザ（メイン）のタイマー画面の状態を、ほかのブラウザに中継する。
//
// メインは出来事（回転・状態・タイマー）を POST で送り、見る側は SSE で受け取る。
// 状態はメモリにだけ持ち、DB には書かない（サーバーを再起動すると消える）。
package live

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"
)

// StaleAfter は、メインから何も届かないとき、メインがいなくなったとみなすまでの時間。
// メインは何もなくても15秒ごとに送ってくる。
const StaleAfter = 40 * time.Second

// subscriberBuffer は、見る側1つに溜めておける出来事の数。溢れたら切り、つなぎ直してもらう（最初の状態から送り直す）。
const subscriberBuffer = 256

// maxSession は、タイマーの状態（JSON）の大きさの上限。
const maxSession = 64 << 10

// Event はメインから届く出来事。
//
//   - main：メインのキューブの接続の状態（cube）。何もなくても送り、生きていることを知らせる
//   - move：1手の回転（move）と、回したあとの状態（facelets）
//   - facelets：状態の置き換え（実機に合わせ直したときなど）
//   - session：タイマーの状態（中身はアプリが決める JSON のオブジェクト）
//   - bye：メインが画面を閉じた
type Event struct {
	Type     string          `json:"type"`
	Cube     string          `json:"cube,omitempty"`
	Move     string          `json:"move,omitempty"`
	Facelets string          `json:"facelets,omitempty"`
	Session  json.RawMessage `json:"session,omitempty"`
}

// Message は見る側に送る出来事。snapshot は見始めたときの今の状態、ping は生きているかの知らせ。
type Message struct {
	Type     string          `json:"type"`
	Online   *bool           `json:"online,omitempty"`
	Cube     string          `json:"cube,omitempty"`
	Move     string          `json:"move,omitempty"`
	Facelets string          `json:"facelets,omitempty"`
	Session  json.RawMessage `json:"session,omitempty"`
	// AgeMS は session を受け取ってからの時間（snapshot のときだけ）。タイマーの経過時間をずらすのに使う。
	AgeMS int64 `json:"age_ms,omitempty"`
}

// Hub はメインの最新の状態と、見る側の一覧を持つ。
type Hub struct {
	now func() time.Time

	mu        sync.Mutex
	lastSeen  time.Time
	bye       bool
	cube      string
	facelets  string
	session   json.RawMessage
	sessionAt time.Time
	subs      map[chan []byte]struct{}
	closed    bool
}

// NewHub は Hub を作る。
func NewHub() *Hub {
	return &Hub{now: time.Now, subs: map[chan []byte]struct{}{}}
}

// ErrInvalid は、メインから届いた出来事が正しくないときのエラー。
var ErrInvalid = errors.New("invalid live event")

func invalid(format string, a ...any) error {
	return fmt.Errorf("%w: %s", ErrInvalid, fmt.Sprintf(format, a...))
}

// Validate は出来事の中身を確かめる。
func (e Event) Validate() error {
	switch e.Type {
	case "main":
		switch e.Cube {
		case "connected", "connecting", "disconnected":
		default:
			return invalid("cube must be connected, connecting or disconnected")
		}
	case "move":
		if e.Move == "" || len(e.Move) > 4 {
			return invalid("move is required")
		}
		if err := validFacelets(e.Facelets); err != nil {
			return err
		}
	case "facelets":
		if err := validFacelets(e.Facelets); err != nil {
			return err
		}
	case "session":
		if len(e.Session) > maxSession {
			return invalid("session is too large")
		}
		if t := bytes.TrimSpace(e.Session); len(t) == 0 || t[0] != '{' || !json.Valid(t) {
			return invalid("session must be a JSON object")
		}
	case "bye":
	default:
		return invalid("unknown type %q", e.Type)
	}
	return nil
}

func validFacelets(f string) error {
	if len(f) != 54 || strings.Trim(f, "URFDLB") != "" {
		return invalid("facelets must be 54 letters of URFDLB")
	}
	return nil
}

// Publish はメインから届いた出来事を、状態に反映して見る側に送る。先に Validate で確かめておく。
func (h *Hub) Publish(events []Event) {
	h.mu.Lock()
	defer h.mu.Unlock()
	now := h.now()
	h.lastSeen = now
	h.bye = false
	for _, e := range events {
		msg := Message{Type: e.Type}
		switch e.Type {
		case "main":
			h.cube = e.Cube
			msg.Online, msg.Cube = boolPtr(true), e.Cube
		case "move", "facelets":
			h.facelets = e.Facelets
			msg.Move, msg.Facelets = e.Move, e.Facelets
		case "session":
			h.session, h.sessionAt = compact(e.Session), now
			msg.Session = h.session
		case "bye":
			h.bye = true
			msg = Message{Type: "main", Online: boolPtr(false), Cube: h.cube}
		}
		h.broadcast(msg)
	}
}

// Subscribe は見る側を足し、最初に送る今の状態と、続く出来事を受け取るチャネルを返す。
// チャネルが閉じたら（溢れたとき・Close のとき）接続を終える。終えるときは unsubscribe を呼ぶ。
func (h *Hub) Subscribe() (snapshot []byte, ch <-chan []byte, unsubscribe func()) {
	h.mu.Lock()
	defer h.mu.Unlock()
	c := make(chan []byte, subscriberBuffer)
	if h.closed {
		close(c)
		return nil, c, func() {}
	}
	h.subs[c] = struct{}{}
	now := h.now()
	snap := Message{Type: "snapshot", Online: boolPtr(h.online(now)), Cube: h.cube, Facelets: h.facelets, Session: h.session}
	if h.session != nil {
		snap.AgeMS = max(1, now.Sub(h.sessionAt).Milliseconds())
	}
	return marshal(snap), c, func() {
		h.mu.Lock()
		defer h.mu.Unlock()
		if _, ok := h.subs[c]; ok {
			delete(h.subs, c)
			close(c)
		}
	}
}

// Ping は、メインが生きているかの知らせ（見る側に定期的に送る）。
func (h *Hub) Ping() []byte {
	h.mu.Lock()
	defer h.mu.Unlock()
	return marshal(Message{Type: "ping", Online: boolPtr(h.online(h.now()))})
}

// Close は見る側をすべて切る（サーバーを止めるとき）。
func (h *Hub) Close() {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.closed = true
	for c := range h.subs {
		delete(h.subs, c)
		close(c)
	}
}

func (h *Hub) online(now time.Time) bool {
	return !h.lastSeen.IsZero() && !h.bye && now.Sub(h.lastSeen) < StaleAfter
}

// broadcast は h.mu を持ったまま呼ぶ。
func (h *Hub) broadcast(msg Message) {
	b := marshal(msg)
	for c := range h.subs {
		select {
		case c <- b:
		default:
			// 読むのが遅い見る側は切る（つなぎ直すと、今の状態から送り直す）
			delete(h.subs, c)
			close(c)
		}
	}
}

func marshal(m Message) []byte {
	b, err := json.Marshal(m)
	if err != nil {
		panic(err) // Message は必ず JSON にできる
	}
	return b
}

// compact は JSON を1行にする（SSE の data は1行で送る）。
func compact(raw json.RawMessage) json.RawMessage {
	var buf bytes.Buffer
	if err := json.Compact(&buf, raw); err != nil {
		return raw
	}
	return buf.Bytes()
}

func boolPtr(b bool) *bool { return &b }
