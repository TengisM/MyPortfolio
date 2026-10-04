package tron

import "math/rand/v2"

// spaceCap is where a bot stops counting free cells: past it, a move has room enough.
const spaceCap = 500

// Personality is how a bot rides. The site's offline bots use the same numbers.
type Personality struct {
	// How hard it steers at the nearest player. 0 just survives.
	Aggression float64
	// Random jitter in its choices, so bots don't all move alike.
	Wander float64
}

// personalities by seat, so a room's bots differ from each other.
var personalities = [Seats]Personality{
	{Aggression: 1.4, Wander: 4},
	{Aggression: 0.6, Wander: 6},
	{Aggression: 0.3, Wander: 10},
	{Aggression: 1.0, Wander: 5},
}

// space counts free cells reachable from (x, y), up to spaceCap.
func (g *Game) space(x, y int) int {
	var seen [Width * Height]bool
	queue := make([]int, 0, spaceCap)
	queue = append(queue, y*Width+x)
	seen[y*Width+x] = true
	for head := 0; head < len(queue) && len(queue) < spaceCap; head++ {
		cx, cy := queue[head]%Width, queue[head]/Width
		for d := range 4 {
			nx, ny := cx+dx[d], cy+dy[d]
			if !g.free(nx, ny) || seen[ny*Width+nx] {
				continue
			}
			seen[ny*Width+nx] = true
			queue = append(queue, ny*Width+nx)
		}
	}
	return len(queue)
}

func (g *Game) straightRun(x, y int, d Dir) int {
	n := 0
	for n < 12 && g.free(x+dx[d]*(n+1), y+dy[d]*(n+1)) {
		n++
	}
	return n
}

func abs(n int) int {
	if n < 0 {
		return -n
	}
	return n
}

// Steer points the bot on seat straight, left or right: most room first, then cutting off the
// nearest of targets (the human seats), then a little noise. It sets the heading directly;
// bots don't queue turns.
func (g *Game) Steer(seat int, targets []int, rng *rand.Rand) {
	r := g.Riders[seat]
	if r == nil || !r.Alive {
		return
	}
	p := personalities[seat]

	// Where the nearest living player will be in four cells.
	hunt, tx, ty := false, 0, 0
	best := -1
	for _, t := range targets {
		h := g.Riders[t]
		if h == nil || !h.Alive || t == seat {
			continue
		}
		px, py := h.X+dx[h.Dir]*4, h.Y+dy[h.Dir]*4
		if d := abs(px-r.X) + abs(py-r.Y); best < 0 || d < best {
			best, tx, ty, hunt = d, px, py, true
		}
	}

	choice, bestScore := r.Dir, -1e18
	for _, d := range [3]Dir{r.Dir, (r.Dir + 3) % 4, (r.Dir + 1) % 4} {
		nx, ny := r.X+dx[d], r.Y+dy[d]
		if !g.free(nx, ny) {
			continue
		}
		room := g.space(nx, ny)
		score := float64(room*2 + g.straightRun(nx, ny, d))
		if d == r.Dir {
			score += 2
		}
		score += rng.Float64() * p.Wander
		// A cell another rider could also enter next tick risks a head-on crash.
		for other, o := range g.Riders {
			if other != seat && o != nil && o.Alive && abs(o.X-nx)+abs(o.Y-ny) == 1 {
				score -= 40
			}
		}
		// Hunt only with room to spare: being cut off yourself loses the round.
		if hunt && room >= spaceCap*6/10 {
			score -= float64(abs(tx-nx)+abs(ty-ny)) * p.Aggression
		}
		if score > bestScore {
			choice, bestScore = d, score
		}
	}
	r.Dir = choice
	r.queue = nil
}
