import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  advance,
  bump,
  createShip,
  type Input,
  PHYS,
  progress,
  SHIP_HALF_WIDTH,
  type ShipState,
  STEP,
  type StepEvents,
  stepShip,
  type Tuning,
  tuning,
} from './race-physics.ts'
import { LAPS, SHIPS } from './race-rules.ts'
import {
  buildPath,
  buildTrack,
  PAD_HALF_WIDTH,
  type PathDef,
  type PointDef,
  sampleIndex,
  type Track,
  type TrackDef,
  type TrackPath,
  type Vec3,
  worldPos,
} from './race-tracks.ts'

const VEGA = tuning(SHIPS.vega.stats)
const IDLE: Input = { steer: 0, throttle: false, brake: false, boost: false }
const GAS: Input = { ...IDLE, throttle: true }

function def(paths: PathDef[], extra: Partial<TrackDef> = {}): TrackDef {
  return {
    id: 'coaster',
    paths,
    branches: [],
    pads: [],
    checkpoints: 3,
    colors: ['#ff00ff', '#00ffff'],
    ...extra,
  }
}

function arc(cx: number, cy: number, r: number, from: number, to: number, step: number) {
  const out: PointDef[] = []
  for (let a = from; a <= to + 1e-9; a += step) {
    const rad = (a * Math.PI) / 180
    out.push({ p: [cx + r * Math.cos(rad), cy + r * Math.sin(rad), 0] })
  }
  return out
}

const flat = (xs: number[], y: number): PointDef[] => xs.map((x) => ({ p: [x, y, 0] }))

// About 1 km, counter-clockwise, so every turn is to the left. s = 0 sits mid-straight.
// Points 0 to 2 run along the bottom, 3 to 11 round the right end, 12 to 15 back along the top.
const OVAL: PointDef[] = [
  ...flat([0, 50, 100], -80),
  ...arc(125, 0, 80, -90, 90, 22.5),
  ...flat([75, 25, -25, -75], 80),
  ...arc(-125, 0, 80, 90, 270, 22.5),
  ...flat([-100, -50], -80),
]

const oval = () => buildTrack(def([{ points: OVAL, closed: true }]))

/** The point on main's edge nearest authored point i, on side -1 (left) or 1 (right). */
function edge(main: TrackPath, i: number, side: number): Vec3 {
  const at = (OVAL[i] as PointDef).p
  let best = 0
  let bestD = Infinity
  for (let k = 0; k < main.width.length; k++) {
    const d = Math.hypot(
      (main.p[k * 3] ?? 0) - at[0],
      (main.p[k * 3 + 1] ?? 0) - at[1],
      (main.p[k * 3 + 2] ?? 0) - at[2],
    )
    if (d < bestD) {
      bestD = d
      best = k
    }
  }
  const half = ((main.width[best] ?? 0) / 2) * side
  return [0, 1, 2].map(
    (j) => (main.p[best * 3 + j] ?? 0) + (main.r[best * 3 + j] ?? 0) * half,
  ) as Vec3
}

// The oval with a narrow cut across the inside of its right end, from point 2 to point 12.
function shortcutOval(): Track {
  const main = buildPath({ points: OVAL, closed: true })
  const corners: Vec3[] = [
    edge(main, 2, -1),
    [115, -40, 0],
    [125, 0, 0],
    [115, 40, 0],
    edge(main, 12, -1),
  ]
  const points: PointDef[] = corners.map((p) => ({ p, width: 10 }))
  return buildTrack(
    def(
      [
        { points: OVAL, closed: true },
        { points, closed: false },
      ],
      { branches: [{ path: 1, from: 2, to: 12, kind: 'shortcut', side: -1 }] },
    ),
  )
}

// A long stadium. The bottom straight has water from 100 to 400 m, a launch pad at about 548 m
// and a gap from 560 to 600 m, with a lower road from the gap's start to 700 m. The top straight
// has a plain pad 5 m right of centre.
function stadium(): Track {
  const points: PointDef[] = [
    ...flat([0, 100, 200, 300, 400, 500, 560, 600, 700, 800, 900], 0),
    ...arc(1000, 100, 100, -90, 90, 30),
    ...flat([900, 800, 700, 600, 500, 400, 300, 200, 100], 200),
    ...arc(0, 100, 100, 90, 240, 30),
  ]
  const lower: PointDef[] = [
    { p: [560, 0, 0] },
    { p: [585, 0, -12] },
    { p: [640, 0, -12] },
    { p: [700, 0, 0] },
  ]
  return buildTrack(
    def(
      [
        { points, closed: true, water: [1, 2, 3], gap: [6] },
        { points: lower, closed: false },
      ],
      {
        branches: [{ path: 1, from: 6, to: 8, kind: 'drop' }],
        pads: [
          { path: 0, seg: 5, at: 0.8, x: 0, launch: true },
          { path: 0, seg: 19, at: 0.5, x: 5 },
        ],
      },
    ),
  )
}

const mainLength = (track: Track) => (track.paths[0] as TrackPath).length
const wallLimit = (track: Track, st: ShipState) => {
  const path = track.paths[st.path] as TrackPath
  return (path.width[sampleIndex(path, st.s)] ?? 0) / 2 - SHIP_HALF_WIDTH
}

function place(track: Track, fields: Partial<ShipState>): ShipState {
  return Object.assign(createShip(track, 0), { x: 0, ...fields })
}

/** Throttle on and steer to hold lateral position target. */
function follow(track: Track, st: ShipState, target = 0, t: Tuning = VEGA): Input {
  const path = track.paths[st.path] as TrackPath
  const curve = path.curve[sampleIndex(path, st.s)] ?? 0
  const want = Math.min(0.35, Math.max(-0.35, (target - st.x) * 0.15))
  const steer = (want - st.yaw) * 3 + (curve * st.speed) / t.turn
  return { ...GAS, steer: Math.min(1, Math.max(-1, steer)) }
}

/** Steps until stop returns true or the time runs out. Returns every step's events. */
function drive(
  track: Track,
  st: ShipState,
  control: () => Input,
  stop: (ev: StepEvents) => boolean,
  seconds = 120,
): StepEvents[] {
  const out: StepEvents[] = []
  for (let k = 0; k < seconds / STEP; k++) {
    const ev = stepShip(track, VEGA, st, control(), STEP)
    out.push(ev)
    if (stop(ev)) break
  }
  return out
}

test('tuning puts stat 3 mid-range and gives Vega a 1.5 boost', () => {
  assert.ok(Math.abs(VEGA.boostMul - 1.5) < 1e-9)
  const lancer = tuning(SHIPS.lancer.stats)
  const kestrel = tuning(SHIPS.kestrel.stats)
  assert.ok(lancer.top > VEGA.top && VEGA.top > kestrel.top)
  assert.ok(kestrel.accel > VEGA.accel && kestrel.turn > lancer.turn)
  // Linear: 3 sits halfway between 1 and 5.
  const one = tuning({ accel: 1, top: 1, handling: 1, boost: 1 })
  const five = tuning({ accel: 5, top: 5, handling: 5, boost: 5 })
  for (const k of Object.keys(VEGA) as (keyof Tuning)[]) {
    assert.ok(Math.abs(VEGA[k] - (one[k] + five[k]) / 2) < 1e-9, k)
  }
})

test('throttle reaches top speed and holds it', () => {
  const track = stadium()
  const st = place(track, { s: 1400 })
  drive(
    track,
    st,
    () => GAS,
    () => false,
    8,
  )
  assert.ok(Math.abs(st.speed - VEGA.top) < 1e-6, `${st.speed}`)
  drive(
    track,
    st,
    () => GAS,
    () => false,
    2,
  )
  assert.ok(Math.abs(st.speed - VEGA.top) < 1e-6, `${st.speed}`)
})

test('holding boost drains a full meter in about 5 s, and releasing stops boost the same step', () => {
  const track = stadium()
  const st = place(track, { s: 1400 })
  assert.equal(st.meter, 1)
  const boost = { ...GAS, boost: true }
  let steps = 0
  while (steps < 10 / STEP) {
    stepShip(track, VEGA, st, boost, STEP)
    if (!st.boosting) break
    steps++
  }
  assert.ok(Math.abs(steps * STEP - PHYS.boostSeconds) < 0.05, `${steps * STEP} s`)
  assert.ok(st.meter < 0.01)

  const again = place(track, { s: 1400 })
  drive(
    track,
    again,
    () => boost,
    () => false,
    2,
  )
  assert.ok(again.boosting && again.speed > VEGA.top)
  const meter = again.meter
  stepShip(track, VEGA, again, GAS, STEP)
  assert.equal(again.boosting, false)
  assert.ok(again.meter >= meter)
})

test('the meter refills from empty in about 20 s', () => {
  const track = stadium()
  const st = place(track, { s: 1400, meter: 0 })
  drive(
    track,
    st,
    () => IDLE,
    () => false,
    PHYS.refillSeconds - 0.1,
  )
  assert.ok(st.meter < 1 && st.meter > 0.99, `${st.meter}`)
  drive(
    track,
    st,
    () => IDLE,
    () => false,
    0.2,
  )
  assert.equal(st.meter, 1)
})

test('a pad adds 0.2 to the meter once per pass', () => {
  const track = stadium()
  const st = place(track, { s: 1500, x: 5, speed: 40, meter: 0.5 })
  const events = drive(
    track,
    st,
    () => GAS,
    () => st.s > 1650,
    10,
  )
  assert.equal(events.filter((ev) => ev.pad).length, 1)
  const refill = (events.length * STEP) / PHYS.refillSeconds
  assert.ok(Math.abs(st.meter - (0.5 + PHYS.padMeter + refill)) < 1e-6, `${st.meter}`)
})

test('water lowers top speed to 0.85 of dry', () => {
  const track = stadium()
  const st = place(track, { s: 110 })
  drive(
    track,
    st,
    () => GAS,
    () => st.s > 390,
    20,
  )
  const wet = st.speed
  drive(
    track,
    st,
    () => GAS,
    () => st.s > 530,
    20,
  )
  const dry = st.speed
  assert.ok(Math.abs(dry - VEGA.top) < 1e-6, `dry ${dry}`)
  assert.ok(Math.abs(wet / dry - PHYS.waterTop) < 1e-6, `wet ${wet}`)
})

test('with no steering, a turn carries the ship into the outside wall', () => {
  const track = oval()
  const st = place(track, { s: 0, speed: VEGA.top })
  const events = drive(
    track,
    st,
    () => GAS,
    (ev) => ev.wall !== undefined,
    10,
  )
  const hit = events.at(-1)?.wall
  assert.ok(hit !== undefined && hit > 0, 'no wall')
  // Every turn on the oval is a left, so the outside is the right.
  assert.ok(Math.abs(st.x - wallLimit(track, st)) < 1e-9, `x ${st.x}`)
})

test('a head-on wall hit costs more speed than a glancing one', () => {
  const track = stadium()
  const hit = (yaw: number) => {
    const st = place(track, { s: 1400, speed: 50, yaw })
    st.x = wallLimit(track, st) - 0.01
    const ev = drive(
      track,
      st,
      () => IDLE,
      (e) => e.wall !== undefined,
      1,
    ).at(-1)
    return { lost: ev?.wall ?? 0, speed: st.speed }
  }
  const glancing = hit(0.2)
  const headOn = hit(1.4)
  assert.ok(glancing.lost > 0 && glancing.lost < 0.25, `glancing ${glancing.lost}`)
  assert.ok(headOn.lost > 0.6, `head-on ${headOn.lost}`)
  assert.ok(headOn.speed < glancing.speed)
})

test('a lap counts only after every checkpoint, in order', () => {
  const track = oval()
  assert.equal(track.checkpoints.length, 3)
  const st = createShip(track, 0)
  const events = drive(
    track,
    st,
    () => follow(track, st),
    (ev) => ev.lap !== undefined,
  )
  const lap = events.at(-1)?.lap
  assert.equal(lap?.n, 1)
  assert.equal(lap?.delta, null)
  assert.deepEqual(st.laps, [lap?.ms])
  assert.equal(st.next, 0)

  // Missing the second and third checkpoints, the line doesn't count.
  const skip = place(track, { s: mainLength(track) - 50, next: 1, speed: 40 })
  drive(
    track,
    skip,
    () => follow(track, skip),
    () => skip.s > 20 && skip.s < 100,
    5,
  )
  assert.equal(skip.lap, 0)
  assert.equal(skip.next, 1)
})

test('crossing the line backward and forward again counts no lap', () => {
  const track = oval()
  const length = mainLength(track)
  const st = place(track, { s: 5, yaw: Math.PI, speed: 20 })
  drive(
    track,
    st,
    () => GAS,
    () => st.s > length - 30 && st.s < length - 20,
    5,
  )
  assert.ok(st.s > length - 30, `${st.s}`)
  st.yaw = 0
  const events = drive(
    track,
    st,
    () => follow(track, st),
    () => st.s > 30 && st.s < 100,
    10,
  )
  assert.ok(st.s > 30 && st.s < 100, `${st.s}`)
  assert.deepEqual(st.laps, [])
  assert.equal(st.next, 0)
  assert.ok(events.every((ev) => ev.lap === undefined))
})

test('lap delta compares with the previous lap', () => {
  const track = oval()
  const st = createShip(track, 0)
  const laps = drive(
    track,
    st,
    () => follow(track, st),
    () => st.lap === 2,
  )
    .map((ev) => ev.lap)
    .filter((lap) => lap !== undefined)
  assert.equal(laps.length, 2)
  assert.equal(laps[0]?.delta, null)
  assert.equal(laps[1]?.n, 2)
  assert.equal(laps[1]?.delta, (st.laps[1] ?? 0) - (st.laps[0] ?? 0))
  assert.ok(st.laps.every((ms) => Number.isInteger(ms) && ms > 0))
})

test('three laps finish the race', () => {
  const track = oval()
  const st = createShip(track, 0)
  const events = drive(
    track,
    st,
    () => follow(track, st),
    (ev) => ev.finished === true,
    300,
  )
  assert.equal(st.finished, true)
  assert.equal(st.lap, LAPS)
  assert.equal(st.laps.length, LAPS)
  assert.equal(events.filter((ev) => ev.finished).length, 1)
  const after = drive(
    track,
    st,
    () => follow(track, st),
    () => false,
    30,
  )
  assert.ok(after.every((ev) => ev.lap === undefined && !ev.finished))
  assert.equal(st.laps.length, LAPS)
})

test("a finished ship's progress never drops as it keeps driving", () => {
  const track = oval()
  const st = createShip(track, 0)
  drive(
    track,
    st,
    () => follow(track, st),
    (ev) => ev.finished === true,
    300,
  )
  const done = progress(track, st)
  assert.ok(done >= LAPS * mainLength(track))
  // Long enough to pass every checkpoint again and cross the line.
  drive(
    track,
    st,
    () => {
      assert.ok(progress(track, st) >= done, `dropped at s ${st.s}`)
      return follow(track, st)
    },
    () => false,
    30,
  )
  assert.ok(progress(track, st) >= done)
})

test('steering into an open shortcut moves onto the branch, and its end rejoins main', () => {
  const track = shortcutOval()
  const branch = track.branches[0]
  assert.ok(branch)
  // Close to the edge, since this branch's opening is short, and turned about as far as the
  // branch leaves, so it doesn't slide straight back out.
  assert.ok(branch.open > 4, `opens ${branch.open} m`)
  const st = place(track, { s: branch.from + 3, x: -7.5, yaw: -1, speed: 40 })
  let mainS = st.s
  drive(
    track,
    st,
    () => {
      mainS = st.s
      return GAS
    },
    () => st.path !== 0,
    2,
  )
  assert.equal(st.path, branch.path)
  const inner = track.paths[branch.path] as TrackPath
  // It picks up the branch as far along as it came into the opening, not back at its start.
  const into = mainS - branch.from
  assert.ok(into > 2, `crossed ${into} m in`)
  assert.ok(Math.abs(st.s - into) < 1.5, `s ${st.s} vs ${into} m into the opening`)
  // Where it already was: on the branch's road, its side facing main.
  assert.ok(st.x > 0 && st.x <= (inner.width[0] ?? 0) / 2 - SHIP_HALF_WIDTH, `x ${st.x}`)

  // Steer away from the edge facing main: across it, still in the opening, is main again.
  drive(
    track,
    st,
    () => follow(track, st, -2),
    () => st.path === 0,
    20,
  )
  assert.equal(st.path, 0)
  assert.ok(Math.abs(st.s - branch.to) < 1, `s ${st.s} vs ${branch.to}`)
  assert.ok(st.x < 0 && st.x >= -wallLimit(track, st), `x ${st.x}`)
})

test("the shortcut's opening has no wall, the rest of its side does", () => {
  const track = shortcutOval()
  const branch = track.branches[0]
  assert.ok(branch)
  const open = place(track, { s: branch.from + 1, x: -7.5, yaw: -0.5, speed: 30 })
  const events = drive(
    track,
    open,
    () => IDLE,
    () => open.path !== 0,
    2,
  )
  assert.equal(open.path, branch.path)
  assert.ok(events.every((ev) => ev.wall === undefined))

  for (const s of [branch.from - 60, branch.from + 60]) {
    const st = place(track, { s, x: -4, yaw: -0.5, speed: 30 })
    const ev = drive(
      track,
      st,
      () => IDLE,
      (e) => e.wall !== undefined,
      2,
    ).at(-1)
    assert.ok(ev?.wall, `no wall at ${s}`)
    assert.equal(st.path, 0)
    assert.ok(Math.abs(st.x + wallLimit(track, st)) < 1e-9, `x ${st.x}`)
  }
})

test('touching the launch pad clears the gap, missing it drops onto the lower road', () => {
  const track = stadium()
  const drop = track.branches[0]
  assert.ok(drop)
  const hit = place(track, { s: 480, speed: VEGA.top })
  let peak = 0
  let flew = false
  const events = drive(
    track,
    hit,
    () => {
      peak = Math.max(peak, hit.y)
      flew ||= hit.air !== null
      assert.equal(hit.path, 0)
      return follow(track, hit)
    },
    (ev) => ev.landed === true,
    5,
  )
  assert.ok(events.some((ev) => ev.pad))
  assert.ok(flew && peak > 7 && peak <= 8, `peak ${peak}`)
  assert.equal(events.at(-1)?.landed, true)
  assert.equal(hit.air, null)
  assert.equal(hit.launch, false)
  assert.equal(hit.y, 0)
  assert.ok(hit.s >= 600 && hit.s < 602, `landed at ${hit.s}`)

  const miss = place(track, { s: 480, x: PAD_HALF_WIDTH + 2.5, speed: VEGA.top })
  const missed = drive(
    track,
    miss,
    () => follow(track, miss, miss.x),
    () => miss.path !== 0,
    5,
  )
  assert.ok(missed.every((ev) => !ev.pad))
  assert.equal(miss.path, drop.path)
  assert.ok(Math.abs(miss.x - (PAD_HALF_WIDTH + 2.5)) < 0.1, `x ${miss.x}`)
  drive(
    track,
    miss,
    () => follow(track, miss),
    () => miss.path === 0,
    10,
  )
  assert.equal(miss.path, 0)
  assert.ok(Math.abs(miss.s - drop.to) < 1, `rejoined at ${miss.s}`)
})

test('advance clamps a 5 s frame', () => {
  const track = oval()
  const st = place(track, { s: 12, speed: VEGA.top })
  const { carry } = advance(track, VEGA, st, GAS, 5, 0)
  assert.ok(st.s - 12 <= 0.1 * VEGA.top + 1e-6, `moved ${st.s - 12}`)
  assert.ok(st.s - 12 > 0.09 * VEGA.top)
  assert.ok(carry >= 0 && carry < STEP)
  assert.ok(Math.abs(st.x) <= wallLimit(track, st))
})

test('bump pushes apart and the ship behind loses speed', () => {
  const track = oval()
  const own = place(track, { s: 100, speed: 50 })
  const other = { path: 0, s: 102, x: 1, y: 0, speed: 50 }
  assert.equal(bump(track, own, other), true)
  assert.ok(Math.abs(own.speed - 50 * 0.97) < 1e-9)
  assert.ok(other.x - own.x >= 2 * SHIP_HALF_WIDTH - 1e-9, `x ${own.x}`)

  const ahead = place(track, { s: 104, speed: 50 })
  assert.equal(bump(track, ahead, other), true)
  assert.ok(Math.abs(ahead.speed - 50 * 1.02) < 1e-9)
  assert.ok(other.x - ahead.x >= 2 * SHIP_HALF_WIDTH - 1e-9, `x ${ahead.x}`)

  const apart = place(track, { s: 110, speed: 50 })
  assert.equal(bump(track, apart, other), false)
  assert.equal(apart.speed, 50)
  assert.equal(apart.x, 0)
})

test('progress orders a ship on a shortcut against one on main', () => {
  const track = shortcutOval()
  const branch = track.branches[0]
  assert.ok(branch)
  const inner = track.paths[branch.path] as TrackPath
  const cutting = place(track, { path: branch.path, s: inner.length / 2 })
  const justIn = place(track, { s: branch.from + 20 })
  const pastExit = place(track, { s: branch.to + 10 })
  assert.ok(progress(track, cutting) > progress(track, justIn))
  assert.ok(progress(track, pastExit) > progress(track, cutting))
  const nextLap = place(track, { s: 20, lap: 1 })
  assert.ok(progress(track, nextLap) > progress(track, pastExit))
})

test("crossing main's edge in a shortcut's exit opening moves onto the branch's end", () => {
  const track = shortcutOval()
  const branch = track.branches[0]
  assert.ok(branch && branch.close > 4, `closes ${branch?.close} m`)
  const inner = track.paths[branch.path] as TrackPath
  const mainS = branch.to - branch.close / 2
  // Just inside main's edge, so it crosses before driving out of the opening.
  const st = place(track, { s: mainS, x: -7.9, yaw: -0.5, speed: 30 })
  const events = drive(
    track,
    st,
    () => IDLE,
    () => st.path !== 0,
    2,
  )
  assert.equal(st.path, branch.path)
  assert.ok(events.every((ev) => ev.wall === undefined))
  // As far before the branch's end as the ship was before main's to.
  assert.ok(Math.abs(st.s - (inner.length - branch.close / 2)) < 2, `s ${st.s}`)

  // Past the exit the wall is back.
  const after = place(track, { s: branch.to + 5, x: -4, yaw: -0.5, speed: 30 })
  const ev = drive(
    track,
    after,
    () => IDLE,
    (e) => e.wall !== undefined,
    2,
  ).at(-1)
  assert.ok(ev?.wall)
  assert.equal(after.path, 0)
})

test('in the air over a gap the road edge holds the ship without a wall hit', () => {
  const track = stadium()
  const flying = (x: number) =>
    place(track, { s: 570, x, yaw: x === 0 ? 0 : 0.6, speed: 40, air: { from: 560, to: 600 } })
  const edge = flying(wallLimit(track, flying(0)) - 0.05)
  const free = flying(0)
  const events = drive(
    track,
    edge,
    () => {
      stepShip(track, VEGA, free, IDLE, STEP)
      return IDLE
    },
    () => false,
    0.2,
  )
  assert.ok(events.every((ev) => ev.wall === undefined))
  assert.ok(Math.abs(edge.x - wallLimit(track, edge)) < 1e-9, `x ${edge.x}`)
  assert.ok(Math.abs(edge.speed - free.speed) < 1e-9, `speed ${edge.speed} vs ${free.speed}`)
})

test("steering back out of a shortcut's entrance lands on main without a wall hit", () => {
  const track = shortcutOval()
  const branch = track.branches[0]
  assert.ok(branch)
  // The branch's edge facing main is on its right: the shortcut leaves on main's left.
  assert.ok(branch.open > 3, `opens ${branch.open} m`)
  const st = place(track, { path: branch.path, s: 2, x: 4.9, yaw: 0.5, speed: 30 })
  const events = drive(
    track,
    st,
    () => IDLE,
    () => st.path === 0,
    2,
  )
  assert.equal(st.path, 0)
  assert.ok(events.every((ev) => ev.wall === undefined))
  assert.ok(Math.abs(st.s - (branch.from + 2)) < 1, `s ${st.s} vs ${branch.from + 2}`)
  assert.ok(st.x < 0 && st.x >= -wallLimit(track, st), `x ${st.x}`)

  // Further in, the same edge is a wall.
  const inside = place(track, { path: branch.path, s: branch.open + 20, x: 3, yaw: 0.5, speed: 30 })
  const hit = drive(
    track,
    inside,
    () => IDLE,
    (e) => e.wall !== undefined,
    2,
  ).at(-1)
  assert.ok(hit?.wall)
  assert.equal(inside.path, branch.path)
})

test('changing path at an opening, either way, moves a ship less than 3 m', async () => {
  const { TRACKS } = await import('./race-track-defs.ts')
  for (const track of Object.values(TRACKS)) {
    const length = (track.paths[0] as TrackPath).length
    for (const b of track.branches) {
      if (b.kind !== 'shortcut') continue
      const own = track.paths[b.path] as TrackPath
      /** Pushes a ship straight out through side's edge and returns how far a path change moved it. */
      const hop = (path: number, s: number, side: number) => {
        const road = track.paths[path] as TrackPath
        const x = side * ((road.width[sampleIndex(road, s)] ?? 0) / 2 - 0.02)
        const st = place(track, { path, s, x, yaw: (side * Math.PI) / 2, speed: 30 })
        const before = worldPos(track, path, s, x, 0)
        stepShip(track, VEGA, st, IDLE, STEP)
        assert.notEqual(st.path, path, `${track.id} ${b.path}: no change from ${path} at ${s}`)
        const after = worldPos(track, st.path, st.s, st.x, st.y)
        return Math.hypot(after[0] - before[0], after[1] - before[1], after[2] - before[2])
      }
      const where = (k: number) => `${track.id} ${b.path}, ${k.toFixed(2)} m in`
      for (let k = 0.25; k < b.open; k += 0.5) {
        assert.ok(hop(0, (b.from + k) % length, b.side) < 3, `main → branch, ${where(k)}`)
        assert.ok(hop(b.path, k, -b.side) < 3, `branch → main, ${where(k)}`)
      }
      for (let k = 0.25; k < b.close; k += 0.5) {
        const m = (b.to - k + length) % length
        assert.ok(hop(0, m, b.side) < 3, `main → branch at the exit, ${where(k)}`)
        assert.ok(
          hop(b.path, own.length - k, -b.side) < 3,
          `branch → main at the exit, ${where(k)}`,
        )
      }
    }
  }
})

test("a branch's own ends and a lower road's ends move a ship less than 3 m", async () => {
  const { TRACKS } = await import('./race-track-defs.ts')
  for (const track of Object.values(TRACKS)) {
    const length = (track.paths[0] as TrackPath).length
    for (const b of track.branches) {
      const own = track.paths[b.path] as TrackPath
      /** Drives one step from path at s and returns how far a path change moved the ship. */
      const hop = (path: number, s: number, x: number, yaw: number) => {
        const st = place(track, { path, s, x, yaw, speed: 30 })
        const before = worldPos(track, path, s, x, 0)
        stepShip(track, VEGA, st, IDLE, STEP)
        assert.notEqual(st.path, path, `${track.id} ${b.path}: no change from ${path} at ${s}`)
        const after = worldPos(track, st.path, st.s, st.x, st.y)
        return Math.hypot(after[0] - before[0], after[1] - before[1], after[2] - before[2])
      }
      const limit = (path: TrackPath, s: number) =>
        (path.width[sampleIndex(path, s)] ?? 0) / 2 - SHIP_HALF_WIDTH
      for (let f = -1; f <= 1; f += 0.25) {
        const where = `${track.id} ${b.kind} ${b.path}, x ${f}`
        // Off the branch's end onto main, and backwards off its start.
        const end = f * limit(own, own.length)
        assert.ok(hop(b.path, own.length - 0.05, end, 0) < 3, `end, ${where}`)
        assert.ok(hop(b.path, 0.05, f * limit(own, 0), Math.PI) < 3, `start, ${where}`)
        if (b.kind === 'drop') {
          // Off main's ramp onto the lower road, without the launch pad.
          const s = (b.from - 0.05 + length) % length
          const main = track.paths[0] as TrackPath
          assert.ok(hop(0, s, f * limit(main, s), 0) < 3, `onto, ${where}`)
        }
      }
    }
  }
})

test("on a shortcut, an airborne ship keeps the branch's edge facing main", () => {
  const track = shortcutOval()
  const branch = track.branches[0]
  assert.ok(branch)
  const st = place(track, {
    path: branch.path,
    s: 1,
    x: 4.9,
    yaw: 0.5,
    speed: 30,
    air: { from: 0, to: 1 },
  })
  stepShip(track, VEGA, st, IDLE, STEP)
  assert.equal(st.path, branch.path)
})

test('a ship driving the wrong way into a Skyway gap goes down onto the lower road', async () => {
  const { TRACKS } = await import('./race-track-defs.ts')
  const track = TRACKS.skyway
  const main = track.paths[0] as TrackPath
  const length = main.length
  for (const b of track.branches) {
    if (b.kind !== 'drop') continue
    let end = sampleIndex(main, b.from)
    while (!main.gap[end]) end++
    while (main.gap[end]) end++
    // Just past the far lip, facing back across the gap.
    const st = place(track, { s: end + 1, yaw: Math.PI, speed: 30 })
    const paths: number[] = []
    for (let k = 0; k < 6 / STEP && !(st.path === 0 && st.s < b.from - 5); k++) {
      stepShip(track, VEGA, st, { ...GAS, steer: 0 }, STEP)
      // Off the lower road's start it's put back on the lip at from, which is road.
      const into = (st.s - b.from + length) % length
      const over = st.path === 0 && into > 1e-6 && into < end - b.from
      assert.ok(!over, `path ${b.path}: on main over the gap at ${st.s.toFixed(1)}`)
      if (paths.at(-1) !== st.path) paths.push(st.path)
    }
    // Back up the lower road and off its start onto main before the gap.
    assert.deepEqual(paths, [0, b.path, 0], `path ${b.path}`)
    assert.ok(st.s < b.from, `path ${b.path}: s ${st.s.toFixed(1)}`)
  }
})

test("crossing a lower road's edge where it rises into main moves a ship less than 3 m", async () => {
  const { TRACKS } = await import('./race-track-defs.ts')
  const track = TRACKS.skyway
  const main = track.paths[0] as TrackPath
  for (const b of track.branches) {
    if (b.kind !== 'drop') continue
    const own = track.paths[b.path] as TrackPath
    assert.ok(b.close > 10, `path ${b.path} closes ${b.close.toFixed(1)} m`)
    for (let k = 0.25; k < b.close; k += 0.5) {
      const s = own.length - k
      const side = -b.side
      const x = side * ((own.width[sampleIndex(own, s)] ?? 0) / 2 - 0.02)
      const st = place(track, { path: b.path, s, x, yaw: (side * Math.PI) / 2, speed: 30 })
      const before = worldPos(track, b.path, s, x, 0)
      const events = stepShip(track, VEGA, st, IDLE, STEP)
      const where = `path ${b.path}, ${k.toFixed(2)} m from its end`
      assert.equal(st.path, 0, where)
      assert.equal(events.wall, undefined, where)
      assert.equal(main.gap[sampleIndex(main, st.s)], 0, `${where}: over a gap`)
      const after = worldPos(track, 0, st.s, st.x, st.y)
      const hop = Math.hypot(after[0] - before[0], after[1] - before[1], after[2] - before[2])
      assert.ok(hop < 3, `${where}: ${hop.toFixed(2)} m`)
    }
    // Further back the same edge is a wall.
    const s = own.length - b.close - 3
    const x = -b.side * ((own.width[sampleIndex(own, s)] ?? 0) / 2 - 0.02)
    const st = place(track, { path: b.path, s, x, yaw: (-b.side * Math.PI) / 2, speed: 30 })
    assert.ok(stepShip(track, VEGA, st, IDLE, STEP).wall, `path ${b.path} before its close`)
    assert.equal(st.path, b.path)
  }
})
