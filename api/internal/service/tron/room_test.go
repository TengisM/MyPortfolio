package tron_test

import (
	"encoding/json"
	"errors"
	"sync"
	"testing"
	"time"

	"landing-api/internal/service/tron"
)

// fast keeps a whole round under a second.
var fast = tron.Timing{Countdown: 10 * time.Millisecond, RoundPause: 10 * time.Millisecond, BaseSpeed: 400, MaxExtraSpeed: 0}

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
		b.mu.Lock()
		for _, m := range b.msgs {
			if m["t"] == kind {
				b.mu.Unlock()
				return m
			}
		}
		b.mu.Unlock()
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatalf("no %q message", kind)
	return nil
}

func TestCreateJoinAndPlayARound(t *testing.T) {
	t.Parallel()
	h := tron.NewHub(fast)
	host, guest := &inbox{}, &inbox{}
	room, hostSeat, err := h.Create(host)
	if err != nil || hostSeat != 0 {
		t.Fatalf("Create = seat %d, %v", hostSeat, err)
	}
	if len(room.Code()) != 4 {
		t.Fatalf("code %q, want 4 letters", room.Code())
	}
	_, guestSeat, err := h.Join(room.Code(), guest)
	if err != nil || guestSeat != 1 {
		t.Fatalf("Join = seat %d, %v", guestSeat, err)
	}
	if err := room.Start(guestSeat); !errors.Is(err, tron.ErrNotHost) {
		t.Fatalf("guest Start = %v, want tron.ErrNotHost", err)
	}
	if err := room.Start(hostSeat); err != nil {
		t.Fatalf("host Start = %v", err)
	}
	round := guest.wait(t, "round")
	if round["w"] != float64(tron.Width) || len(round["r"].([]any)) != 2 {
		t.Fatalf("round message = %v", round)
	}
	guest.wait(t, "tick")
	// Nobody steers, so both ride into a wall and the round ends.
	over := host.wait(t, "over")
	if _, ok := over["win"]; !ok {
		t.Fatalf("over message = %v", over)
	}
	room.Leave(guestSeat)
	room.Leave(hostSeat)
	if h.Rooms() != 0 {
		t.Fatalf("rooms = %d after everyone left, want 0", h.Rooms())
	}
}

func TestStartNeedsTwoRiders(t *testing.T) {
	t.Parallel()
	h := tron.NewHub(fast)
	room, seat, _ := h.Create(&inbox{})
	if err := room.Start(seat); !errors.Is(err, tron.ErrTooFew) {
		t.Fatalf("Start alone = %v, want tron.ErrTooFew", err)
	}
}

func TestJoinUnknownAndFullRooms(t *testing.T) {
	t.Parallel()
	h := tron.NewHub(fast)
	if _, _, err := h.Join("ZZZZ", &inbox{}); !errors.Is(err, tron.ErrNoRoom) {
		t.Fatalf("Join unknown = %v, want tron.ErrNoRoom", err)
	}
	room, _, _ := h.Create(&inbox{})
	for range tron.Seats - 1 {
		if _, _, err := h.Join(room.Code(), &inbox{}); err != nil {
			t.Fatalf("Join = %v", err)
		}
	}
	if _, _, err := h.Join(room.Code(), &inbox{}); !errors.Is(err, tron.ErrFull) {
		t.Fatalf("fifth Join = %v, want tron.ErrFull", err)
	}
}

func TestHostLeavingHandsTheRoomOn(t *testing.T) {
	t.Parallel()
	h := tron.NewHub(fast)
	guest := &inbox{}
	room, hostSeat, _ := h.Create(&inbox{})
	_, guestSeat, _ := h.Join(room.Code(), guest)
	room.Leave(hostSeat)
	guest.mu.Lock()
	last := guest.msgs[len(guest.msgs)-1]
	guest.mu.Unlock()
	if last["host"] != float64(guestSeat) {
		t.Fatalf("host = %v after the host left, want %d", last["host"], guestSeat)
	}
}

func TestShutdownClosesEveryConnection(t *testing.T) {
	t.Parallel()
	h := tron.NewHub(fast)
	a, b := &inbox{}, &inbox{}
	room, _, _ := h.Create(a)
	_, _, _ = h.Join(room.Code(), b)
	h.Shutdown()
	if !a.closed || !b.closed {
		t.Fatal("Shutdown left a connection open")
	}
	if _, _, err := h.Create(&inbox{}); !errors.Is(err, tron.ErrShutdown) {
		t.Fatalf("Create after Shutdown = %v, want tron.ErrShutdown", err)
	}
}
