import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { smoothstep } from './race-math.ts'
import type { TrackId } from './race-rules.ts'
import { SLAB, type TrackLayout } from './race-track-mesh.ts'
import {
  type Frame,
  frameAt,
  newFrame,
  place,
  sampleIndex,
  type Track,
  WALL_HEIGHT,
  widthAt,
} from './race-tracks.ts'

// Where each track is, in daylight: the sky and sun, the land around the circuit, the sea or the
// cloud layer under it, rock towers, the pillars that hold the road up and the gantry over the
// start. Everything is made here from noise; nothing is loaded. Built once per track.
//
// The land climbs with distance from the road, so every circuit runs along a valley floor with
// ridges around it and nothing ever rises through the track.

/** [metres above the land's floor, colour]. */
type Stop = [number, string]
type Vec = [number, number, number]

export type Look = {
  zenith: string
  /** A little above the horizon. Without it blue and a warm horizon mix to grey. */
  mid: string
  horizon: string
  /** Under the horizon, and the fog, so far land fades into it. */
  haze: string
  /** Degrees above the horizon, and the compass bearing. */
  sun: { up: number; bearing: number; color: string; power: number }
  /** Light from the sky above and bounced off the ground below. */
  fill: { sky: string; ground: string; power: number }
  fog: number
  exposure: number
  land: {
    /** z of the valley floor. */
    floor: number
    /** Metres from the road where the land starts to climb, and where it's fully up. */
    near: number
    far: number
    height: number
    /** Mesas: heights settle on ledges this tall. 0 for rolling hills. */
    ledge: number
    /** Bumps on the valley floor, metres either way. */
    bumps: number
    colors: Stop[]
  }
  /** A flat layer over the land's floor. */
  sheet?: { kind: 'sea' | 'cloud'; z: number; color: string; shade: string }
  /** Rock towers near the road. */
  spires?: { count: number; height: [number, number]; colors: Stop[] }
  /** Where the pillars stop: the floor, or just inside the sea or cloud. */
  foot: number
  concrete: string
}

export const LOOKS: Record<TrackId, Look> = {
  // A desert canyon late in the afternoon: warm low sun, red mesas, sandstone towers.
  coaster: {
    zenith: '#2a64c0',
    mid: '#7fa9de',
    horizon: '#f2d3b0',
    haze: '#e0b48a',
    sun: { up: 16, bearing: 235, color: '#ffd6a6', power: 2.8 },
    fill: { sky: '#9fc3f5', ground: '#b0703f', power: 0.45 },
    fog: 0.00026,
    exposure: 0.95,
    land: {
      floor: -90,
      near: 240,
      far: 1500,
      height: 560,
      ledge: 70,
      bumps: 5,
      colors: [
        [0, '#d9a56f'],
        [30, '#c98552'],
        [110, '#a9552f'],
        [190, '#d49460'],
        [290, '#9a4a2b'],
        [400, '#c97f4c'],
        [620, '#e3b27c'],
      ],
    },
    spires: {
      count: 34,
      height: [70, 210],
      colors: [
        [0, '#c98552'],
        [60, '#a9552f'],
        [120, '#d49460'],
        [180, '#9a4a2b'],
        [240, '#c97f4c'],
      ],
    },
    foot: -90,
    concrete: '#c7b9a7',
  },
  // High above a sea of cloud at midday, with snow peaks standing out of it.
  skyway: {
    zenith: '#1a52c4',
    mid: '#6f9de0',
    horizon: '#d3e4f6',
    haze: '#e4ecf5',
    sun: { up: 52, bearing: 160, color: '#fff3df', power: 3.0 },
    fill: { sky: '#b9d4ff', ground: '#eef1f5', power: 0.5 },
    fog: 0.00018,
    exposure: 0.9,
    land: {
      floor: -560,
      near: 700,
      far: 3600,
      height: 1500,
      ledge: 0,
      bumps: 0,
      colors: [
        [0, '#3d434b'],
        [600, '#555c66'],
        [900, '#757b84'],
        [1000, '#eef2f7'],
        [2200, '#ffffff'],
      ],
    },
    // Far below the road, so it reads as cloud and not a snowfield. The tops stay 100 m under
    // the lowest road.
    sheet: { kind: 'cloud', z: -160, color: '#e8ecf1', shade: '#7f90a8' },
    foot: -150,
    concrete: '#d6dbe1',
  },
  // A grey-green coast in the morning: open sea, sea stacks and headlands.
  tidal: {
    zenith: '#46769c',
    mid: '#8cadc6',
    horizon: '#d2dfe3',
    haze: '#aec3c9',
    sun: { up: 24, bearing: 110, color: '#fff0dc', power: 2.4 },
    fill: { sky: '#c3d8e4', ground: '#2c565c', power: 0.5 },
    fog: 0.00034,
    exposure: 0.95,
    land: {
      floor: -50,
      near: 320,
      far: 2500,
      height: 400,
      ledge: 0,
      bumps: 6,
      colors: [
        [0, '#38463f'],
        [44, '#cbb68b'],
        [58, '#7d8f55'],
        [150, '#5c6d45'],
        [250, '#77746a'],
        [420, '#9a978c'],
      ],
    },
    sheet: { kind: 'sea', z: 0, color: '#0f4655', shade: '#0b3340' },
    spires: {
      count: 26,
      height: [70, 130],
      colors: [
        [0, '#2f3b38'],
        [46, '#5d5f58'],
        [90, '#77746a'],
        [130, '#8d8a80'],
      ],
    },
    foot: -8,
    concrete: '#b9bfc2',
  },
}

/** Half the land's width, metres. Past the far plane from anywhere on a track. */
const EXTENT = 7000
const LAND_CELLS = 220
const CLOUD_CELLS = 260
/** Metres the cloud puffs rise over the cloud layer's z. */
const CLOUD_TOP = 95
/** Metres between footprint points the land keeps away from. */
const FOOT_STEP = 12
/** Metres between pillars along the road. */
const PILLAR_STEP = 70
/** No pillar where another road passes under this close to it, metres. */
const PILLAR_CLEAR = 13
/** Metres between light posts on the barriers, and between gates over the road. */
const POST_STEP = 32
const POST_HEIGHT = 5
const GATE_STEP = 380
const GATE_HEIGHT = 7.5

// ---- noise ----------------------------------------------------------------------------------------

function hash(x: number, y: number, seed: number) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

/** Smooth value noise in [0, 1]. With period, it tiles every period units. */
function noise(x: number, y: number, seed: number, period = 0) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const u = x - xi
  const v = y - yi
  const su = u * u * (3 - 2 * u)
  const sv = v * v * (3 - 2 * v)
  const w = (n: number) => (period ? ((n % period) + period) % period : n)
  const a = hash(w(xi), w(yi), seed)
  const b = hash(w(xi + 1), w(yi), seed)
  const c = hash(w(xi), w(yi + 1), seed)
  const d = hash(w(xi + 1), w(yi + 1), seed)
  return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv
}

function fbm(x: number, y: number, seed: number, octaves: number) {
  let sum = 0
  let amp = 0.5
  let f = 1
  let total = 0
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise(x * f, y * f, seed + i)
    total += amp
    amp *= 0.5
    f *= 2.03
  }
  return sum / total
}

/** A seeded random number generator, so a track's towers stand in the same places every race. */
function random(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---- colour ---------------------------------------------------------------------------------------

type Ramp = { at: number; color: THREE.Color }[]
const ramp = (stops: Stop[]): Ramp => stops.map(([at, c]) => ({ at, color: new THREE.Color(c) }))

function shade(out: THREE.Color, r: Ramp, h: number) {
  const first = r[0]
  const last = r.at(-1)
  if (!first || !last) return out.set(0x808080)
  if (h <= first.at) return out.copy(first.color)
  for (let i = 1; i < r.length; i++) {
    const hi = r[i]
    const lo = r[i - 1]
    if (hi && lo && h <= hi.at)
      return out.copy(lo.color).lerp(hi.color, (h - lo.at) / (hi.at - lo.at))
  }
  return out.copy(last.color)
}

// ---- the track's footprint ------------------------------------------------------------------------

/** x, y every FOOT_STEP metres along every path. */
function footprint(track: Track): Float32Array {
  const out: number[] = []
  for (const path of track.paths) {
    const n = path.p.length / 3
    const step = Math.max(1, Math.round(FOOT_STEP / (path.length / n)))
    for (let i = 0; i < n; i += step) out.push(path.p[i * 3] ?? 0, path.p[i * 3 + 1] ?? 0)
  }
  return new Float32Array(out)
}

/** A test for whether x, y is at least reach from the box round the points: then none is nearer. */
function beyond(points: Float32Array, reach: number) {
  let x0 = Number.POSITIVE_INFINITY
  let x1 = Number.NEGATIVE_INFINITY
  let y0 = Number.POSITIVE_INFINITY
  let y1 = Number.NEGATIVE_INFINITY
  for (let i = 0; i < points.length; i += 2) {
    const px = points[i] as number
    const py = points[i + 1] as number
    if (px < x0) x0 = px
    if (px > x1) x1 = px
    if (py < y0) y0 = py
    if (py > y1) y1 = py
  }
  return (vx: number, vy: number) =>
    Math.hypot(Math.max(x0 - vx, 0, vx - x1), Math.max(y0 - vy, 0, vy - y1)) >= reach
}

function nearest(points: Float32Array, x: number, y: number) {
  let best = Number.POSITIVE_INFINITY
  for (let i = 0; i < points.length; i += 2) {
    const dx = x - (points[i] as number)
    const dy = y - (points[i + 1] as number)
    const d = dx * dx + dy * dy
    if (d < best) best = d
  }
  return Math.sqrt(best)
}

// ---- pieces ---------------------------------------------------------------------------------------

function landGeometry(look: Look, cx: number, cy: number, points: Float32Array) {
  const L = look.land
  const geo = new THREE.PlaneGeometry(EXTENT * 2, EXTENT * 2, LAND_CELLS, LAND_CELLS)
  geo.translate(cx, cy, 0)
  const pos = geo.getAttribute('position') as THREE.BufferAttribute
  const colors = new Float32Array(pos.count * 3)
  const r = ramp(L.colors)
  const c = new THREE.Color()
  // Most of the land is far from the track, where it rises fully: no need to find the nearest
  // footprint point there.
  const far = beyond(points, L.far)
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const rise = far(x, y) ? 1 : smoothstep(L.near, L.far, nearest(points, x, y))
    let h = 0
    if (rise > 0) {
      h = L.height * rise * (0.3 + 0.95 * fbm(x / 1150, y / 1150, 11, 4))
      h += L.height * rise * 0.18 * (fbm(x / 240, y / 240, 23, 3) - 0.5)
    }
    if (L.ledge > 0) {
      const k = Math.max(0, h) / L.ledge
      const f = Math.floor(k)
      h = (f + smoothstep(0.55, 0.85, k - f)) * L.ledge
    }
    h = Math.max(0, h) + L.bumps * (fbm(x / 180, y / 180, 5, 3) - 0.5) * 2
    pos.setZ(i, L.floor + h)
    shade(c, r, h).multiplyScalar(0.88 + 0.24 * noise(x / 60, y / 60, 41))
    c.toArray(colors, i * 3)
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.computeVertexNormals()
  return geo
}

function cloudGeometry(sheet: NonNullable<Look['sheet']>, cx: number, cy: number) {
  const geo = new THREE.PlaneGeometry(EXTENT * 2, EXTENT * 2, CLOUD_CELLS, CLOUD_CELLS)
  geo.translate(cx, cy, 0)
  const pos = geo.getAttribute('position') as THREE.BufferAttribute
  const colors = new Float32Array(pos.count * 3)
  const top = new THREE.Color(sheet.color)
  const low = new THREE.Color(sheet.shade)
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const puff = fbm(x / 420, y / 420, 31, 5) ** 1.8
    pos.setZ(i, sheet.z + CLOUD_TOP * puff)
    c.copy(low).lerp(top, smoothstep(0.15, 0.7, puff))
    c.toArray(colors, i * 3)
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.computeVertexNormals()
  return geo
}

/**
 * Bumps as a normal map that tiles: small swells for the sea, or with billow, the rounded lumps
 * of a cloud top.
 */
function bumpNormals(billow = false) {
  const N = 128
  const lump = (v: number) => (billow ? 1 - Math.abs(v * 2 - 1) : v)
  const height = (x: number, y: number) =>
    lump(noise(x / 16, y / 16, 3, N / 16)) * 0.6 +
    lump(noise(x / 8, y / 8, 9, N / 8)) * 0.3 +
    lump(noise(x / 4, y / 4, 17, N / 4)) * 0.1
  const data = new Uint8Array(N * N * 4)
  const v = new THREE.Vector3()
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = height((x + 1) % N, y) - height((x - 1 + N) % N, y)
      const dy = height(x, (y + 1) % N) - height(x, (y - 1 + N) % N)
      v.set(-dx * 6, -dy * 6, 1).normalize()
      const at = (y * N + x) * 4
      data[at] = (v.x * 0.5 + 0.5) * 255
      data[at + 1] = (v.y * 0.5 + 0.5) * 255
      data[at + 2] = (v.z * 0.5 + 0.5) * 255
      data[at + 3] = 255
    }
  }
  const tex = new THREE.DataTexture(data, N, N)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.generateMipmaps = true
  tex.needsUpdate = true
  return tex
}

function spireGeometry(look: Look, cx: number, cy: number, points: Float32Array, seed: number) {
  const spec = look.spires
  if (!spec) return null
  const rand = random(seed)
  const r = ramp(spec.colors)
  const c = new THREE.Color()
  const list: THREE.BufferGeometry[] = []
  for (let tries = 0; tries < spec.count * 40 && list.length < spec.count; tries++) {
    const x = cx + (rand() - 0.5) * 3200
    const y = cy + (rand() - 0.5) * 3200
    const radius = 14 + rand() * 26
    const d = nearest(points, x, y)
    if (d < radius + 55 || d > 700) continue
    const h = spec.height[0] + rand() * (spec.height[1] - spec.height[0])
    const geo = new THREE.CylinderGeometry(radius * 0.45, radius, h, 12, 14).rotateX(Math.PI / 2)
    const pos = geo.getAttribute('position') as THREE.BufferAttribute
    const colors = new Float32Array(pos.count * 3)
    const k = list.length * 7.3
    for (let i = 0; i < pos.count; i++) {
      const z = pos.getZ(i) + h / 2
      const round = Math.atan2(pos.getY(i), pos.getX(i)) * 1.5
      const wobble = 0.6 + 0.55 * noise(z / 18 + k, round, 61) + 0.25 * noise(z / 5, round * 3, 71)
      pos.setX(i, pos.getX(i) * wobble)
      pos.setY(i, pos.getY(i) * wobble)
      shade(c, r, z).multiplyScalar(0.9 + 0.2 * noise(z / 6, k, 67))
      c.toArray(colors, i * 3)
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geo.translate(x, y, look.land.floor + h / 2)
    list.push(geo)
  }
  const merged = mergeAll(list)
  merged?.computeVertexNormals()
  return merged
}

/** One geometry from many, the parts disposed. null when there are none. */
function mergeAll(list: THREE.BufferGeometry[]) {
  if (list.length === 0) return null
  const merged = mergeGeometries(list)
  for (const g of list) g.dispose()
  return merged
}

const F = newFrame()
const at3: Vec = [0, 0, 0]
const basis = new THREE.Matrix4()
const R = new THREE.Vector3()
const T = new THREE.Vector3()
const N = new THREE.Vector3()

/** A box w across the road, l along it, h up, centred lat right and up above the frame's point. */
function box(f: Frame, w: number, l: number, h: number, lat: number, up: number) {
  R.set(...f.r)
  T.set(...f.t)
  N.set(...f.n)
  basis.makeBasis(R, T, N)
  basis.setPosition(...place(at3, f, lat, up))
  return new THREE.BoxGeometry(w, l, h).applyMatrix4(basis)
}

/**
 * A pillar and its crossbeam under the road every PILLAR_STEP metres where the road is level
 * enough to stand on one, unless another road passes underneath.
 */
function pillarGeometry(track: Track, foot: number) {
  const under = trackPoints(track)
  const list: THREE.BufferGeometry[] = []
  for (const path of track.paths) {
    for (let s = 20; s < path.length - 10; s += PILLAR_STEP) {
      const i = sampleIndex(path, s)
      if (path.gap[i]) continue
      frameAt(path, s, F)
      if (F.n[2] < 0.92) continue
      const top = F.p[2] - SLAB
      if (top - foot < 6) continue
      let clear = true
      for (let k = 0; k < under.length && clear; k += 3) {
        if ((under[k + 2] as number) > top - 1) continue
        const dx = (under[k] as number) - F.p[0]
        const dy = (under[k + 1] as number) - F.p[1]
        if (dx * dx + dy * dy < PILLAR_CLEAR * PILLAR_CLEAR) clear = false
      }
      if (!clear) continue
      const width = path.width[i] ?? 16
      const tall = top - foot - 1.2
      // Straight down, whatever the road's bank.
      const col = new THREE.BoxGeometry(2.4, 2.4, tall)
      col.rotateZ(Math.atan2(F.t[1], F.t[0]))
      col.translate(F.p[0], F.p[1], foot + tall / 2)
      list.push(col, box(F, width * 0.7, 1.8, 1.2, 0, -SLAB - 0.6))
    }
  }
  return mergeAll(list)
}

/** Every few metres of every path, as x, y, z: for checking nothing stands in another road. */
function trackPoints(track: Track) {
  const out: number[] = []
  for (const path of track.paths) {
    for (let i = 0; i < path.p.length / 3; i += 2) {
      out.push(path.p[i * 3] ?? 0, path.p[i * 3 + 1] ?? 0, path.p[i * 3 + 2] ?? 0)
    }
  }
  return out
}

/** Whether any road passes within reach metres across of point, between lo and hi above it. */
function crowded(points: number[], p: readonly number[], reach: number, lo: number, hi: number) {
  const x = p[0] as number
  const y = p[1] as number
  const z = p[2] as number
  for (let k = 0; k < points.length; k += 3) {
    const dz = (points[k + 2] as number) - z
    if (dz < lo || dz > hi) continue
    const dx = (points[k] as number) - x
    const dy = (points[k + 1] as number) - y
    if (dx * dx + dy * dy < reach * reach) return true
  }
  return false
}

/**
 * Light posts on the barrier tops every POST_STEP metres of main, leaning a lamp over the road,
 * and a gate across the road every GATE_STEP: things close to the eye that stream past at speed.
 * Only where the road is level enough, has its barrier, and nothing else passes overhead.
 */
function trackside(track: Track, layout: TrackLayout) {
  const main = layout.paths[0]
  if (!main) return null
  const points = trackPoints(track)
  const frames: THREE.BufferGeometry[] = []
  const lamps: THREE.BufferGeometry[] = []
  const tip: Vec = [0, 0, 0]
  const at = (lat: number, up: number) => place(tip, F, lat, up)
  for (let s = 16; s < main.length - 8; s += POST_STEP) {
    if (!layout.road(0, s)) continue
    frameAt(main, s, F)
    if (F.n[2] < 0.85) continue
    const half = widthAt(main, s) / 2
    for (const side of [-1, 1] as const) {
      if (!layout.wall(0, side, s) || !layout.wall(0, side, s + 2)) continue
      const lat = side * (half + 0.18)
      // Nothing of another road within the post's and lamp's reach.
      if (crowded(points, at(lat - side * 1.2, 0), 3.5, 0.5, POST_HEIGHT + WALL_HEIGHT + 2))
        continue
      const top = WALL_HEIGHT + POST_HEIGHT
      frames.push(
        box(F, 0.16, 0.16, POST_HEIGHT, lat, WALL_HEIGHT + POST_HEIGHT / 2),
        box(F, 1.9, 0.12, 0.12, lat - side * 0.9, top - 0.1),
        box(F, 0.75, 0.32, 0.14, lat - side * 1.75, top - 0.16),
      )
      lamps.push(box(F, 0.62, 0.22, 0.03, lat - side * 1.75, top - 0.245))
    }
  }
  for (let s = 140; s < main.length - 60; s += GATE_STEP) {
    frameAt(main, s, F)
    if (F.n[2] < 0.92 || !layout.road(0, s)) continue
    if (![-1, 1].every((side) => layout.wall(0, side as -1 | 1, s))) continue
    const half = widthAt(main, s) / 2
    if (crowded(points, at(0, 0), half + 3, 0.5, GATE_HEIGHT + 3)) continue
    frames.push(
      box(F, 0.5, 0.5, GATE_HEIGHT, -(half + 0.18), WALL_HEIGHT + GATE_HEIGHT / 2 - 0.6),
      box(F, 0.5, 0.5, GATE_HEIGHT, half + 0.18, WALL_HEIGHT + GATE_HEIGHT / 2 - 0.6),
      box(F, half * 2 + 1.4, 0.9, 0.8, 0, WALL_HEIGHT + GATE_HEIGHT - 0.6),
    )
    lamps.push(box(F, half * 2, 0.4, 0.03, 0, WALL_HEIGHT + GATE_HEIGHT - 1.02))
  }
  return { frames: mergeAll(frames), lamps: mergeAll(lamps) }
}

/** Two posts and a beam over the start line. */
function gantryGeometry(track: Track) {
  const main = track.paths[0]
  if (!main) return null
  frameAt(main, 0, F)
  const half = (main.width[0] ?? 16) / 2 + 0.9
  const list = [
    box(F, 0.8, 0.8, 8, -half, 4),
    box(F, 0.8, 0.8, 8, half, 4),
    box(F, half * 2 + 0.8, 1, 1.6, 0, 7.6),
  ]
  return mergeAll(list)
}

// ---- the sky ---------------------------------------------------------------------------------------

/** The sun's direction for a look. */
export function sunDirection(look: Look, out = new THREE.Vector3()) {
  const up = THREE.MathUtils.degToRad(look.sun.up)
  const bearing = THREE.MathUtils.degToRad(look.sun.bearing)
  return out.set(Math.sin(bearing) * Math.cos(up), Math.cos(bearing) * Math.cos(up), Math.sin(up))
}

/**
 * A gradient sky with the sun in it, drawn at the far plane so it never cuts into anything.
 * disc scales the sun's disc: the reflection map gets a dim one so metal doesn't sparkle.
 */
export function skyMaterial(look: Look, disc = 1) {
  return new THREE.ShaderMaterial({
    uniforms: {
      zenith: { value: new THREE.Color(look.zenith) },
      mid: { value: new THREE.Color(look.mid) },
      horizon: { value: new THREE.Color(look.horizon) },
      haze: { value: new THREE.Color(look.haze) },
      sunColor: { value: new THREE.Color(look.sun.color) },
      sunDir: { value: sunDirection(look) },
      disc: { value: disc },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vDir = world.xyz - cameraPosition;
        gl_Position = projectionMatrix * viewMatrix * world;
        gl_Position.z = gl_Position.w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 zenith;
      uniform vec3 mid;
      uniform vec3 horizon;
      uniform vec3 haze;
      uniform vec3 sunColor;
      uniform vec3 sunDir;
      uniform float disc;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.z;
        float a = clamp(h, 0.0, 1.0);
        vec3 sky = mix(horizon, mid, smoothstep(0.0, 0.2, a));
        sky = mix(sky, zenith, smoothstep(0.12, 0.85, a));
        sky = mix(sky, haze, smoothstep(0.015, -0.1, h));
        float s = max(dot(d, sunDir), 0.0);
        sky += sunColor * (0.16 * pow(s, 5.0) + 0.45 * pow(s, 60.0));
        sky += sunColor * disc * smoothstep(0.99955, 0.99985, s) * 24.0;
        gl_FragColor = vec4(sky, 1.0);
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  })
}

// ---- built ------------------------------------------------------------------------------------------

export type BuiltScenery = {
  /** The land, sea or clouds and rock towers. */
  group: THREE.Group
  /** The pillars and the start gantry, which go with the road. */
  props: THREE.Group
  /** Moves the swell on the sea. */
  update(dt: number): void
}

/** The land, sea or clouds, rock towers, pillars and the start gantry for one track. */
export function buildScenery(track: Track, layout: TrackLayout): BuiltScenery {
  const look = LOOKS[track.id]
  const main = track.paths[0]
  const box3 = new THREE.Box3().setFromBufferAttribute(
    new THREE.BufferAttribute(main?.p ?? new Float32Array(3), 3),
  )
  const centre = box3.getCenter(new THREE.Vector3())
  const points = footprint(track)
  const group = new THREE.Group()
  const props = new THREE.Group()
  const add = (
    geo: THREE.BufferGeometry | null,
    material: THREE.Material,
    name: string,
    into = group,
  ) => {
    if (!geo) {
      material.dispose()
      return null
    }
    const mesh = new THREE.Mesh(geo, material)
    mesh.name = name
    into.add(mesh)
    return mesh
  }

  add(
    landGeometry(look, centre.x, centre.y, points),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
    'land',
  )

  let waves: THREE.Texture | null = null
  const sheet = look.sheet
  if (sheet?.kind === 'cloud') {
    // Lumps about 90 m across over the big puffs, so the top doesn't read as snow.
    const lumps = bumpNormals(true)
    lumps.repeat.set((EXTENT * 2) / 90, (EXTENT * 2) / 90)
    add(
      cloudGeometry(sheet, centre.x, centre.y),
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 1,
        normalMap: lumps,
        normalScale: new THREE.Vector2(2.6, 2.6),
      }),
      'clouds',
    )
  } else if (sheet?.kind === 'sea') {
    waves = bumpNormals()
    // About 50 m per tile of swell.
    waves.repeat.set((EXTENT * 2) / 50, (EXTENT * 2) / 50)
    const sea = new THREE.PlaneGeometry(EXTENT * 2, EXTENT * 2).translate(
      centre.x,
      centre.y,
      sheet.z,
    )
    add(
      sea,
      new THREE.MeshStandardMaterial({
        color: sheet.color,
        roughness: 0.14,
        metalness: 0.05,
        normalMap: waves,
        normalScale: new THREE.Vector2(0.55, 0.55),
      }),
      'sea',
    )
  }

  add(
    spireGeometry(
      look,
      centre.x,
      centre.y,
      points,
      [...track.id].reduce((h, ch) => Math.imul(h, 31) + (ch.codePointAt(0) ?? 0), 7),
    ),
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
    'spires',
  )
  const concrete = new THREE.MeshStandardMaterial({ color: look.concrete, roughness: 0.85 })
  add(pillarGeometry(track, look.foot), concrete, 'pillars', props)
  add(
    gantryGeometry(track),
    new THREE.MeshStandardMaterial({ color: '#2b2f36', roughness: 0.5, metalness: 0.6 }),
    'gantry',
    props,
  )
  const side = trackside(track, layout)
  add(
    side?.frames ?? null,
    new THREE.MeshStandardMaterial({ color: '#2f343c', roughness: 0.45, metalness: 0.7 }),
    'posts',
    props,
  )
  // Lamps lit in daylight too: small, bright, and the first thing to streak past.
  add(
    side?.lamps ?? null,
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#fff6e8').multiplyScalar(1.6) }),
    'lamps',
    props,
  )

  return {
    group,
    props,
    update(dt) {
      if (waves) {
        waves.offset.x += dt * 0.01
        waves.offset.y += dt * 0.004
      }
    },
  }
}
