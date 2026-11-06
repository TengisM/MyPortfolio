import { clamp, wrap } from './race-math.ts'
import {
  createShip,
  type Input,
  PHYS,
  type ShipState,
  STEP,
  stepShip,
  type Tuning,
  tuning,
} from './race-physics.ts'
import {
  formatTime,
  LAPS,
  SHIP_ORDER,
  SHIPS,
  type ShipId,
  TRACK_ORDER,
  type TrackId,
} from './race-rules.ts'
import { TRACKS } from './race-track-defs.ts'
import {
  type Branch,
  dot,
  frameAt,
  PAD_HALF_WIDTH,
  PAD_LENGTH,
  type Pad,
  SAMPLE,
  sampleIndex,
  type Track,
  type TrackPath,
  widthAt,
} from './race-tracks.ts'

// A driver for the lap script and the tests. It follows a racing line that hugs the inside of
// turns and brakes for turns it can't hold. With 'smart' driving it boosts on open road and runs
// over pads, and with shortcuts on it takes every shortcut. Throttle-only driving steers around
// every pad, so it takes the lower road at every gap.

export type Driving = {
  boost: 'never' | 'smart'
  shortcuts: boolean
  /** Steer around launch pads and take the lower road at every gap. */
  avoidLaunch?: boolean
}

// Metres behind and ahead of a sample whose curvature sets the racing line there.
const LINE_BEHIND = 20
const LINE_AHEAD = 60
// Metres the line moves to the inside per unit of curvature, before the walls clamp it.
const LINE_GAIN = 1500
// How close the line comes to a wall.
const LINE_MARGIN = 3
// Metres either side a speed limit averages curvature over. The spline's curvature spikes for a
// few metres where a turn meets a straight or another turn, and a ship rides through those.
const CURVE_SPAN = 6
// Share of the turn rate the driver plans to use, and of the brakes.
const TURN_USE = 0.85
const BRAKE_USE = 0.6
// Road ahead that has to take a boosted ship at full speed before boost goes on.
const BOOST_AHEAD = 150
// Meter kept back until the last lap, and the margin above it needed to start boosting again.
const RESERVE = 0.2
const RESTART = 0.05
// Lateral speed per metre off the target, steer per radian off the wanted heading, and the
// widest heading the driver takes to change lanes.
const PULL = 1.2
const YAW_GAIN = 3
const MAX_YAW = 0.4
// Seconds ahead the driver reads the racing line.
const LOOK = 0.3
// Fewest and most radians the ship turns out of main into a shortcut, and metres inside main's
// edge it waits before turning in.
const ENTRY_YAW: [number, number] = [0.15, 0.5]
const WAIT_GAP = 1.5
// How far a driver not taking a shortcut keeps inside the line marking the shortcut's lane.
const LANE_GAP = 2
// Seconds of road ahead in which a pad or a shortcut entrance pulls the ship over.
const REACH = 2.5
// How far off a pad's centre the driver passes one it doesn't want.
const PAD_CLEAR = PAD_HALF_WIDTH + 1.5
// Metres per second over the limit before the driver brakes.
const OVER = 0.5
const RACE_LIMIT = 10 * 60

type Plan = {
  entry: number // heading off main, + right, that lines a ship up with this branch
  line: Float32Array // target x per sample
  vlim: Float32Array // fastest the ship may go at each sample and still slow for what's ahead
  open: Float32Array // the lowest speed limit over the next BOOST_AHEAD metres
}

/** Sample i on a path, wrapped when closed and clamped when open. */
function at(path: TrackPath, i: number): number {
  const n = path.width.length
  return path.closed ? wrap(i, n) : clamp(i, 0, n - 1)
}

function racingLine(path: TrackPath): Float32Array {
  const n = path.width.length
  const line = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let sum = 0
    for (let k = -LINE_BEHIND; k <= LINE_AHEAD; k++) sum += path.curve[at(path, i + k)] ?? 0
    const room = Math.max(0, (path.width[i] ?? 0) / 2 - LINE_MARGIN)
    line[i] = clamp((sum / (LINE_BEHIND + LINE_AHEAD + 1)) * LINE_GAIN, -room, room)
  }
  return line
}

/** The fastest a ship that turns at turn rad/s can hold the line at each sample. */
function speeds(path: TrackPath, line: Float32Array, turn: number): Float32Array {
  const n = path.width.length
  const vmax = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let c = 0
    for (let k = -CURVE_SPAN; k <= CURVE_SPAN; k++) c += path.curve[at(path, i + k)] ?? 0
    c /= 2 * CURVE_SPAN + 1
    // On the line the ship's own path bends by c / (1 − c·x).
    const bend = Math.abs(c) / Math.max(0.3, 1 - c * (line[i] ?? 0))
    vmax[i] = bend > 1e-6 ? (TURN_USE * turn) / bend : 1e6
  }
  return vmax
}

/** Backward pass: the speed at each sample from which braking still meets every later limit. */
function reachable(path: TrackPath, vmax: Float32Array, tail: number): Float32Array {
  const n = path.width.length
  const vlim = new Float32Array(n)
  const a = 2 * PHYS.brake * BRAKE_USE * SAMPLE
  let next = path.closed ? (vmax[0] ?? 0) : tail
  // A closed path goes round twice so the limits carry across the seam.
  for (let r = path.closed ? 2 : 1; r > 0; r--) {
    for (let i = n - 1; i >= 0; i--) {
      next = Math.min(vmax[i] ?? 0, Math.sqrt(next * next + a))
      vlim[i] = next
    }
  }
  return vlim
}

/** The lowest vmax over the next BOOST_AHEAD metres. after(k) reads k metres past an open end. */
function lowestAhead(path: TrackPath, vmax: Float32Array, after: (k: number) => number) {
  const n = path.width.length
  const open = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let low = Infinity
    for (let j = i; j < i + BOOST_AHEAD; j++) {
      low = Math.min(low, path.closed || j < n ? (vmax[at(path, j)] ?? 0) : after(j - n))
    }
    open[i] = low
  }
  return open
}

const plans = new WeakMap<Track, Map<number, Plan[]>>()

/** Lines and speed limits for every path, for a ship that turns at turn rad/s. */
function plan(track: Track, turn: number): Plan[] {
  let byTurn = plans.get(track)
  if (!byTurn) {
    byTurn = new Map()
    plans.set(track, byTurn)
  }
  const cached = byTurn.get(turn)
  if (cached) return cached

  const main = track.paths[0] as TrackPath
  const mainLine = racingLine(main)
  const mainMax = speeds(main, mainLine, turn)
  const mainLim = reachable(main, mainMax, 0)
  const out: Plan[] = [
    {
      entry: 0,
      line: mainLine,
      vlim: mainLim,
      open: lowestAhead(main, mainMax, () => 0),
    },
  ]
  for (let k = 1; k < track.paths.length; k++) {
    const path = track.paths[k] as TrackPath
    const branch = track.branches.find((b) => b.path === k)
    // Past its end a branch carries on along main from its to.
    const to = branch ? sampleIndex(main, branch.to) : 0
    const line = racingLine(path)
    const vmax = speeds(path, line, turn)
    let entry = 0
    if (branch) {
      // Measured halfway through the opening, where ships usually cross.
      const m = frameAt(main, branch.from + branch.open / 2)
      const t = frameAt(path, branch.open / 2).t
      const off = Math.atan2(dot(t, m.r), dot(t, m.t)) * branch.side
      // Steep enough to cover the last WAIT_GAP metres to main's edge in the first half of a
      // short opening.
      const steep = Math.atan((2 * WAIT_GAP) / Math.max(branch.open, 1))
      entry = branch.side * clamp(Math.max(off, steep), ENTRY_YAW[0], ENTRY_YAW[1])
    }
    out.push({
      entry,
      line,
      vlim: reachable(path, vmax, mainLim[to] ?? 0),
      open: lowestAhead(path, vmax, (j) => mainMax[at(main, to + j)] ?? 0),
    })
  }
  byTurn.set(turn, out)
  return out
}

/** Whether main's s lies between a branch's from and to. */
const lanes = new WeakMap<Branch, number>()

/**
 * Where a shortcut's edge facing main crosses main's road when its opening ends, as metres right
 * of main's centre. Right of it, for a shortcut on the right, is the shortcut's lane.
 */
function laneEdge(track: Track, b: Branch): number {
  const known = lanes.get(b)
  if (known !== undefined) return known
  const main = track.paths[0] as TrackPath
  const own = track.paths[b.path] as TrackPath
  const s = Math.min(b.fork, own.length)
  const f = frameAt(own, s)
  const half = widthAt(own, s) / 2
  const edge = [0, 1, 2].map((k) => (f.p[k] as number) - b.side * half * (f.r[k] as number))
  const m = frameAt(main, wrap(b.from + s, main.length))
  let x = 0
  for (let k = 0; k < 3; k++) x += ((edge[k] as number) - (m.p[k] as number)) * (m.r[k] as number)
  // A shortcut that starts beyond main's edge leaves main's lanes alone.
  const limit = widthAt(main, b.from + s) / 2
  const lane = b.side > 0 ? Math.min(x, limit) : Math.max(x, -limit)
  lanes.set(b, lane)
  return lane
}

function within(track: Track, b: Branch, s: number): boolean {
  const length = (track.paths[0] as TrackPath).length
  return wrap(s - b.from, length) < wrap(b.to - b.from, length)
}

/** Steering, throttle, brake and boost for one step. */
export function autopilot(track: Track, t: Tuning, st: ShipState, how: Driving): Input {
  const plans = plan(track, t.turn)
  const main = track.paths[0] as TrackPath
  const path = track.paths[st.path] as TrackPath
  const own = plans[st.path] as Plan
  const i = sampleIndex(path, st.s)
  const half = (path.width[i] ?? 0) / 2
  const ahead = Math.max(st.speed, 20) * REACH
  let target = own.line[at(path, i + Math.round(st.speed * LOOK))] ?? 0
  let limit = own.vlim[at(path, i + 1)] ?? 0
  let entering: Plan | null = null

  if (how.shortcuts && st.path === 0) {
    for (const b of track.branches) {
      if (b.kind !== 'shortcut') continue
      const before = wrap(b.from - st.s, main.length)
      const into = wrap(st.s - b.from, main.length)
      const inner = plans[b.path] as Plan
      // Turning to the entry heading takes this long, and drifts this far sideways. The heading
      // loop closes the last of the turn with a time constant of 1 / (YAW_GAIN · turn).
      const ramp = (Math.abs(inner.entry) + 1 / YAW_GAIN) / t.turn
      const drift = (st.speed * Math.abs(inner.entry) * ramp) / 2
      if (into < b.open - 2 || before < st.speed * ramp - b.open / 2) {
        entering = inner
        limit = Math.min(limit, inner.vlim[into < b.open ? Math.round(into) : 0] ?? 0)
      } else if (before < ahead) {
        // Wait close to the edge, with room left to turn in without touching the wall.
        target = b.side * (half - WAIT_GAP - drift)
        const v = inner.vlim[0] ?? 0
        limit = Math.min(limit, Math.sqrt(v * v + 2 * PHYS.brake * BRAKE_USE * before))
      } else continue
      break
    }
  }

  const dropping = how.boost === 'never' || how.avoidLaunch === true
  if (dropping && st.path === 0 && !st.air) {
    // Slow in time for the lower roads ahead.
    for (const b of track.branches) {
      if (b.kind !== 'drop') continue
      const v = (plans[b.path] as Plan).vlim[0] ?? 0
      const before = wrap(b.from - st.s, main.length)
      limit = Math.min(limit, Math.sqrt(v * v + 2 * PHYS.brake * BRAKE_USE * before))
    }
  }

  const takes = (b: Branch) => (b.kind === 'shortcut' ? how.shortcuts : dropping)
  const wants = (pad: Pad) => how.boost === 'smart' && !(pad.launch && dropping)
  let nearest = Infinity
  let seek: number | null = null
  const avoid: number[] = []
  for (const pad of track.pads) {
    if (pad.path !== st.path) continue
    const d = path.closed ? wrap(pad.s - st.s, path.length) : pad.s - st.s
    if (d < -1 - PAD_LENGTH / 2 || d > ahead) continue
    // A main pad inside the span of a branch the driver takes is never under it.
    if (st.path === 0 && track.branches.some((b) => takes(b) && within(track, b, pad.s))) continue
    if (!wants(pad)) avoid.push(pad.x)
    else if (!entering && d > 1 - PAD_LENGTH / 2 && d < nearest) {
      nearest = d
      seek = pad.x
    }
  }
  if (seek !== null) target = seek
  target = clamp(target, 2 - half, half - 2)
  for (const x of avoid) {
    if (Math.abs(target - x) >= PAD_CLEAR) continue
    // Pass on the side the ship is already on, unless the wall is in the way.
    const from = Math.abs(st.x - x) > 1 ? st.x : target
    const side = from >= x ? 1 : -1
    target =
      Math.abs(x + side * PAD_CLEAR) <= half - 2 ? x + side * PAD_CLEAR : x - side * PAD_CLEAR
  }

  if (!how.shortcuts && st.path === 0) {
    // Stay in main's lanes past a shortcut that starts on them: in its lane when the opening
    // ends is on the shortcut.
    for (const b of track.branches) {
      if (b.kind !== 'shortcut') continue
      const into = wrap(st.s - b.from, main.length)
      if (into > b.fork + 10 && wrap(b.from - st.s, main.length) > ahead) continue
      const edge = laneEdge(track, b)
      target = b.side > 0 ? Math.min(target, edge - LANE_GAP) : Math.max(target, edge + LANE_GAP)
    }
  }

  const c = path.curve[i] ?? 0
  const lateral = clamp(PULL * (target - st.x), -st.speed, st.speed)
  const want = entering
    ? entering.entry
    : Math.asin(clamp(lateral / Math.max(st.speed, 5), -MAX_YAW, MAX_YAW))
  // The steer that holds the heading against the road turning underneath.
  const hold = (c * st.speed * Math.cos(st.yaw)) / Math.max(0.3, 1 - c * st.x) / t.turn
  const steer = clamp((want - st.yaw) * YAW_GAIN + hold, -1, 1)

  const brake = st.speed > limit + OVER
  const reserve = st.lap < LAPS - 1 ? RESERVE : 0
  const boost =
    how.boost === 'smart' &&
    !brake &&
    (own.open[i] ?? 0) >= t.top * t.boostMul &&
    st.meter > reserve + (st.boosting ? 0 : RESTART)
  return { steer, throttle: !brake, brake, boost }
}

/** Drives a whole race from grid slot 0 and returns each lap's ms. */
export function lapTimes(id: TrackId, ship: ShipId, how: Driving): number[] {
  const track = TRACKS[id]
  const t = tuning(SHIPS[ship].stats)
  const st = createShip(track, 0)
  for (let k = 0; k < RACE_LIMIT / STEP; k++) {
    stepShip(track, t, st, autopilot(track, t, st, how), STEP)
    if (st.finished) return st.laps
  }
  throw new Error(`${ship} didn't finish ${id} within ${RACE_LIMIT} s driving ${how.boost}`)
}

/**
 * Where the pads met driving round the lap sit, in metres along that line, and the line's length.
 * Without shortcuts that's every pad on main, launch pads included. With them each shortcut
 * replaces its span of main, so main pads in that span drop out and the shortcut's own pads
 * come in.
 */
function padsOnLine(track: Track, shortcuts: boolean): { at: number[]; length: number } {
  const main = track.paths[0] as TrackPath
  const taken = shortcuts ? track.branches.filter((b) => b.kind === 'shortcut') : []
  if (taken.some((b) => b.to < b.from)) throw new Error(`${track.id}: a shortcut spans the line`)
  // Metres the shortcuts that end by main's s have cut from the lap.
  const saved = (s: number) =>
    taken
      .filter((b) => b.to <= s)
      .reduce((sum, b) => sum + b.to - b.from - (track.paths[b.path] as TrackPath).length, 0)
  const at: number[] = []
  for (const pad of track.pads) {
    if (pad.path === 0) {
      if (!taken.some((b) => pad.s > b.from && pad.s < b.to)) at.push(pad.s - saved(pad.s))
      continue
    }
    const b = taken.find((x) => x.path === pad.path)
    if (b) at.push(b.from - saved(b.from) + pad.s)
  }
  at.sort((a, b) => a - b)
  return { at, length: main.length - saved(main.length) }
}

/** The shortest gap in metres between pads met in a row driving round the lap. */
function closestPads(track: Track, shortcuts: boolean): number {
  const { at, length } = padsOnLine(track, shortcuts)
  let min = Infinity
  for (let k = 0; k < at.length; k++) {
    const next = k + 1 < at.length ? (at[k + 1] as number) : (at[0] as number) + length
    min = Math.min(min, next - (at[k] as number))
  }
  return min
}

/**
 * What's wrong with a track's pads: 6 to 8 on either line round the lap, and no two in a row
 * closer than 8 s of Vega at top speed.
 */
export function checkPads(track: Track): string[] {
  const errors: string[] = []
  const near = 8 * tuning(SHIPS.vega.stats).top
  for (const shortcuts of [false, true]) {
    const line = shortcuts ? 'the shortcut line' : 'the line without shortcuts'
    const count = padsOnLine(track, shortcuts).at.length
    if (count < 6 || count > 8) errors.push(`${count} pads on ${line}`)
    const gap = closestPads(track, shortcuts)
    if (gap < near) errors.push(`pads ${gap.toFixed(0)} m apart on ${line}`)
  }
  return errors
}

export type LapRow = { ship: ShipId; driving: 'throttle' | 'smart'; laps: number[] | null }

const THROTTLE: Driving = { boost: 'never', shortcuts: false }
const SMART: Driving = { boost: 'smart', shortcuts: true }
// Vega's laps 2 and 3 must land in these, in ms.
const TARGETS = { throttle: [85_000, 95_000], smart: [65_000, 70_000] } as const
// The widest smart lap 2 spread across ships that passes, and the one the spec aims for.
const SPREAD_MAX = 5000
const SPREAD_AIM = 4000
// The server refuses laps under this share of the fastest smart lap, rounded down to a second.
const MIN_LAP_SHARE = 0.8
// How far off the fastest smart lap 2 a ship may be on its best track and still count as close.
const CLOSE = 1000

/**
 * Drives every ship round a track on throttle alone and driving well, then checks Vega's laps,
 * the smart lap 2 spread and the pads against the spec's targets. The lap script prints the rows,
 * and the tests fail on any error. minLap is the shortest lap the server accepts on this track.
 */
export function checkTargets(id: TrackId): {
  rows: LapRow[]
  spread: number
  minLap: number
  errors: string[]
  warnings: string[]
} {
  const rows: LapRow[] = []
  const errors: string[] = []
  const warnings: string[] = []
  const second: number[] = []
  for (const ship of SHIP_ORDER) {
    for (const driving of ['throttle', 'smart'] as const) {
      let laps: number[] | null = null
      try {
        laps = lapTimes(id, ship, driving === 'smart' ? SMART : THROTTLE)
      } catch (err) {
        errors.push(`${ship} ${driving}: ${(err as Error).message}`)
      }
      rows.push({ ship, driving, laps })
      if (!laps) continue
      if (driving === 'smart') second.push(laps[1] as number)
      if (ship !== 'vega') continue
      const [lo, hi] = TARGETS[driving]
      for (const lap of [1, 2]) {
        const ms = laps[lap] as number
        if (ms < lo || ms > hi) {
          errors.push(
            `vega ${driving} lap ${lap + 1} ${formatTime(ms)} is outside ${formatTime(lo)} to ${formatTime(hi)}`,
          )
        }
      }
    }
  }
  const spread = second.length > 0 ? Math.max(...second) - Math.min(...second) : 0
  const secs = `${(spread / 1000).toFixed(2)} s`
  if (spread > SPREAD_MAX) errors.push(`smart lap 2 spread ${secs}`)
  else if (spread > SPREAD_AIM) warnings.push(`smart lap 2 spread ${secs} is over 4 s`)
  errors.push(...checkPads(TRACKS[id]))
  const fastest = Math.min(
    ...rows.flatMap((r) => (r.driving === 'smart' && r.laps ? r.laps : [Infinity])),
  )
  const minLap = Math.floor((MIN_LAP_SHARE * fastest) / 1000) * 1000
  return { rows, spread, minLap, errors, warnings }
}

/**
 * Checks that every ship but Vega is the fastest on some track, or within CLOSE of it, comparing
 * smart lap 2. best says where each ship comes closest and how far off it is there, in ms.
 */
export function checkShips(rows: Record<TrackId, LapRow[]>): {
  best: { ship: ShipId; track: TrackId; behind: number }[]
  errors: string[]
} {
  const lap2 = (track: TrackId, ship: ShipId) =>
    rows[track].find((r) => r.ship === ship && r.driving === 'smart')?.laps?.[1] ?? Infinity
  const best: { ship: ShipId; track: TrackId; behind: number }[] = []
  const errors: string[] = []
  for (const ship of SHIP_ORDER) {
    let near = { ship, track: TRACK_ORDER[0] as TrackId, behind: Infinity }
    for (const track of TRACK_ORDER) {
      const fastest = Math.min(...SHIP_ORDER.map((s) => lap2(track, s)))
      const behind = lap2(track, ship) - fastest
      if (behind < near.behind) near = { ship, track, behind }
    }
    best.push(near)
    if (ship !== 'vega' && near.behind > CLOSE) {
      errors.push(
        `${ship} is ${(near.behind / 1000).toFixed(2)} s off the fastest at best (${near.track})`,
      )
    }
  }
  return { best, errors }
}
