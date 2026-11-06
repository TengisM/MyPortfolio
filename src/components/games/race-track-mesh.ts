import * as THREE from 'three'
import { clamp, wrap } from './race-math.ts'
import {
  dot,
  type Frame,
  frameAt,
  nearestMain,
  newFrame,
  ON_ROAD_EDGE,
  ON_ROAD_UP,
  openingAt,
  PAD_HALF_WIDTH,
  PAD_LENGTH,
  place,
  SAMPLE,
  sampleIndex,
  type Track,
  type TrackPath,
  type Vec3,
  WALL_HEIGHT,
  widthAt,
} from './race-tracks.ts'

// The track as three.js meshes: an asphalt road on a concrete slab, barriers, painted lines and
// kerbs, glowing pads, water, ramp lips and the cuts over merge ramps. trackLayout says where each
// goes and follows the physics, so there's no invisible wall and no drawn opening a ship can't
// drive through. Built once per track. No canvas here: the tests build it under Node.

// Metres between drawn cross-sections, and samples either side averaged for the drawn road. The
// spline's curvature spikes for a metre or two where turns join, and the average hides the kink.
const STATION = 2
const SMOOTH = 3
const LINE = 0.18
const DASH = 4
/** Metres of main road cut open over the end of a lower road, so its merge ramp shows through. */
export const SLOT = 26
const MERGE_RAMP = 40

/** Metres under the road's surface to the slab's underside. */
export const SLAB = 0.9
/** Curvature, 1/m, from which a corner gets kerbs: tighter than a 140 m radius. */
const KERB_CURVE = 1 / 140
const KERB = 2.5
const KERB_WIDTH = 0.7
/** The barrier's coloured band, as shares of its height. */
const BAND = [0.6, 0.84] as const
const CAP = 0.35
/** Metres between barrier panel joints. */
const PANEL = 6

export const ROAD = new THREE.Color('#4d4c4a')
const PAINT = new THREE.Color('#e9e9e4')
const LANE = PAINT.clone().multiplyScalar(0.55)
const WHITE = new THREE.Color('#ffffff')
const BLACK = new THREE.Color('#16181c')
const BARRIER = new THREE.Color('#c9cdd2')
const BARRIER_TOP = new THREE.Color('#a9aeb5')
const JOINT = new THREE.Color('#5b6068')
const SLAB_SIDE = new THREE.Color('#8e939a')
const SLAB_UNDER = new THREE.Color('#6d7279')
const LIP = new THREE.Color('#3a3e44')
const SLOT_PAINT = new THREE.Color('#e8c547')
const WATER_DEEP = new THREE.Color('#0e4a56')
export const WATER_CREST = new THREE.Color('#e6f4f2')
/** Ripples on the road's water: lighter water, not white foam. */
const WATER_RIPPLE = new THREE.Color('#5fa9b1')

function sub(out: Vec3, a: Vec3, b: Vec3) {
  out[0] = a[0] - b[0]
  out[1] = a[1] - b[1]
  out[2] = a[2] - b[2]
}

// ---- layout ---------------------------------------------------------------------------------------

/** The path with p, t and n averaged over ±SMOOTH samples. An open path keeps its end points. */
function smoothed(path: TrackPath): TrackPath {
  const count = path.width.length
  const blur = (src: Float32Array) => {
    const out = new Float32Array(src.length)
    for (let i = 0; i < count; i++) {
      const k = path.closed ? SMOOTH : Math.min(SMOOTH, i, count - 1 - i)
      let x = 0
      let y = 0
      let z = 0
      let sum = 0
      for (let j = -k; j <= k; j++) {
        const w = k + 1 - Math.abs(j)
        const at = wrap(i + j, count) * 3
        x += w * (src[at] ?? 0)
        y += w * (src[at + 1] ?? 0)
        z += w * (src[at + 2] ?? 0)
        sum += w
      }
      out[i * 3] = x / sum
      out[i * 3 + 1] = y / sum
      out[i * 3 + 2] = z / sum
    }
    return out
  }
  return { ...path, p: blur(path.p), t: blur(path.t), n: blur(path.n) }
}

export type TrackLayout = {
  /** The paths as drawn, frames lightly smoothed. Ships are drawn on these too. */
  paths: TrackPath[]
  /** Spans of main with no road, [from, to) in metres: the jumps. */
  gaps: [number, number][]
  road(path: number, s: number): boolean
  /** A wall on side (-1 left, 1 right) of path at s. */
  wall(path: number, side: -1 | 1, s: number): boolean
  /** Whether the point s metres along a branch, lat right of its centre and up above it, lies on main's road. */
  onMain(path: number, s: number, lat: number, up?: number): boolean
  /**
   * The lateral span of main's road cut open at s over a lower road's merge ramp. at, when given,
   * decides whether there's a cut: the middle of the stretch being drawn, so a cut's end station
   * gets the cut's shape on one side and none on the other.
   */
  slot(s: number, at?: number): [number, number] | null
  /** Metres on each path where something starts or stops. */
  breaks: number[][]
}

/**
 * Where everything goes, following the physics. Main has no wall on a shortcut's side over its
 * open metres after the entrance and its close metres before the exit, and a shortcut hides its
 * wall facing main over the same stretches. Gaps have no road and no walls. A lower road hides
 * its wall facing main over its close metres, where that wall would stand on main's road.
 */
export function trackLayout(track: Track): TrackLayout {
  const paths = track.paths.map(smoothed)
  const main = paths[0]
  if (!main) throw new Error(`${track.id}: no main path`)
  const length = main.length
  const count = main.gap.length
  const fa = newFrame()
  const fb = newFrame()
  const point: Vec3 = [0, 0, 0]
  const away: Vec3 = [0, 0, 0]

  const gaps: [number, number][] = []
  for (let i = 0; i < count; i++) {
    if (!main.gap[i] || main.gap[wrap(i - 1, count)]) continue
    let j = i
    while (main.gap[(j + 1) % count] && j - i < count) j++
    // The road stops where the lower road leaves, a little before the first gap sample.
    const drop = track.branches.find(
      (b) => b.kind === 'drop' && wrap(i * SAMPLE - b.from, length) <= SAMPLE,
    )
    gaps.push([drop ? drop.from : i * SAMPLE, wrap((j + 1) * SAMPLE, length)])
  }
  const inGap = (s: number) => gaps.some(([a, b]) => wrap(s - a, length) < wrap(b - a, length))

  /** Main metres abreast of s on a branch, spreading its length over the span it stands in for. */
  const abreast = (path: number, s: number) => {
    const b = track.branches.find((x) => x.path === path)
    const own = paths[path]
    if (!b || !own) return 0
    return b.from + (s / own.length) * wrap(b.to - b.from, length)
  }

  const onMain = (path: number, s: number, lat: number, up = 0) => {
    const own = paths[path]
    if (!own) return false
    if (path === 0) return Math.abs(lat) <= widthAt(own, s) / 2 && !inGap(s)
    frameAt(own, s, fa)
    place(point, fa, lat, up)
    const best = nearestMain(main, point, abreast(path, s))
    if (main.gap[best]) return false
    frameAt(main, best * SAMPLE, fb)
    sub(away, point, fb.p)
    return (
      Math.abs(dot(away, fb.n)) < ON_ROAD_UP &&
      Math.abs(dot(away, fb.r)) < (main.width[best] ?? 0) / 2 + ON_ROAD_EDGE
    )
  }

  const drops = track.branches.filter((b) => b.kind === 'drop')
  const slot = (s: number, at = s): [number, number] | null => {
    for (const b of drops) {
      const own = paths[b.path]
      if (!own || wrap(b.to - at, length) > SLOT) continue
      const span = wrap(b.to - b.from, length)
      // Signed, so a station a hair past to still lands on the ramp's end.
      let back = wrap(b.to - s, length)
      if (back > length / 2) back -= length
      const along = clamp(((span - back) / span) * own.length, 0, own.length)
      frameAt(own, along, fa)
      frameAt(main, s, fb)
      sub(away, fa.p, fb.p)
      const c = dot(away, fb.r)
      const half = widthAt(own, along) / 2
      return [c - half, c + half]
    }
    return null
  }

  const breaks = paths.map((path, i) => {
    const out: number[] = []
    const b = track.branches.find((x) => x.path === i)
    if (b) out.push(b.open, path.length - b.close)
    const n = path.water.length
    for (let i = 0; i < n; i++) {
      const before = path.closed || i > 0 ? path.water[wrap(i - 1, n)] : 0
      // Water is looked up by nearest sample, so a run starts half a sample early.
      if (path.water[i] !== before) out.push(wrap(i * SAMPLE - SAMPLE / 2, path.length))
    }
    return out
  })
  const mainBreaks = breaks[0] as number[]
  mainBreaks.push(1.5)
  for (const [a, b] of gaps) mainBreaks.push(a, b, wrap(a - 1.6, length), wrap(b + 1.6, length))
  for (const b of track.branches) {
    if (b.kind === 'shortcut') {
      mainBreaks.push(b.from, wrap(b.from + b.fork, length), wrap(b.to - b.close, length))
    } else mainBreaks.push(b.to, wrap(b.to - SLOT, length))
  }

  return {
    paths,
    gaps,
    road: (path, s) => path !== 0 || !inGap(s),
    wall(path, side, s) {
      if (path === 0) return !inGap(s) && openingAt(track, s, side) === undefined
      const own = paths[path]
      const b = track.branches.find((x) => x.path === path)
      if (!own || !b) return false
      // A lower road's open is 0, so only its close hides a wall.
      return side === b.side || (s >= b.open && s <= own.length - b.close)
    },
    onMain,
    slot,
    breaks,
  }
}

// ---- track geometry -------------------------------------------------------------------------------

type Buf = { pos: number[]; col: number[]; uv: number[]; idx: number[] }
const buf = (): Buf => ({ pos: [], col: [], uv: [], idx: [] })
/**
 * The two ends of a cross-section across the road at s: [lat, up, lat, up]. mid is the middle of
 * the stretch being drawn, for shapes that change at a station.
 */
type Edge = (s: number, width: number, mid: number) => readonly [number, number, number, number]

const bf = newFrame()
const bp: Vec3 = [0, 0, 0]

/** Every STATION metres along the path, plus each break. A closed path ends back at 0. */
function stations(path: TrackPath, breaks: number[]): number[] {
  const all: number[] = []
  for (let s = 0; s < path.length; s += STATION) all.push(s)
  for (const b of breaks) if (b > 0 && b < path.length) all.push(b)
  all.sort((a, b) => a - b)
  const out: number[] = []
  for (const s of all) if (out.length === 0 || s - (out.at(-1) as number) > 0.05) out.push(s)
  if (path.length - (out.at(-1) as number) <= 0.05) out.pop()
  out.push(path.length)
  return out
}

function vertex(b: Buf, f: Frame, lat: number, up: number, c: THREE.Color, u: number) {
  place(bp, f, lat, up)
  b.pos.push(bp[0], bp[1], bp[2])
  b.col.push(c.r, c.g, c.b)
  b.uv.push(u, lat)
}

/** A strip along the path over every station interval whose middle passes on. */
function strip(
  b: Buf,
  path: TrackPath,
  st: number[],
  on: (s: number) => boolean,
  edge: Edge,
  c0: THREE.Color,
  c1 = c0,
) {
  const section = (s: number, e: readonly number[]) => {
    frameAt(path, s, bf)
    vertex(b, bf, e[0] ?? 0, e[1] ?? 0, c0, s)
    vertex(b, bf, e[2] ?? 0, e[3] ?? 0, c1, s)
  }
  // Neighbouring stretches share their station's section unless its shape differs between them.
  let last: readonly number[] | null = null
  for (let k = 0; k + 1 < st.length; k++) {
    const s0 = st[k] as number
    const s1 = st[k + 1] as number
    const mid = (s0 + s1) / 2
    if (!on(mid)) {
      last = null
      continue
    }
    const start = [...edge(s0, widthAt(path, s0), mid)]
    if (!last || start.some((v, j) => v !== last?.[j])) section(s0, start)
    last = [...edge(s1, widthAt(path, s1), mid)]
    section(s1, last)
    const n = b.pos.length / 3
    b.idx.push(n - 4, n - 3, n - 2, n - 3, n - 1, n - 2)
  }
}

/** A quad through four [along, lat, up] corners measured from s metres along, x right of centre. */
function quad(
  b: Buf,
  path: TrackPath,
  s: number,
  x: number,
  corners: number[],
  c: THREE.Color,
  u = 0,
) {
  for (let k = 0; k < 4; k++) {
    const along = corners[k * 3] ?? 0
    frameAt(path, s + along, bf)
    vertex(b, bf, x + (corners[k * 3 + 1] ?? 0), corners[k * 3 + 2] ?? 0, c, u + along)
  }
  const n = b.pos.length / 3
  b.idx.push(n - 4, n - 3, n - 2, n - 4, n - 2, n - 1)
}

/** An arrow on the road pointing along it, half metres either side of x. */
function chevron(
  b: Buf,
  path: TrackPath,
  s: number,
  x: number,
  half: number,
  c: THREE.Color,
  u: number,
) {
  const len = half * 0.6
  const th = 0.45
  for (const side of [-1, 1]) {
    const lat = side * half
    quad(
      b,
      path,
      s,
      x,
      [-len / 2, lat, 0.05, -len / 2 + th, lat, 0.05, len / 2 + th, 0, 0.05, len / 2, 0, 0.05],
      c,
      u,
    )
  }
}

function geometry(b: Buf): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2))
  g.setIndex(b.idx)
  g.computeBoundingSphere()
  return g
}

const PAD_SHADER = {
  vertexShader: /* glsl */ `
    varying vec3 vColor;
    varying float vAlong;
    void main() {
      vColor = color;
      vAlong = uv.x;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  // A bright band sweeps forward over each pad.
  fragmentShader: /* glsl */ `
    uniform float time;
    varying vec3 vColor;
    varying float vAlong;
    void main() {
      float sweep = fract(vAlong * 0.12 - time * 1.4);
      gl_FragColor = vec4(vColor * (0.45 + 1.6 * pow(sweep, 4.0)), 1.0);
    }`,
}

const WATER_SHADER = {
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  // uv is metres: x along the road, y across it. Two swells crossing make the crests.
  fragmentShader: /* glsl */ `
    uniform float time;
    uniform vec3 deep;
    uniform vec3 crest;
    varying vec2 vUv;
    void main() {
      float w = sin(vUv.x * 0.35 - time * 1.6 + sin(vUv.y * 0.5 + time * 0.7) * 1.8)
        + 0.6 * sin(vUv.x * 0.9 + vUv.y * 0.7 + time * 2.3);
      float c = smoothstep(1.0, 1.55, w);
      gl_FragColor = vec4(mix(deep, crest, 0.08 + 0.35 * c), 0.5 + 0.15 * c);
    }`,
}

export type BuiltTrack = {
  group: THREE.Group
  layout: TrackLayout
}

/**
 * Asphalt as a tiling grey texture, one tile 8 m along and 16 m across: fine grain, a seam
 * across the road at each slab joint, and darker wear where ships run. Data, not a canvas, so
 * it builds under Node.
 */
function asphalt(): THREE.DataTexture {
  const W = 128
  const H = 256
  const data = new Uint8Array(W * H * 4)
  let seed = 1
  const rand = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  for (let y = 0; y < H; y++) {
    // Across the road: lighter at the edges, darker down the two worn lines.
    const across = y / H
    const wear =
      Math.exp(-(((across - 0.33) / 0.07) ** 2)) + Math.exp(-(((across - 0.67) / 0.07) ** 2))
    for (let x = 0; x < W; x++) {
      let v = 0.9 + rand() * 0.14 - wear * 0.07
      if (x < 2) v *= 0.55
      const at = (y * W + x) * 4
      const b = Math.max(0, Math.min(255, v * 230))
      data[at] = b
      data[at + 1] = b
      data[at + 2] = b
      data[at + 3] = 255
    }
  }
  const tex = new THREE.DataTexture(data, W, H)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(1 / 8, 1 / 16)
  // uv.y is metres from the centre line, so the tile starts at the left edge.
  tex.offset.set(0, 0.5)
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.generateMipmaps = true
  tex.anisotropy = 8
  tex.needsUpdate = true
  return tex
}

/** Builds the track's meshes once. Every material reads the shared time uniform. */
export function buildTrackMeshes(track: Track, time: THREE.IUniform<number>): BuiltTrack {
  const layout = trackLayout(track)
  const { paths } = layout
  const main = paths[0] as TrackPath
  const length = main.length
  // ca: the barriers' band, kerbs and ramp lips. cb: pads and arrows.
  const [ca, cb] = track.colors.map((c) => new THREE.Color(c)) as [THREE.Color, THREE.Color]
  const tone = (c: THREE.Color, k: number) => c.clone().multiplyScalar(k)
  const road = buf()
  const branchRoad = buf()
  const slab = buf()
  const barriers = buf()
  const paint = buf()
  const pads = buf()
  const water = buf()
  const full: Edge = (_s, w) => [-w / 2, 0.04, w / 2, 0.04]

  paths.forEach((path, i) => {
    const st = stations(path, layout.breaks[i] ?? [])
    const isMain = i === 0
    const on = (s: number) => layout.road(i, s)

    // The road, and the same shape again as the slab's underside.
    for (const up of [0, -SLAB]) {
      const into = up === 0 ? (isMain ? road : branchRoad) : slab
      const colour = up === 0 ? ROAD : SLAB_UNDER
      if (isMain) {
        // Over a merge ramp the road is drawn either side of the cut.
        const cut = layout.slot
        strip(
          into,
          path,
          st,
          on,
          (s, w, mid) => {
            const c = cut(s, mid)
            return [-w / 2, up, c ? clamp(c[0], -w / 2, w / 2) : w / 2, up]
          },
          colour,
        )
        strip(
          into,
          path,
          st,
          (s) => on(s) && cut(s) !== null,
          (s, w, mid) => {
            const c = cut(s, mid)
            return [c ? clamp(c[1], -w / 2, w / 2) : w / 2, up, w / 2, up]
          },
          colour,
        )
      } else {
        strip(into, path, st, on, (_s, w) => [-w / 2, up, w / 2, up], colour)
      }
    }

    for (const side of [-1, 1] as const) {
      const wallOn = (s: number) => layout.wall(i, side, s)
      const H = WALL_HEIGHT
      const at = (w: number) => (side * w) / 2
      // The face toward the road: grey, a band of the track's colour, grey again.
      strip(barriers, path, st, wallOn, (_s, w) => [at(w), 0, at(w), H * BAND[0]], BARRIER)
      strip(barriers, path, st, wallOn, (_s, w) => [at(w), H * BAND[0], at(w), H * BAND[1]], ca)
      strip(barriers, path, st, wallOn, (_s, w) => [at(w), H * BAND[1], at(w), H], BARRIER)
      // The cap, and the outside face down to the slab's underside.
      strip(barriers, path, st, wallOn, (_s, w) => [at(w), H, at(w) + side * CAP, H], BARRIER_TOP)
      strip(
        barriers,
        path,
        st,
        wallOn,
        (_s, w) => [at(w) + side * CAP, H, at(w) + side * CAP, -SLAB],
        SLAB_SIDE,
      )
      // Panels: a white break in the band and a dark joint every PANEL metres, so the barrier
      // streams past at speed instead of reading as one smooth stripe.
      for (let s = 0; s + 1.1 < path.length; s += PANEL) {
        if (!wallOn(s) || !wallOn(s + 1.1)) continue
        const lat = side * (widthAt(path, s) / 2 - 0.015)
        const [lo, hi] = [H * BAND[0], H * BAND[1]]
        quad(paint, path, s, 0, [0, lat, lo, 1, lat, lo, 1, lat, hi, 0, lat, hi], BARRIER)
        quad(paint, path, s, 0, [0.95, lat, 0, 1.08, lat, 0, 1.08, lat, H, 0.95, lat, H], JOINT)
      }
      // Where there's no barrier the slab's own edge shows.
      strip(
        slab,
        path,
        st,
        (s) => on(s) && !wallOn(s) && (isMain ? layout.slot(s) === null : true),
        (_s, w) => [at(w), 0, at(w), -SLAB],
        SLAB_SIDE,
      )

      const edgeOn = isMain
        ? (s: number) => on(s) && layout.slot(s) === null
        : (s: number) => !layout.onMain(i, s, side * (widthAt(path, s) / 2 - 0.25))
      strip(
        paint,
        path,
        st,
        edgeOn,
        (_s, w) => [side * (w / 2 - 0.45), 0.03, side * (w / 2 - 0.2), 0.03],
        PAINT,
      )
      // Where a shortcut's edge facing main runs across main's road, a dashed line marks its lane:
      // a ship past that line when the opening ends goes onto the shortcut.
      const own = track.branches.find((b) => b.path === i)
      if (own?.kind === 'shortcut' && side === -own.side) {
        strip(
          paint,
          path,
          st,
          // The cheap test first: onMain searches main's samples.
          (s) =>
            Math.floor(s / DASH) % 2 === 0 &&
            layout.onMain(i, s, side * (widthAt(path, s) / 2 - 0.25)),
          (_s, w) => [side * (w / 2 - 0.45), 0.035, side * (w / 2 - 0.15), 0.035],
          PAINT,
        )
      }
      // Kerbs on the inside of tight corners, in blocks of the track's colour and white.
      const inside = (s: number) => {
        const c = path.curve[sampleIndex(path, s)] ?? 0
        return side * c > KERB_CURVE
      }
      for (const odd of [0, 1]) {
        strip(
          paint,
          path,
          st,
          (s) => inside(s) && Math.floor(s / KERB) % 2 === odd && edgeOn(s),
          (_s, w) => [side * (w / 2 - 0.45 - KERB_WIDTH), 0.035, side * (w / 2 - 0.45), 0.035],
          odd ? PAINT : ca,
        )
      }
    }

    const dash = (s: number) => Math.floor(s / DASH) % 2 === 0
    for (const f of isMain ? [-1 / 6, 1 / 6] : [0]) {
      const laneOn = isMain
        ? (s: number) => on(s) && dash(s) && layout.slot(s) === null
        : (s: number) => dash(s) && !layout.onMain(i, s, f * widthAt(path, s))
      strip(
        paint,
        path,
        st,
        laneOn,
        (_s, w) => [f * w - LINE / 2, 0.03, f * w + LINE / 2, 0.03],
        LANE,
      )
    }

    strip(
      water,
      path,
      st,
      (s) => on(s) && path.water[sampleIndex(path, s)] === 1,
      (_s, w) => [-w / 2, 0.07, w / 2, 0.07],
      WHITE,
    )

    if (!isMain) return
    // The start line: two rows of black and white squares.
    const half = widthAt(path, 0) / 2
    for (let row = 0; row < 2; row++) {
      for (let lat = -half, k = 0; lat < half - 0.01; lat += 1, k++) {
        const w = Math.min(1, half - lat)
        quad(
          paint,
          path,
          row,
          lat,
          [0, 0, 0.04, 1, 0, 0.04, 1, w, 0.04, 0, w, 0.04],
          (k + row) % 2 ? PAINT : BLACK,
        )
      }
    }
    for (const [a, b] of layout.gaps) {
      // The ramp lip where the road stops, and the edge of the landing where it starts again.
      strip(paint, path, st, (s) => wrap(a - s, length) < 1.6, full, ca)
      strip(paint, path, st, (s) => wrap(s - b, length) < 1.6, full, PAINT)
      for (const s of [a, b]) {
        const w = widthAt(path, s) / 2
        quad(paint, path, s, 0, [0, -w, -SLAB, 0, w, -SLAB, 0, w, 0.04, 0, -w, 0.04], LIP)
      }
    }
    for (const k of [0, 1]) {
      strip(
        paint,
        path,
        st,
        (s) => {
          const c = layout.slot(s)
          return c !== null && Math.abs(c[k] as number) < widthAt(path, s) / 2
        },
        (s, _w, mid) => {
          const lat = layout.slot(s, mid)?.[k] ?? 0
          return [lat - 0.12, 0.04, lat + 0.12, 0.04]
        },
        SLOT_PAINT,
      )
    }
  })

  const padColor = tone(cb.clone().lerp(WHITE, 0.2), 1.25)
  const launchColor = tone(new THREE.Color('#fff3c4'), 1.6)
  for (const pad of track.pads) {
    const path = paths[pad.path]
    if (!path) continue
    const c = pad.launch ? launchColor : padColor
    const l = PAD_LENGTH / 2
    const h = PAD_HALF_WIDTH
    quad(
      paint,
      path,
      pad.s,
      pad.x,
      [-l, -h, 0.035, l, -h, 0.035, l, h, 0.035, -l, h, 0.035],
      BLACK.clone().lerp(c, 0.12),
    )
    for (const k of [-1, 0, 1]) chevron(pads, path, pad.s + k * 2, pad.x, h * 0.85, c, k * 2)
  }
  // Arrows up each lower road's merge ramp.
  for (const b of track.branches) {
    const path = paths[b.path]
    if (b.kind !== 'drop' || !path) continue
    for (let a = 4; a <= MERGE_RAMP; a += 5)
      chevron(pads, path, path.length - a, 0, 5, tone(cb, 0.9), -a)
  }

  const group = new THREE.Group()
  const add = (b: Buf, material: THREE.Material, order = 0, name = '') => {
    if (b.idx.length === 0) {
      material.dispose()
      return
    }
    const g = geometry(b)
    g.computeVertexNormals()
    const mesh = new THREE.Mesh(g, material)
    mesh.renderOrder = order
    mesh.name = name
    group.add(mesh)
  }
  const surface = asphalt()
  add(
    road,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: surface,
      roughness: 0.78,
      metalness: 0.05,
      side: THREE.DoubleSide,
    }),
    0,
    'road',
  )
  // Where a branch leaves or joins it lies on main's road; main draws over it.
  add(
    branchRoad,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: surface,
      roughness: 0.78,
      metalness: 0.05,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 2,
      polygonOffsetUnits: 2,
    }),
  )
  add(
    slab,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }),
    0,
    'slab',
  )
  add(
    barriers,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.5,
      metalness: 0.25,
      side: THREE.DoubleSide,
    }),
    0,
    'barriers',
  )
  add(
    water,
    new THREE.ShaderMaterial({
      ...WATER_SHADER,
      uniforms: { time, deep: { value: WATER_DEEP }, crest: { value: WATER_RIPPLE } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    1,
  )
  add(
    paint,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.6,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
    2,
    'paint',
  )
  add(
    pads,
    new THREE.ShaderMaterial({
      ...PAD_SHADER,
      uniforms: { time },
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
    3,
  )
  return { group, layout }
}
