// Tetris rules with no DOM: the board, the piece queue, moves, hold and garbage rows. Solo and
// online play both drive one of these and draw it with tetris-view. Same seed, same pieces, so
// everyone in an online round gets an identical queue.

export const W = 10
export const H = 20

// Each piece in its spawn orientation. The first seven are the classic tetrominoes.
export const SHAPES: number[][][] = [
  [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  [
    [1, 1],
    [1, 1],
  ],
  [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ],
  [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ],
  [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
  // Bonus pieces. One may join a bag now and then: a plus, a U, a small corner, a short bar.
  [
    [0, 1, 0],
    [1, 1, 1],
    [0, 1, 0],
  ],
  [
    [1, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
  [
    [1, 1],
    [1, 0],
  ],
  [
    [0, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
]

const CLASSIC = 7
/** Odds that a bag of seven gets one bonus piece mixed in. */
const BONUS_CHANCE = 1 / 3

/** One colour per piece, then garbage. A board cell holds a piece's index + 1, or GARBAGE. */
export const COLORS = [
  '#5b8cff',
  '#ffc56d',
  '#c4b5fd',
  '#9be3a1',
  '#ff7ab2',
  '#7dd3fc',
  '#67e8f9',
  '#f0abfc',
  '#fca5a5',
  '#fde68a',
  '#a5b4fc',
  '#4a5368',
]
export const GARBAGE = SHAPES.length + 1

const LINE_SCORES = [0, 100, 300, 500, 800]

export type Piece = { type: number; shape: number[][]; x: number; y: number }

const rotate = (m: number[][]): number[][] =>
  (m[0] ?? []).map((_, i) => m.map((row) => row[i] ?? 0).reverse())

export const cells = (p: Piece): [number, number][] => {
  const out: [number, number][] = []
  p.shape.forEach((row, dy) => {
    row.forEach((v, dx) => {
      if (v) out.push([p.x + dx, p.y + dy])
    })
  })
  return out
}

/** A piece as text rows for the HUD, two characters per cell. */
export const pieceRows = (type: number) =>
  (SHAPES[type] ?? [])
    .filter((row) => row.some(Boolean))
    .map((row) => row.map((v) => (v ? '██' : '  ')).join(''))

/** mulberry32: small, fast, and the same sequence in every browser for a given seed. */
const seeded = (seed: number) => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const randomSeed = () => Math.floor(Math.random() * 2 ** 32)

export type Tetris = ReturnType<typeof createTetris>

export function createTetris(seed: number) {
  const random = seeded(seed)
  let bag: number[] = []
  const pending: { rows: number; hole: number }[] = []
  let fallTimer = 0
  let flashTimer = 0
  let usedHold = false

  const state = {
    board: Array.from({ length: H }, () => Array<number>(W).fill(0)),
    piece: null as Piece | null,
    next: 0,
    hold: null as number | null,
    score: 0,
    lines: 0,
    level: 1,
    over: false,
    flashRows: [] as number[],
    /** Goes up on every change, so a view or a socket knows when to catch up. */
    rev: 0,
    /** Goes up with each new piece. Soft drop stops at a new piece until ↓ is pressed again. */
    spawned: 0,
  }

  const draw = () => {
    if (bag.length === 0) {
      bag = [0, 1, 2, 3, 4, 5, 6]
      if (random() < BONUS_CHANCE)
        bag.push(CLASSIC + Math.floor(random() * (SHAPES.length - CLASSIC)))
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1))
        ;[bag[i], bag[j]] = [bag[j] as number, bag[i] as number]
      }
    }
    return bag.pop() as number
  }

  const fits = (p: Piece) =>
    cells(p).every(([x, y]) => x >= 0 && x < W && y < H && (y < 0 || !state.board[y]?.[x]))

  const spawn = (type: number) => {
    const shape = SHAPES[type] as number[][]
    const top = shape.findIndex((row) => row.some(Boolean))
    const piece = { type, shape, x: Math.floor((W - (shape[0]?.length ?? 0)) / 2), y: -top }
    state.piece = piece
    state.spawned++
    fallTimer = 0
    if (!fits(piece)) state.over = true
  }

  const spawnNext = () => {
    const type = state.next
    state.next = draw()
    spawn(type)
  }

  const busy = () => state.over || state.flashRows.length > 0 || !state.piece

  const lock = () => {
    const piece = state.piece
    if (!piece) return
    for (const [x, y] of cells(piece)) {
      if (y < 0) {
        state.over = true
        continue
      }
      const row = state.board[y]
      if (row) row[x] = piece.type + 1
    }
    state.piece = null
    usedHold = false
    const full = state.board.flatMap((row, y) => (row.every(Boolean) ? [y] : []))
    if (full.length) {
      state.flashRows = full
      flashTimer = 0.15
      state.lines += full.length
      state.score += (LINE_SCORES[Math.min(full.length, 4)] ?? 0) * state.level
      state.level = 1 + Math.floor(state.lines / 10)
    }
    if (!state.over) spawnNext()
    state.rev++
  }

  const move = (dx: number, dy: number) => {
    const piece = state.piece
    if (busy() || !piece) return false
    const moved = { ...piece, x: piece.x + dx, y: piece.y + dy }
    if (!fits(moved)) return false
    state.piece = moved
    state.rev++
    return true
  }

  // Rows rise from the bottom with one gap. Blocks pushed past the top end the game.
  const raise = (rows: number, hole: number) => {
    if (state.board.slice(0, rows).some((row) => row.some(Boolean))) state.over = true
    const junk = Array.from({ length: rows }, () =>
      Array.from({ length: W }, (_, x) => (x === hole ? 0 : GARBAGE)),
    )
    state.board = [...state.board.slice(rows), ...junk]
    const piece = state.piece
    if (piece && !fits(piece)) {
      // Lift the falling piece out of the way rather than bury it.
      let lifted = { ...piece }
      for (let i = 0; i < rows && !fits(lifted); i++) lifted = { ...lifted, y: lifted.y - 1 }
      if (fits(lifted)) state.piece = lifted
      else state.over = true
    }
    state.rev++
  }

  state.next = draw()
  spawnNext()

  return {
    state,
    fits,
    move,
    turn() {
      const piece = state.piece
      if (busy() || !piece) return
      const shape = rotate(piece.shape)
      for (const kick of [0, -1, 1, -2, 2]) {
        const turned = { ...piece, shape, x: piece.x + kick }
        if (fits(turned)) {
          state.piece = turned
          state.rev++
          return
        }
      }
    },
    /** One row down. Landed already: it locks, the way soft drop worked on the NES. */
    softDrop() {
      if (busy()) return
      if (move(0, 1)) {
        state.score += 1
        fallTimer = 0
      } else lock()
    },
    hardDrop() {
      if (busy()) return
      let dropped = 0
      while (move(0, 1)) dropped++
      state.score += dropped * 2
      lock()
    },
    /** Shift: put the piece aside, or swap it with the one already there. Once per piece. */
    hold() {
      const piece = state.piece
      if (busy() || !piece || usedHold) return
      const held = state.hold
      state.hold = piece.type
      if (held === null) spawnNext()
      else spawn(held)
      usedHold = true
      state.rev++
    },
    /** Queue garbage. It lands between pieces' moves, never in the middle of a line clear. */
    addGarbage(rows: number, hole: number) {
      pending.push({ rows, hole })
    },
    ghostY() {
      const piece = state.piece
      if (!piece) return 0
      let y = piece.y
      while (fits({ ...piece, y: y + 1 })) y++
      return y
    },
    step(dt: number) {
      if (state.over) return
      if (state.flashRows.length) {
        flashTimer -= dt
        if (flashTimer > 0) return
        state.board = state.board.filter((_, y) => !state.flashRows.includes(y))
        while (state.board.length < H) state.board.unshift(Array<number>(W).fill(0))
        state.flashRows = []
        state.rev++
      }
      while (pending.length && !state.over) {
        const g = pending.shift()
        if (g) raise(g.rows, g.hole)
      }
      if (state.over) return
      fallTimer += dt
      const interval = Math.max(0.08, 0.8 - (state.level - 1) * 0.07)
      if (fallTimer >= interval) {
        fallTimer = 0
        if (!move(0, 1)) lock()
      }
    },
    /** The board with the falling piece in it, one base-36 digit per cell, for opponents' views. */
    snapshot() {
      const rows = state.board.map((row) => [...row])
      if (state.piece) {
        for (const [x, y] of cells(state.piece)) {
          const row = rows[y]
          if (row && x >= 0 && x < W) row[x] = state.piece.type + 1
        }
      }
      return rows.map((row) => row.map((v) => v.toString(36)).join('')).join('')
    },
  }
}

// ---- held keys ----------------------------------------------------------------------------------
// The browser's own key repeat waits about half a second before it starts, which made sliding a
// piece across feel stuck. These keys ignore it and keep their own clock.

/** Seconds a side key is held before the piece starts sliding. */
const DAS = 0.15
/** Seconds between steps once it slides. */
const ARR = 0.04
/** Seconds between rows while ↓ is held. */
const SOFT_DROP = 0.03

const ACTIONS: Record<string, 'left' | 'right' | 'turn' | 'soft' | 'drop' | 'hold'> = {
  ArrowLeft: 'left',
  a: 'left',
  ArrowRight: 'right',
  d: 'right',
  ArrowUp: 'turn',
  w: 'turn',
  x: 'turn',
  ArrowDown: 'soft',
  s: 'soft',
  ' ': 'drop',
  Shift: 'hold',
  c: 'hold',
}

export function createControls(game: () => Tetris | null) {
  // Side keys in the order they went down. The last one wins, like holding ← then tapping →.
  let sides: ('left' | 'right')[] = []
  let slideTimer = 0
  let softHeld = false
  let softTimer = 0
  let softPiece = 0

  const actionOf = (key: string) => ACTIONS[key.length === 1 ? key.toLowerCase() : key]

  return {
    /** A key went down. Returns whether it's a Tetris key, so the page doesn't scroll. */
    press(key: string, repeat = false) {
      const action = actionOf(key)
      if (!action) return false
      const g = game()
      if (repeat || !g) return true
      switch (action) {
        case 'left':
        case 'right':
          sides = [...sides.filter((s) => s !== action), action]
          g.move(action === 'left' ? -1 : 1, 0)
          slideTimer = DAS
          break
        case 'soft':
          softHeld = true
          softPiece = g.state.spawned
          g.softDrop()
          softTimer = SOFT_DROP
          break
        case 'turn':
          g.turn()
          break
        case 'drop':
          g.hardDrop()
          break
        case 'hold':
          g.hold()
          break
      }
      return true
    },
    release(key: string) {
      const action = actionOf(key)
      if (action === 'left' || action === 'right') {
        const wasLast = sides.at(-1) === action
        sides = sides.filter((s) => s !== action)
        // Back to the other side key, still held: it waits out the delay again.
        if (wasLast) slideTimer = DAS
      }
      if (action === 'soft') softHeld = false
    },
    releaseAll() {
      sides = []
      softHeld = false
    },
    update(dt: number) {
      const g = game()
      if (!g) return
      const side = sides.at(-1)
      if (side) {
        slideTimer -= dt
        while (slideTimer <= 0) {
          if (!g.move(side === 'left' ? -1 : 1, 0)) {
            // Against a wall: slide on the moment there's room.
            slideTimer = 0
            break
          }
          slideTimer += ARR
        }
      }
      // A new piece doesn't inherit the soft drop: press ↓ again, so a held key can't sink it.
      if (softHeld && g.state.spawned === softPiece) {
        softTimer -= dt
        while (softTimer <= 0 && g.state.spawned === softPiece) {
          g.softDrop()
          softTimer += SOFT_DROP
        }
      }
    },
  }
}
