package race_test

import (
	"encoding/json"
	"errors"
	"math"
	"slices"
	"sync"
	"testing"
	"time"

	"landing-api/internal/service/race"
)

// fast starts a race at once and cuts the field off a few milliseconds after the first finisher.
var fast = race.Timing{Countdown: 5 * time.Millisecond, Cutoff: 30 * time.Millisecond, MaxRace: time.Minute, Seed: 7}

// slow keeps a race in its countdown for the whole test.
var slow = race.Timing{Countdown: time.Minute, Cutoff: time.Minute, MaxRace: time.Minute, Seed: 7}

// long gets past the countdown at once and has no cut-off or limit that fires during a test.
var long = race.Timing{Countdown: 5 * time.Millisecond, Cutoff: time.Minute, MaxRace: time.Minute, Seed: 7}

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

func (b *inbox) isClosed() bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.closed
}

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

// last returns the latest message of kind, or nil.
func (b *inbox) last(kind string) map[string]any {
	b.mu.Lock()
	defer b.mu.Unlock()
	for i := len(b.msgs) - 1; i >= 0; i-- {
		if b.msgs[i]["t"] == kind {
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

// players opens a room with n seats, every one of them with a ship picked.
func players(t *testing.T, timing race.Timing, n int) (*race.Room, []*inbox) {
	t.Helper()
	h := race.NewHub(timing)
	t.Cleanup(h.Shutdown)
	boxes := make([]*inbox, n)
	var room *race.Room
	for i := range boxes {
		boxes[i] = &inbox{}
		if i == 0 {
			room, _, _ = h.Create(boxes[i])
		} else if _, seat, err := h.Join(room.Code(), boxes[i]); err != nil || seat != i {
			t.Fatalf("Join = seat %d, %v", seat, err)
		}
		if err := room.Pick(i, "vega", "Racer"); err != nil {
			t.Fatal(err)
		}
	}
	return room, boxes
}

// withWatcher is players(2) plus a third seat that never picked, so it watches and survives
// when both racers leave.
func withWatcher(t *testing.T, timing race.Timing) (*race.Room, []*inbox, *inbox) {
	t.Helper()
	h := race.NewHub(timing)
	t.Cleanup(h.Shutdown)
	boxes := []*inbox{{}, {}}
	room, _, _ := h.Create(boxes[0])
	_, _, _ = h.Join(room.Code(), boxes[1])
	_ = room.Pick(0, "vega", "A")
	_ = room.Pick(1, "vega", "B")
	watcher := &inbox{}
	if _, seat, err := h.Join(room.Code(), watcher); err != nil || seat != 2 {
		t.Fatalf("watcher Join = seat %d, %v", seat, err)
	}
	return room, boxes, watcher
}

// waitRunning blocks until the countdown is over, which is when a state first relays.
func waitRunning(t *testing.T, room *race.Room, to *inbox) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	before := to.count("s")
	for time.Now().Before(deadline) {
		room.State(0, race.State{})
		if to.count("s") > before {
			return
		}
		time.Sleep(2 * time.Millisecond)
	}
	t.Fatal("the race never started running")
}

func waitOver(t *testing.T, b *inbox, n int) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if b.count("over") >= n {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatalf("race %d never ended", n)
}

func TestCreateJoinAndFull(t *testing.T) {
	t.Parallel()
	h := race.NewHub(slow)
	t.Cleanup(h.Shutdown)
	if _, _, err := h.Join("ZZZZ", &inbox{}); !errors.Is(err, race.ErrNoRoom) {
		t.Fatalf("Join unknown = %v, want ErrNoRoom", err)
	}
	host := &inbox{}
	room, seat, err := h.Create(host)
	if err != nil || seat != 0 || len(room.Code()) != 4 {
		t.Fatalf("Create = %q seat %d, %v", room.Code(), seat, err)
	}
	guest := &inbox{}
	if _, seat, err := h.Join(room.Code(), guest); err != nil || seat != 1 {
		t.Fatalf("Join = seat %d, %v", seat, err)
	}
	if m := guest.last("room"); m["you"] != float64(1) || m["host"] != float64(0) || m["playing"] != false {
		t.Fatalf("guest's room = %v", m)
	}
	for range race.Seats - 2 {
		if _, _, err := h.Join(room.Code(), &inbox{}); err != nil {
			t.Fatalf("Join = %v", err)
		}
	}
	if _, _, err := h.Join(room.Code(), &inbox{}); !errors.Is(err, race.ErrFull) {
		t.Fatalf("fifth Join = %v, want ErrFull", err)
	}
}

func TestPickRefusesBadShipsAndNames(t *testing.T) {
	t.Parallel()
	h := race.NewHub(slow)
	t.Cleanup(h.Shutdown)
	host := &inbox{}
	room, _, _ := h.Create(host)
	if err := room.Pick(0, "tractor", "Bat"); !errors.Is(err, race.ErrBadShip) {
		t.Fatalf("bad ship = %v", err)
	}
	for _, name := range []string{"", "   ", "<script>", "this name is far too long"} {
		if err := room.Pick(0, "vega", name); !errors.Is(err, race.ErrBadName) {
			t.Fatalf("name %q = %v, want ErrBadName", name, err)
		}
	}
	if err := room.Pick(0, "kestrel", "  Bat   Erdene "); err != nil {
		t.Fatalf("good pick = %v", err)
	}
	m := host.last("room")
	if m["ships"].([]any)[0] != "kestrel" || m["names"].([]any)[0] != "Bat Erdene" {
		t.Fatalf("room after pick = %v", m)
	}
}

func TestStartRules(t *testing.T) {
	t.Parallel()
	h := race.NewHub(slow)
	t.Cleanup(h.Shutdown)
	host, guest := &inbox{}, &inbox{}
	room, _, _ := h.Create(host)
	_ = room.Pick(0, "vega", "Host")
	if err := room.Start(0); !errors.Is(err, race.ErrTooFew) {
		t.Fatalf("Start alone = %v, want ErrTooFew", err)
	}
	_, gs, _ := h.Join(room.Code(), guest)
	// Seated but not picked does not count.
	if err := room.Start(0); !errors.Is(err, race.ErrTooFew) {
		t.Fatalf("Start with an unpicked guest = %v, want ErrTooFew", err)
	}
	_ = room.Pick(gs, "wisp", "Guest")
	if err := room.Start(gs); !errors.Is(err, race.ErrNotHost) {
		t.Fatalf("guest Start = %v, want ErrNotHost", err)
	}
	if err := room.Start(0); err != nil {
		t.Fatalf("host Start = %v", err)
	}
	if err := room.Start(0); !errors.Is(err, race.ErrStarted) {
		t.Fatalf("second Start = %v, want ErrStarted", err)
	}
	if err := room.Pick(gs, "torch", "Guest"); !errors.Is(err, race.ErrStarted) {
		t.Fatalf("Pick mid-race = %v, want ErrStarted", err)
	}
	m := guest.wait(t, "race")
	if m["round"] != float64(1) || m["count"] != float64(slow.Countdown.Milliseconds()) {
		t.Fatalf("race = %v", m)
	}
	if p := m["players"].([]any); p[0] != true || p[1] != true || p[2] != false {
		t.Fatalf("race players = %v", p)
	}
}

func TestOnlyPickedSeatsRace(t *testing.T) {
	t.Parallel()
	h := race.NewHub(slow)
	t.Cleanup(h.Shutdown)
	a, b, c := &inbox{}, &inbox{}, &inbox{}
	room, _, _ := h.Create(a)
	_, bs, _ := h.Join(room.Code(), b)
	_, _, _ = h.Join(room.Code(), c)
	_ = room.Pick(0, "vega", "A")
	_ = room.Pick(bs, "vega", "B")
	if err := room.Start(0); err != nil {
		t.Fatal(err)
	}
	if p := c.wait(t, "race")["players"].([]any); p[2] != false || p[0] != true || p[1] != true {
		t.Fatalf("players = %v, want the unpicked seat out", p)
	}
}

func TestTracksNeverRepeatBackToBack(t *testing.T) {
	t.Parallel()
	for seed := uint64(1); seed <= 20; seed++ {
		timing := long
		timing.Seed = seed
		room, boxes := players(t, timing, 2)
		prev := ""
		for round := 1; round <= 12; round++ {
			if err := room.Start(0); err != nil {
				t.Fatalf("seed %d round %d Start = %v", seed, round, err)
			}
			track := ""
			deadline := time.Now().Add(2 * time.Second)
			for time.Now().Before(deadline) {
				if m := boxes[1].last("race"); m != nil && m["round"] == float64(round) {
					track, _ = m["track"].(string)
					break
				}
				time.Sleep(time.Millisecond)
			}
			if !slices.Contains(race.Tracks, track) {
				t.Fatalf("seed %d round %d track %q", seed, round, track)
			}
			if track == prev {
				t.Fatalf("seed %d: %q twice in a row at round %d", seed, track, round)
			}
			prev = track
			// Everyone finishes so the host can start the next one.
			waitRunning(t, room, boxes[1])
			room.Finish(0, 1000)
			room.Finish(1, 2000)
			waitOver(t, boxes[0], round)
		}
	}
}

func TestStatesRelayToOthersOnly(t *testing.T) {
	t.Parallel()
	h := race.NewHub(long)
	t.Cleanup(h.Shutdown)
	a, b, late := &inbox{}, &inbox{}, &inbox{}
	room, _, _ := h.Create(a)
	_, _, _ = h.Join(room.Code(), b)
	_ = room.Pick(0, "vega", "A")
	_ = room.Pick(1, "vega", "B")
	st := race.State{P: 3, D: 512.3, X: -2.1, H: 0.05, V: 81.2, B: 1, L: 1, C: 3}

	room.State(0, st)
	if b.find("s") != nil {
		t.Fatal("a state was relayed in the lobby")
	}
	if err := room.Start(0); err != nil {
		t.Fatal(err)
	}
	waitRunning(t, room, b)
	_, lateSeat, _ := h.Join(room.Code(), late)
	before := a.count("s")
	room.State(lateSeat, st)
	if a.count("s") != before {
		t.Fatal("a watcher's state was relayed")
	}
	room.State(0, st)
	got := b.last("s")
	if got["s"] != float64(0) || got["p"] != float64(3) || got["d"] != 512.3 || got["x"] != -2.1 ||
		got["h"] != 0.05 || got["v"] != 81.2 || got["b"] != float64(1) || got["l"] != float64(1) || got["c"] != float64(3) {
		t.Fatalf("relayed state = %v", got)
	}
	if a.find("s") != nil {
		t.Fatal("the sender got its own state back")
	}
	late.wait(t, "s")
}

func TestNoStatesDuringTheCountdown(t *testing.T) {
	t.Parallel()
	room, boxes := players(t, slow, 2)
	_ = room.Start(0)
	room.State(0, race.State{V: 10})
	if boxes[1].find("s") != nil {
		t.Fatal("a state was relayed during the countdown")
	}
}

func TestOutOfRangeStatesAreDropped(t *testing.T) {
	t.Parallel()
	room, boxes := players(t, long, 2)
	_ = room.Start(0)
	waitRunning(t, room, boxes[1])
	before := boxes[1].count("s")
	for _, st := range []race.State{
		{P: 16}, {P: -1}, {L: 4}, {L: -1}, {C: 65}, {D: 1e5}, {X: -1e5}, {Y: 1e6}, {V: -2e5},
		{D: math.NaN()}, {V: math.Inf(1)}, {H: math.Inf(-1)}, {B: math.NaN()},
	} {
		room.State(0, st)
	}
	if n := boxes[1].count("s"); n != before {
		t.Fatalf("%d bad states were relayed", n-before)
	}
	room.State(0, race.State{P: 15, L: 3, C: 64, D: 99999, V: -99999})
	if n := boxes[1].count("s"); n != before+1 {
		t.Fatal("an edge-of-range state was dropped")
	}
}

func TestFinishOrderAndPlaces(t *testing.T) {
	t.Parallel()
	room, boxes := players(t, long, 3)
	_ = room.Start(0)
	waitRunning(t, room, boxes[1])
	room.Finish(2, 204118)
	room.Finish(2, 100) // counts once
	room.Finish(0, 209877)
	room.Finish(1, 0) // not a time
	if boxes[1].count("done") != 2 {
		t.Fatalf("done count = %d, want 2", boxes[1].count("done"))
	}
	if d := boxes[0].find("done"); d["s"] != float64(2) || d["ms"] != float64(204118) || d["place"] != float64(1) {
		t.Fatalf("first done = %v", d)
	}
	room.Finish(1, 212000)
	over := boxes[0].wait(t, "over")
	if o := over["order"].([]any); o[0] != float64(2) || o[1] != float64(0) || o[2] != float64(1) || o[3] != float64(-1) {
		t.Fatalf("order = %v", o)
	}
	if ms := over["ms"].([]any); ms[0] != float64(204118) || ms[1] != float64(209877) || ms[2] != float64(212000) || ms[3] != float64(-1) {
		t.Fatalf("ms = %v", ms)
	}
	if over["win"] != float64(2) || over["wins"].([]any)[2] != float64(1) {
		t.Fatalf("over = %v", over)
	}
	if m := boxes[2].last("room"); m["playing"] != false || m["racing"].([]any)[0] != false {
		t.Fatalf("room after the race = %v", m)
	}
}

func TestCutoffEndsTheRaceWithDNFs(t *testing.T) {
	t.Parallel()
	room, boxes := players(t, fast, 3)
	_ = room.Start(0)
	waitRunning(t, room, boxes[1])
	room.Finish(1, 5000)
	over := boxes[0].wait(t, "over")
	if o := over["order"].([]any); o[0] != float64(1) || o[1] != float64(0) || o[2] != float64(2) || o[3] != float64(-1) {
		t.Fatalf("order = %v, want DNFs after the finisher", o)
	}
	if ms := over["ms"].([]any); ms[0] != float64(5000) || ms[1] != float64(-1) {
		t.Fatalf("ms = %v", ms)
	}
	// A finish after the cut-off is ignored.
	room.Finish(0, 6000)
	if boxes[1].count("done") != 1 {
		t.Fatal("a finish after the race was counted")
	}
}

func TestStaleTimersDoNothing(t *testing.T) {
	t.Parallel()
	timing := race.Timing{Countdown: 5 * time.Millisecond, Cutoff: 150 * time.Millisecond, MaxRace: time.Minute, Seed: 1}
	room, boxes := players(t, timing, 2)
	_ = room.Start(0)
	waitRunning(t, room, boxes[1])
	room.Finish(0, 1000) // starts race 1's cut-off
	room.Finish(1, 1100) // ends race 1 now
	waitOver(t, boxes[0], 1)
	_ = room.Start(0) // race 2, while race 1's cut-off timer is still pending
	time.Sleep(250 * time.Millisecond)
	if n := boxes[0].count("over"); n != 1 {
		t.Fatalf("race 1's timer ended race 2: %d overs", n)
	}
}

func TestEveryoneFinishingEndsEarly(t *testing.T) {
	t.Parallel()
	room, boxes := players(t, long, 2)
	_ = room.Start(0)
	waitRunning(t, room, boxes[1])
	room.Finish(0, 1000)
	if boxes[1].find("over") != nil {
		t.Fatal("the race ended with a racer still on the road")
	}
	room.Finish(1, 1500)
	boxes[1].wait(t, "over")
	if err := room.Start(0); err != nil {
		t.Fatalf("Start after a race = %v", err)
	}
}

func TestHostLeavingMidRace(t *testing.T) {
	t.Parallel()
	room, boxes := players(t, long, 3)
	_ = room.Start(0)
	waitRunning(t, room, boxes[1])
	room.Leave(0)
	m := boxes[1].last("room")
	if m["host"] != float64(1) || m["seats"].([]any)[0] != false || m["racing"].([]any)[0] != false {
		t.Fatalf("room after the host left = %v", m)
	}
	if boxes[1].find("over") != nil {
		t.Fatal("the race ended with two racers left")
	}
	room.Finish(1, 3000)
	room.Finish(2, 4000)
	over := boxes[1].wait(t, "over")
	if o := over["order"].([]any); o[0] != float64(1) || o[1] != float64(2) || o[2] != float64(0) || o[3] != float64(-1) {
		t.Fatalf("order = %v, want the leaver as a DNF", o)
	}
}

func TestLastRacerLeavingEndsTheRace(t *testing.T) {
	t.Parallel()
	room, boxes, watcher := withWatcher(t, long)
	_ = room.Start(0)
	waitRunning(t, room, boxes[1])
	room.Leave(0)
	if watcher.find("over") != nil {
		t.Fatal("the race ended with a racer still on the road")
	}
	room.Leave(1)
	over := watcher.wait(t, "over")
	if over["win"] != float64(-1) || over["order"].([]any)[0] != float64(0) || over["order"].([]any)[1] != float64(1) || over["ms"].([]any)[0] != float64(-1) {
		t.Fatalf("over = %v, want no winner", over)
	}
	if m := watcher.last("room"); m["playing"] != false || m["host"] != float64(2) {
		t.Fatalf("room after the race = %v", m)
	}
}

func TestEveryoneLeavingDuringTheCountdownEndsIt(t *testing.T) {
	t.Parallel()
	room, _, watcher := withWatcher(t, slow)
	_ = room.Start(0)
	room.Leave(0)
	room.Leave(1)
	watcher.wait(t, "over")
	if m := watcher.last("room"); m["playing"] != false {
		t.Fatalf("room = %v", m)
	}
}

func TestMaxRaceEndsARaceNobodyFinishes(t *testing.T) {
	t.Parallel()
	timing := race.Timing{Countdown: 5 * time.Millisecond, Cutoff: time.Minute, MaxRace: 30 * time.Millisecond, Seed: 1}
	room, boxes := players(t, timing, 2)
	_ = room.Start(0)
	over := boxes[0].wait(t, "over")
	if over["win"] != float64(-1) {
		t.Fatalf("over = %v", over)
	}
	for _, v := range over["ms"].([]any) {
		if v != float64(-1) {
			t.Fatalf("ms = %v, want all DNF", over["ms"])
		}
	}
}

func TestJoinerMidRaceWatches(t *testing.T) {
	t.Parallel()
	h := race.NewHub(long)
	t.Cleanup(h.Shutdown)
	a, b := &inbox{}, &inbox{}
	room, _, _ := h.Create(a)
	_, _, _ = h.Join(room.Code(), b)
	_ = room.Pick(0, "vega", "A")
	_ = room.Pick(1, "lancer", "B")
	_ = room.Start(0)
	waitRunning(t, room, b)
	late := &inbox{}
	_, lateSeat, _ := h.Join(room.Code(), late)
	rm := late.find("race")
	if rm == nil || rm["track"] == "" || rm["count"] != float64(0) || rm["round"] != float64(1) {
		t.Fatalf("joiner's race = %v, want the track and no countdown", rm)
	}
	if p := rm["players"].([]any); p[lateSeat] != false || p[0] != true || p[1] != true {
		t.Fatalf("joiner's players = %v", p)
	}
	if m := late.last("room"); m["playing"] != true || m["racing"].([]any)[lateSeat] != false {
		t.Fatalf("joiner's room = %v", m)
	}
	// The joiner can't finish, and the race still waits for the real racers.
	room.Finish(lateSeat, 500)
	room.Finish(1, 1000)
	room.Finish(0, 2000)
	over := late.wait(t, "over")
	if o := over["order"].([]any); o[0] != float64(1) || o[1] != float64(0) || o[2] != float64(-1) {
		t.Fatalf("order = %v", o)
	}
	if over["wins"].([]any)[1] != float64(1) {
		t.Fatalf("wins = %v", over["wins"])
	}
}

func TestRetakenSeatStartsFresh(t *testing.T) {
	t.Parallel()
	h := race.NewHub(long)
	t.Cleanup(h.Shutdown)
	a, b := &inbox{}, &inbox{}
	room, _, _ := h.Create(a)
	_, _, _ = h.Join(room.Code(), b)
	_ = room.Pick(0, "vega", "A")
	_ = room.Pick(1, "lancer", "B")
	_ = room.Start(0)
	waitRunning(t, room, b)
	room.Finish(1, 1000)
	room.Finish(0, 2000)
	b.wait(t, "over")
	if m := a.last("room"); m["wins"].([]any)[1] != float64(1) {
		t.Fatalf("wins = %v", m["wins"])
	}
	room.Leave(1)
	_, seat, _ := h.Join(room.Code(), &inbox{})
	if seat != 1 {
		t.Fatalf("re-taken seat = %d, want 1", seat)
	}
	if m := a.last("room"); m["wins"].([]any)[1] != float64(0) || m["ships"].([]any)[1] != "" || m["names"].([]any)[1] != "" {
		t.Fatalf("a re-taken seat kept its record: %v", m)
	}
}

func TestLastLeaverClosesTheRoomAndShutdown(t *testing.T) {
	t.Parallel()
	h := race.NewHub(fast)
	a, b := &inbox{}, &inbox{}
	room, _, _ := h.Create(a)
	_, bs, _ := h.Join(room.Code(), b)
	_ = room.Pick(0, "vega", "A")
	_ = room.Pick(bs, "vega", "B")
	_ = room.Start(0)
	room.Leave(bs)
	room.Leave(0)
	if h.Rooms() != 0 {
		t.Fatalf("rooms = %d, want 0", h.Rooms())
	}
	if _, _, err := h.Join(room.Code(), &inbox{}); !errors.Is(err, race.ErrNoRoom) {
		t.Fatalf("Join a closed room = %v, want ErrNoRoom", err)
	}
	c := &inbox{}
	_, _, _ = h.Create(c)
	h.Shutdown()
	if !c.isClosed() {
		t.Fatal("Shutdown left a connection open")
	}
	if _, _, err := h.Create(&inbox{}); !errors.Is(err, race.ErrShutdown) {
		t.Fatalf("Create after Shutdown = %v, want ErrShutdown", err)
	}
}

func TestJoinerDuringCountdownGetsTheRemainingTime(t *testing.T) {
	t.Parallel()
	h := race.NewHub(slow)
	t.Cleanup(h.Shutdown)
	a, b := &inbox{}, &inbox{}
	room, _, _ := h.Create(a)
	_, _, _ = h.Join(room.Code(), b)
	_ = room.Pick(0, "vega", "A")
	_ = room.Pick(1, "vega", "B")
	_ = room.Start(0)
	late := &inbox{}
	_, seat, _ := h.Join(room.Code(), late)
	rm := late.find("race")
	left, _ := rm["count"].(float64)
	if rm == nil || left <= 0 || left > float64(slow.Countdown.Milliseconds()) || rm["players"].([]any)[seat] != false {
		t.Fatalf("joiner's race = %v", rm)
	}
}

func TestNewcomerInALeaversSeatInheritsNothing(t *testing.T) {
	t.Parallel()
	h := race.NewHub(long)
	t.Cleanup(h.Shutdown)
	a, b, c := &inbox{}, &inbox{}, &inbox{}
	room, _, _ := h.Create(a)
	_, _, _ = h.Join(room.Code(), b)
	_, _, _ = h.Join(room.Code(), c)
	for i, n := range []string{"A", "B", "C"} {
		_ = room.Pick(i, "vega", n)
	}
	_ = room.Start(0)
	waitRunning(t, room, b)
	room.Finish(1, 1000)
	room.Leave(1)
	newcomer := &inbox{}
	_, seat, _ := h.Join(room.Code(), newcomer)
	if seat != 1 {
		t.Fatalf("seat = %d, want the leaver's seat", seat)
	}
	room.Finish(0, 2000)
	room.Finish(2, 3000)
	over := a.wait(t, "over")
	if o := over["order"].([]any); o[0] != float64(0) || o[1] != float64(2) || o[2] != float64(-1) {
		t.Fatalf("order = %v, want the leaver's finish gone", o)
	}
	if over["win"] != float64(0) || over["wins"].([]any)[1] != float64(0) {
		t.Fatalf("over = %v, want seat 0 to win and seat 1 to have none", over)
	}
}

func TestWholeNumbersOnlyForPieceLapAndCheckpoint(t *testing.T) {
	t.Parallel()
	room, boxes := players(t, long, 2)
	_ = room.Start(0)
	waitRunning(t, room, boxes[1])
	before := boxes[1].count("s")
	room.State(0, race.State{P: 1.5})
	room.State(0, race.State{L: 0.5})
	room.State(0, race.State{C: 2.25})
	if boxes[1].count("s") != before {
		t.Fatal("a fractional piece, lap or checkpoint was relayed")
	}
}

// A timer that has fired and waits on the room's lock while the last player leaves must not
// close the race's channel a second time.
func TestLastLeaveRacingTheCutoffDoesNotPanic(t *testing.T) {
	t.Parallel()
	for i := range 200 {
		timing := race.Timing{Countdown: time.Millisecond, Cutoff: 100 * time.Microsecond, MaxRace: 3 * time.Millisecond, Seed: 1}
		h := race.NewHub(timing)
		a, b := &inbox{}, &inbox{}
		room, _, _ := h.Create(a)
		_, _, _ = h.Join(room.Code(), b)
		_ = room.Pick(0, "vega", "A")
		_ = room.Pick(1, "vega", "B")
		_ = room.Start(0)
		time.Sleep(time.Millisecond + time.Duration(i%10)*100*time.Microsecond)
		room.Finish(0, 1000) // starts the cut-off
		time.Sleep(time.Duration(i%7) * 50 * time.Microsecond)
		var wg sync.WaitGroup
		wg.Add(2)
		go func() { defer wg.Done(); room.Leave(0) }()
		go func() { defer wg.Done(); room.Leave(1) }()
		wg.Wait()
		time.Sleep(4 * time.Millisecond)
		h.Shutdown()
	}
}
