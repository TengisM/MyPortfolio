import { createArena, type Dir, DX, DY, keyToDir } from './tron-view'
import type { GameHud, HudLine, HudTone, StartGame } from './types'

// Offline Tron: you against bots, or two people on one keyboard. The rules and the bots live
// here; tron-view draws.

const reverse = (d: Dir) => ((d + 2) % 4) as Dir
const left = (d: Dir) => ((d + 3) % 4) as Dir
const right = (d: Dir) => ((d + 1) % 4) as Dir

type Control = 'solo' | 'p1' | 'p2' | 'bot'

type Rider = {
  name: string
  tone: HudTone
  control: Control
  /** How hard a bot steers at the nearest player. 0 just survives. */
  aggression: number
  /** Random jitter in a bot's choices, so bots don't all move alike. */
  wander: number
  x: number
  y: number
  dir: Dir
  queue: Dir[]
  alive: boolean
  wins: number
}

const COUNTDOWN = 2.4
const ROUND_PAUSE = 2.2
// Cells per second. Rounds start calm and speed up so they end.
const BASE_SPEED = 11
const MAX_EXTRA_SPEED = 7
// Flood fill stops counting here: past this a bot treats the space as "plenty".
const SPACE_CAP = 500

export const start: StartGame = (stage, onHud, options) => {
  const players = options?.players ?? 1

  // Arena size follows the screen's shape, so phones get a tall arena and desktops a wide one.
  const aspect = stage.clientWidth / Math.max(1, stage.clientHeight)
  const W = aspect >= 1 ? Math.min(64, Math.max(34, Math.round(34 * aspect))) : 30
  const H = aspect >= 1 ? 34 : Math.min(54, Math.max(30, Math.round(30 / aspect)))
  // Which rider is on each cell: 0 free, otherwise rider index + 1.
  const grid = new Uint8Array(W * H)
  const free = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && grid[y * W + x] === 0

  const SPAWNS: { x: number; y: number; dir: Dir }[] = [
    { x: 3, y: Math.floor(H / 2) - 2, dir: 1 },
    { x: W - 4, y: Math.floor(H / 2) + 1, dir: 3 },
    { x: Math.floor(W / 2) + 2, y: 2, dir: 2 },
    { x: Math.floor(W / 2) - 3, y: H - 3, dir: 0 },
  ]

  const ROSTER: Pick<Rider, 'name' | 'tone' | 'control' | 'aggression' | 'wander'>[] =
    players === 2
      ? [
          { name: 'p1', tone: 'primary', control: 'p1', aggression: 0, wander: 0 },
          { name: 'p2', tone: 'amber', control: 'p2', aggression: 0, wander: 0 },
          { name: 'bot-1', tone: 'pink', control: 'bot', aggression: 1.2, wander: 4 },
          { name: 'bot-2', tone: 'green', control: 'bot', aggression: 0.4, wander: 8 },
        ]
      : [
          { name: 'you', tone: 'primary', control: 'solo', aggression: 0, wander: 0 },
          { name: 'bot-1', tone: 'pink', control: 'bot', aggression: 1.4, wander: 4 },
          { name: 'bot-2', tone: 'amber', control: 'bot', aggression: 0.6, wander: 6 },
          { name: 'bot-3', tone: 'green', control: 'bot', aggression: 0.3, wander: 10 },
        ]

  const riders: Rider[] = ROSTER.map((r) => ({
    ...r,
    x: 0,
    y: 0,
    dir: 0,
    queue: [],
    alive: true,
    wins: 0,
  }))
  const humans = riders.filter((r) => r.control !== 'bot')

  // ---- game state -----------------------------------------------------------------------------
  type Phase = 'countdown' | 'running' | 'over'
  let phase: Phase = 'countdown'
  let phaseTimer = COUNTDOWN
  let round = 0
  let roundTime = 0
  let tickTimer = 0
  let paused = false
  let message = ''
  let goTimer = 0

  const pushHud = () => {
    const rows: HudLine[] = riders.map((r) => ({
      text: `██ ${r.name.padEnd(6)} ${String(r.wins).padStart(2)}${r.alive ? '' : '  ✗'}`,
      tone: r.tone,
    }))
    const hud: GameHud = {
      score: players === 2 ? round : (riders[0]?.wins ?? 0),
      label: players === 2 ? 'round' : 'rounds won',
      lines: [players === 2 ? 'wins' : `round ${round}`, ...rows],
      banner: message || undefined,
      over: false,
      paused,
    }
    onHud(hud)
  }

  const startRound = () => {
    round++
    grid.fill(0)
    riders.forEach((r, i) => {
      const spawn = SPAWNS[i] as (typeof SPAWNS)[number]
      Object.assign(r, { x: spawn.x, y: spawn.y, dir: spawn.dir, queue: [], alive: true })
      grid[r.y * W + r.x] = i + 1
    })
    arena.reset(riders.map((r, slot) => ({ slot, x: r.x, y: r.y, dir: r.dir })))
    phase = 'countdown'
    phaseTimer = COUNTDOWN
    roundTime = 0
    tickTimer = 0
    message = '3'
    pushHud()
  }

  const resetMatch = () => {
    for (const r of riders) r.wins = 0
    round = 0
    paused = false
    startRound()
  }

  // ---- bots -----------------------------------------------------------------------------------
  // Reused between calls: a visit stamp per cell and a BFS queue, so thinking allocates nothing.
  const seen = new Uint32Array(W * H)
  const bfs = new Int32Array(W * H)
  let stamp = 0

  /** How many free cells are reachable from (x, y), up to SPACE_CAP. */
  const space = (x: number, y: number) => {
    stamp++
    let head = 0
    let tail = 0
    bfs[tail++] = y * W + x
    seen[y * W + x] = stamp
    while (head < tail && tail < SPACE_CAP) {
      const c = bfs[head++] as number
      const cx = c % W
      const cy = (c - cx) / W
      for (let d = 0; d < 4; d++) {
        const nx = cx + (DX[d] as number)
        const ny = cy + (DY[d] as number)
        if (!free(nx, ny)) continue
        const n = ny * W + nx
        if (seen[n] === stamp) continue
        seen[n] = stamp
        bfs[tail++] = n
      }
    }
    return tail
  }

  const straightRun = (x: number, y: number, d: Dir) => {
    let n = 0
    while (n < 12 && free(x + DX[d] * (n + 1), y + DY[d] * (n + 1))) n++
    return n
  }

  /** Picks straight, left or right: most room first, then the cut-off, then a little noise. */
  const think = (r: Rider): Dir => {
    let best = r.dir
    let bestScore = -Infinity
    const target = humans
      .filter((h) => h.alive)
      .map((h) => ({ x: h.x + DX[h.dir] * 4, y: h.y + DY[h.dir] * 4 }))
      .sort(
        (a, b) =>
          Math.abs(a.x - r.x) + Math.abs(a.y - r.y) - Math.abs(b.x - r.x) - Math.abs(b.y - r.y),
      )[0]
    for (const d of [r.dir, left(r.dir), right(r.dir)]) {
      const nx = r.x + DX[d]
      const ny = r.y + DY[d]
      if (!free(nx, ny)) continue
      const room = space(nx, ny)
      let score = room * 2 + straightRun(nx, ny, d) + (d === r.dir ? 2 : 0)
      score += Math.random() * r.wander
      // A cell another rider could also enter next tick risks a head-on crash.
      for (const o of riders) {
        if (o === r || !o.alive) continue
        if (Math.abs(o.x - nx) + Math.abs(o.y - ny) === 1) score -= 40
      }
      // Hunt only with room to spare: being cut off yourself loses the round.
      if (target && room >= SPACE_CAP * 0.6) {
        score -= (Math.abs(target.x - nx) + Math.abs(target.y - ny)) * r.aggression
      }
      if (score > bestScore) {
        bestScore = score
        best = d
      }
    }
    return best
  }

  // ---- simulation -----------------------------------------------------------------------------
  const crash = (r: Rider) => {
    r.alive = false
    // The trail derezzes, which opens its cells back up.
    const id = riders.indexOf(r) + 1
    for (let i = 0; i < grid.length; i++) if (grid[i] === id) grid[i] = 0
    arena.crash(id - 1)
  }

  const tick = () => {
    for (const r of riders) {
      if (!r.alive) continue
      if (r.control === 'bot') r.dir = think(r)
      else {
        const next = r.queue.shift()
        if (next !== undefined && next !== reverse(r.dir)) r.dir = next
      }
    }
    const moving = riders.filter((r) => r.alive)
    const doomed = new Set<Rider>()
    for (const r of moving) {
      if (!free(r.x + DX[r.dir], r.y + DY[r.dir])) doomed.add(r)
    }
    // Two riders entering the same cell: head-on, both go.
    for (let i = 0; i < moving.length; i++) {
      for (let j = i + 1; j < moving.length; j++) {
        const a = moving[i] as Rider
        const b = moving[j] as Rider
        if (a.x + DX[a.dir] === b.x + DX[b.dir] && a.y + DY[a.dir] === b.y + DY[b.dir]) {
          doomed.add(a)
          doomed.add(b)
        }
      }
    }
    for (const r of moving) {
      if (doomed.has(r)) continue
      r.x += DX[r.dir]
      r.y += DY[r.dir]
      const slot = riders.indexOf(r)
      grid[r.y * W + r.x] = slot + 1
      arena.advance(slot, r.x, r.y, r.dir)
    }
    for (const r of doomed) crash(r)
    if (doomed.size) settle()
  }

  /** After a crash: decide whether the round is over and who took it. */
  const settle = () => {
    const alive = riders.filter((r) => r.alive)
    const humansAlive = humans.filter((r) => r.alive)
    let done = false
    if (alive.length <= 1) {
      done = true
      const winner = alive[0]
      if (winner) {
        winner.wins++
        message = winner.control === 'solo' ? 'you win the round' : `${winner.name} wins the round`
      } else message = 'draw'
    } else if (humansAlive.length === 0) {
      // Nobody left to play: don't make people watch the bots finish.
      done = true
      message = players === 2 ? 'both players derezzed' : 'you derezzed'
    }
    if (done) {
      phase = 'over'
      phaseTimer = ROUND_PAUSE
    }
    pushHud()
  }

  const steer = (r: Rider | undefined, d: Dir) => {
    if (!r?.alive || phase === 'over') return
    const last = r.queue[r.queue.length - 1] ?? r.dir
    if (d === last || d === reverse(last) || r.queue.length >= 3) return
    r.queue.push(d)
  }

  // ---- loop -----------------------------------------------------------------------------------
  const step = () => 1 / (BASE_SPEED + Math.min(MAX_EXTRA_SPEED, roundTime * 0.12))

  const frame = (dt: number): number | null => {
    if (paused) return null
    if (phase === 'countdown') {
      phaseTimer -= dt
      const shown = String(Math.ceil((phaseTimer / COUNTDOWN) * 3))
      if (phaseTimer <= 0) {
        phase = 'running'
        message = 'go'
        goTimer = 0.7
        pushHud()
      } else if (shown !== message) {
        message = shown
        pushHud()
      }
      return null
    }
    if (phase === 'over') {
      phaseTimer -= dt
      if (phaseTimer <= 0) startRound()
      return null
    }
    roundTime += dt
    if (goTimer > 0) {
      goTimer -= dt
      if (goTimer <= 0 && message === 'go') {
        message = ''
        pushHud()
      }
    }
    tickTimer += dt
    while (tickTimer >= step() && phase === 'running') {
      tickTimer -= step()
      tick()
    }
    return phase === 'running' ? Math.min(1, tickTimer / step()) : null
  }

  // Swipes steer the first player on touch screens.
  const arena = createArena(
    stage,
    W,
    H,
    riders.map((r) => r.tone),
    (d) => steer(humans[0], d),
    frame,
  )

  startRound()

  return {
    key(key) {
      const lower = key.length === 1 ? key.toLowerCase() : key
      const steering = keyToDir(key)
      if (steering) {
        if (players === 2) steer(riders[steering.wasd ? 0 : 1], steering.dir)
        else steer(riders[0], steering.dir)
        return true
      }
      if (lower === 'p') {
        paused = !paused
        pushHud()
        return true
      }
      if (lower === 'r') {
        resetMatch()
        return true
      }
      if ((key === ' ' || key === 'Enter') && phase === 'over') {
        startRound()
        return true
      }
      return key === ' '
    },
    summary() {
      const played = phase === 'over' ? round : round - 1
      if (players === 2) {
        return `tron exited. ${riders.map((r) => `${r.name} ${r.wins}`).join(', ')}.`
      }
      return `tron exited. you won ${riders[0]?.wins ?? 0} of ${Math.max(0, played)} rounds.`
    },
    dispose() {
      arena.dispose()
    },
  }
}
