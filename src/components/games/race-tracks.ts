import { smoothstep, wrap } from './race-math.ts'
import type { TrackId } from './race-rules.ts'

// Track geometry. Authored control points become a centreline sampled every metre, with a frame
// at each sample that follows the road through loops, corkscrews and banked turns. Pure data with
// no three.js, so the physics and the lap script run under plain Node.

export type Vec3 = [number, number, number]
/** Position, forward tangent, surface up, right. Unit vectors, right = forward × up. */
export type Frame = { p: Vec3; t: Vec3; n: Vec3; r: Vec3 }

/**
 * Authoring input. Positive roll tilts up towards the right, which banks a right-hand turn.
 * Default width is DEFAULT_WIDTH.
 */
export type PointDef = {
  p: Vec3
  roll?: number /* radians, added to the transported up */
  width?: number
}
/** Segment i runs from points[i] to points[i + 1]. */
export type PathDef = {
  points: PointDef[]
  closed: boolean
  water?: number[] /* segment indices */
  gap?: number[]
}
export type PadDef = {
  path: number
  seg: number
  at: number /* 0..1 along the segment */
  x: number
  launch?: boolean
}
export type BranchDef = {
  path: number
  from: number
  to: number /* segment indices on path 0 */
  kind: 'shortcut' | 'drop'
  side?: -1 | 1
}
export type TrackDef = {
  id: TrackId
  paths: PathDef[] // paths[0] is the closed main loop, the rest are branches
  branches: BranchDef[]
  pads: PadDef[]
  checkpoints: number // how many, spread evenly on the main path outside branch spans
  /** The barriers' band, kerbs and ramp lips, then the boost pads and arrows. */
  colors: [string, string]
}

export type TrackPath = {
  closed: boolean
  length: number
  /** One sample per SAMPLE metres. Flat arrays, 3 floats per sample for each vector. */
  p: Float32Array
  t: Float32Array
  n: Float32Array
  r: Float32Array
  width: Float32Array
  /** Signed lateral curvature, 1/m: positive turns right. */
  curve: Float32Array
  water: Uint8Array
  gap: Uint8Array
}
export type Branch = {
  path: number
  from: number
  to: number /* metres on main */
  kind: 'shortcut' | 'drop'
  /** The side of main the branch lies on. A lower road's is the side it comes up from. */
  side: -1 | 1
  /**
   * Metres of main after from, and before to, with no wall between main and the branch. A
   * shortcut's while its near edge is on main's road and level with it. A lower road has no open,
   * and closes while its wall facing main would stand on main's road.
   */
  open: number
  close: number
  /**
   * Metres of main after from where main's wall on the shortcut's side comes back: SPLIT past the
   * open. A ship in the shortcut's lane there goes onto it. 0 for a lower road.
   */
  fork: number
}
export type Pad = { path: number; s: number; x: number; launch: boolean }
export type Track = {
  id: TrackId
  paths: TrackPath[]
  branches: Branch[]
  pads: Pad[]
  checkpoints: number[]
  colors: [string, string]
}

export const SAMPLE = 1 // metres
export const DEFAULT_WIDTH = 16
export const PAD_LENGTH = 6
export const PAD_HALF_WIDTH = 2.5
export const OPENING = 30 // metres of main kept clear of checkpoints either side of a branch

const TWO_PI = Math.PI * 2
// Spacing of the dense pass that measures arc length before resampling.
const DENSE_STEP = 0.2
// Parameter step for the central difference that gives the tangent.
const TANGENT_H = 1e-4
// Metres over which the base frame settles back to level after transport tilts it.
const LEVEL_DISTANCE = 20
// A branch's near edge this far above or below main's surface isn't level with main's road, and
// ships don't cross there. Shortcuts are laid onto main where they share it, so the open stretch
// is flush; anything looser lets a ship pop up or down where a level shortcut leaves a banking
// turn.
const LEVEL = 0.3
// Main samples searched either side of a guess for the one nearest a branch point.
const SEARCH = 60
/** How tall walls stand. */
export const WALL_HEIGHT = 1.1
// A branch point this close to main's road counts as on it: metres off the surface, and past
// the edge.
export const ON_ROAD_UP = 1.5
export const ON_ROAD_EDGE = 0.3
/**
 * Metres past a shortcut's opening where main still has no wall on its side. A shortcut often
 * starts on main's outer lanes, so a ship in its lane when the opening ends goes onto it here
 * rather than meeting main's wall in the middle of the shortcut's road.
 */
const SPLIT = 6

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

function cross(a: Vec3, b: Vec3, out: Vec3): Vec3 {
  const x = a[1] * b[2] - a[2] * b[1]
  const y = a[2] * b[0] - a[0] * b[2]
  const z = a[0] * b[1] - a[1] * b[0]
  out[0] = x
  out[1] = y
  out[2] = z
  return out
}

function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2])
  if (len > 0) {
    v[0] /= len
    v[1] /= len
    v[2] /= len
  }
  return v
}

/** Rotates v in place about the unit axis k by angle a (Rodrigues). */
function rotate(v: Vec3, k: Vec3, a: number): Vec3 {
  const c = Math.cos(a)
  const s = Math.sin(a)
  const kv = dot(k, v) * (1 - c)
  const x = v[0] * c + (k[1] * v[2] - k[2] * v[1]) * s + k[0] * kv
  const y = v[1] * c + (k[2] * v[0] - k[0] * v[2]) * s + k[1] * kv
  const z = v[2] * c + (k[0] * v[1] - k[1] * v[0]) * s + k[2] * kv
  v[0] = x
  v[1] = y
  v[2] = z
  return v
}

/** Removes v's component along unit t and normalises what's left. */
function orthogonalize(v: Vec3, t: Vec3): Vec3 {
  const d = dot(v, t)
  v[0] -= d * t[0]
  v[1] -= d * t[1]
  v[2] -= d * t[2]
  return normalize(v)
}

/** Turns up from tangent a to tangent b by the smallest rotation that takes a onto b. */
function transport(up: Vec3, a: Vec3, b: Vec3): Vec3 {
  const axis = cross(a, b, [0, 0, 0])
  const sin = Math.hypot(axis[0], axis[1], axis[2])
  if (sin > 1e-12) rotate(up, normalize(axis), Math.atan2(sin, dot(a, b)))
  return orthogonalize(up, b)
}

/** The signed angle about unit axis k that turns a onto b, both perpendicular to k. */
function angleAbout(a: Vec3, b: Vec3, k: Vec3): number {
  return Math.atan2(dot(k, cross(a, b, [0, 0, 0])), dot(a, b))
}

/**
 * Eases up back towards level, or level upside down, whichever is nearer. Transport alone lets
 * bank creep in wherever the road climbs while it turns: two turns of a gentle spiral ramp come
 * out banked 66°, and a loop that drifts sideways exits tilted. The pull scales with how flat the
 * tangent is, so it lets go through the vertical part of a loop and transport carries up there.
 */
function level(up: Vec3, t: Vec3): Vec3 {
  const flat = t[0] * t[0] + t[1] * t[1]
  if (flat < 1e-8) return up
  let bank = angleAbout(orthogonalize([0, 0, 1], t), up, t)
  if (bank > Math.PI / 2) bank -= Math.PI
  else if (bank < -Math.PI / 2) bank += Math.PI
  return rotate(up, t, -bank * Math.min(1, (flat * SAMPLE) / LEVEL_DISTANCE))
}

// One centripetal Catmull-Rom segment between q[1] and q[2], with its knots.
type Segment = { q: [Vec3, Vec3, Vec3, Vec3]; k: [number, number, number, number] }

function segmentAt(g: Segment, u: number, out: Vec3): Vec3 {
  const [p0, p1, p2, p3] = g.q
  const [t0, t1, t2, t3] = g.k
  const t = t1 + u * (t2 - t1)
  // Barry and Goldman's pyramid, one coordinate at a time.
  const at = (x0: number, x1: number, x2: number, x3: number) => {
    const a1 = ((t1 - t) * x0 + (t - t0) * x1) / (t1 - t0)
    const a2 = ((t2 - t) * x1 + (t - t1) * x2) / (t2 - t1)
    const a3 = ((t3 - t) * x2 + (t - t2) * x3) / (t3 - t2)
    const b1 = ((t2 - t) * a1 + (t - t0) * a2) / (t2 - t0)
    const b2 = ((t3 - t) * a2 + (t - t1) * a3) / (t3 - t1)
    return ((t2 - t) * b1 + (t - t1) * b2) / (t2 - t1)
  }
  out[0] = at(p0[0], p1[0], p2[0], p3[0])
  out[1] = at(p0[1], p1[1], p2[1], p3[1])
  out[2] = at(p0[2], p1[2], p2[2], p3[2])
  return out
}

/** The slope at a point for monotone cubic interpolation: flat at a peak, valley or plateau. */
function slope(before: number, after: number): number {
  return before * after > 0 ? (2 * before * after) / (before + after) : 0
}

/**
 * Cubic between r1 and r2 that never overshoots, for roll. Plain Catmull-Rom would start
 * unwinding the wrong way a segment before a corkscrew.
 */
function hermite(r0: number, r1: number, r2: number, r3: number, u: number): number {
  const m1 = slope(r1 - r0, r2 - r1)
  const m2 = slope(r2 - r1, r3 - r2)
  const u2 = u * u
  const u3 = u2 * u
  return (
    (2 * u3 - 3 * u2 + 1) * r1 + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * r2 + (u3 - u2) * m2
  )
}

/** A path plus where each authored segment starts, in metres. */
type Built = { path: TrackPath; segStart: number[] }

function build(def: PathDef): Built {
  const pts = def.points
  const n = pts.length
  if (n < (def.closed ? 3 : 2)) {
    throw new Error(`a ${def.closed ? 'closed' : 'open'} path needs more points`)
  }
  const segs = def.closed ? n : n - 1
  const point = (i: number) => pts[i] as PointDef
  for (let i = 0; i < segs; i++) {
    if (dist(point(i).p, point((i + 1) % n).p) < 1e-6) {
      throw new Error(`points ${i} and ${(i + 1) % n} coincide`)
    }
  }

  // Control points and rolls past the ends: wrapped when closed, extended straight when open.
  // A closed path's rolls carry whole turns across the seam, so a corkscrew doesn't unwind there.
  const lapRoll = def.closed
    ? TWO_PI * Math.round(((point(n - 1).roll ?? 0) - (point(0).roll ?? 0)) / TWO_PI)
    : 0
  const ctrl = (i: number): Vec3 => {
    if (def.closed) return point(wrap(i, n)).p
    if (i < 0) return sub(point(0).p, sub(point(1).p, point(0).p))
    if (i >= n) return sub(point(n - 1).p, sub(point(n - 2).p, point(n - 1).p))
    return point(i).p
  }
  const rollAt = (i: number): number => {
    if (!def.closed) return point(Math.min(Math.max(i, 0), n - 1)).roll ?? 0
    return (point(wrap(i, n)).roll ?? 0) + lapRoll * Math.floor(i / n)
  }

  const segments: Segment[] = []
  for (let i = 0; i < segs; i++) {
    const q: Segment['q'] = [ctrl(i - 1), ctrl(i), ctrl(i + 1), ctrl(i + 2)]
    const k1 = Math.sqrt(dist(q[0], q[1]))
    const k2 = k1 + Math.sqrt(dist(q[1], q[2]))
    segments.push({ q, k: [0, k1, k2, k2 + Math.sqrt(dist(q[2], q[3]))] })
  }

  // Dense pass: arc length against (segment, u). Each segment lists u = 0 and u = 1, so the
  // boundary appears twice at the same distance.
  const ds: number[] = []
  const dSeg: number[] = []
  const dU: number[] = []
  const segStart: number[] = []
  const a: Vec3 = [0, 0, 0]
  const b: Vec3 = [0, 0, 0]
  let length = 0
  for (let i = 0; i < segs; i++) {
    const g = segments[i] as Segment
    const steps = Math.max(8, Math.ceil((1.5 * dist(g.q[1], g.q[2])) / DENSE_STEP))
    segStart.push(length)
    segmentAt(g, 0, a)
    for (let j = 0; j <= steps; j++) {
      const u = j / steps
      if (j > 0) {
        segmentAt(g, u, b)
        length += dist(a, b)
        a[0] = b[0]
        a[1] = b[1]
        a[2] = b[2]
      }
      ds.push(length)
      dSeg.push(i)
      dU.push(u)
    }
  }
  segStart.push(length)

  // Samples sit every SAMPLE metres. A closed path's last gap back to sample 0 is shorter, and
  // an open path gets a final sample at its very end.
  const count = def.closed
    ? Math.ceil(length / SAMPLE - 1e-6)
    : Math.ceil(length / SAMPLE - 1e-6) + 1
  const sAt = (i: number) => (!def.closed && i === count - 1 ? length : i * SAMPLE)
  const water = new Set(def.water ?? [])
  const gap = new Set(def.gap ?? [])
  const pos: Vec3[] = []
  const tan: Vec3[] = []
  const up: Vec3[] = []
  const roll: number[] = []
  const path: TrackPath = {
    closed: def.closed,
    length,
    p: new Float32Array(count * 3),
    t: new Float32Array(count * 3),
    n: new Float32Array(count * 3),
    r: new Float32Array(count * 3),
    width: new Float32Array(count),
    curve: new Float32Array(count),
    water: new Uint8Array(count),
    gap: new Uint8Array(count),
  }

  let d = 0
  for (let i = 0; i < count; i++) {
    const s = sAt(i)
    while (d + 2 < ds.length && (ds[d + 1] as number) <= s) d++
    const s0 = ds[d] as number
    const s1 = ds[d + 1] as number
    const f = s1 > s0 ? Math.min(Math.max((s - s0) / (s1 - s0), 0), 1) : 0
    const seg = dSeg[d] as number
    const u0 = dU[d] as number
    const u = u0 + f * ((dU[d + 1] as number) - u0)
    const g = segments[seg] as Segment
    pos.push(segmentAt(g, u, [0, 0, 0]))
    const ahead = segmentAt(g, u + TANGENT_H, [0, 0, 0])
    const behind = segmentAt(g, u - TANGENT_H, [0, 0, 0])
    tan.push(normalize(sub(ahead, behind)))
    roll.push(hermite(rollAt(seg - 1), rollAt(seg), rollAt(seg + 1), rollAt(seg + 2), u))
    const w0 = point(seg).width ?? DEFAULT_WIDTH
    const w1 = point((seg + 1) % n).width ?? DEFAULT_WIDTH
    path.width[i] = w0 + u * (w1 - w0)
    path.water[i] = water.has(seg) ? 1 : 0
    path.gap[i] = gap.has(seg) ? 1 : 0
  }

  // Up starts as world up off the first tangent and is carried along by parallel transport,
  // which survives the tangent passing straight up or down inside a loop, then levelled.
  const t0 = tan[0] as Vec3
  const first: Vec3 = Math.abs(t0[2]) > 0.999 ? [1, 0, 0] : [0, 0, 1]
  up.push(orthogonalize(first, t0))
  for (let i = 1; i < count; i++) {
    const t = tan[i] as Vec3
    up.push(level(transport([...(up[i - 1] as Vec3)], tan[i - 1] as Vec3, t), t))
  }
  // A closed lap can come back twisted at the seam, for example when it starts inside a loop
  // where levelling lets go. Spread the correction evenly over the lap.
  let twist = 0
  if (def.closed) {
    const back = transport([...(up[count - 1] as Vec3)], tan[count - 1] as Vec3, t0)
    twist = angleAbout(back, up[0] as Vec3, t0)
  }

  for (let i = 0; i < count; i++) {
    const t = tan[i] as Vec3
    const nv = rotate(up[i] as Vec3, t, (twist * sAt(i)) / length + (roll[i] as number))
    path.p.set(pos[i] as Vec3, i * 3)
    path.t.set(t, i * 3)
    path.n.set(nv, i * 3)
    path.r.set(cross(t, nv, [0, 0, 0]), i * 3)
  }

  // Curvature: how fast the tangent swings towards the right vector.
  for (let i = 0; i < count; i++) {
    let lo = i - 1
    let hi = i + 1
    let span: number
    if (def.closed) {
      lo = (lo + count) % count
      hi %= count
      span = (i === count - 1 ? length : sAt(hi)) - (i === 0 ? sAt(lo) - length : sAt(lo))
    } else {
      lo = Math.max(lo, 0)
      hi = Math.min(hi, count - 1)
      span = sAt(hi) - sAt(lo)
    }
    const dt = sub(tan[hi] as Vec3, tan[lo] as Vec3)
    const rv: Vec3 = [path.r[i * 3] ?? 0, path.r[i * 3 + 1] ?? 0, path.r[i * 3 + 2] ?? 0]
    path.curve[i] = dot(dt, rv) / span
  }

  return { path, segStart }
}

/** Builds one path on its own, as buildTrack does each path before laying shortcuts onto main. */
export function buildPath(def: PathDef): TrackPath {
  return build(def).path
}

function segmentMetres(built: Built, seg: number, what: string): number {
  const at = built.segStart[seg]
  if (!Number.isInteger(seg) || at === undefined) throw new Error(`${what}: no segment ${seg}`)
  return at
}

/**
 * Spreads checkpoints evenly over the main loop's free road, meaning every metre outside each
 * branch span ±OPENING. Counted in free metres, the start line and the checkpoints split the
 * lap into equal gaps.
 */
function placeCheckpoints(count: number, length: number, branches: Branch[]): number[] {
  if (count === 0) return []
  const blocked: [number, number][] = []
  for (const b of branches) {
    const lo = b.from - OPENING
    const to = b.to >= b.from ? b.to : b.to + length
    const hi = Math.max(to, b.from + b.open) + OPENING
    // A span can hang off either end of the lap, so clip it with each shift into [0, length].
    for (const shift of [-length, 0, length]) {
      const from = Math.max(lo + shift, 0)
      const to = Math.min(hi + shift, length)
      if (from < to) blocked.push([from, to])
    }
  }
  blocked.sort((a, b) => a[0] - b[0])
  const free: [number, number][] = []
  let edge = 0
  for (const [lo, hi] of blocked) {
    if (lo > edge) free.push([edge, lo])
    edge = Math.max(edge, hi)
  }
  if (edge < length) free.push([edge, length])
  const total = free.reduce((sum, [lo, hi]) => sum + hi - lo, 0)
  if (total <= 0) throw new Error('no road outside the branches for checkpoints')

  const out: number[] = []
  let i = 0
  let passed = 0 // free metres in the stretches before free[i]
  for (let k = 0; k < count; k++) {
    const want = ((k + 1) * total) / (count + 1)
    let stretch = free[i] as [number, number]
    while (want > passed + stretch[1] - stretch[0]) {
      passed += stretch[1] - stretch[0]
      i++
      stretch = free[i] as [number, number]
    }
    out.push(stretch[0] + want - passed)
  }
  return out
}

/** The main sample nearest point, searched around the one at guess metres. */
export function nearestMain(main: TrackPath, point: Vec3, guess: number): number {
  const count = main.width.length
  const start = sampleIndex(main, guess)
  let best = start
  let nearest = Number.POSITIVE_INFINITY
  for (let k = -SEARCH; k <= SEARCH; k++) {
    const j = wrap(start + k, count)
    const dx = point[0] - (main.p[j * 3] ?? 0)
    const dy = point[1] - (main.p[j * 3 + 1] ?? 0)
    const dz = point[2] - (main.p[j * 3 + 2] ?? 0)
    const d = dx * dx + dy * dy + dz * dz
    if (d < nearest) {
      nearest = d
      best = j
    }
  }
  return best
}

/**
 * Which side of main a lower road comes up on, and how long before to its wall facing main would
 * stand on main's road, in main metres. That wall isn't drawn there, and a ship crossing its edge
 * there is back on main.
 */
function dropEnd(
  main: TrackPath,
  path: TrackPath,
  from: number,
  to: number,
): { side: -1 | 1; close: number } {
  const n = path.width.length
  const span = wrap(to - from, main.length)
  const point: Vec3 = [0, 0, 0]
  /** The main metres beside the middle of sample i's wall on edge, if that's on main's road. */
  const beside = (i: number, edge: number): number | null => {
    const half = (path.width[i] ?? 0) / 2
    for (let k = 0; k < 3; k++) {
      point[k] =
        (path.p[i * 3 + k] ?? 0) +
        edge * half * (path.r[i * 3 + k] ?? 0) +
        (WALL_HEIGHT / 2) * (path.n[i * 3 + k] ?? 0)
    }
    const best = nearestMain(main, point, from + (i / Math.max(n - 1, 1)) * span)
    if (main.gap[best]) return null
    let up = 0
    let across = 0
    for (let k = 0; k < 3; k++) {
      const d = (point[k] as number) - (main.p[best * 3 + k] ?? 0)
      up += d * (main.n[best * 3 + k] ?? 0)
      across += d * (main.r[best * 3 + k] ?? 0)
    }
    const on =
      Math.abs(up) < ON_ROAD_UP && Math.abs(across) < (main.width[best] ?? 0) / 2 + ON_ROAD_EDGE
    return on ? best * SAMPLE : null
  }
  const closes = (edge: number) => {
    let close = 0
    for (let i = n - 1; i >= 0; i--) {
      const m = beside(i, edge)
      if (m === null) break
      // Signed, so a sample a hair past to doesn't wrap round the lap.
      close = Math.max(0, shortWay(main, to - m))
    }
    return close
  }
  const left = closes(-1)
  const right = closes(1)
  // The wall facing main is the one on main's road for longer. The road lies the other way.
  return left >= right ? { side: 1, close: left } : { side: -1, close: right }
}

/**
 * How long a shortcut's near edge, the one facing main, stays on main's road and level with it
 * after from, and how long before to it's back, in main metres. Each branch sample is matched to
 * the main sample nearest its near edge.
 */
function openings(
  main: TrackPath,
  path: TrackPath,
  from: number,
  to: number,
  side: number,
): { open: number; close: number } {
  const n = path.width.length
  const span = wrap(to - from, main.length)
  /** The main metres beside sample i if its near edge is on main's road and level, else null. */
  const beside = (i: number): number | null => {
    const half = (path.width[i] ?? 0) / 2
    const edge: Vec3 = [0, 0, 0]
    for (let k = 0; k < 3; k++) {
      edge[k] = (path.p[i * 3 + k] ?? 0) - side * half * (path.r[i * 3 + k] ?? 0)
    }
    const best = nearestMain(main, edge, from + (i / Math.max(n - 1, 1)) * span)
    const at = (src: Float32Array): Vec3 => [
      src[best * 3] ?? 0,
      src[best * 3 + 1] ?? 0,
      src[best * 3 + 2] ?? 0,
    ]
    const away = sub(edge, at(main.p))
    const across = dot(away, at(main.r)) * side
    const on = across < (main.width[best] ?? 0) / 2 && Math.abs(dot(away, at(main.n))) < LEVEL
    return on ? best * SAMPLE : null
  }
  // Each opening ends at the main metres beside the last sample still level with main.
  let open = 0
  for (let i = 0; i < n; i++) {
    const m = beside(i)
    if (m === null) break
    open = wrap(m - from, main.length)
  }
  let close = 0
  for (let i = n - 1; i >= 0; i--) {
    const m = beside(i)
    if (m === null) break
    close = wrap(to - m, main.length)
  }
  return { open, close }
}

/** Metres over which a shortcut eases from main's height and bank back to its own. */
const MERGE_BLEND = 40
/** Samples either side a laid shortcut's tangent is taken over. */
const SPAN = 3
/** cos 15°: main's up may turn this far from the junction's before a lay stops. A sweeper's bank is followed; a hairpin's isn't. */
const STEADY = Math.cos((15 * Math.PI) / 180)

/**
 * Lays a built shortcut onto main's surface wherever its near edge is over main's road: each
 * sample there moves onto main's plane and takes main's up, and past those it eases back to its
 * own road over MERGE_BLEND metres. Otherwise a level shortcut leaving a banked turn rises out of
 * main's road, the two surfaces cut through each other, and a ship crossing over pops up and
 * snaps level. Only heights and tilt change, so lengths, segments, pads and water stay put.
 */
function layOnto(main: TrackPath, path: TrackPath, side: number) {
  const n = path.width.length
  const count = main.width.length
  const at = (src: Float32Array, i: number): Vec3 => [
    src[i * 3] ?? 0,
    src[i * 3 + 1] ?? 0,
    src[i * 3 + 2] ?? 0,
  ]
  /** Sample i's near edge, the one facing main: where the two roads share asphalt. */
  const nearEdge = (i: number): Vec3 => {
    const half = (path.width[i] ?? 0) / 2
    const p = at(path.p, i)
    for (let c = 0; c < 3; c++) p[c] = (p[c] as number) - side * half * (path.r[i * 3 + c] ?? 0)
    return p
  }
  // Main's nearest sample to each near edge: searched over the lap once, then followed along.
  const match = new Int32Array(n)
  let m = -1
  for (let i = 0; i < n; i++) {
    const p = nearEdge(i)
    let best = Number.POSITIVE_INFINITY
    const near = (j: number) => {
      const d = dist(p, at(main.p, j))
      if (d < best) {
        best = d
        m = j
      }
    }
    if (m < 0) for (let j = 0; j < count; j++) near(j)
    else for (let k = -SEARCH; k <= SEARCH; k++) near(wrap(m + k, count))
    match[i] = m
  }
  /** Whether sample i's near edge lies on main's road. */
  const over = (i: number) => {
    const j = match[i] as number
    const edge = sub(nearEdge(i), at(main.p, j))
    return (
      Math.abs(dot(edge, at(main.r, j))) < (main.width[j] ?? 0) / 2 &&
      Math.abs(dot(edge, at(main.n, j))) < ON_ROAD_UP &&
      !main.gap[j]
    )
  }
  // The lay stops where main starts to bank or unbank: a shortcut can't follow a hairpin's bank
  // and stay its own level road, and twisting it after one makes crossing worse, not better.
  const steady = (i: number, end: number) =>
    dot(at(main.n, match[i] as number), at(main.n, match[end] as number)) > STEADY
  let head = -1
  while (head + 1 < n && over(head + 1) && steady(head + 1, 0)) head++
  let tail = n
  while (tail - 1 > head && over(tail - 1) && steady(tail - 1, n - 1)) tail--
  if (head < 0 && tail >= n) return
  const weight = (i: number) =>
    Math.max(
      head >= 0 ? 1 - smoothstep(head, head + MERGE_BLEND, i * SAMPLE) : 0,
      tail < n ? smoothstep(tail - MERGE_BLEND, tail, i * SAMPLE) : 0,
    )
  const w = Float32Array.from({ length: n }, (_, i) => weight(i))
  for (let i = 0; i < n; i++) {
    const k = w[i] as number
    if (k <= 0) continue
    const j = match[i] as number
    const p = at(path.p, i)
    const nm = at(main.n, j)
    // Onto main's plane: drop the part of the offset that's along main's up.
    const lift = dot(sub(p, at(main.p, j)), nm)
    for (let c = 0; c < 3; c++) path.p[i * 3 + c] = (p[c] as number) - k * lift * (nm[c] as number)
    const own = at(path.n, i)
    const up = normalize([
      own[0] + k * (nm[0] - own[0]),
      own[1] + k * (nm[1] - own[1]),
      own[2] + k * (nm[2] - own[2]),
    ])
    path.n.set(up, i * 3)
  }
  // Tangents follow the new heights, taken over a few metres so they stay smooth; up and right
  // are made square to them again. Curvature across the road barely moves with height and tilt,
  // and a noisy one would make drivers brake for nothing, so it stays as built.
  const touched = (i: number) => {
    for (let k = Math.max(0, i - SPAN); k <= Math.min(n - 1, i + SPAN); k++) {
      if ((w[k] as number) > 0) return true
    }
    return false
  }
  const tan: Vec3[] = []
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - SPAN)
    const hi = Math.min(n - 1, i + SPAN)
    tan.push(touched(i) ? normalize(sub(at(path.p, hi), at(path.p, lo))) : at(path.t, i))
  }
  for (let i = 0; i < n; i++) {
    if (!touched(i)) continue
    const t = tan[i] as Vec3
    const up = orthogonalize(at(path.n, i), t)
    path.t.set(t, i * 3)
    path.n.set(up, i * 3)
    path.r.set(cross(t, up, [0, 0, 0]), i * 3)
  }
}

export function buildTrack(def: TrackDef): Track {
  const main = def.paths[0]
  if (!main?.closed) throw new Error(`${def.id}: paths[0] must be a closed loop`)
  const mainBuilt = build(main)
  const length = mainBuilt.path.length
  // Shortcuts are laid onto main's surface where they share its road.
  const built = def.paths.map((path, i) => {
    if (i === 0) return mainBuilt
    const b = def.branches.find((x) => x.path === i)
    if (b?.kind !== 'shortcut' || b.side === undefined) return build(path)
    const own = build(path)
    layOnto(mainBuilt.path, own.path, b.side)
    return own
  })

  const branches = def.branches.map((b, i): Branch => {
    if (b.path < 1 || !built[b.path]) throw new Error(`${def.id} branch ${i}: no path ${b.path}`)
    if (b.kind === 'shortcut' && b.side === undefined) {
      throw new Error(`${def.id} branch ${i}: a shortcut needs a side`)
    }
    const from = segmentMetres(mainBuilt, b.from, `${def.id} branch ${i}`) % length
    const to = segmentMetres(mainBuilt, b.to, `${def.id} branch ${i}`) % length
    const own = (built[b.path] as Built).path
    if (b.kind === 'drop') {
      const { side, close } = dropEnd(mainBuilt.path, own, from, to)
      return { path: b.path, from, to, kind: b.kind, side, open: 0, close, fork: 0 }
    }
    const side = b.side as -1 | 1
    const ends = openings(mainBuilt.path, own, from, to, side)
    return { path: b.path, from, to, kind: b.kind, side, ...ends, fork: ends.open + SPLIT }
  })

  const pads = def.pads.map((pad, i): Pad => {
    const owner = built[pad.path]
    if (!owner) throw new Error(`${def.id} pad ${i}: no path ${pad.path}`)
    if (pad.seg >= owner.segStart.length - 1) {
      throw new Error(`${def.id} pad ${i}: no segment ${pad.seg}`)
    }
    const start = segmentMetres(owner, pad.seg, `${def.id} pad ${i}`)
    const end = segmentMetres(owner, pad.seg + 1, `${def.id} pad ${i}`)
    return {
      path: pad.path,
      s: start + pad.at * (end - start),
      x: pad.x,
      launch: pad.launch ?? false,
    }
  })

  return {
    id: def.id,
    paths: built.map((b) => b.path),
    branches,
    pads,
    checkpoints: placeCheckpoints(def.checkpoints, length, branches),
    colors: def.colors,
  }
}

export const newFrame = (): Frame => ({ p: [0, 0, 0], t: [0, 0, 0], n: [0, 0, 0], r: [0, 0, 0] })

function lerpInto(src: Float32Array, a: number, b: number, f: number, out: Vec3) {
  for (let j = 0; j < 3; j++) {
    const x = src[a * 3 + j] ?? 0
    out[j] = x + f * ((src[b * 3 + j] ?? 0) - x)
  }
}

/** Interpolated frame at s metres. Wraps when closed, clamps when open. */
export function frameAt(path: TrackPath, s: number, out: Frame = newFrame()): Frame {
  const last = path.width.length - 1
  const length = path.length
  let a: number
  let b: number
  let end: number
  let w: number
  if (path.closed) {
    w = wrap(s, length)
    a = Math.min(Math.floor(w / SAMPLE), last)
    b = a === last ? 0 : a + 1
    end = a === last ? length : b * SAMPLE
  } else {
    w = Math.min(Math.max(s, 0), length)
    a = Math.min(Math.floor(w / SAMPLE), last - 1)
    b = a + 1
    end = b === last ? length : b * SAMPLE
  }
  const f = (w - a * SAMPLE) / (end - a * SAMPLE)
  lerpInto(path.p, a, b, f, out.p)
  lerpInto(path.t, a, b, f, out.t)
  lerpInto(path.n, a, b, f, out.n)
  normalize(out.t)
  orthogonalize(out.n, out.t)
  cross(out.t, out.n, out.r)
  return out
}

/** The sample nearest to s metres. Wraps when closed, clamps when open. */
export function sampleIndex(path: TrackPath, s: number): number {
  const count = path.width.length
  if (path.closed) {
    const i = Math.round(wrap(s, path.length) / SAMPLE)
    return i >= count ? 0 : i
  }
  return Math.min(Math.max(Math.round(s / SAMPLE), 0), count - 1)
}

/**
 * The shortcut whose entrance or exit opening covers main at s on this side, if any: no wall
 * there. An entrance runs to the fork.
 */
export function openingAt(track: Track, s: number, side: number): Branch | undefined {
  const length = (track.paths[0] as TrackPath).length
  return track.branches.find(
    (b) =>
      b.kind === 'shortcut' &&
      b.side === side &&
      (wrap(s - b.from, length) < b.fork || wrap(b.to - s, length) < b.close),
  )
}

/** The road's width at s metres. */
export const widthAt = (path: TrackPath, s: number) => path.width[sampleIndex(path, s)] ?? 0

/** ds metres along a path, taken the short way across the start line when it's a loop. */
export const shortWay = (path: Pick<TrackPath, 'closed' | 'length'>, ds: number) =>
  path.closed ? wrap(ds + path.length / 2, path.length) - path.length / 2 : ds

/** The point lat metres right of the frame's centre and up above it: p + r·lat + n·up. */
export function place(out: Vec3, f: Frame, lat: number, up: number): Vec3 {
  out[0] = f.p[0] + f.r[0] * lat + f.n[0] * up
  out[1] = f.p[1] + f.r[1] * lat + f.n[1] * up
  out[2] = f.p[2] + f.r[2] * lat + f.n[2] * up
  return out
}

const scratch = newFrame()

/** p + r·x + n·y on the given path. */
export function worldPos(track: Track, path: number, s: number, x: number, y: number): Vec3 {
  const owner = track.paths[path]
  if (!owner) throw new Error(`no path ${path}`)
  return place([0, 0, 0], frameAt(owner, s, scratch), x, y)
}
