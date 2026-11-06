import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  autopilot,
  checkPads,
  checkShips,
  checkTargets,
  type Driving,
  lapTimes,
} from './race-autopilot.ts'
import { createShip, type ShipState, STEP, stepShip, tuning } from './race-physics.ts'
import { SHIP_ORDER, SHIPS, type ShipId, TRACK_ORDER } from './race-rules.ts'
import { TRACK_DEFS, TRACKS } from './race-track-defs.ts'
import { buildTrack, frameAt, sampleIndex, type Track, type TrackPath } from './race-tracks.ts'

const VEGA = tuning(SHIPS.vega.stats)
const NEVER: Driving = { boost: 'never', shortcuts: false }
const SMART: Driving = { boost: 'smart', shortcuts: true }
const DROPPING: Driving = { ...SMART, avoidLaunch: true }

const mainOf = (track: Track) => track.paths[0] as TrackPath
const wrap = (a: number, n: number) => ((a % n) + n) % n

/** Drives a ship (Vega unless named) round one lap, calling seen after every step. */
function oneLap(
  track: Track,
  how: Driving,
  seen: (st: ShipState, pad: boolean) => void,
  ship: ShipId = 'vega',
) {
  const t = tuning(SHIPS[ship].stats)
  const st = createShip(track, 0)
  for (let k = 0; st.lap < 1; k++) {
    assert.ok(k < 300 / STEP, `${track.id}: no lap in 300 s for ${ship} driving ${how.boost}`)
    const ev = stepShip(track, t, st, autopilot(track, t, st, how), STEP)
    seen(st, ev.pad === true)
  }
}

/** Vega's second lap, driving well. */
function smartLap2(track: Track): number {
  const st = createShip(track, 0)
  for (let k = 0; st.lap < 2; k++) {
    assert.ok(k < 300 / STEP, `${track.id}: no second lap in 300 s`)
    stepShip(track, VEGA, st, autopilot(track, VEGA, st, SMART), STEP)
  }
  return st.laps[1] as number
}

test('every branch meets main at both ends', () => {
  for (const id of TRACK_ORDER) {
    const track = TRACKS[id]
    const main = mainOf(track)
    for (const b of track.branches) {
      const path = track.paths[b.path] as TrackPath
      for (const [s, end] of [
        [b.from, 0],
        [b.to, path.length],
      ] as const) {
        // A shortcut's far edge meets main's edge on its side, a drop road meets main's centre.
        const f = frameAt(main, s)
        const half = (main.width[sampleIndex(main, s)] ?? 0) / 2
        const own = (path.width[sampleIndex(path, end)] ?? 0) / 2
        const x = b.kind === 'shortcut' ? b.side * (half - own) : 0
        const want = f.p.map((v, j) => v + (f.r[j] as number) * x)
        const got = frameAt(path, end).p
        const d = Math.hypot(...want.map((v, j) => v - (got[j] as number)))
        assert.ok(
          d < 1,
          `${id} ${b.kind} ${b.path} is ${d.toFixed(2)} m off main at ${s.toFixed(0)}`,
        )
      }
    }
  }
})

test('every drop road starts on the first sample of a gap and is at least as wide as main', () => {
  for (const id of TRACK_ORDER) {
    const track = TRACKS[id]
    const main = mainOf(track)
    const count = main.width.length
    for (const b of track.branches) {
      if (b.kind !== 'drop') continue
      // Otherwise the jump is zero metres long and ships drive across the gap.
      const first = Math.ceil(b.from - 1e-6) % count
      assert.equal(main.gap[first], 1, `${id} drop ${b.path} starts off the gap`)
      assert.equal(main.gap[wrap(first - 1, count)], 0, `${id} drop ${b.path} starts mid gap`)
      // Ships keep their x when they drop, so the drop road must have room for it.
      const path = track.paths[b.path] as TrackPath
      let widest = 0
      for (let s = b.from; s <= b.from + wrap(b.to - b.from, main.length); s++) {
        widest = Math.max(widest, main.width[sampleIndex(main, s)] ?? 0)
      }
      assert.ok(Math.min(...path.width) >= widest, `${id} drop ${b.path} is narrower than main`)
    }
  }
})

test("main roads don't run through themselves", () => {
  for (const id of TRACK_ORDER) {
    const main = mainOf(TRACKS[id])
    // Every other sample, bucketed so each one only meets its neighbours in space.
    const cell = 40
    const grid = new Map<string, number[]>()
    const pos = (i: number) => [main.p[i * 3] ?? 0, main.p[i * 3 + 1] ?? 0, main.p[i * 3 + 2] ?? 0]
    const cellOf = (i: number) => pos(i).map((v) => Math.floor(v / cell))
    for (let i = 0; i < main.width.length; i += 2) {
      const k = cellOf(i).join()
      grid.set(k, [...(grid.get(k) ?? []), i])
    }
    for (let a = 0; a < main.width.length; a += 2) {
      const [cx, cy, cz] = cellOf(a) as [number, number, number]
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          for (let dz = -1; dz <= 1; dz++) {
            for (const b of grid.get([cx + dx, cy + dy, cz + dz].join()) ?? []) {
              const along = Math.abs(a - b)
              if (Math.min(along, main.length - along) < 100) continue
              const d = Math.hypot(...pos(a).map((v, j) => v - (pos(b)[j] as number)))
              const clear = ((main.width[a] ?? 0) + (main.width[b] ?? 0)) / 2 + 2
              assert.ok(d > clear, `${id} meets itself at ${a} and ${b} m`)
            }
          }
    }
  }
})

test('drop roads keep clear of the rest of the lap', () => {
  for (const id of TRACK_ORDER) {
    const track = TRACKS[id]
    const main = mainOf(track)
    for (const b of track.branches) {
      if (b.kind !== 'drop') continue
      const drop = track.paths[b.path] as TrackPath
      const span = wrap(b.to - b.from, main.length)
      for (let i = 0; i < main.width.length; i += 2) {
        // Main near the drop's own span is where it leaves and rejoins.
        const along = wrap(i - b.from, main.length)
        if (along < span + 100 || along > main.length - 100) continue
        for (let k = 0; k < drop.width.length; k += 2) {
          const d = Math.hypot(
            ...[0, 1, 2].map((j) => (main.p[i * 3 + j] ?? 0) - (drop.p[k * 3 + j] ?? 0)),
          )
          const clear = ((main.width[i] ?? 0) + (drop.width[k] ?? 0)) / 2 + 2
          assert.ok(d > clear, `${id} drop ${b.path} meets main at ${i} m`)
        }
      }
    }
  }
})

test('coaster has loops, corkscrews, banking and shortcuts but no water or gaps', () => {
  const def = TRACK_DEFS.coaster
  const track = TRACKS.coaster
  const main = mainOf(track)
  assert.ok(def.paths.every((p) => !p.water?.length && !p.gap?.length))
  assert.deepEqual(def.colors, ['#d9472b', '#46c8ff'])
  assert.ok(track.branches.filter((b) => b.kind === 'shortcut').length >= 2)
  assert.ok(track.checkpoints.length >= 7 && track.checkpoints.length <= 9)
  let upsideDown = 0
  let bank = 0
  for (let i = 0; i < main.width.length; i++) {
    const nz = main.n[i * 3 + 2] ?? 0
    if (nz < -0.9) upsideDown++
    if (nz > 0 && nz < Math.cos(0.8)) bank++
  }
  assert.ok(upsideDown > 30, `${upsideDown} m upside down`)
  assert.ok(bank > 100, `${bank} m banked past 45°`)
})

test('skyway has 3 or 4 gaps, each with a launch pad within 40 m before it and a drop branch', () => {
  const track = TRACKS.skyway
  const main = mainOf(track)
  const count = main.width.length
  assert.deepEqual(TRACK_DEFS.skyway.colors, ['#f0a01c', '#52d6ff'])
  assert.ok(track.branches.filter((b) => b.kind === 'shortcut').length >= 2)
  const starts: number[] = []
  for (let i = 0; i < count; i++) {
    if (main.gap[i] && !main.gap[wrap(i - 1, count)]) starts.push(i)
  }
  assert.ok(starts.length >= 3 && starts.length <= 4, `${starts.length} gaps`)
  for (const g of starts) {
    let end = g
    while (main.gap[end % count]) end++
    const drop = track.branches.find((b) => b.kind === 'drop' && Math.ceil(b.from - 1e-6) === g)
    assert.ok(drop, `no drop road at the gap at ${g} m`)
    assert.ok(wrap(drop.to - g, main.length) > end - g, `the drop at ${g} m rejoins inside the gap`)
    const launch = track.pads.filter(
      (p) => p.path === 0 && p.launch && wrap(g - p.s, main.length) <= 40,
    )
    assert.ok(launch.length === 1, `${launch.length} launch pads before the gap at ${g} m`)
    // Missing the pad has to cost road, not only the pad's boost.
    const span = wrap(drop.to - drop.from, main.length)
    const own = (track.paths[drop.path] as TrackPath).length
    assert.ok(own > span, `the drop at ${g} m is ${own.toFixed(0)} m against ${span.toFixed(0)} m`)
  }
  assert.equal(track.branches.filter((b) => b.kind === 'drop').length, starts.length)
})

test('tidal has water on the main line and a dry route around it', () => {
  const track = TRACKS.tidal
  const main = mainOf(track)
  assert.deepEqual(TRACK_DEFS.tidal.colors, ['#f2662a', '#3fe0cf'])
  assert.ok(
    track.paths.every((p) => !p.gap.includes(1)),
    'tidal has a gap',
  )
  const dry = track.branches.filter((b) => {
    const path = track.paths[b.path] as TrackPath
    let wet = 0
    for (let s = b.from; s < b.from + wrap(b.to - b.from, main.length); s++) {
      wet += main.water[sampleIndex(main, s)] ?? 0
    }
    return wet > 0 && !path.water.includes(1)
  })
  assert.ok(dry.length >= 1, 'no dry route around water on main')
})

test('tidal has at least two shortcuts that each save vega a second', () => {
  const def = TRACK_DEFS.tidal
  const all = smartLap2(TRACKS.tidal)
  // Rebuilt without one shortcut at a time, the lap is that much slower.
  const saved = def.branches.map((_, i) => {
    const without = buildTrack({ ...def, branches: def.branches.filter((__, j) => j !== i) })
    return smartLap2(without) - all
  })
  const real = saved.filter((ms) => ms >= 1000)
  assert.ok(real.length >= 2, `saves ${saved.map((ms) => (ms / 1000).toFixed(2)).join(', ')} s`)
})

test('every ship clears every skyway gap driving well', () => {
  const track = TRACKS.skyway
  for (const ship of SHIP_ORDER) {
    const seen = new Set<number>()
    oneLap(track, SMART, (st) => seen.add(st.path), ship)
    for (const b of track.branches) {
      if (b.kind === 'drop') assert.ok(!seen.has(b.path), `${ship} took drop road ${b.path}`)
    }
  }
})

test('every ship but vega is fastest, or close to it, on some track', () => {
  const rows = Object.fromEntries(TRACK_ORDER.map((id) => [id, checkTargets(id).rows]))
  assert.deepEqual(checkShips(rows as Parameters<typeof checkShips>[0]).errors, [])
})

test('pads are counted on the line without shortcuts too', () => {
  // Coaster less its start pad meets 6 pads taking shortcuts but only 5 without.
  const def = TRACK_DEFS.coaster
  const track = buildTrack({ ...def, pads: def.pads.slice(1) })
  assert.deepEqual(checkPads(track), ['5 pads on the line without shortcuts'])
})

for (const id of TRACK_ORDER) {
  test(`${id} has 6 to 8 pads on the line, at least 8 s of Vega apart`, () => {
    assert.deepEqual(checkPads(TRACKS[id]), [])
  })

  test(`smart driving takes every shortcut and clears every gap on ${id}`, () => {
    const track = TRACKS[id]
    const seen = new Set<number>()
    oneLap(track, SMART, (st) => seen.add(st.path))
    for (const b of track.branches) {
      const want = b.kind === 'shortcut'
      assert.equal(seen.has(b.path), want, `${b.kind} ${b.path} ${want ? 'missed' : 'taken'}`)
    }
  })

  test(`throttle-only driving runs over no pads on ${id}`, () => {
    const track = TRACKS[id]
    let pads = 0
    oneLap(track, NEVER, (_, pad) => {
      if (pad) pads++
    })
    assert.equal(pads, 0)
  })

  test(`${id} meets the lap targets`, (t) => {
    const { rows, errors, warnings, minLap } = checkTargets(id)
    for (const w of warnings) t.diagnostic(`${id}: ${w}`)
    assert.deepEqual(errors, [])
    // The server's floor: whole seconds, under every lap any ship drives.
    assert.equal(minLap % 1000, 0)
    for (const { laps } of rows) for (const ms of laps ?? []) assert.ok(ms > minLap)
  })
}

test('missing every launch pad still finishes, but slower', () => {
  const track = TRACKS.skyway
  const drops = track.branches.filter((b) => b.kind === 'drop')
  const seen = new Set<number>()
  let launched = false
  oneLap(track, DROPPING, (st) => {
    seen.add(st.path)
    launched ||= st.launch
  })
  assert.ok(!launched, 'touched a launch pad')
  for (const b of drops) assert.ok(seen.has(b.path), `missed drop road ${b.path}`)
  const flying = lapTimes('skyway', 'vega', SMART)
  const dropping = lapTimes('skyway', 'vega', DROPPING)
  assert.equal(dropping.length, 3)
  for (const lap of [0, 1, 2]) {
    assert.ok((dropping[lap] as number) > (flying[lap] as number), `lap ${lap + 1}`)
  }
})
