package tron

// Test hooks: set up board positions the public API can't reach in a few ticks.

// Place moves seat's rider to (x, y) heading d, and clears the rest of the board.
func (g *Game) Place(seat, x, y int, d Dir) {
	r := g.Riders[seat]
	g.grid[r.Y*Width+r.X] = 0
	r.X, r.Y, r.Dir = x, y, d
	g.grid[y*Width+x] = uint8(seat + 1)
}

// Trail counts the cells seat's trail covers.
func (g *Game) Trail(seat int) int {
	n := 0
	for _, v := range g.grid {
		if v == uint8(seat+1) {
			n++
		}
	}
	return n
}
