import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as THREE from 'three'
import { createShip, STEP, stepShip, tuning } from './race-physics.ts'
import { SHIPS, TRACK_ORDER } from './race-rules.ts'
import { TRACKS } from './race-track-defs.ts'
import { buildTrackMeshes, SLOT, trackLayout } from './race-track-mesh.ts'
import { frameAt, sampleIndex, type Track } from './race-tracks.ts'

const wrap = (a: number, n: number) => ((a % n) + n) % n
const vega = tuning(SHIPS.vega.stats)
const idle = { steer: 0, throttle: false, brake: false, boost: false }

/** Whether a ship on path at s, drifting out through side's edge, is stopped by a wall. */
function physicsWall(track: Track, side: -1 | 1, s: number, path = 0): boolean {
  const own = track.paths[path]
  assert.ok(own)
  const width = own.width[sampleIndex(own, s)] ?? 0
  const st = createShip(track, 0)
  // Straight sideways, so the step doesn't carry it along into or out of an opening.
  const x = side * (width / 2 - 0.05)
  Object.assign(st, { path, s, x, yaw: (side * Math.PI) / 2, speed: 30 })
  stepShip(track, vega, st, idle, STEP)
  return st.path === path
}

for (const id of TRACK_ORDER) {
  const track = TRACKS[id]
  const main = track.paths[0]
  assert.ok(main)
  const layout = trackLayout(track)
  const nearGap = (s: number) =>
    layout.gaps.some(([a, b]) => wrap(s - a + 5, main.length) < wrap(b - a, main.length) + 10)

  test(`${id}: main's drawn walls match the physics walls`, () => {
    for (let s = 0.5; s < main.length; s += 3) {
      if (nearGap(s)) continue
      for (const side of [-1, 1] as const) {
        assert.equal(layout.wall(0, side, s), physicsWall(track, side, s), `side ${side} at ${s}`)
      }
    }
  })

  test(`${id}: shortcuts' and lower roads' drawn walls match the physics walls`, () => {
    for (const b of track.branches) {
      const path = track.paths[b.path]
      assert.ok(path)
      for (let s = 0.5; s < path.length - 0.5; s += 3) {
        for (const side of [-1, 1] as const) {
          assert.equal(
            layout.wall(b.path, side, s),
            physicsWall(track, side, s, b.path),
            `path ${b.path} side ${side} at ${s}`,
          )
        }
      }
    }
  })

  test(`${id}: main has no road or walls over its gaps`, () => {
    for (const [a, b] of layout.gaps) {
      for (let s = a + 0.5; wrap(s - a, main.length) < wrap(b - a, main.length); s += 2) {
        assert.equal(layout.road(0, s), false, `road at ${s}`)
        assert.equal(layout.wall(0, -1, s) || layout.wall(0, 1, s), false, `wall at ${s}`)
      }
      assert.equal(layout.road(0, a - 1), true)
      assert.equal(layout.road(0, b + 1), true)
    }
  })

  test(`${id}: a branch's wall facing main is hidden over its openings`, () => {
    for (const b of track.branches) {
      const path = track.paths[b.path]
      assert.ok(path)
      for (let s = path.length * 0.25; s < path.length * 0.75; s += 5) {
        assert.ok(layout.wall(b.path, -1, s) && layout.wall(b.path, 1, s), `path ${b.path} at ${s}`)
      }
      if (b.kind === 'shortcut') {
        const near = -b.side as -1 | 1
        const end = path.length - b.close
        for (const [s, drawn] of [
          [0.5, false],
          [b.open - 0.5, false],
          [b.open + 0.5, true],
          [end - 0.5, true],
          [end + 0.5, false],
          [path.length - 0.5, false],
        ] as const) {
          assert.equal(layout.wall(b.path, near, s), drawn, `path ${b.path} at ${s}`)
          assert.equal(layout.wall(b.path, b.side, s), true, `path ${b.path} at ${s}`)
        }
      } else {
        // A lower road leaves where main's road stops, so its walls carry on from main's.
        assert.ok(layout.wall(b.path, -1, 3) && layout.wall(b.path, 1, 3), `path ${b.path} start`)
      }
    }
  })

  test(`${id}: main's road is cut over each lower road's merge ramp`, () => {
    for (const b of track.branches) {
      if (b.kind !== 'drop') continue
      const cut = layout.slot(wrap(b.to - 2, main.length))
      assert.ok(cut, `slot before ${b.to}`)
      assert.ok(Math.abs((cut[0] + cut[1]) / 2) < 1, 'the ramp meets main in its middle')
      assert.equal(layout.slot(wrap(b.to - SLOT - 2, main.length)), null)
      assert.equal(layout.slot(wrap(b.to + 2, main.length)), null)
    }
  })

  test(`${id}: main's road is drawn full width just outside each cut`, () => {
    const built = buildTrackMeshes(track, { value: 0 })
    const road = built.group.getObjectByName('road')
    assert.ok(road)
    const drawn = built.layout.paths[0]
    assert.ok(drawn)
    const ray = new THREE.Raycaster()
    const f = frameAt(drawn, 0)
    const origin = new THREE.Vector3()
    const down = new THREE.Vector3()
    for (const b of track.branches) {
      if (b.kind !== 'drop') continue
      for (const s of [b.to + 0.3, b.to + 1.7, b.to - SLOT - 0.3, b.to - SLOT - 1.7]) {
        frameAt(drawn, wrap(s, main.length), f)
        const half: number = (main.width[sampleIndex(main, s)] ?? 0) / 2
        for (let lat = -half + 0.3; lat < half; lat += 0.5) {
          origin.set(...f.p).addScaledVector(new THREE.Vector3(...f.r), lat)
          origin.addScaledVector(new THREE.Vector3(...f.n), 1)
          down.set(-f.n[0], -f.n[1], -f.n[2])
          ray.set(origin, down)
          ray.far = 1.5
          assert.ok(ray.intersectObject(road).length > 0, `hole at ${s.toFixed(1)}, ${lat}`)
        }
      }
    }
    built.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose()
    })
  })
}
