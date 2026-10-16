package tetris_test

import (
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"landing-api/internal/service/tetris"
)

// fast starts a round at once and drops garbage every few milliseconds.
var fast = tetris.Timing{Countdown: 5 * time.Millisecond, GarbageEvery: 20 * time.Millisecond, GarbageRows: 2}

// slow keeps a round in its countdown for the whole test, so no garbage arrives mid-check.
var slow = tetris.Timing{Countdown: time.Minute, GarbageEvery: time.Minute, GarbageRows: 2}

var board = strings.Repeat("0", tetris.BoardCells-3) + "1az"

// inbox is a Sender that records what the room sent.
type inbox struct {
	mu     sync.Mutex
	msgs   []map[string]any
	closed bool
}

func (b *inbox) Send(msg []byte) bool {
	var m map[string]any
	_ = json.Unmarshal(msg, &m)
	b.mu.Lock()
	defer b.mu.Unlock()
	b.msgs = append(b.msgs, m)
	return true
}

func (b *inbox) Close() {
	b.mu.Lock()
	b.closed = true
	b.mu.Unlock()
}

// wait returns the first message of kind t, polling until timeout.
func (b *inbox) wait(t *testing.T, kind string) map[string]any {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if m := b.find(kind); m != nil {
			return m
		}
		time.Sleep(2 * time.Millisecond)
	}
	t.Fatalf("no %q message", kind)
	return nil
}

// find returns the first message of kind, or nil.
func (b *inbox) find(kind string) map[string]any {
	b.mu.Lock()
	defer b.mu.Unlock()
	for _, m := range b.msgs {
		if m["t"] == kind {
			return m
		}
	}
	return nil
}

// room returns the latest room message, or nil.
func (b *inbox) room() map[string]any {
	b.mu.Lock()
	defer b.mu.Unlock()
	for i := len(b.msgs) - 1; i >= 0; i-- {
		if b.msgs[i]["t"] == "room" {
			return b.msgs[i]
		}
	}
	return nil
}

func (b *inbox) count(kind string) int {
	b.mu.Lock()
	defer b.mu.Unlock()
	n := 0
	for _, m := range b.msgs {
		if m["t"] == kind {
			n++
		}
	}
	return n
}

// twoPlayers opens a room with a host and a guest.
func twoPlayers(t *testing.T, timing tetris.Timing) (*tetris.Room, *inbox, *inbox) {
	t.Helper()
	h := tetris.NewHub(timing)
	t.Cleanup(h.Shutdown)
	host, guest := &inbox{}, &inbox{}
	room, seat, err := h.Create(host)
	if err != nil || seat != 0 {
		t.Fatalf("Create = seat %d, %v", seat, err)
	}
	if _, seat, err := h.Join(room.Code(), guest); err != nil || seat != 1 {
		t.Fatalf("Join = seat %d, %v", seat, err)
	}
	return room, host, guest
}

func TestCreateJoinAndStart(t *testing.T) {
	t.Parallel()
	h := tetris.NewHub(slow)
	t.Cleanup(h.Shutdown)
	host, guest := &inbox{}, &inbox{}
	room, hostSeat, _ := h.Create(host)
	if len(room.Code()) != 4 {
		t.Fatalf("code %q, want 4 letters", room.Code())
	}
	if err := room.Start(hostSeat); !errors.Is(err, tetris.ErrTooFew) {
		t.Fatalf("Start alone = %v, want tetris.ErrTooFew", err)
	}
	_, guestSeat, _ := h.Join(room.Code(), guest)
	if joined := guest.room(); joined["you"] != float64(1) || joined["host"] != float64(0) {
		t.Fatalf("guest's room = %v", joined)
	}
	if err := room.Start(guestSeat); !errors.Is(err, tetris.ErrNotHost) {
		t.Fatalf("guest Start = %v, want tetris.ErrNotHost", err)
	}
	if err := room.Start(hostSeat); err != nil {
		t.Fatalf("host Start = %v", err)
	}
	if err := room.Start(hostSeat); !errors.Is(err, tetris.ErrStarted) {
		t.Fatalf("second Start = %v, want tetris.ErrStarted", err)
	}
	round := guest.wait(t, "round")
	if round["round"] != float64(1) || round["count"] != float64(slow.Countdown.Milliseconds()) ||
		round["garbage"] != float64(slow.GarbageEvery.Milliseconds()) || round["rows"] != float64(2) {
		t.Fatalf("round = %v", round)
	}
	if _, ok := round["seed"].(float64); !ok {
		t.Fatalf("round seed = %v", round["seed"])
	}
	if players := round["players"].([]any); players[0] != true || players[1] != true || players[2] != false {
		t.Fatalf("round players = %v", players)
	}
}

func TestJoinUnknownAndFullRooms(t *testing.T) {
	t.Parallel()
	h := tetris.NewHub(slow)
	t.Cleanup(h.Shutdown)
	if _, _, err := h.Join("ZZZZ", &inbox{}); !errors.Is(err, tetris.ErrNoRoom) {
		t.Fatalf("Join unknown = %v, want tetris.ErrNoRoom", err)
	}
	room, _, _ := h.Create(&inbox{})
	for range tetris.Seats - 1 {
		if _, _, err := h.Join(room.Code(), &inbox{}); err != nil {
			t.Fatalf("Join = %v", err)
		}
	}
	if _, _, err := h.Join(room.Code(), &inbox{}); !errors.Is(err, tetris.ErrFull) {
		t.Fatalf("fifth Join = %v, want tetris.ErrFull", err)
	}
}

func TestBoardsGoToEveryoneElse(t *testing.T) {
	t.Parallel()
	room, host, guest := twoPlayers(t, slow)
	room.Board(0, board, 3)
	if host.find("board") != nil {
		t.Fatal("a board was relayed in the lobby")
	}
	if err := room.Start(0); err != nil {
		t.Fatal(err)
	}
	room.Board(0, board, 3)
	got := guest.wait(t, "board")
	if got["s"] != float64(0) || got["b"] != board || got["l"] != float64(3) {
		t.Fatalf("relayed board = %v", got)
	}
	if host.find("board") != nil {
		t.Fatal("the sender got its own board back")
	}
}

func TestInvalidBoardsAreDropped(t *testing.T) {
	t.Parallel()
	room, _, guest := twoPlayers(t, slow)
	if err := room.Start(0); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		b     string
		lines int
	}{
		{board[1:], 0},
		{board + "0", 0},
		{strings.Repeat("A", tetris.BoardCells), 0},
		{board[:tetris.BoardCells-1] + "<", 0},
		{board, -1},
		{board, 100001},
	} {
		room.Board(0, tc.b, tc.lines)
	}
	if n := guest.count("board"); n != 0 {
		t.Fatalf("%d invalid boards were relayed", n)
	}
}

func TestGarbageArrivesOnTheClock(t *testing.T) {
	t.Parallel()
	room, host, guest := twoPlayers(t, fast)
	if err := room.Start(0); err != nil {
		t.Fatal(err)
	}
	g := guest.wait(t, "garbage")
	hole, _ := g["hole"].(float64)
	if g["rows"] != float64(2) || hole < 0 || hole >= tetris.Width {
		t.Fatalf("garbage = %v", g)
	}
	host.wait(t, "garbage")
}

func TestLastOneStandingWins(t *testing.T) {
	t.Parallel()
	h := tetris.NewHub(fast)
	t.Cleanup(h.Shutdown)
	a, b, c := &inbox{}, &inbox{}, &inbox{}
	room, _, _ := h.Create(a)
	_, _, _ = h.Join(room.Code(), b)
	_, _, _ = h.Join(room.Code(), c)
	if err := room.Start(0); err != nil {
		t.Fatal(err)
	}
	room.Dead(1)
	if out := c.wait(t, "out"); out["s"] != float64(1) {
		t.Fatalf("out = %v", out)
	}
	if a.find("over") != nil {
		t.Fatal("the round ended with two players still in")
	}
	room.Dead(1)
	if n := a.count("out"); n != 1 {
		t.Fatalf("a second Dead sent %d outs, want 1", n)
	}
	room.Dead(0)
	over := b.wait(t, "over")
	if over["win"] != float64(2) || over["wins"].([]any)[2] != float64(1) {
		t.Fatalf("over = %v, want seat 2 to win", over)
	}
	if lobby := c.room(); lobby["playing"] != false {
		t.Fatalf("room after the round = %v", lobby)
	}
	// Back in the lobby: the host can go again.
	if err := room.Start(0); err != nil {
		t.Fatalf("Start after a round = %v", err)
	}
}

func TestLeavingMidRoundHandsTheWin(t *testing.T) {
	t.Parallel()
	room, host, guest := twoPlayers(t, slow)
	if err := room.Start(0); err != nil {
		t.Fatal(err)
	}
	room.Leave(0)
	over := guest.wait(t, "over")
	if over["win"] != float64(1) {
		t.Fatalf("over = %v, want seat 1 to win", over)
	}
	lobby := guest.room()
	if lobby["host"] != float64(1) || lobby["playing"] != false {
		t.Fatalf("room after the host left = %v", lobby)
	}
	if host.find("over") != nil {
		t.Fatal("the leaver heard about the round after leaving")
	}
}

func TestLastLeaverClosesTheRoom(t *testing.T) {
	t.Parallel()
	h := tetris.NewHub(fast)
	t.Cleanup(h.Shutdown)
	room, _, _ := h.Create(&inbox{})
	_, guestSeat, _ := h.Join(room.Code(), &inbox{})
	if err := room.Start(0); err != nil {
		t.Fatal(err)
	}
	room.Leave(guestSeat)
	room.Leave(0)
	if h.Rooms() != 0 {
		t.Fatalf("rooms = %d after everyone left, want 0", h.Rooms())
	}
	if _, _, err := h.Join(room.Code(), &inbox{}); !errors.Is(err, tetris.ErrNoRoom) {
		t.Fatalf("Join a closed room = %v, want tetris.ErrNoRoom", err)
	}
}

func TestJoiningMidRoundWatches(t *testing.T) {
	t.Parallel()
	h := tetris.NewHub(slow)
	t.Cleanup(h.Shutdown)
	host, guest, late := &inbox{}, &inbox{}, &inbox{}
	room, _, _ := h.Create(host)
	_, _, _ = h.Join(room.Code(), guest)
	if err := room.Start(0); err != nil {
		t.Fatal(err)
	}
	_, seat, err := h.Join(room.Code(), late)
	if err != nil || seat != 2 {
		t.Fatalf("Join mid-round = seat %d, %v", seat, err)
	}
	state := late.room()
	if alive := state["alive"].([]any); alive[0] != true || alive[2] != false || state["playing"] != true {
		t.Fatalf("late joiner's room = %v", state)
	}
	room.Board(seat, board, 0)
	if host.find("board") != nil {
		t.Fatal("a watcher's board was relayed")
	}
	room.Board(1, board, 0)
	late.wait(t, "board")
	room.Dead(1)
	if over := late.wait(t, "over"); over["win"] != float64(0) {
		t.Fatalf("over = %v, want the host to win", over)
	}
}

func TestShutdownClosesEveryConnection(t *testing.T) {
	t.Parallel()
	h := tetris.NewHub(slow)
	a, b := &inbox{}, &inbox{}
	room, _, _ := h.Create(a)
	_, _, _ = h.Join(room.Code(), b)
	h.Shutdown()
	if !a.closed || !b.closed {
		t.Fatal("Shutdown left a connection open")
	}
	if _, _, err := h.Create(&inbox{}); !errors.Is(err, tetris.ErrShutdown) {
		t.Fatalf("Create after Shutdown = %v, want tetris.ErrShutdown", err)
	}
}
