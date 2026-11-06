import { clamp, wrap } from './race-math.ts'
import { LAPS, type Stats } from './race-rules.ts'
import {
  type Branch,
  frameAt,
  newFrame,
  ON_ROAD_UP,
  openingAt,
  PAD_HALF_WIDTH,
  PAD_LENGTH,
  SAMPLE,
  sampleIndex,
  shortWay,
  type Track,
  type TrackPath,
  widthAt,
} from './race-tracks.ts'

// Ship movement in track space: s metres along a path, x metres right of its centreline, y
// metres above the road. Boost, pads, walls, water, branches, jumps and laps all live here.
// Pure, with no three.js, so the lap script can drive a race under Node.

export const STEP = 1 / 120
export const SHIP_HALF_WIDTH = 1.2

export type Input = {
  steer: number /* -1..1, + is right */
  throttle: boolean
  brake: boolean
  boost: boolean
}
export type Tuning = {
  accel: number // m/s² under throttle
  top: number // m/s with throttle held and no boost
  turn: number // rad/s at full steer
  grip: number // share of the speed cap kept at full steer
  boostMul: number // speed cap multiplier while boosting
  kick: number // m/s added to the speed cap while a pad kick lasts
}
export type ShipState = {
  path: number
  s: number
  x: number
  y: number
  yaw: number // heading relative to the path tangent, + is right
  speed: number // m/s along the heading
  meter: number // 0..1
  boosting: boolean
  kickLeft: number // seconds of pad kick left
  launch: boolean // touched a launch pad since the last gap
  air: { from: number; to: number } | null // main metres of the gap being jumped
  lastPad: number // index of the pad under the ship or -1, so one pass counts once
  lap: number // laps finished
  next: number // index of the next checkpoint
  time: number // ms since go
  lapStart: number // ms when this lap started
  laps: number[] // ms per finished lap
  finished: boolean
}
export type StepEvents = {
  lap?: { n: number; ms: number; delta: number | null }
  pad?: boolean
  wall?: number
  landed?: boolean
  finished?: boolean
}
export type Ghost = Pick<ShipState, 'path' | 's' | 'x' | 'y' | 'speed'>

export const PHYS = {
  boostSeconds: 10, // a full meter lasts this long
  refillSeconds: 18, // empty to full with no pads
  padMeter: 0.2,
  kickSeconds: 1.5,
  waterTop: 0.85,
  wallLoss: 0.8, // share of speed a square hit costs
  brake: 40, // m/s²
  drag: 1.5, // 1/s: how fast speed above the cap bleeds off
  gravity: 6, // m/s² along a slope
}

// Speed lost per second with nothing held, as a rate.
const COAST = 0.3
// Boosting and pad kicks push this many times harder than throttle.
const THRUST_MUL = 2
// Meter needed to start boosting, so holding boost on an empty meter doesn't flicker.
const BOOST_START = 0.05
const MAX_FRAME = 0.1
const JUMP_HEIGHT = 8
// On a tight turn's inside a step covers more centreline; this caps the stretch.
export const MIN_STRETCH = 0.3
const BUMP_LENGTH = 4
// Speed lost behind, gained ahead, per 60 Hz frame of contact. dt scales them, so a second of
// contact costs the same at any frame rate.
const BEHIND_LOSS = 0.03
const AHEAD_GAIN = 0.02
const BUMP_HZ = 60
// Grid slots: two abreast, rows this far apart, the front row this far past the line.
const GRID_FRONT = 12
const GRID_ROW = 8
const GRID_X = 3

// Stat 1 maps to the first number, 5 to the second, 3 to the middle.
const RANGES: Record<keyof Tuning, [number, number]> = {
  accel: [10, 26],
  top: [66, 74],
  turn: [1.35, 1.85],
  grip: [0.8, 0.96],
  boostMul: [1.42, 1.58],
  kick: [6, 30],
}

/** a mod n in [0, n). */
const wrapAngle = (a: number) => wrap(a + Math.PI, 2 * Math.PI) - Math.PI

export function tuning(stats: Stats): Tuning {
  const at = (k: keyof Tuning, n: number) => {
    const [lo, hi] = RANGES[k]
    return lo + ((n - 1) / 4) * (hi - lo)
  }
  return {
    accel: at('accel', stats.accel),
    top: at('top', stats.top),
    turn: at('turn', stats.handling),
    grip: at('grip', stats.handling),
    boostMul: at('boostMul', stats.boost),
    kick: at('kick', stats.boost),
  }
}

export function createShip(track: Track, grid: number): ShipState {
  const row = Math.floor(grid / 2)
  return {
    path: 0,
    s: wrap(GRID_FRONT - row * GRID_ROW, mainOf(track).length),
    x: grid % 2 === 0 ? -GRID_X : GRID_X,
    y: 0,
    yaw: 0,
    speed: 0,
    meter: 1,
    boosting: false,
    kickLeft: 0,
    launch: false,
    air: null,
    lastPad: -1,
    lap: 0,
    next: 0,
    time: 0,
    lapStart: 0,
    laps: [],
    finished: false,
  }
}

function mainOf(track: Track): TrackPath {
  const main = track.paths[0]
  if (!main) throw new Error(`${track.id}: no main path`)
  return main
}

function pathOf(track: Track, i: number): TrackPath {
  const path = track.paths[i]
  if (!path) throw new Error(`${track.id}: no path ${i}`)
  return path
}

function branchOf(track: Track, path: number): Branch {
  const b = track.branches.find((x) => x.path === path)
  if (!b) throw new Error(`${track.id}: path ${path} is no branch`)
  return b
}

const fa = newFrame()
const fb = newFrame()

/** How far right of a's tangent at sa b's tangent at sb points. Keeps the world heading on a path change. */
function turnBetween(a: TrackPath, sa: number, b: TrackPath, sb: number): number {
  frameAt(a, sa, fa)
  frameAt(b, sb, fb)
  const t = fb.t
  return Math.atan2(
    t[0] * fa.r[0] + t[1] * fa.r[1] + t[2] * fa.r[2],
    t[0] * fa.t[0] + t[1] * fa.t[1] + t[2] * fa.t[2],
  )
}

/**
 * How far right of path's centre at s the ship is now, kept inside that road's walls, so
 * changing path doesn't move it.
 */
function across(track: Track, st: ShipState, path: number, s: number): number {
  frameAt(pathOf(track, st.path), st.s, fa)
  const to = pathOf(track, path)
  frameAt(to, s, fb)
  let x = 0
  for (let k = 0; k < 3; k++) {
    const at = (fa.p[k] as number) + (fa.r[k] as number) * st.x + (fa.n[k] as number) * st.y
    x += (at - (fb.p[k] as number)) * (fb.r[k] as number)
  }
  const limit = widthAt(to, s) / 2 - SHIP_HALF_WIDTH
  return clamp(x, -limit, limit)
}

function moveTo(track: Track, st: ShipState, path: number, s: number, x: number) {
  const from = pathOf(track, st.path)
  const to = pathOf(track, path)
  st.yaw = wrapAngle(st.yaw - turnBetween(from, st.s, to, s))
  st.path = path
  st.s = s
  st.x = x
}

/** Where the main road resumes after the gap that starts at a drop branch's from. */
function gapEnd(main: TrackPath, from: number): number {
  const count = main.gap.length
  let i = sampleIndex(main, from)
  let k = 0
  // The nearest sample can sit just before the gap.
  while (k < 3 && !main.gap[i]) {
    i = (i + 1) % count
    k++
  }
  if (!main.gap[i]) return from
  while (main.gap[i] && k < count) {
    i = (i + 1) % count
    k++
  }
  return i * SAMPLE
}

/**
 * Counts checkpoints and the line passed going forward on main from a to b (unwrapped metres,
 * a < b). Only the next checkpoint in order counts, and the line counts once they're all done.
 */
function crossings(
  track: Track,
  st: ShipState,
  a: number,
  b: number,
  msAt: (pos: number) => number,
  ev: StepEvents,
) {
  const length = mainOf(track).length
  const cps = track.checkpoints
  let at = a
  while (!st.finished) {
    const target = st.next < cps.length ? (cps[st.next] as number) : 0
    let pos = target + Math.floor(at / length) * length
    if (pos <= at) pos += length
    if (pos > b) return
    at = pos
    if (st.next < cps.length) {
      st.next++
      continue
    }
    const end = Math.round(msAt(pos))
    const ms = end - st.lapStart
    const prev = st.laps.at(-1)
    st.laps.push(ms)
    st.lap++
    st.lapStart = end
    st.next = 0
    ev.lap = { n: st.lap, ms, delta: prev === undefined ? null : ms - prev }
    if (st.lap >= LAPS) {
      st.finished = true
      ev.finished = true
    }
  }
}

function moveAlong(
  track: Track,
  st: ShipState,
  ds: number,
  before: number,
  dt: number,
  ev: StepEvents,
) {
  const main = mainOf(track)
  const length = main.length
  if (st.path === 0) {
    const a = st.s
    const b = st.s + ds
    st.s = wrap(b, length)
    if (ds > 0) {
      crossings(track, st, a, b, (pos) => before + ((pos - a) / ds) * dt * 1000, ev)
      if (st.air) return
      for (const branch of track.branches) {
        if (branch.kind !== 'drop' || wrap(branch.from - a, length) >= ds) continue
        if (st.launch) {
          st.air = { from: branch.from, to: gapEnd(main, branch.from) }
        } else {
          moveTo(track, st, branch.path, 0, across(track, st, branch.path, 0))
        }
        return
      }
    }
    if (!st.air) underGap(track, st)
    return
  }

  const path = pathOf(track, st.path)
  const branch = branchOf(track, st.path)
  st.s += ds
  if (st.s >= path.length) {
    st.s = path.length
    moveTo(track, st, 0, branch.to, across(track, st, 0, branch.to))
    // The branch stands in for main from its from to its to, start line included.
    const span = wrap(branch.to - branch.from, length)
    crossings(track, st, branch.from, branch.from + span, () => before + dt * 1000, ev)
  } else if (st.s < 0) {
    st.s = 0
    moveTo(track, st, 0, branch.from, across(track, st, 0, branch.from))
  }
}

/**
 * A grounded ship on main over a gap, which it can only reach going the wrong way past the far
 * lip, goes down onto the lower road beneath at the same distance along.
 */
function underGap(track: Track, st: ShipState) {
  const main = mainOf(track)
  for (const branch of track.branches) {
    if (branch.kind !== 'drop') continue
    const into = wrap(st.s - branch.from, main.length)
    const span = wrap(branch.to - branch.from, main.length)
    if (into >= span || into >= wrap(gapEnd(main, branch.from) - branch.from, main.length)) continue
    const s = (into / span) * pathOf(track, branch.path).length
    moveTo(track, st, branch.path, s, across(track, st, branch.path, s))
    return
  }
}

/**
 * A ship on a branch, past its edge facing main over the branch's open or close metres: no wall
 * there, and across the edge it's back on main. True when there's no wall. A lower road has only
 * a close, where it rises into main beside main's road.
 */
function slipway(track: Track, st: ShipState, side: number, width: number): boolean {
  const branch = branchOf(track, st.path)
  if (st.air || side !== -branch.side) return false
  const own = pathOf(track, st.path)
  const entrance = st.s < branch.open
  if (!entrance && st.s <= own.length - branch.close) return false
  if (st.x * side > width / 2) {
    const s = entrance ? branch.from + st.s : branch.to - (own.length - st.s)
    // A lower road climbs into main at a slant, so its metres run a little off main's.
    const at = branch.kind === 'drop' ? alongMain(track, st, s) : wrap(s, mainOf(track).length)
    moveTo(track, st, 0, at, across(track, st, 0, at))
  }
  return true
}

/**
 * A shortcut often starts on main's own outer lanes and peels away. A ship on main that reaches
 * the end of the opening on the shortcut's road, past its edge facing main, goes onto the
 * shortcut: it drove into the shortcut's lane, and main's wall comes back between the two here.
 * A ship still in main's lanes stays on main.
 */
function split(track: Track, st: ShipState) {
  if (st.path !== 0 || st.air) return
  const main = mainOf(track)
  for (const b of track.branches) {
    if (b.kind !== 'shortcut') continue
    const into = wrap(st.s - b.from, main.length)
    if (into < b.open - 1 || into > b.fork) continue
    const own = pathOf(track, b.path)
    const s = clamp(into, 0, own.length)
    frameAt(main, st.s, fa)
    frameAt(own, s, fb)
    let x = 0
    let up = 0
    for (let k = 0; k < 3; k++) {
      const d =
        (fa.p[k] as number) +
        (fa.r[k] as number) * st.x +
        (fa.n[k] as number) * st.y -
        (fb.p[k] as number)
      x += d * (fb.r[k] as number)
      up += d * (fb.n[k] as number)
    }
    if (Math.abs(x) >= widthAt(own, s) / 2 || Math.abs(up) > ON_ROAD_UP) continue
    moveTo(track, st, b.path, s, across(track, st, b.path, s))
    return
  }
}

/** Main metres level with the ship, from a guess near them: the guess moved along main's tangent. */
function alongMain(track: Track, st: ShipState, guess: number): number {
  const main = mainOf(track)
  const at = wrap(guess, main.length)
  frameAt(pathOf(track, st.path), st.s, fa)
  frameAt(main, at, fb)
  let ds = 0
  for (let k = 0; k < 3; k++) {
    const p = (fa.p[k] as number) + (fa.r[k] as number) * st.x + (fa.n[k] as number) * st.y
    ds += (p - (fb.p[k] as number)) * (fb.t[k] as number)
  }
  return wrap(at + ds, main.length)
}

function walls(track: Track, st: ShipState, ev: StepEvents) {
  const path = pathOf(track, st.path)
  const width = widthAt(path, st.s)
  const limit = width / 2 - SHIP_HALF_WIDTH
  if (Math.abs(st.x) <= limit) return
  const side = st.x > 0 ? 1 : -1
  if (st.path === 0 && !st.air) {
    const open = openingAt(track, st.s, side)
    if (open) {
      if (st.x * side > width / 2) {
        // Start as far down the branch as the ship has come past from, so it doesn't jump back,
        // or in an exit opening as far before the branch's end as the ship is before to.
        const inner = pathOf(track, open.path)
        const length = mainOf(track).length
        const into = wrap(st.s - open.from, length)
        const along = into < open.fork ? into : inner.length - wrap(open.to - st.s, length)
        const s = clamp(along, 0, inner.length)
        moveTo(track, st, open.path, s, across(track, st, open.path, s))
      }
      return
    }
  }
  if (st.path !== 0 && slipway(track, st, side, width)) return
  st.x = side * limit
  // Over a gap the road's edge still holds the ship, but there's no wall to hit.
  if (st.air) return
  const into = Math.sin(st.yaw) * side
  if (into <= 0) return
  const loss = PHYS.wallLoss * into
  st.speed *= 1 - loss
  st.yaw = Math.cos(st.yaw) >= 0 ? 0 : Math.PI
  ev.wall = Math.max(ev.wall ?? 0, loss)
}

function pads(track: Track, st: ShipState, ev: StepEvents) {
  const path = pathOf(track, st.path)
  let hit = -1
  for (let i = 0; i < track.pads.length; i++) {
    const pad = track.pads[i]
    if (!pad || pad.path !== st.path) continue
    const ds = shortWay(path, st.s - pad.s)
    if (Math.abs(ds) < PAD_LENGTH / 2 && Math.abs(st.x - pad.x) < PAD_HALF_WIDTH) {
      hit = i
      break
    }
  }
  if (hit >= 0 && hit !== st.lastPad) {
    st.meter = Math.min(1, st.meter + PHYS.padMeter)
    st.kickLeft = PHYS.kickSeconds
    if (track.pads[hit]?.launch) st.launch = true
    ev.pad = true
  }
  st.lastPad = hit
}

function fly(track: Track, st: ShipState, ev: StepEvents) {
  if (!st.air) return
  const length = mainOf(track).length
  const u = wrap(st.s - st.air.from, length) / Math.max(wrap(st.air.to - st.air.from, length), 1e-6)
  if (u >= 1) {
    st.y = 0
    st.air = null
    st.launch = false
    ev.landed = true
    return
  }
  st.y = 4 * JUMP_HEIGHT * u * (1 - u)
}

export function stepShip(
  track: Track,
  t: Tuning,
  st: ShipState,
  input: Input,
  dt: number,
): StepEvents {
  const ev: StepEvents = {}
  const before = st.time
  st.time += dt * 1000

  st.boosting = input.boost && st.meter > 0 && (st.boosting || st.meter >= BOOST_START)
  if (st.boosting) st.meter = Math.max(0, st.meter - dt / PHYS.boostSeconds)
  else st.meter = Math.min(1, st.meter + dt / PHYS.refillSeconds)
  st.kickLeft = Math.max(0, st.kickLeft - dt)
  const kicking = st.kickLeft > 0

  const path = pathOf(track, st.path)
  const i = sampleIndex(path, st.s)
  const grounded = st.air === null
  const steer = clamp(input.steer, -1, 1)
  let cap = t.top * (st.boosting ? t.boostMul : 1) + (kicking ? t.kick : 0)
  if (grounded && path.water[i]) cap *= PHYS.waterTop
  cap *= 1 - (1 - t.grip) * Math.abs(steer)

  if (input.brake) {
    st.speed = Math.max(0, st.speed - PHYS.brake * dt)
  } else if (input.throttle || st.boosting || kicking) {
    const thrust = t.accel * (st.boosting || kicking ? THRUST_MUL : 1)
    if (st.speed < cap) st.speed = Math.min(cap, st.speed + thrust * dt)
  } else {
    st.speed *= Math.exp(-COAST * dt)
  }
  if (st.speed > cap) st.speed = cap + (st.speed - cap) * Math.exp(-PHYS.drag * dt)
  if (grounded) {
    const cos = Math.cos(st.yaw)
    const sin = Math.sin(st.yaw)
    const climb = (path.t[i * 3 + 2] ?? 0) * cos + (path.r[i * 3 + 2] ?? 0) * sin
    st.speed = Math.max(0, st.speed - PHYS.gravity * climb * dt)
  }

  st.yaw += steer * t.turn * dt
  const curve = path.curve[i] ?? 0
  const ds = (st.speed * Math.cos(st.yaw) * dt) / Math.max(MIN_STRETCH, 1 - curve * st.x)
  st.x += st.speed * Math.sin(st.yaw) * dt
  st.yaw = wrapAngle(st.yaw - curve * ds)

  moveAlong(track, st, ds, before, dt, ev)
  split(track, st)
  walls(track, st, ev)
  if (!st.air) pads(track, st, ev)
  fly(track, st, ev)
  return ev
}

function merge(into: StepEvents, ev: StepEvents) {
  if (ev.lap) into.lap = ev.lap
  if (ev.pad) into.pad = true
  if (ev.wall !== undefined) into.wall = Math.max(into.wall ?? 0, ev.wall)
  if (ev.landed) into.landed = true
  if (ev.finished) into.finished = true
}

/** Runs fixed STEPs for one frame. Clamps frameDt to 0.1 s. Returns the leftover for next frame and merged events. */
export function advance(
  track: Track,
  t: Tuning,
  st: ShipState,
  input: Input,
  frameDt: number,
  carry: number,
): { carry: number; events: StepEvents } {
  const events: StepEvents = {}
  let left = carry + clamp(frameDt, 0, MAX_FRAME)
  // The epsilon keeps 0.1 s at 12 steps despite rounding.
  while (left >= STEP - 1e-9) {
    left -= STEP
    merge(events, stepShip(track, t, st, input, STEP))
  }
  return { carry: Math.max(0, left), events }
}

/**
 * Pushes own sideways off other when they overlap on the same path. Only own changes: each
 * client bumps its own ship against the others it draws.
 */
export function bump(track: Track, own: ShipState, other: Ghost, dt = 1 / BUMP_HZ): boolean {
  if (own.path !== other.path) return false
  const path = pathOf(track, own.path)
  const ds = shortWay(path, other.s - own.s)
  const dx = own.x - other.x
  const reach = 2 * SHIP_HALF_WIDTH
  if (Math.abs(ds) >= BUMP_LENGTH || Math.abs(dx) >= reach) return false
  const away = dx !== 0 ? Math.sign(dx) : ds > 0 ? -1 : 1
  const limit = widthAt(path, own.s) / 2 - SHIP_HALF_WIDTH
  own.x = clamp(other.x + away * reach, -limit, limit)
  const frames = Math.min(dt, MAX_FRAME) * BUMP_HZ
  if (ds > 0) own.speed *= (1 - BEHIND_LOSS) ** frames
  else if (ds < 0) own.speed *= (1 + AHEAD_GAIN) ** frames
  return true
}

/** Metres along main. A branch maps its length onto main's span from its from to its to. */
function mainDistance(track: Track, st: Pick<ShipState, 'path' | 's'>): number {
  if (st.path === 0) return st.s
  const length = mainOf(track).length
  const branch = branchOf(track, st.path)
  const span = wrap(branch.to - branch.from, length)
  const own = pathOf(track, st.path).length
  return branch.from + (clamp(st.s, 0, own) / own) * span
}

export function progress(
  track: Track,
  st: Pick<ShipState, 'path' | 's' | 'lap' | 'next' | 'finished'>,
): number {
  const length = mainOf(track).length
  // Finished ships stop counting checkpoints, so next no longer says where they are.
  if (st.finished) return st.lap * length
  let d = mainDistance(track, st)
  // A ship can't be past the checkpoint it still owes, so past it means behind the line.
  const owed = track.checkpoints[st.next]
  if (owed !== undefined && d > owed) d -= length
  return st.lap * length + d
}
