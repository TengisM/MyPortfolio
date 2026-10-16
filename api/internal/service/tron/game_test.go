package tron_test

import (
	"math/rand/v2"
	"slices"
	"testing"

	"landing-api/internal/service/tron"
)

func seated(seats ...int) [tron.Seats]bool {
	var s [tron.Seats]bool
	for _, i := range seats {
		s[i] = true
	}
	return s
}

func TestStepMovesEveryRiderOneCell(t *testing.T) {
	t.Parallel()
	g := tron.NewGame(seated(0, 1))
	a, b := *g.Riders[0], *g.Riders[1]
	moves, crashed := g.Step()
	if len(crashed) != 0 {
		t.Fatalf("crashed = %v, want none", crashed)
	}
	want := []tron.Move{
		{Seat: 0, X: a.X + 1, Y: a.Y, Dir: 1},
		{Seat: 1, X: b.X - 1, Y: b.Y, Dir: 3},
	}
	if !slices.Equal(moves, want) {
		t.Fatalf("moves = %v, want %v", moves, want)
	}
}

func TestRiderCrashesIntoTheWall(t *testing.T) {
	t.Parallel()
	g := tron.NewGame(seated(2))
	// Seat 2 starts two cells under the top wall, heading up after this turn.
	g.Turn(2, 1)
	g.Step()
	g.Turn(2, 0)
	for range 10 {
		if _, crashed := g.Step(); len(crashed) > 0 {
			if !slices.Equal(crashed, []int{2}) {
				t.Fatalf("crashed = %v, want [2]", crashed)
			}
			return
		}
	}
	t.Fatal("rider never hit the wall")
}

func TestUTurnIsIgnored(t *testing.T) {
	t.Parallel()
	g := tron.NewGame(seated(0))
	g.Turn(0, 3) // seat 0 heads right; left would be straight back into its own trail
	moves, _ := g.Step()
	if moves[0].Dir != 1 {
		t.Fatalf("dir = %d, want 1 (the U-turn should be dropped)", moves[0].Dir)
	}
}

func TestTwoTurnsQueuedBetweenTicksBothApply(t *testing.T) {
	t.Parallel()
	g := tron.NewGame(seated(0))
	g.Turn(0, 0) // up
	g.Turn(0, 3) // then left: a quick U shape over two ticks
	first, _ := g.Step()
	second, _ := g.Step()
	if first[0].Dir != 0 || second[0].Dir != 3 {
		t.Fatalf("dirs = %d then %d, want 0 then 3", first[0].Dir, second[0].Dir)
	}
}

func TestHeadOnCrashKillsBoth(t *testing.T) {
	t.Parallel()
	g := tron.NewGame(seated(0, 1))
	// Two cells apart, facing each other: both enter the middle cell on the next tick.
	g.Place(0, 10, 10, 1)
	g.Place(1, 12, 10, 3)
	_, crashed := g.Step()
	if !slices.Equal(crashed, []int{0, 1}) {
		t.Fatalf("crashed = %v, want [0 1]", crashed)
	}
	if len(g.Alive()) != 0 {
		t.Fatalf("alive = %v, want none", g.Alive())
	}
}

func TestCrashFreesTheTrail(t *testing.T) {
	t.Parallel()
	g := tron.NewGame(seated(0, 1))
	for range 3 {
		g.Step()
	}
	if g.Trail(0) != 4 {
		t.Fatalf("trail = %d cells before the crash, want 4", g.Trail(0))
	}
	g.Crash(0)
	if n := g.Trail(0); n != 0 {
		t.Fatalf("%d cells still hold seat 0's trail", n)
	}
	if slices.Contains(g.Alive(), 0) {
		t.Fatal("seat 0 still alive after Crash")
	}
}

func TestBotTurnsAwayFromTheWall(t *testing.T) {
	t.Parallel()
	g := tron.NewGame(seated(0))
	// Facing the right wall, one cell from it.
	g.Place(0, tron.Width-1, 10, 1)
	g.Steer(0, nil, rand.New(rand.NewPCG(1, 2))) //nolint:gosec // a fixed seed keeps the test repeatable
	if _, crashed := g.Step(); len(crashed) > 0 {
		t.Fatal("bot drove into the wall")
	}
}
