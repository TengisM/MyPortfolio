package race

import (
	"crypto/rand"
	"encoding/binary"
	"encoding/json"
	"errors"
	"math"
	mrand "math/rand/v2"
	"slices"
	"sync"
	"time"
)

// Seats is the most players in one room.
const Seats = 4

// Limits on a relayed ship state. They are far past anything a real ship reaches and only keep
// nonsense out of everyone else's screen.
const (
	maxPiece  = 15
	maxLap    = 3
	maxCheck  = 64
	maxCoord  = 1e5
	maxFinish = 60 * 60 * 1000
)

// Sender is one player's connection. Send must not block: it returns false when the connection
// is gone or too far behind, and the handler then drops it.
type Sender interface {
	Send(msg []byte) bool
	Close()
}

// Timing holds the clock of a race. Tests shrink it.
type Timing struct {
	Countdown time.Duration
	// Cutoff is how long the others get after the first finisher before they are marked DNF.
	Cutoff time.Duration
	// MaxRace ends a race nobody finishes, counted from the end of the countdown.
	MaxRace time.Duration
	// Seed makes the track order repeatable when it is not zero. Tests set it.
	Seed uint64
}

// Default is the race clock players get.
var Default = Timing{Countdown: 3 * time.Second, Cutoff: 30 * time.Second, MaxRace: 8 * time.Minute}

// MaxRooms caps open rooms, so a script can't fill memory with empty ones.
const MaxRooms = 200

// codeLetters leaves out I and O, which read as 1 and 0.
const codeLetters = "ABCDEFGHJKLMNPQRSTUVWXYZ"

var (
	ErrNoRoom   = errors.New("no room with that code")
	ErrFull     = errors.New("that room is full")
	ErrTooMany  = errors.New("too many rooms are open, try again in a minute")
	ErrNotHost  = errors.New("only the host can start")
	ErrTooFew   = errors.New("need at least 2 players to start: send the invite link to a friend")
	ErrStarted  = errors.New("already playing")
	ErrShutdown = errors.New("server is restarting")
	ErrBadShip  = errors.New("unknown ship")
	ErrBadName  = errors.New("name must be 1 to 16 letters, digits, spaces, _ or -")
)

// Hub holds every open room by code.
type Hub struct {
	mu     sync.Mutex
	rooms  map[string]*Room
	timing Timing
	made   uint64
	closed bool
}

// NewHub returns an empty hub on the given clock.
func NewHub(timing Timing) *Hub {
	return &Hub{rooms: map[string]*Room{}, timing: timing}
}

// Create opens a room with s in seat 0 as its host.
func (h *Hub) Create(s Sender) (*Room, int, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.closed {
		return nil, 0, ErrShutdown
	}
	if len(h.rooms) >= MaxRooms {
		return nil, 0, ErrTooMany
	}
	// crypto/rand so codes can't be predicted from earlier ones: a code is the room's only lock.
	code := ""
	for code == "" || h.rooms[code] != nil {
		b := make([]byte, 4)
		_, _ = rand.Read(b)
		for i := range b {
			b[i] = codeLetters[int(b[i])%len(codeLetters)]
		}
		code = string(b)
	}
	h.made++
	s1, s2 := h.timing.Seed, h.made
	if s1 == 0 {
		var seed [16]byte
		_, _ = rand.Read(seed[:])
		s1, s2 = binary.LittleEndian.Uint64(seed[:8]), binary.LittleEndian.Uint64(seed[8:])
	}
	r := &Room{
		hub:  h,
		code: code,
		stop: make(chan struct{}),
		// Only orders the tracks, so it needs to be varied and not secret.
		rng: mrand.New(mrand.NewPCG(s1, s2)), //nolint:gosec // track order, not a secret
	}
	r.seats[0] = s
	h.rooms[code] = r
	r.mu.Lock()
	r.broadcastRoomLocked()
	r.mu.Unlock()
	return r, 0, nil
}

// Join seats s in the room's first free seat. Mid-race, the new player watches until the host
// starts the next one.
func (h *Hub) Join(code string, s Sender) (*Room, int, error) {
	h.mu.Lock()
	r := h.rooms[code]
	closed := h.closed
	h.mu.Unlock()
	if closed {
		return nil, 0, ErrShutdown
	}
	if r == nil {
		return nil, 0, ErrNoRoom
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.closed {
		return nil, 0, ErrNoRoom
	}
	for seat, taken := range r.seats {
		if taken == nil {
			r.seats[seat] = s
			r.clearSeatLocked(seat)
			r.forgetSeatLocked(seat)
			r.broadcastRoomLocked()
			if r.phase != lobby {
				// A watcher still needs the track, to draw it.
				var left int64
				if r.phase == countdown {
					left = max(time.Until(r.countEnd).Milliseconds(), 0)
				}
				s.Send(mustJSON(raceMsg{T: "race", Round: r.round, Track: r.track, Count: left, Players: r.started}))
			}
			return r, seat, nil
		}
	}
	return nil, 0, ErrFull
}

// Rooms counts open rooms.
func (h *Hub) Rooms() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	return len(h.rooms)
}

// Shutdown closes every connection, so a server stop doesn't wait on open sockets.
func (h *Hub) Shutdown() {
	h.mu.Lock()
	h.closed = true
	rooms := make([]*Room, 0, len(h.rooms))
	for _, r := range h.rooms {
		rooms = append(rooms, r)
	}
	h.mu.Unlock()
	for _, r := range rooms {
		r.mu.Lock()
		seats := r.seats
		r.mu.Unlock()
		for _, s := range seats {
			if s != nil {
				s.Close()
			}
		}
	}
}

func (h *Hub) remove(code string) {
	h.mu.Lock()
	delete(h.rooms, code)
	h.mu.Unlock()
}

type phase uint8

const (
	lobby phase = iota
	countdown
	running
)

// Room is up to four seats, the host who starts races, and who is racing in this one.
type Room struct {
	hub  *Hub
	code string

	mu    sync.Mutex
	seats [Seats]Sender
	wins  [Seats]int
	ships [Seats]string
	names [Seats]string
	host  int
	phase phase
	// Who is still in this race. Seats that joined mid-race, or left, are not.
	racing [Seats]bool
	// Who the race began with, kept after a seat leaves so a leaver still shows as DNF.
	started [Seats]bool
	// Finish times by seat, and the seats in the order they crossed the line.
	finishMs [Seats]int
	order    []int
	// Counts races, so a finished race's timers can tell they are stale and stop.
	round int
	// track and countEnd describe the current race, for someone who joins during it.
	track    string
	countEnd time.Time
	// done closes when the current race ends, which releases its timers.
	done   chan struct{}
	closed bool
	stop   chan struct{}
	rng    *mrand.Rand
	// bag holds the tracks not yet raced in this cycle. last is the track of the previous race.
	bag  []string
	last string
}

// Code is what players type to join.
func (r *Room) Code() string { return r.code }

// Pick sets seat's ship and name. Only in the lobby, so nobody changes mid-race.
func (r *Room) Pick(seat int, ship, name string) error {
	if !slices.Contains(Ships, ship) {
		return ErrBadShip
	}
	clean, ok := CleanName(name)
	if !ok {
		return ErrBadName
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.phase != lobby {
		return ErrStarted
	}
	if r.seats[seat] == nil {
		return nil
	}
	r.ships[seat], r.names[seat] = ship, clean
	r.broadcastRoomLocked()
	return nil
}

// Start begins a race for every seat that has picked. Only the host can, and only with two ready.
func (r *Room) Start(seat int) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if seat != r.host {
		return ErrNotHost
	}
	if r.phase != lobby {
		return ErrStarted
	}
	var ready [Seats]bool
	count := 0
	for s, p := range r.seats {
		ready[s] = p != nil && r.ships[s] != ""
		if ready[s] {
			count++
		}
	}
	if count < 2 {
		return ErrTooFew
	}
	r.racing = ready
	r.started = r.racing
	r.finishMs = [Seats]int{}
	r.order = r.order[:0]
	r.round++
	r.phase = countdown
	r.done = make(chan struct{})
	r.track = r.nextTrackLocked()
	timing := r.hub.timing
	r.countEnd = time.Now().Add(timing.Countdown)
	r.broadcastLocked(mustJSON(raceMsg{
		T:       "race",
		Round:   r.round,
		Track:   r.track,
		Count:   timing.Countdown.Milliseconds(),
		Players: r.racing,
	}))
	r.broadcastRoomLocked()
	go r.clock(r.round, r.done)
	return nil
}

// nextTrackLocked draws the next track from the shuffled bag. A refill never opens with the track
// that was just raced.
func (r *Room) nextTrackLocked() string {
	if len(r.bag) == 0 {
		r.bag = slices.Clone(Tracks)
		r.rng.Shuffle(len(r.bag), func(i, j int) { r.bag[i], r.bag[j] = r.bag[j], r.bag[i] })
		// The bag is drawn from the end.
		if last := len(r.bag) - 1; r.bag[last] == r.last {
			r.bag[0], r.bag[last] = r.bag[last], r.bag[0]
		}
	}
	track := r.bag[len(r.bag)-1]
	r.bag = r.bag[:len(r.bag)-1]
	r.last = track
	return track
}

// State is a ship's position as its own browser reports it. Numbers stay floats so a client that
// sends 1.0 for a lap doesn't break the decode.
type State struct {
	P float64 `json:"p"`
	D float64 `json:"d"`
	X float64 `json:"x"`
	Y float64 `json:"y"`
	H float64 `json:"h"`
	V float64 `json:"v"`
	B float64 `json:"b"`
	L float64 `json:"l"`
	C float64 `json:"c"`
}

func (s State) valid() bool {
	for _, v := range []float64{s.P, s.D, s.X, s.Y, s.H, s.V, s.B, s.L, s.C} {
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return false
		}
	}
	for _, v := range []float64{s.P, s.L, s.C} {
		if v != math.Trunc(v) {
			return false
		}
	}
	if s.P < 0 || s.P > maxPiece || s.L < 0 || s.L > maxLap || s.C < 0 || s.C > maxCheck {
		return false
	}
	for _, v := range []float64{s.D, s.X, s.Y, s.V, s.H, s.B} {
		if math.Abs(v) >= maxCoord {
			return false
		}
	}
	return true
}

type stateMsg struct {
	State

	T string `json:"t"`
	S int    `json:"s"`
}

// State relays seat's ship to everyone else. A state from a seat that isn't racing, outside the
// running phase, or one that fails the range check, is dropped without a word: a fixed client
// never sends one.
func (r *Room) State(seat int, st State) {
	if !st.valid() {
		return
	}
	msg := mustJSON(stateMsg{State: st, T: "s", S: seat})
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.phase != running || !r.racing[seat] {
		return
	}
	for s, p := range r.seats {
		if p != nil && s != seat {
			p.Send(msg)
		}
	}
}

// Finish records that seat crossed the line after ms. It counts once per seat. The first finish
// starts the cut-off, and the race ends when nobody is left to finish.
func (r *Room) Finish(seat, ms int) {
	if ms <= 0 || ms > maxFinish {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.phase != running || !r.racing[seat] || slices.Contains(r.order, seat) {
		return
	}
	r.finishMs[seat] = ms
	r.order = append(r.order, seat)
	r.broadcastLocked(mustJSON(doneMsg{T: "done", S: seat, Ms: ms, Place: len(r.order)}))
	if len(r.order) == 1 {
		go r.cutoff(r.round, r.done)
	}
	if r.pendingLocked() == 0 {
		r.endLocked()
	}
}

// Leave frees seat. A racer who hasn't finished is a DNF; the last one out ends the race, and the
// last player out closes the room.
func (r *Room) Leave(seat int) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.seats[seat] == nil {
		return
	}
	r.seats[seat] = nil
	r.clearSeatLocked(seat)
	if r.countLocked() == 0 {
		r.closed = true
		r.phase = lobby
		r.closeDoneLocked()
		close(r.stop)
		r.hub.remove(r.code)
		return
	}
	if seat == r.host {
		for s, taken := range r.seats {
			if taken != nil {
				r.host = s
				break
			}
		}
	}
	if r.phase != lobby && r.pendingLocked() == 0 {
		r.endLocked() // sends the room
		return
	}
	r.broadcastRoomLocked()
}

// pendingLocked counts racers still on the road: seated, racing and not finished.
func (r *Room) pendingLocked() int {
	n := 0
	for s := range r.seats {
		if r.racing[s] && !slices.Contains(r.order, s) {
			n++
		}
	}
	return n
}

// endLocked closes the race: finishers by place, then DNFs, and a win for the first finisher.
func (r *Room) endLocked() {
	order := [Seats]int{-1, -1, -1, -1}
	ms := [Seats]int{-1, -1, -1, -1}
	n := 0
	for _, s := range r.order {
		order[n], ms[n] = s, r.finishMs[s]
		n++
	}
	// Then everyone who started and didn't finish: left mid-race, or cut off.
	for s, was := range r.started {
		if was && !slices.Contains(r.order, s) {
			order[n] = s
			n++
		}
	}
	win := -1
	if len(r.order) > 0 {
		win = r.order[0]
	}
	// A winner who has already left has no seat to count the win on.
	if win >= 0 && r.seats[win] != nil {
		r.wins[win]++
	}
	r.racing = [Seats]bool{}
	r.phase = lobby
	r.closeDoneLocked()
	r.broadcastLocked(mustJSON(overMsg{T: "over", Order: order, Ms: ms, Win: win, Wins: r.wins}))
	r.broadcastRoomLocked()
}

// closeDoneLocked releases the race's timers. Safe to call twice.
func (r *Room) closeDoneLocked() {
	if r.done == nil {
		return
	}
	select {
	case <-r.done:
	default:
		close(r.done)
	}
}

// clearSeatLocked resets what a seat holds between occupants: wins, ship, name and racing.
func (r *Room) clearSeatLocked(seat int) {
	r.wins[seat] = 0
	r.racing[seat] = false
	r.ships[seat], r.names[seat] = "", ""
}

// forgetSeatLocked clears whatever the seat's last occupant did in this race, so a newcomer
// doesn't inherit a finish or a DNF.
func (r *Room) forgetSeatLocked(seat int) {
	r.started[seat] = false
	r.finishMs[seat] = 0
	r.order = slices.DeleteFunc(r.order, func(s int) bool { return s == seat })
}

func (r *Room) countLocked() int {
	n := 0
	for _, s := range r.seats {
		if s != nil {
			n++
		}
	}
	return n
}

// clock runs one race's countdown and its overall limit. It does nothing if the race it was
// started for is over, even when the host has already started the next one.
func (r *Room) clock(round int, done chan struct{}) {
	timing := r.hub.timing
	if !r.sleep(timing.Countdown, done) {
		return
	}
	r.mu.Lock()
	if r.round != round || r.phase != countdown {
		r.mu.Unlock()
		return
	}
	r.phase = running
	r.mu.Unlock()

	if !r.sleep(timing.MaxRace, done) {
		return
	}
	r.endRound(round)
}

// cutoff gives the field Cutoff after the first finisher, then marks the rest DNF.
func (r *Room) cutoff(round int, done chan struct{}) {
	if !r.sleep(r.hub.timing.Cutoff, done) {
		return
	}
	r.endRound(round)
}

func (r *Room) endRound(round int) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.closed || r.round != round || r.phase != running {
		return
	}
	r.endLocked()
}

// sleep waits d, or returns false at once if the room closed or the race ended.
func (r *Room) sleep(d time.Duration, done chan struct{}) bool {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-t.C:
		return true
	case <-done:
		return false
	case <-r.stop:
		return false
	}
}

// ---- messages ----------------------------------------------------------------------------------
// Compact JSON. A state goes out about 20 times a second per player to everyone else in the room.

type roomMsg struct {
	T       string        `json:"t"`
	Code    string        `json:"code"`
	You     int           `json:"you"`
	Host    int           `json:"host"`
	Seats   [Seats]bool   `json:"seats"`
	Names   [Seats]string `json:"names"`
	Ships   [Seats]string `json:"ships"`
	Wins    [Seats]int    `json:"wins"`
	Racing  [Seats]bool   `json:"racing"`
	Playing bool          `json:"playing"`
}

type raceMsg struct {
	T     string `json:"t"`
	Round int    `json:"round"`
	Track string `json:"track"`
	// Countdown in ms.
	Count   int64       `json:"count"`
	Players [Seats]bool `json:"players"`
}

type doneMsg struct {
	T     string `json:"t"`
	S     int    `json:"s"`
	Ms    int    `json:"ms"`
	Place int    `json:"place"`
}

type overMsg struct {
	T     string     `json:"t"`
	Order [Seats]int `json:"order"`
	Ms    [Seats]int `json:"ms"`
	Win   int        `json:"win"`
	Wins  [Seats]int `json:"wins"`
}

// ErrorMessage is what the handler sends on a refused request.
func ErrorMessage(err error) []byte {
	return mustJSON(struct {
		T   string `json:"t"`
		Msg string `json:"msg"`
	}{"error", err.Error()})
}

func mustJSON(v any) []byte {
	b, err := json.Marshal(v)
	if err != nil {
		// Only fixed structs of numbers, bools and strings come through here.
		panic(err)
	}
	return b
}

func (r *Room) broadcastLocked(msg []byte) {
	for _, s := range r.seats {
		if s != nil {
			s.Send(msg)
		}
	}
}

// broadcastRoomLocked tells each player the room's state, with their own seat filled in.
func (r *Room) broadcastRoomLocked() {
	msg := roomMsg{
		T: "room", Code: r.code, Host: r.host, Names: r.names, Ships: r.ships,
		Wins: r.wins, Racing: r.racing, Playing: r.phase != lobby,
	}
	for s, taken := range r.seats {
		msg.Seats[s] = taken != nil
	}
	for s, taken := range r.seats {
		if taken == nil {
			continue
		}
		msg.You = s
		taken.Send(mustJSON(msg))
	}
}
