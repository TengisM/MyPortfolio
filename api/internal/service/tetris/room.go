// Package tetris runs online Tetris rooms. Each player's board runs in their own browser; the
// server only keeps the room: who sits where, who hosts, when a round starts and on what piece
// seed, the shared garbage clock, and who is still standing. It relays boards so everyone can
// watch, and it knows nothing about HTTP; the handler hands it connections as Senders.
package tetris

import (
	"crypto/rand"
	"encoding/binary"
	"encoding/json"
	"errors"
	mrand "math/rand/v2"
	"sync"
	"time"
)

// The board, as the site draws it. A relayed board is one character per cell, row by row.
const (
	Width      = 10
	Height     = 20
	BoardCells = Width * Height
	// Seats is the most players in one room.
	Seats = 4
	// maxLines is far past any real score. It only keeps nonsense out of everyone else's screen.
	maxLines = 100000
)

// Sender is one player's connection. Send must not block: it returns false when the connection
// is gone or too far behind, and the handler then drops it.
type Sender interface {
	Send(msg []byte) bool
	Close()
}

// Timing holds the clock of a round. Tests shrink it.
type Timing struct {
	Countdown, GarbageEvery time.Duration
	// Rows pushed onto every board each GarbageEvery, so a round between careful players ends.
	GarbageRows int
}

// Default is the round clock players get.
var Default = Timing{Countdown: 3 * time.Second, GarbageEvery: time.Minute, GarbageRows: 2}

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
)

// Hub holds every open room by code.
type Hub struct {
	mu     sync.Mutex
	rooms  map[string]*Room
	timing Timing
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
	var seed [16]byte
	_, _ = rand.Read(seed[:])
	r := &Room{
		hub:  h,
		code: code,
		stop: make(chan struct{}),
		// Only picks garbage holes. Seeded from crypto/rand so rooms don't get the same ones.
		rng: mrand.New(mrand.NewPCG(binary.LittleEndian.Uint64(seed[:8]), binary.LittleEndian.Uint64(seed[8:]))), //nolint:gosec // garbage holes, not a secret
	}
	r.seats[0] = s
	h.rooms[code] = r
	r.mu.Lock()
	r.broadcastRoomLocked()
	r.mu.Unlock()
	return r, 0, nil
}

// Join seats s in the room's first free seat. Mid-round, the new player watches until the host
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
			r.wins[seat] = 0
			r.alive[seat] = false
			r.broadcastRoomLocked()
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

// Room is up to four seats, the host who starts rounds, and who is still standing in this one.
type Room struct {
	hub  *Hub
	code string

	mu    sync.Mutex
	seats [Seats]Sender
	wins  [Seats]int
	host  int
	phase phase
	// Who is still playing this round. Players who joined mid-round, or topped out, watch.
	alive [Seats]bool
	// Counts rounds, so a finished round's garbage clock can tell it is stale and stop.
	round  int
	closed bool
	stop   chan struct{}
	rng    *mrand.Rand
}

// Code is what players type to join.
func (r *Room) Code() string { return r.code }

// Start begins a round for everyone seated. Only the host can, and only with two people in.
func (r *Room) Start(seat int) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if seat != r.host {
		return ErrNotHost
	}
	if r.phase != lobby {
		return ErrStarted
	}
	if r.countLocked() < 2 {
		return ErrTooFew
	}
	for s, p := range r.seats {
		r.alive[s] = p != nil
	}
	// Every board draws pieces from this seed, so everyone gets the same sequence.
	var seed [4]byte
	_, _ = rand.Read(seed[:])
	r.round++
	r.phase = countdown
	timing := r.hub.timing
	r.broadcastLocked(mustJSON(roundMsg{
		T:       "round",
		Round:   r.round,
		Seed:    binary.LittleEndian.Uint32(seed[:]),
		Count:   timing.Countdown.Milliseconds(),
		Garbage: timing.GarbageEvery.Milliseconds(),
		Rows:    timing.GarbageRows,
		Players: r.alive,
	}))
	go r.clock(r.round)
	return nil
}

// Board relays seat's board to everyone else in the room. A board from someone who isn't
// playing, or one that doesn't parse, is dropped without a word: a fixed client never sends one.
func (r *Room) Board(seat int, b string, lines int) {
	if !validBoard(b) || lines < 0 || lines > maxLines {
		return
	}
	msg := mustJSON(boardMsg{T: "board", S: seat, B: b, L: lines})
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.phase == lobby || !r.alive[seat] {
		return
	}
	for s, p := range r.seats {
		if p != nil && s != seat {
			p.Send(msg)
		}
	}
}

// validBoard checks the cell characters, so a relayed board can't carry anything but cells.
func validBoard(b string) bool {
	if len(b) != BoardCells {
		return false
	}
	for i := range len(b) {
		c := b[i]
		if (c < '0' || c > '9') && (c < 'a' || c > 'z') {
			return false
		}
	}
	return true
}

// Dead takes seat out of the round after it topped out.
func (r *Room) Dead(seat int) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.outLocked(seat) {
		r.broadcastRoomLocked()
	}
}

// Leave frees seat. A player still in the round is out; the last one out closes the room.
func (r *Room) Leave(seat int) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.seats[seat] == nil {
		return
	}
	r.seats[seat] = nil
	r.wins[seat] = 0
	if r.countLocked() == 0 {
		r.closed = true
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
	r.outLocked(seat)
	r.broadcastRoomLocked()
}

// outLocked takes seat out of the round, and ends the round when one player or none is left.
// It reports whether the round ended; the caller then sends the room.
func (r *Room) outLocked(seat int) bool {
	if r.phase == lobby || !r.alive[seat] {
		return false
	}
	r.alive[seat] = false
	r.broadcastLocked(mustJSON(outMsg{T: "out", S: seat}))
	winner, left := -1, 0
	for s, alive := range r.alive {
		if alive {
			winner = s
			left++
		}
	}
	if left > 1 {
		return false
	}
	if winner >= 0 {
		r.wins[winner]++
	}
	r.alive = [Seats]bool{}
	r.phase = lobby
	r.broadcastLocked(mustJSON(overMsg{T: "over", Win: winner, Wins: r.wins}))
	return true
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

// clock runs one round's countdown and garbage. It stops when the room closes or the round
// it was started for is over, even if the host has already started the next one.
func (r *Room) clock(round int) {
	timing := r.hub.timing
	if !r.sleep(timing.Countdown) {
		return
	}
	r.mu.Lock()
	if r.round != round || r.phase != countdown {
		r.mu.Unlock()
		return
	}
	r.phase = running
	r.mu.Unlock()

	// time.NewTicker panics on zero, and a panic here would take the server down.
	if timing.GarbageEvery <= 0 {
		return
	}
	tick := time.NewTicker(timing.GarbageEvery)
	defer tick.Stop()
	for {
		select {
		case <-tick.C:
		case <-r.stop:
			return
		}
		r.mu.Lock()
		if r.round != round || r.phase != running {
			r.mu.Unlock()
			return
		}
		// One hole for the whole batch, the same on every board.
		r.broadcastLocked(mustJSON(garbageMsg{T: "garbage", Rows: timing.GarbageRows, Hole: r.rng.IntN(Width)}))
		r.mu.Unlock()
	}
}

// sleep waits d, or returns false at once if the room closed.
func (r *Room) sleep(d time.Duration) bool {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-t.C:
		return true
	case <-r.stop:
		return false
	}
}

// ---- messages ----------------------------------------------------------------------------------
// Compact JSON. A board goes out about 12 times a second per player to everyone else in the room.

type roomMsg struct {
	T       string      `json:"t"`
	Code    string      `json:"code"`
	You     int         `json:"you"`
	Host    int         `json:"host"`
	Seats   [Seats]bool `json:"seats"`
	Wins    [Seats]int  `json:"wins"`
	Alive   [Seats]bool `json:"alive"`
	Playing bool        `json:"playing"`
}

type roundMsg struct {
	T     string `json:"t"`
	Round int    `json:"round"`
	Seed  uint32 `json:"seed"`
	// Countdown and garbage interval, in ms.
	Count   int64       `json:"count"`
	Garbage int64       `json:"garbage"`
	Rows    int         `json:"rows"`
	Players [Seats]bool `json:"players"`
}

type boardMsg struct {
	T string `json:"t"`
	S int    `json:"s"`
	B string `json:"b"`
	L int    `json:"l"`
}

type garbageMsg struct {
	T    string `json:"t"`
	Rows int    `json:"rows"`
	Hole int    `json:"hole"`
}

type outMsg struct {
	T string `json:"t"`
	S int    `json:"s"`
}

type overMsg struct {
	T    string     `json:"t"`
	Win  int        `json:"win"`
	Wins [Seats]int `json:"wins"`
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
		// Only fixed structs of ints, bools and strings come through here.
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
	msg := roomMsg{T: "room", Code: r.code, Host: r.host, Wins: r.wins, Alive: r.alive, Playing: r.phase != lobby}
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
