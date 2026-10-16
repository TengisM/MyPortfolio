// Package tron runs online light-cycle matches: the rules, the rooms and their clocks. The
// server owns the game, so every player sees the same board and nobody's lag decides a crash.
// It knows nothing about HTTP; the handler hands it connections as Senders.
package tron

// The arena. The site's renderer reads these from the round message, so they can change here
// alone.
const (
	Width  = 56
	Height = 34
	// Seats is the most riders in one room.
	Seats = 4
)

// Dir is a heading: 0 up, 1 right, 2 down, 3 left. Grid y grows downward, like the screen.
type Dir uint8

var (
	dx = [4]int{0, 1, 0, -1}
	dy = [4]int{-1, 0, 1, 0}
)

func (d Dir) reverse() Dir { return (d + 2) % 4 }

// Rider is one light cycle in the current round.
type Rider struct {
	X, Y  int
	Dir   Dir
	Alive bool
	// Turns typed between ticks, applied one per tick, so a quick double tap isn't lost.
	queue []Dir
}

// Move is where a rider ended up after a tick.
type Move struct {
	Seat int
	X, Y int
	Dir  Dir
}

// Game is one round's board. Riders are indexed by seat; an empty seat is nil.
type Game struct {
	grid   [Width * Height]uint8
	Riders [Seats]*Rider
}

// spawns are the start cells by seat: two facing in from the sides, two from top and bottom,
// offset so nobody starts on a head-on line.
var spawns = [Seats]Rider{
	{X: 3, Y: Height/2 - 2, Dir: 1},
	{X: Width - 4, Y: Height/2 + 1, Dir: 3},
	{X: Width/2 + 2, Y: 2, Dir: 2},
	{X: Width/2 - 3, Y: Height - 3, Dir: 0},
}

// NewGame places a rider on every seat in seated.
func NewGame(seated [Seats]bool) *Game {
	g := &Game{}
	for seat, in := range seated {
		if !in {
			continue
		}
		s := spawns[seat]
		g.Riders[seat] = &Rider{X: s.X, Y: s.Y, Dir: s.Dir, Alive: true}
		g.grid[s.Y*Width+s.X] = uint8(seat + 1)
	}
	return g
}

func (g *Game) free(x, y int) bool {
	return x >= 0 && y >= 0 && x < Width && y < Height && g.grid[y*Width+x] == 0
}

// Turn queues a heading change for seat. It ignores a U-turn, a repeat and a full queue.
func (g *Game) Turn(seat int, d Dir) {
	if seat < 0 || seat >= Seats || d > 3 {
		return
	}
	r := g.Riders[seat]
	if r == nil || !r.Alive {
		return
	}
	last := r.Dir
	if n := len(r.queue); n > 0 {
		last = r.queue[n-1]
	}
	if d == last || d == last.reverse() || len(r.queue) >= 3 {
		return
	}
	r.queue = append(r.queue, d)
}

// Crash takes seat out of the round, for a player who disconnects mid-round.
func (g *Game) Crash(seat int) bool {
	r := g.Riders[seat]
	if r == nil || !r.Alive {
		return false
	}
	g.derezz(seat)
	return true
}

// derezz kills a rider and frees its trail, which opens the space back up.
func (g *Game) derezz(seat int) {
	g.Riders[seat].Alive = false
	id := uint8(seat + 1)
	for i, v := range g.grid {
		if v == id {
			g.grid[i] = 0
		}
	}
}

// Step moves every living rider one cell. It returns where the survivors are, then the seats
// that crashed. Crashing into a wall or a trail kills; two riders entering the same cell kill
// each other.
func (g *Game) Step() ([]Move, []int) {
	var moves []Move
	var crashed []int
	var doomed [Seats]bool
	for _, r := range g.Riders {
		if r == nil || !r.Alive || len(r.queue) == 0 {
			continue
		}
		next := r.queue[0]
		r.queue = r.queue[1:]
		if next != r.Dir.reverse() {
			r.Dir = next
		}
	}
	for seat, r := range g.Riders {
		if r != nil && r.Alive && !g.free(r.X+dx[r.Dir], r.Y+dy[r.Dir]) {
			doomed[seat] = true
		}
	}
	for i, a := range g.Riders {
		if a == nil || !a.Alive {
			continue
		}
		for j := i + 1; j < Seats; j++ {
			b := g.Riders[j]
			if b == nil || !b.Alive {
				continue
			}
			if a.X+dx[a.Dir] == b.X+dx[b.Dir] && a.Y+dy[a.Dir] == b.Y+dy[b.Dir] {
				doomed[i], doomed[j] = true, true
			}
		}
	}
	for seat, r := range g.Riders {
		if r == nil || !r.Alive || doomed[seat] {
			continue
		}
		r.X += dx[r.Dir]
		r.Y += dy[r.Dir]
		g.grid[r.Y*Width+r.X] = uint8(seat + 1)
		moves = append(moves, Move{Seat: seat, X: r.X, Y: r.Y, Dir: r.Dir})
	}
	for seat, d := range doomed {
		if d {
			g.derezz(seat)
			crashed = append(crashed, seat)
		}
	}
	return moves, crashed
}

// Alive lists the seats still riding.
func (g *Game) Alive() []int {
	var out []int
	for seat, r := range g.Riders {
		if r != nil && r.Alive {
			out = append(out, seat)
		}
	}
	return out
}
