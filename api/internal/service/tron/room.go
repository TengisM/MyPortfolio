package tron

import (
	"crypto/rand"
	"encoding/json"
	"errors"
	"sync"
	"time"
)

// Sender is one player's connection. Send must not block: it returns false when the connection
// is gone or too far behind, and the handler then drops it.
type Sender interface {
	Send(msg []byte) bool
	Close()
}

// Timing holds the clock of a match. Tests shrink it; Default matches the site's offline game.
type Timing struct {
	Countdown  time.Duration
	RoundPause time.Duration
	// Cells per second at the start of a round, and the most it speeds up by.
	BaseSpeed, MaxExtraSpeed float64
}

// Default is the match clock players get.
var Default = Timing{Countdown: 2400 * time.Millisecond, RoundPause: 2200 * time.Millisecond, BaseSpeed: 11, MaxExtraSpeed: 7}

// MaxRooms caps open rooms, so a script can't fill memory with empty ones.
const MaxRooms = 200

// codeLetters leaves out I and O, which read as 1 and 0.
const codeLetters = "ABCDEFGHJKLMNPQRSTUVWXYZ"

var (
	ErrNoRoom   = errors.New("no room with that code")
	ErrFull     = errors.New("that room is full")
	ErrTooMany  = errors.New("too many rooms are open, try again in a minute")
	ErrNotHost  = errors.New("only the host can start")
	ErrTooFew   = errors.New("need at least 2 riders to start")
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
	r := &Room{hub: h, code: code, stop: make(chan struct{})}
	r.seats[0] = s
	h.rooms[code] = r
	r.mu.Lock()
	r.broadcastRoomLocked()
	r.mu.Unlock()
	return r, 0, nil
}

// Join seats s in the room's first free seat. Mid-round, the new rider joins at the next round.
func (h *Hub) Join(code string, s Sender) (*Room, int, error) {
	h.mu.Lock()
	r := h.rooms[code]
	h.mu.Unlock()
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
	roundOver
)

// Room is one match: up to four seats, the host who starts it, and the round being played.
type Room struct {
	hub  *Hub
	code string

	mu      sync.Mutex
	seats   [Seats]Sender
	wins    [Seats]int
	host    int
	phase   phase
	game    *Game
	round   int
	closed  bool
	stop    chan struct{}
	leavers []int
}

// Code is what players type to join.
func (r *Room) Code() string { return r.code }

// Start begins the match. Only the host can, and only with two riders seated.
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
	for i := range r.wins {
		r.wins[i] = 0
	}
	r.round = 0
	r.phase = countdown
	go r.loop()
	return nil
}

// Turn steers seat's rider.
func (r *Room) Turn(seat int, d Dir) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.game != nil && r.phase == running {
		r.game.Turn(seat, d)
	}
}

// Leave frees seat. A rider still on the board crashes; the last one out closes the room.
func (r *Room) Leave(seat int) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.seats[seat] == nil {
		return
	}
	r.seats[seat] = nil
	r.wins[seat] = 0
	if r.game != nil && r.game.Crash(seat) {
		// Reported with the next tick, so every client hears of it in order.
		r.leavers = append(r.leavers, seat)
	}
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
	r.broadcastRoomLocked()
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

// loop plays rounds until fewer than two riders are left, then goes back to the lobby.
func (r *Room) loop() {
	timing := r.hub.timing
	for {
		r.mu.Lock()
		if r.closed {
			r.mu.Unlock()
			return
		}
		if r.countLocked() < 2 {
			r.phase = lobby
			r.game = nil
			r.broadcastRoomLocked()
			r.mu.Unlock()
			return
		}
		r.round++
		var seated [Seats]bool
		for s, taken := range r.seats {
			seated[s] = taken != nil
		}
		r.game = NewGame(seated)
		r.leavers = nil
		r.phase = countdown
		r.broadcastLocked(r.roundMessageLocked(timing.Countdown))
		r.mu.Unlock()

		if !r.sleep(timing.Countdown) {
			return
		}
		r.mu.Lock()
		r.phase = running
		r.mu.Unlock()

		started := time.Now()
		for {
			speed := timing.BaseSpeed + min(timing.MaxExtraSpeed, time.Since(started).Seconds()*0.12)
			step := time.Duration(float64(time.Second) / speed)
			if !r.sleep(step) {
				return
			}
			r.mu.Lock()
			moves, crashed := r.game.Step()
			crashed = append(crashed, r.leavers...)
			r.leavers = nil
			r.broadcastLocked(tickMessage(moves, crashed, step))
			alive := r.game.Alive()
			done := len(alive) <= 1
			if done {
				winner := -1
				if len(alive) == 1 {
					winner = alive[0]
					r.wins[winner]++
				}
				r.phase = roundOver
				r.broadcastLocked(mustJSON(overMsg{T: "over", Win: winner, Wins: r.wins}))
			}
			r.mu.Unlock()
			if done {
				break
			}
		}
		if !r.sleep(timing.RoundPause) {
			return
		}
	}
}

// ---- messages ----------------------------------------------------------------------------------
// Compact JSON. Positions travel as [seat, x, y, dir] arrays: a tick goes out up to 18 times a
// second to every player.

type roomMsg struct {
	T       string      `json:"t"`
	Code    string      `json:"code"`
	You     int         `json:"you"`
	Host    int         `json:"host"`
	Seats   [Seats]bool `json:"seats"`
	Wins    [Seats]int  `json:"wins"`
	Playing bool        `json:"playing"`
}

type roundMsg struct {
	T      string   `json:"t"`
	Round  int      `json:"round"`
	W      int      `json:"w"`
	H      int      `json:"h"`
	Count  int64    `json:"count"`
	Riders [][4]int `json:"r"`
}

type tickMsg struct {
	T       string   `json:"t"`
	Moves   [][4]int `json:"m"`
	Crashed []int    `json:"x,omitempty"`
	Ms      int64    `json:"ms"`
}

type overMsg struct {
	T    string     `json:"t"`
	Win  int        `json:"win"`
	Wins [Seats]int `json:"wins"`
}

// ErrorMessage is what the handler sends before closing on a refused request.
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

func (r *Room) roundMessageLocked(count time.Duration) []byte {
	msg := roundMsg{T: "round", Round: r.round, W: Width, H: Height, Count: count.Milliseconds(), Riders: [][4]int{}}
	for seat, rider := range r.game.Riders {
		if rider != nil {
			msg.Riders = append(msg.Riders, [4]int{seat, rider.X, rider.Y, int(rider.Dir)})
		}
	}
	return mustJSON(msg)
}

func tickMessage(moves []Move, crashed []int, step time.Duration) []byte {
	msg := tickMsg{T: "tick", Moves: make([][4]int, 0, len(moves)), Crashed: crashed, Ms: step.Milliseconds()}
	for _, m := range moves {
		msg.Moves = append(msg.Moves, [4]int{m.Seat, m.X, m.Y, int(m.Dir)})
	}
	return mustJSON(msg)
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
	msg := roomMsg{T: "room", Code: r.code, Host: r.host, Wins: r.wins, Playing: r.phase != lobby}
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
