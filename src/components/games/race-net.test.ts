import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  drawAt,
  encode,
  ghostNow,
  knownPath,
  leavers,
  ordinal,
  receive,
  relayed,
  resultLines,
  type Seen,
  seatLines,
  standings,
  type Wire,
  wireProgress,
} from './race-net.ts'
import { createShip, progress } from './race-physics.ts'
import { TRACKS } from './race-track-defs.ts'
import type { Track } from './race-tracks.ts'

const wire = (over: Partial<Wire> = {}): Wire => ({
  p: 0,
  d: 100,
  x: 0,
  y: 0,
  h: 0,
  v: 50,
  b: 0,
  l: 0,
  c: 0,
  ...over,
})

// A straight closed 1000 m main and a 200 m branch.
const straight = (length: number, closed: boolean) => ({
  closed,
  length,
  width: new Float32Array(length + 1).fill(16),
  curve: new Float32Array(length + 1),
})
const loop = { paths: [straight(1000, true), straight(200, false)] } as unknown as Track

test('encode sends whole numbers for path, lap and checkpoint and rounds the rest', () => {
  const st = createShip(TRACKS.coaster, 1)
  st.s = 512.34567
  st.x = -2.123456
  st.yaw = 0.0512345
  st.speed = 81.2345
  st.boosting = true
  st.lap = 2
  st.next = 5
  const msg = encode(st)
  assert.deepEqual(msg, {
    t: 's',
    p: 0,
    d: 512.35,
    x: -2.12,
    y: 0,
    h: 0.051,
    v: 81.23,
    b: 1,
    l: 2,
    c: 5,
  })
  for (const k of ['p', 'l', 'c'] as const) assert.ok(Number.isInteger(msg[k]))
})

test('ghostNow carries the newest state forward at its speed', () => {
  const g = ghostNow(loop, { at: 1050, w: wire({ d: 103.5, v: 70 }) }, 1080)
  assert.ok(g)
  assert.ok(Math.abs(g.s - 105.6) < 1e-6, `s ${g.s}`)
  assert.equal(g.speed, 70)
  assert.equal(ghostNow(loop, null, 1000), null)
})

test('ghostNow moves sideways along the heading, and stops guessing after 150 ms', () => {
  const seen: Seen = { at: 0, w: wire({ d: 100, x: 0, v: 40, h: Math.PI / 6 }) }
  const g = ghostNow(loop, seen, 100)
  assert.ok(g)
  assert.ok(Math.abs(g.s - (100 + 4 * Math.cos(Math.PI / 6))) < 1e-6)
  assert.ok(Math.abs(g.x - 2) < 1e-6)
  const late = ghostNow(loop, seen, 5000)
  assert.ok(late)
  assert.ok(Math.abs(late.s - (100 + 6 * Math.cos(Math.PI / 6))) < 1e-6)
})

test('ghostNow wraps at the line and stops at the end of a branch', () => {
  const lap = ghostNow(loop, { at: 0, w: wire({ d: 999, v: 50 }) }, 100)
  assert.ok(Math.abs((lap?.s ?? -1) - 4) < 1e-6)
  assert.equal(ghostNow(loop, { at: 0, w: wire({ p: 1, d: 198, v: 50 }) }, 100)?.s, 200)
})

test('a fresh state fades in from where the ship was drawn', () => {
  const g = relayed()
  receive(loop, g, wire({ d: 100, v: 50 }), 0)
  // Drawn at 105 at 100 ms. The next state says it was really at 103 then.
  assert.ok(Math.abs((drawAt(loop, g, 100)?.s ?? 0) - 105) < 1e-6)
  receive(loop, g, wire({ d: 103, v: 50 }), 100)
  assert.ok(Math.abs((drawAt(loop, g, 100)?.s ?? 0) - 105) < 1e-6)
  // Half way through the fade the 2 m jump is half gone; after it, the new state rules.
  assert.ok(Math.abs((drawAt(loop, g, 150)?.s ?? 0) - (103 + 2.5 + 1)) < 1e-6)
  assert.ok(Math.abs((drawAt(loop, g, 200)?.s ?? 0) - (103 + 5)) < 1e-6)
})

test('a jump onto another path or too far to fade snaps', () => {
  const g = relayed()
  receive(loop, g, wire({ p: 0, d: 400, v: 50 }), 0)
  receive(loop, g, wire({ p: 1, d: 3, v: 50 }), 50)
  assert.equal(drawAt(loop, g, 50)?.path, 1)
  assert.equal(drawAt(loop, g, 50)?.s, 3)
  receive(loop, g, wire({ p: 1, d: 150, v: 0 }), 60)
  assert.equal(drawAt(loop, g, 60)?.s, 150)
})

test('wireProgress matches progress for the same ship', () => {
  const track = TRACKS.coaster
  const st = createShip(track, 0)
  st.s = 300
  st.lap = 1
  st.next = 1
  const w = encode(st)
  assert.ok(Math.abs(wireProgress(track, w, false) - progress(track, st)) < 0.01)
})

test('a state on a path this track has no road for is unknown', () => {
  const track = TRACKS.skyway
  for (let p = 0; p < track.paths.length; p++) assert.equal(knownPath(track, wire({ p })), true)
  assert.equal(knownPath(track, wire({ p: track.paths.length })), false)
  assert.equal(knownPath(track, wire({ p: 15 })), false)
  assert.equal(knownPath(TRACKS.coaster, wire({ p: TRACKS.skyway.paths.length - 1 })), false)
})

test('leavers: a seat that started but has stopped racing, only mid-race', () => {
  const players = [true, true, true, false]
  const racing = [true, false, true, false]
  // A late joiner hears the race's players, a leaver among them, while the room is playing.
  assert.deepEqual(leavers(players, { playing: true, racing }), [false, true, false, false])
  // A normal start comes with the lobby room still held: nobody has left yet.
  assert.deepEqual(leavers(players, { playing: false, racing: [false, false, false, false] }), [
    false,
    false,
    false,
    false,
  ])
})

test('standings put finishers first by place, then the rest by progress', () => {
  assert.deepEqual(
    standings([
      { seat: 0, progress: 900 },
      { seat: 1, progress: 2000, place: 2 },
      { seat: 2, progress: 1500 },
      { seat: 3, progress: 1800, place: 1 },
    ]),
    [3, 1, 2, 0],
  )
})

test('ordinal', () => {
  assert.deepEqual([1, 2, 3, 4].map(ordinal), ['1st', '2nd', '3rd', '4th'])
})

test('results list the places with names, ships and times, and dnf for -1', () => {
  const names = ['Bat', 'Ana', '', 'Lee']
  const ships = ['vega', 'torch', '', 'wisp']
  const lines = resultLines({ order: [3, 0, 1, -1], ms: [204_118, 209_877, -1, -1] }, names, ships)
  assert.deepEqual(lines, [
    { text: '1st Lee Wisp    3:24.11', tone: 'green' },
    { text: '2nd Bat Vega    3:29.87', tone: 'primary' },
    { text: '    Ana Torch   dnf', tone: 'amber' },
  ])
})

test('lobby seats show name, ship, host and wins in seat colours', () => {
  const lines = seatLines(
    {
      seats: [true, true, false, true],
      names: ['Bat', '', '', 'Lee'],
      ships: ['vega', '', '', 'kestrel'],
      wins: [2, 0, 0, 1],
      host: 0,
    },
    3,
  )
  assert.deepEqual(lines, [
    { text: '██ Bat      Vega    host  2', tone: 'primary' },
    { text: `██ picking… ${' '.repeat(13)} 0`, tone: 'amber' },
    { text: '░░ open seat', tone: 'muted' },
    { text: `██ Lee      Kestrel ${' '.repeat(6)}1 you`, tone: 'green' },
  ])
})
