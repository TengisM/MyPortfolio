import type { TrackId } from './race-rules.ts'
import {
  buildTrack,
  DEFAULT_WIDTH,
  type PadDef,
  type PathDef,
  type PointDef,
  type Track,
  type TrackDef,
  type Vec3,
} from './race-tracks.ts'

// The three tracks, authored with a pen that drives forward and drops control points: straights,
// turns, loops and corkscrews. Headings are radians anticlockwise from +x seen from above, and a
// positive turn goes right.

type Pen = {
  x: number
  y: number
  z: number
  h: number
  roll: number
  points: PointDef[]
  pads: PadDef[]
  gap: number[]
  water: number[]
}
/** Where the pen stood when a turn began, so a shortcut can cut its inside. */
type TurnStart = { at: number; x: number; y: number; z: number; h: number }

const RAD = Math.PI / 180
// Most metres between two control points on a straight, and most degrees on a turn.
const STRAIGHT_STEP = 40
const TURN_STEP = 15

const smooth = (u: number) => u * u * (3 - 2 * u)

function pen(x: number, y: number, z: number, h: number): Pen {
  return { x, y, z, h: h * RAD, roll: 0, points: [{ p: [x, y, z] }], pads: [], gap: [], water: [] }
}

/** A boost pad on the main road where the pen stands, x metres right of centre. */
function pad(pen: Pen, x: number) {
  pen.pads.push({ path: 0, seg: here(pen), at: 0, x })
}

function put(pen: Pen, roll = 0) {
  pen.points.push({ p: [pen.x, pen.y, pen.z], roll: pen.roll + roll })
}

/** The segment index that starts at the pen. */
const here = (pen: Pen) => pen.points.length - 1

/** Straight ahead, rising dz with an eased start and end. */
function straight(pen: Pen, length: number, dz = 0) {
  const n = Math.max(1, Math.ceil(length / STRAIGHT_STEP))
  const [x, y, z] = [pen.x, pen.y, pen.z]
  for (let k = 1; k <= n; k++) {
    const u = k / n
    pen.x = x + Math.cos(pen.h) * length * u
    pen.y = y + Math.sin(pen.h) * length * u
    pen.z = z + dz * smooth(u)
    put(pen)
  }
}

/** A turn of deg degrees (+ right) on the given radius, banked by bank radians into the turn. */
function turn(pen: Pen, deg: number, radius: number, bank = 0, dz = 0): TurnStart {
  const start = { at: here(pen), x: pen.x, y: pen.y, z: pen.z, h: pen.h }
  const side = Math.sign(deg)
  const n = Math.ceil(Math.abs(deg) / TURN_STEP)
  // Centre of the turn, off the pen's right for a right turn.
  const cx = pen.x + side * radius * Math.sin(start.h)
  const cy = pen.y - side * radius * Math.cos(start.h)
  for (let k = 1; k <= n; k++) {
    const a = (deg * RAD * k) / n
    pen.h = start.h - a
    pen.x = cx - side * radius * Math.sin(pen.h)
    pen.y = cy + side * radius * Math.cos(pen.h)
    pen.z = start.z + dz * smooth(k / n)
    put(pen, k < n ? side * bank : 0)
  }
  return start
}

/** A vertical loop that drifts sideways (+ right) so it clears its own entry. */
function loop(pen: Pen, radius: number, drift: number) {
  const [x, y, z] = [pen.x, pen.y, pen.z]
  const fx = Math.cos(pen.h)
  const fy = Math.sin(pen.h)
  for (let k = 1; k <= 12; k++) {
    const a = (k * Math.PI) / 6
    const side = (drift * k) / 12
    pen.x = x + fx * radius * Math.sin(a) + fy * side
    pen.y = y + fy * radius * Math.sin(a) - fx * side
    pen.z = z + radius * (1 - Math.cos(a))
    put(pen)
  }
}

/** A straight that rolls the road through whole turns (+ rolls right). */
function corkscrew(pen: Pen, length: number, turns: number) {
  const n = 8 * Math.abs(turns)
  const [x, y] = [pen.x, pen.y]
  const from = pen.roll
  for (let k = 1; k <= n; k++) {
    pen.x = x + (Math.cos(pen.h) * length * k) / n
    pen.y = y + (Math.sin(pen.h) * length * k) / n
    pen.roll = from + (2 * Math.PI * turns * k) / n
    put(pen)
  }
}

/**
 * A narrower road across the inside of a turn, from main's inside edge where the turn starts to
 * the same edge where it ends. Its distance from the turn's centre dips to inner at the middle.
 */
function insideLine(
  start: TurnStart,
  deg: number,
  radius: number,
  dz: number,
  inner: number,
  width: number,
): PathDef {
  const side = Math.sign(deg)
  const cx = start.x + side * radius * Math.sin(start.h)
  const cy = start.y - side * radius * Math.cos(start.h)
  const edge = radius - DEFAULT_WIDTH / 2
  const n = 2 * Math.ceil(Math.abs(deg) / TURN_STEP)
  const points: PointDef[] = []
  for (let k = 0; k <= n; k++) {
    const u = k / n
    const h = start.h - deg * RAD * u
    // Half sin, half sin²: it meets main at half the angle a plain sine would.
    const dip = Math.sin(Math.PI * u)
    const r = edge - ((edge - inner) * (dip + dip * dip)) / 2
    points.push({
      p: [cx - side * r * Math.sin(h), cy + side * r * Math.cos(h), start.z + dz * smooth(u)],
      width,
    })
  }
  return { points, closed: false }
}

/**
 * A narrower road that turns back early across the inside of a half turn: a half circle along
 * main's inside edge, starting lead metres before the turn and ending lead metres after it.
 */
function earlyTurn(
  start: TurnStart,
  deg: number,
  radius: number,
  lead: number,
  width: number,
): PathDef {
  const side = Math.sign(deg)
  const cx = start.x + side * radius * Math.sin(start.h) - lead * Math.cos(start.h)
  const cy = start.y - side * radius * Math.cos(start.h) - lead * Math.sin(start.h)
  const edge = radius - DEFAULT_WIDTH / 2
  const n = 2 * Math.ceil(Math.abs(deg) / TURN_STEP)
  const points: PointDef[] = []
  for (let k = 0; k <= n; k++) {
    const h = start.h - (deg * RAD * k) / n
    points.push({
      p: [cx - side * edge * Math.sin(h), cy + side * edge * Math.cos(h), start.z],
      width,
    })
  }
  return { points, closed: false }
}

// Metres over which a branch's ends ease sideways onto main's road.
const MERGE = 30

/** Unit vector to the right of heading h, seen from above. */
const rightOf = (h: number): [number, number] => [Math.sin(h), -Math.cos(h)]

/** Main's control point i moved sideways onto its edge on side, for a straight heading h. */
function edgePoint(points: PointDef[], i: number, h: number, side: number, width: number) {
  const [x, y, z] = points[i]?.p ?? [0, 0, 0]
  const [rx, ry] = rightOf(h)
  const out = (side * DEFAULT_WIDTH) / 2
  return { p: [x + rx * out, y + ry * out, z] as Vec3, width }
}

/**
 * A branch that starts one main segment earlier, before, and ends one later, after, running along
 * main's edge on the straights either side of a banked turn. There main is level, so the
 * openings are long enough to steer through.
 */
function leads(def: PathDef, before: PointDef | null, after: PointDef | null): PathDef {
  return {
    ...def,
    points: [...(before ? [before] : []), ...def.points, ...(after ? [after] : [])],
  }
}

/**
 * Eases a branch's ends sideways onto main's road, so its far edge meets main's edge where it
 * leaves and rejoins and a ship on it is on main's road there too: changing path never moves it.
 * side is the side of main the branch runs on, hFrom and hTo main's headings at its ends.
 */
function merged(def: PathDef, side: number, hFrom: number, hTo: number, over = MERGE): PathDef {
  const pts = def.points
  const along = [0]
  for (let i = 1; i < pts.length; i++) {
    const a = (pts[i - 1] as PointDef).p
    const b = (pts[i] as PointDef).p
    along.push((along[i - 1] as number) + Math.hypot(b[0] - a[0], b[1] - a[1]))
  }
  const total = along.at(-1) ?? 0
  const ease = (d: number) => smooth(Math.min(1, Math.max(0, 1 - d / over)))
  const [ax, ay] = rightOf(hFrom)
  const [bx, by] = rightOf(hTo)
  return {
    ...def,
    points: pts.map((pt, i) => {
      // From main's edge to half the branch's width inside it.
      const shift = (pt.width ?? DEFAULT_WIDTH) / 2
      const a = ease(along[i] as number) * shift
      const b = ease(total - (along[i] as number)) * shift
      return {
        ...pt,
        p: [pt.p[0] - side * (a * ax + b * bx), pt.p[1] - side * (a * ay + b * by), pt.p[2]],
      }
    }),
  }
}

/**
 * Ends a lap that heads west below and behind the start: a right half turn this wide comes out
 * on the line heading east at the start's height, then a straight to the start.
 */
function close(p: Pen, bank: number) {
  const [x, y, z] = p.points[0]?.p ?? [0, 0, 0]
  const radius = (y - p.y) / 2
  if (Math.cos(p.h) > -1 + 1e-9 || radius <= 0 || p.x >= x) {
    throw new Error('a lap must close heading west, below and behind its start')
  }
  const sweeper = turn(p, 180, radius, bank, z - p.z)
  const sweeperEnd = here(p)
  straight(p, x - p.x)
  p.points.pop()
  return { sweeper, sweeperEnd, radius }
}

// A jump: an 80 m ramp up 10 m, a 60 m gap, and a 160 m landing straight back down. The launch
// pad sits 30 m before the gap, and the lower road dips this far below main.
const RAMP = 80
const GAP = 60
const LANDING = 160
const DEPTH = 20

/**
 * A jump straight ahead. The lower road leaves main's centre where the gap starts, dips and swings
 * out swing metres (+ right), then climbs back to main's centre where the landing ends. Returns
 * the lower road and the main segments it spans.
 */
function jump(p: Pen, swing: number): { from: number; to: number; drop: PathDef } {
  straight(p, RAMP, 10)
  p.pads.push({ path: 0, seg: here(p) - 1, at: 0.25, x: 0, launch: true })
  const from = here(p)
  const start = { x: p.x, y: p.y, z: p.z, h: p.h }
  straight(p, GAP)
  for (let k = from; k < here(p); k++) p.gap.push(k)
  straight(p, LANDING, -10)
  const length = GAP + LANDING
  const n = Math.ceil(length / 20)
  const points: PointDef[] = []
  for (let k = 0; k <= n; k++) {
    const u = k / n
    const dip = Math.sin(Math.PI * u) ** 2
    const along = length * u
    points.push({
      p: [
        start.x + Math.cos(start.h) * along + Math.sin(start.h) * swing * dip,
        start.y + Math.sin(start.h) * along - Math.cos(start.h) * swing * dip,
        start.z + (p.z - start.z) * smooth(u) - DEPTH * dip,
      ],
    })
  }
  return { from, to: here(p), drop: { points, closed: false } }
}

// Coaster: the Hot Wheels track. A loop off the line, a banked helix down, a slalom and a second
// loop, a steep banked hairpin with a tight inside line, a crest and a big drop, a camelback, a
// corkscrew, a longer slalom, and a climbing sweeper back to the line with a tighter inner split.
function coaster(): TrackDef {
  const p = pen(0, 0, 30, 0)
  straight(p, 130)
  pad(p, 0)
  straight(p, 120)
  loop(p, 40, 20)
  straight(p, 200)
  turn(p, 360, 75, 0.9, -40)
  pad(p, -4)
  straight(p, 100)
  turn(p, 90, 40)
  straight(p, 40)
  turn(p, -90, 40)
  turn(p, -45, 40)
  turn(p, 90, 40)
  turn(p, -90, 40)
  turn(p, 45, 40)
  straight(p, 150)
  pad(p, 4)
  loop(p, 36, 20)
  straight(p, 250)
  const hairpin = turn(p, 180, 110, 1.0)
  const hairpinEnd = here(p)
  const hairpinOut = p.h
  straight(p, 250, 50)
  straight(p, 250, -75)
  pad(p, 5)
  straight(p, 200, 30)
  straight(p, 200, -30)
  corkscrew(p, 300, 1)
  pad(p, 0)
  straight(p, 420)
  turn(p, -60, 40)
  turn(p, 120, 40)
  turn(p, -120, 40)
  turn(p, 120, 40)
  turn(p, -60, 40)
  straight(p, 60)
  const { sweeper, sweeperEnd, radius } = close(p, 0.5)
  // Both bends are banked, so the shortcuts leave and rejoin on the level straights beside them.
  const insideCut = insideLine(hairpin, 180, 110, 0, 65, 10)
  const inside = merged(
    leads(
      insideCut,
      edgePoint(p.points, hairpin.at - 1, hairpin.h, 1, 10),
      edgePoint(p.points, hairpinEnd + 1, hairpinOut, 1, 10),
    ),
    1,
    hairpin.h,
    hairpinOut,
  )
  const splitCut = insideLine(sweeper, 180, radius, 30 - sweeper.z, 95, 10)
  const split = merged(
    leads(
      splitCut,
      edgePoint(p.points, sweeper.at - 1, sweeper.h, 1, 10),
      edgePoint(p.points, sweeperEnd + 1, sweeper.h - Math.PI, 1, 10),
    ),
    1,
    sweeper.h,
    sweeper.h - Math.PI,
  )
  return {
    id: 'coaster',
    paths: [{ points: p.points, closed: true }, inside, split],
    branches: [
      { path: 1, from: hairpin.at - 1, to: hairpinEnd + 1, kind: 'shortcut', side: 1 },
      { path: 2, from: sweeper.at - 1, to: sweeperEnd + 1, kind: 'shortcut', side: 1 },
    ],
    pads: [
      ...p.pads,
      // Halfway round the sweeper, on the outside, and halfway across each cut.
      { path: 0, seg: (sweeper.at + sweeperEnd) / 2, at: 0, x: -5 },
      { path: 1, seg: 1 + (insideCut.points.length - 1) / 2, at: 0, x: 0 },
      { path: 2, seg: 1 + (splitCut.points.length - 1) / 2, at: 0, x: 0 },
    ],
    checkpoints: 8,
    colors: ['#d9472b', '#46c8ff'],
  }
}

// Skyway: a fast road high in the sky with four jumps. A jump off the line, a tight right and a
// long descent to the second jump, a banked hairpin with an inside line, a climb to the third
// jump, a banked half turn and a fast S-bend into the fourth, a slalom, and a wide sweeper back
// to the line with a tighter inner split. Drop roads swing out to the side under each gap.
function skyway(): TrackDef {
  const p = pen(0, 0, 80, 0)
  straight(p, 300)
  const j1 = jump(p, 40)
  turn(p, 90, 60, 0.5)
  straight(p, 330, -30)
  const j2 = jump(p, -40)
  straight(p, 60)
  turn(p, 90, 50, 0.6)
  straight(p, 150)
  const hairpin = turn(p, -180, 90, 0.9)
  const hairpinEnd = here(p)
  const hairpinOut = p.h
  straight(p, 250, 30)
  const j3 = jump(p, 40)
  straight(p, 150)
  turn(p, 180, 100, 0.9)
  straight(p, 150)
  turn(p, -30, 120)
  turn(p, 60, 120)
  turn(p, -30, 120)
  straight(p, 60)
  const j4 = jump(p, 40)
  straight(p, 200)
  turn(p, 90, 60, 0.5)
  straight(p, 100)
  turn(p, -60, 40)
  turn(p, 120, 40)
  turn(p, -60, 40)
  pad(p, 0)
  straight(p, 60)
  turn(p, -90, 60, 0.5)
  straight(p, 350)
  const { sweeper, sweeperEnd, radius } = close(p, 0.4)
  // The hairpin is banked, so its shortcut leaves and rejoins on the level straights beside it.
  const inside = merged(
    leads(
      insideLine(hairpin, -180, 90, 0, 50, 10),
      edgePoint(p.points, hairpin.at - 1, hairpin.h, -1, 10),
      edgePoint(p.points, hairpinEnd + 1, hairpinOut, -1, 10),
    ),
    -1,
    hairpin.h,
    hairpinOut,
  )
  const split = merged(
    insideLine(sweeper, 180, radius, 80 - sweeper.z, radius - 70, 10),
    1,
    sweeper.h,
    sweeper.h - Math.PI,
  )
  const jumps = [j1, j2, j3, j4]
  return {
    id: 'skyway',
    paths: [
      { points: p.points, closed: true, gap: p.gap },
      inside,
      split,
      ...jumps.map((j) => j.drop),
    ],
    branches: [
      { path: 1, from: hairpin.at - 1, to: hairpinEnd + 1, kind: 'shortcut', side: -1 },
      { path: 2, from: sweeper.at, to: sweeperEnd, kind: 'shortcut', side: 1 },
      ...jumps.map((j, k) => ({ path: 3 + k, from: j.from, to: j.to, kind: 'drop' as const })),
    ],
    pads: [
      ...p.pads,
      // Halfway round the sweeper, on the outside, and halfway along the split inside it.
      { path: 0, seg: (sweeper.at + sweeperEnd) / 2, at: 0, x: -5 },
      { path: 2, seg: (split.points.length - 1) / 2, at: 0, x: 0 },
    ],
    checkpoints: 8,
    colors: ['#f0a01c', '#52d6ff'],
  }
}

// Dry road at each end of a stretch of shallows, so its openings stay dry, and how far the dry
// road weaves either side of its line.
const SHORE = 40
const WEAVE = 8
// Metres over which Tidal's shortcuts ease onto main's road at their ends. They leave and rejoin
// on flat road and are long and gentle, so a long ease keeps the merge from becoming an S-bend.
const SHORE_MERGE = 100
// How far before and after Tidal's banked hairpin its shortcut leaves and rejoins.
const LEAD = 100

/**
 * A straight whose middle runs through shallow water, with a dry road round it on side (+ right).
 * The dry road leaves main's edge where the straight starts, swings swing metres further out,
 * weaving a little, and comes back to the edge where it ends. A pad sits halfway along each.
 * Returns the dry road and the main segments it spans.
 */
function shallows(
  p: Pen,
  length: number,
  side: 1 | -1,
  swing: number,
): { from: number; to: number; dry: PathDef } {
  const from = here(p)
  const start = { x: p.x, y: p.y, z: p.z, h: p.h }
  straight(p, SHORE)
  const wet = here(p)
  straight(p, length / 2 - SHORE)
  pad(p, 0)
  straight(p, length / 2 - SHORE)
  for (let k = wet; k < here(p); k++) p.water.push(k)
  straight(p, SHORE)
  const n = Math.ceil(length / 10)
  const points: PointDef[] = []
  for (let k = 0; k <= n; k++) {
    const u = k / n
    const bulge = Math.sin(Math.PI * u) ** 2
    const out = side * (DEFAULT_WIDTH / 2 + bulge * (swing + WEAVE * Math.sin(4 * Math.PI * u)))
    const along = length * u
    points.push({
      p: [
        start.x + Math.cos(start.h) * along + Math.sin(start.h) * out,
        start.y + Math.sin(start.h) * along - Math.cos(start.h) * out,
        start.z,
      ],
      width: 12,
    })
  }
  return {
    from,
    to: here(p),
    dry: merged({ points, closed: false }, side, start.h, start.h, SHORE_MERGE),
  }
}

// Tidal: a figure of eight low over the sea that crosses itself once, on a bridge. East under the
// bridge and through the first shallows, over a hump that kinks right into a banked left that
// tightens, then a chicane. A climbing left and a ramp up onto a viaduct, a tight S off its crest,
// and a banked left onto the bridge, which drops back to the water through tight esses. West
// through the second shallows, a banked hairpin, a tight hairpin the other way, and a wide sweeper
// back to the line. Shallow water lies on the straight line through each stretch of shallows and
// a slightly longer dry road weaves round it. A shortcut turns back early across the banked
// hairpin's inside, through water, and the sweeper has a tighter inner split.
function tidal(): TrackDef {
  const p = pen(0, 0, 10, 0)
  straight(p, 100)
  pad(p, -4)
  straight(p, 150)
  turn(p, -40, 120)
  turn(p, 40, 120)
  straight(p, 80)
  // Where the bridge crosses over.
  const under = { x: p.x, y: p.y }
  straight(p, 80)
  const w1 = shallows(p, 440, -1, 70)
  turn(p, 15, 400, 0, 10)
  turn(p, -35, 160, 0.2, -5)
  turn(p, -25, 90, 0.3, -5)
  turn(p, -45, 32, 0.3)
  straight(p, 40)
  turn(p, 60, 28)
  turn(p, -120, 28)
  turn(p, 60, 28)
  straight(p, 50)
  turn(p, -90, 150, 0.3, 16)
  straight(p, 200, 20)
  pad(p, -4)
  turn(p, 45, 40, 0, -4)
  turn(p, -45, 40, 0, -2)
  // West until the left onto the bridge comes out heading south over the crossing.
  straight(p, p.x - 130 - under.x, 4)
  turn(p, -90, 130, 0.4)
  straight(p, 100)
  pad(p, 0)
  // Over the crossing about 25 m up, then down off the bridge.
  straight(p, p.y - under.y + 30, -10)
  turn(p, 15, 300, 0, -10)
  turn(p, -15, 300, 0, -10)
  turn(p, -60, 30, 0, -2)
  turn(p, 120, 30, 0, -2)
  turn(p, -60, 30)
  straight(p, 40)
  turn(p, 90, 120, 0.3)
  const w2 = shallows(p, 440, 1, 70)
  straight(p, 40)
  const cutFrom = here(p)
  straight(p, LEAD)
  const hairpin = turn(p, -180, 80, 0.6)
  straight(p, LEAD)
  const cutTo = here(p)
  straight(p, 50)
  turn(p, 180, 22)
  straight(p, 160)
  const { sweeper, sweeperEnd, radius } = close(p, 0.1)
  const inside = merged(
    earlyTurn(hairpin, -180, 80, LEAD, 10),
    -1,
    hairpin.h,
    hairpin.h - Math.PI,
    SHORE_MERGE,
  )
  // The middle third of the shortcut's 24 segments is under water.
  inside.water = Array.from({ length: 8 }, (_, k) => 8 + k)
  const split = merged(
    insideLine(sweeper, 180, radius, 10 - sweeper.z, radius - 60, 10),
    1,
    sweeper.h,
    sweeper.h - Math.PI,
    SHORE_MERGE,
  )
  const halfway = (path: number, def: PathDef) => ({
    path,
    seg: (def.points.length - 1) / 2,
    at: 0,
    x: 0,
  })
  return {
    id: 'tidal',
    paths: [{ points: p.points, closed: true, water: p.water }, w1.dry, w2.dry, inside, split],
    branches: [
      { path: 1, from: w1.from, to: w1.to, kind: 'shortcut', side: -1 },
      { path: 2, from: w2.from, to: w2.to, kind: 'shortcut', side: 1 },
      { path: 3, from: cutFrom, to: cutTo, kind: 'shortcut', side: -1 },
      { path: 4, from: sweeper.at, to: sweeperEnd, kind: 'shortcut', side: 1 },
    ],
    pads: [
      ...p.pads,
      halfway(1, w1.dry),
      halfway(2, w2.dry),
      // Halfway round the sweeper, on the outside.
      { path: 0, seg: (sweeper.at + sweeperEnd) / 2, at: 0, x: -5 },
      halfway(4, split),
    ],
    checkpoints: 8,
    colors: ['#f2662a', '#3fe0cf'],
  }
}

export const TRACK_DEFS: Record<TrackId, TrackDef> = {
  coaster: coaster(),
  skyway: skyway(),
  tidal: tidal(),
}

const built: Partial<Record<TrackId, Track>> = {}

/** Built tracks. Each one is built on first access. */
export const TRACKS = {} as Record<TrackId, Track>
for (const id of Object.keys(TRACK_DEFS) as TrackId[]) {
  Object.defineProperty(TRACKS, id, {
    enumerable: true,
    get: () => {
      built[id] ??= buildTrack(TRACK_DEFS[id])
      return built[id]
    },
  })
}
