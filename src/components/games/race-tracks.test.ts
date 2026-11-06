import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildPath,
  buildTrack,
  frameAt,
  OPENING,
  type PathDef,
  type PointDef,
  type Track,
  type TrackDef,
  type TrackPath,
  type Vec3,
} from './race-tracks.ts'

function def(paths: PathDef[], extra: Partial<TrackDef> = {}): TrackDef {
  return {
    id: 'coaster',
    paths,
    branches: [],
    pads: [],
    checkpoints: 0,
    colors: ['#ff00ff', '#00ffff'],
    ...extra,
  }
}

/** Counter-clockwise seen from above (a left-hand turn) unless cw. */
function circle(radius: number, count: number, cw = false): PointDef[] {
  return Array.from({ length: count }, (_, i) => {
    const a = ((cw ? -1 : 1) * i * 2 * Math.PI) / count
    return { p: [radius * Math.cos(a), radius * Math.sin(a), 0] }
  })
}

// An approach along +x, a vertical loop of radius 40 that drifts 20 m sideways so it doesn't
// meet itself, then a flat exit.
function loopPath(): PathDef {
  const points: PointDef[] = [{ p: [-150, 0, 0] }, { p: [-75, 0, 0] }]
  for (let k = 0; k <= 12; k++) {
    const a = (k * Math.PI) / 6
    points.push({ p: [40 * Math.sin(a), (20 * k) / 12, 40 - 40 * Math.cos(a)] })
  }
  points.push({ p: [75, 20, 0] }, { p: [150, 20, 0] }, { p: [225, 20, 0] })
  return { points, closed: false }
}

// A closed lap with hills and banking, flat where it starts and ends.
function hillsPath(): PathDef {
  const z = [0, 0, 40, 90, 60, 20, 70, 110, 70, 30, 0, 0]
  const roll = [0, 0, 0.3, 0.6, 0.4, 0, -0.4, -0.7, 0, 0.3, 0, 0]
  const points = circle(300, 12).map((pt, i) => ({
    p: [pt.p[0], pt.p[1], z[i] ?? 0] as Vec3,
    roll: roll[i] ?? 0,
  }))
  return { points, closed: true }
}

const vec = (a: Float32Array, i: number): Vec3 => [
  a[i * 3] ?? 0,
  a[i * 3 + 1] ?? 0,
  a[i * 3 + 2] ?? 0,
]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const count = (path: TrackPath) => path.width.length

test('a flat circle has length 2πR within 1%', () => {
  const path = buildPath({ points: circle(200, 16), closed: true })
  const want = 2 * Math.PI * 200
  assert.ok(Math.abs(path.length - want) / want < 0.01, `${path.length} vs ${want}`)
})

test('frames stay orthonormal', () => {
  for (const path of [
    buildPath({ points: circle(200, 16), closed: true }),
    buildPath(loopPath()),
  ]) {
    for (let i = 0; i < count(path); i++) {
      const t = vec(path.t, i)
      const n = vec(path.n, i)
      const r = vec(path.r, i)
      for (const v of [t, n, r]) assert.ok(Math.abs(dot(v, v) - 1) < 1e-3, `sample ${i} length`)
      for (const d of [dot(t, n), dot(t, r), dot(n, r)])
        assert.ok(Math.abs(d) < 1e-3, `sample ${i}`)
    }
  }
})

test('the up vector turns over inside a vertical loop', () => {
  const path = buildPath(loopPath())
  let top = 0
  for (let i = 0; i < count(path); i++) {
    if ((path.p[i * 3 + 2] ?? 0) > (path.p[top * 3 + 2] ?? 0)) top = i
  }
  assert.ok((path.p[top * 3 + 2] ?? 0) > 75)
  assert.ok((path.n[top * 3 + 2] ?? 0) < -0.9, `top n.z ${path.n[top * 3 + 2]}`)
  const exit = frameAt(path, path.length - 30)
  assert.ok(exit.n[2] > 0.99, `exit n.z ${exit.n[2]}`)
})

test('roll 2π over a straight makes a corkscrew', () => {
  const path = buildPath({
    points: [
      { p: [0, 0, 0] },
      { p: [100, 0, 0] },
      { p: [200, 0, 0], roll: 2 * Math.PI },
      { p: [300, 0, 0], roll: 2 * Math.PI },
    ],
    closed: false,
  })
  assert.ok(frameAt(path, 150).n[2] < -0.9)
  assert.ok(frameAt(path, 50).n[2] > 0.99)
  assert.ok(frameAt(path, 250).n[2] > 0.99)
})

test('a climbing spiral stays level', () => {
  // Two turns of radius 100 rising 60 m a turn. Transport alone banks this 66° by the top.
  const points: PointDef[] = Array.from({ length: 33 }, (_, i) => {
    const a = (i * Math.PI) / 8
    return { p: [100 * Math.cos(a), 100 * Math.sin(a), (60 * a) / (2 * Math.PI)] }
  })
  const path = buildPath({ points, closed: false })
  for (let i = 0; i < count(path); i++) {
    assert.ok(Math.abs(path.r[i * 3 + 2] ?? 0) < 0.05, `sample ${i} banks`)
  }
})

test("a closed loop's up vector meets itself", () => {
  const path = buildPath(hillsPath())
  const first = vec(path.n, 0)
  const last = vec(path.n, count(path) - 1)
  const diff = Math.hypot(first[0] - last[0], first[1] - last[1], first[2] - last[2])
  assert.ok(diff < 1e-2, `n differs by ${diff}`)
})

test('curve is positive on a right-hand turn and about 1/R', () => {
  // 32 points: with 16 the spline itself wanders ±11% off the circle's curvature.
  const right = buildPath({ points: circle(200, 32, true), closed: true })
  for (let i = 0; i < count(right); i++) {
    const k = right.curve[i] ?? 0
    assert.ok(Math.abs(k * 200 - 1) < 0.05, `sample ${i}: ${k}`)
  }
  const left = buildPath({ points: circle(200, 32), closed: true })
  assert.ok((left.curve[0] ?? 0) < 0)
})

test("water and gap flags cover their segments' samples", () => {
  const points: PointDef[] = [0, 100, 200, 300, 400].map((x) => ({ p: [x, 0, 0] }))
  const path = buildPath({ points, closed: false, water: [1], gap: [3] })
  assert.ok(Math.abs(path.length - 400) < 0.01)
  for (let i = 0; i < count(path); i++) {
    const s = i
    if (s > 101 && s < 199) assert.equal(path.water[i], 1, `water at ${s}`)
    if (s < 99 || s > 201) assert.equal(path.water[i], 0, `dry at ${s}`)
    if (s > 301 && s < 399) assert.equal(path.gap[i], 1, `gap at ${s}`)
    if (s < 299) assert.equal(path.gap[i], 0, `road at ${s}`)
  }
})

// The 16-point R=200 circle with one shortcut cutting across from segment `from` to `to`.
function shortcutTrack(from: number, to: number, checkpoints: number) {
  const main = circle(200, 16)
  const a = (main[from] as PointDef).p
  const b = (main[to] as PointDef).p
  const mid: Vec3 = [((a[0] + b[0]) / 2) * 0.9, ((a[1] + b[1]) / 2) * 0.9, 0]
  return buildTrack(
    def(
      [
        { points: main, closed: true },
        { points: [{ p: a }, { p: mid }, { p: b }], closed: false },
      ],
      { branches: [{ path: 1, from, to, kind: 'shortcut', side: -1 }], checkpoints },
    ),
  )
}

function checkCheckpoints(track: Track, count: number, spacing: number) {
  const branch = track.branches[0]
  assert.ok(branch)
  const length = (track.paths[0] as TrackPath).length
  assert.equal(track.checkpoints.length, count)
  let prev = -Infinity
  for (const c of track.checkpoints) {
    assert.ok(c > 0 && c < length, `${c} off the lap`)
    assert.ok(c - prev >= spacing, `${c} is ${c - prev} m after the one before`)
    assert.ok(c < branch.from - OPENING || c > branch.to + OPENING, `${c} inside the shortcut`)
    prev = c
  }
}

test('checkpoints avoid branch spans and are in increasing order', () => {
  checkCheckpoints(shortcutTrack(3, 6, 4), 4, 1)
})

test('checkpoints that would share a branch span spread out instead of bunching', () => {
  // Evenly spaced, two or three of these land inside the shortcut's span.
  checkCheckpoints(shortcutTrack(2, 8, 5), 5, 50)
  checkCheckpoints(shortcutTrack(1, 7, 6), 6, 50)
})

test('a shortcut needs a side, a drop gets side 1', () => {
  const paths: PathDef[] = [
    { points: circle(200, 16), closed: true },
    { points: [{ p: [0, 0, 0] }, { p: [10, 0, 0] }], closed: false },
  ]
  assert.throws(() =>
    buildTrack(def(paths, { branches: [{ path: 1, from: 3, to: 6, kind: 'shortcut' }] })),
  )
  const track = buildTrack(def(paths, { branches: [{ path: 1, from: 3, to: 6, kind: 'drop' }] }))
  assert.equal(track.branches[0]?.side, 1)
})

test('pads convert segment and fraction to metres', () => {
  const points: PointDef[] = [0, 100, 200, 300].map((x) => ({ p: [x, 0, 0] }))
  const track = buildTrack(
    def(
      [
        { points: circle(200, 16), closed: true },
        { points, closed: false },
      ],
      {
        pads: [{ path: 1, seg: 1, at: 0.25, x: 3, launch: true }],
      },
    ),
  )
  const pad = track.pads[0]
  assert.ok(pad)
  assert.equal(pad.path, 1)
  assert.ok(Math.abs(pad.s - 125) < 0.01, `${pad.s}`)
  assert.equal(pad.x, 3)
  assert.equal(pad.launch, true)
})

test('frameAt wraps on closed paths', () => {
  const track = buildTrack(def([hillsPath()]))
  const main = track.paths[0] as TrackPath
  const a = frameAt(main, main.length + 5)
  const b = frameAt(main, 5)
  for (const k of ['p', 't', 'n', 'r'] as const) {
    for (let j = 0; j < 3; j++) {
      assert.ok(Math.abs((a[k][j] ?? 0) - (b[k][j] ?? 1)) < 1e-6, `${k}[${j}]`)
    }
  }
})

test("a shortcut's openings are where its near edge lies beside main's edge and level", async () => {
  const { TRACKS } = await import('./race-track-defs.ts')
  for (const track of Object.values(TRACKS)) {
    const main = track.paths[0] as TrackPath
    for (const b of track.branches) {
      if (b.kind === 'drop') {
        // A lower road has no open. Its close is where it rises into main beside main's road.
        assert.equal(b.open, 0, `${track.id} drop ${b.path}`)
        assert.ok(b.close > 10 && b.close < 40, `${track.id} drop ${b.path} closes ${b.close}`)
        continue
      }
      const path = track.paths[b.path] as TrackPath
      const span = (((b.to - b.from) % main.length) + main.length) % main.length
      // Long enough to steer through: about a third of a second in, a sixth out, at 60 m/s.
      assert.ok(b.open >= 20, `${track.id} ${b.path} opens ${b.open.toFixed(1)} m`)
      assert.ok(b.close >= 10, `${track.id} ${b.path} closes ${b.close.toFixed(1)} m`)
      assert.ok(b.open + b.close < span, `${track.id} ${b.path}`)
      // Branch s in each opening and the main s it lines up with.
      const pairs: [number, number][] = []
      for (let s = 0; s <= b.open; s++) pairs.push([s, b.from + s])
      for (let s = 0; s <= b.close; s++) pairs.push([path.length - s, b.to - s])
      for (const [s, m] of pairs) {
        const f = frameAt(path, s)
        const g = frameAt(main, m)
        const half = (path.width[Math.round(s)] ?? 0) / 2
        const d: Vec3 = [0, 0, 0]
        for (let k = 0; k < 3; k++) {
          d[k] = (f.p[k] as number) - b.side * half * (f.r[k] as number) - (g.p[k] as number)
        }
        const across = (d[0] * g.r[0] + d[1] * g.r[1] + d[2] * g.r[2]) * b.side
        const up = d[0] * g.n[0] + d[1] * g.n[1] + d[2] * g.n[2]
        const where = `${track.id} ${b.path} at ${s.toFixed(1)}`
        assert.ok(Math.abs(up) <= 1, `${where}: ${up.toFixed(2)} m off main's surface`)
        assert.ok(across <= (main.width[0] ?? 0) / 2 + 1, `${where}: ${across.toFixed(2)} m out`)
      }
    }
  }
  // Skyway's lower roads come up on main's right, except the second, which comes up on its left.
  assert.deepEqual(
    TRACKS.skyway.branches.filter((b) => b.kind === 'drop').map((b) => b.side),
    [1, -1, 1, 1],
  )
  // Tidal's sweeper split leaves main gently, so it's alongside for well over 30 m.
  assert.ok((TRACKS.tidal.branches[3]?.open ?? 0) > 60)
})
