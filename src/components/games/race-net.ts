import { wrap } from './race-math.ts'
import { type Ghost, MIN_STRETCH, progress, type ShipState } from './race-physics.ts'
import { formatTime, pad, SHIPS, type ShipId } from './race-rules.ts'
import { sampleIndex, shortWay, type Track } from './race-tracks.ts'
import type { HudLine, HudTone } from './types.ts'

// The plain half of online racing: a ship state on the wire, the other ships carried forward from
// their last states, places, and the lobby and result rows. No three.js, so the tests run
// it under Node.

/** Seat colours in seat order, as in online Tetris. Seat 0 is whoever opened the room. */
export const SEAT_TONES: HudTone[] = ['primary', 'amber', 'pink', 'green']

/** A ship state as the server relays it. p, l and c must be whole numbers or the server drops it. */
export type Wire = {
  p: number // path
  d: number // metres along the path
  x: number
  y: number
  h: number // heading off the path tangent
  v: number // speed
  b: number // 1 while boosting
  l: number // laps finished
  c: number // next checkpoint
}

const round = (v: number, places: number) => Math.round(v * 10 ** places) / 10 ** places

/** Centimetres are plenty, and keep each message small. */
export const encode = (st: ShipState): Wire & { t: 's' } => ({
  t: 's',
  p: st.path,
  d: round(st.s, 2),
  x: round(st.x, 2),
  y: round(st.y, 2),
  h: round(st.yaw, 3),
  v: round(st.speed, 2),
  b: st.boosting ? 1 : 0,
  l: st.lap,
  c: st.next,
})

/** A state and when it arrived, in performance.now() ms. */
export type Seen = { at: number; w: Wire }

export type Relayed = Ghost & { yaw: number; boosting: boolean }

/** A state is guessed forward at most this far. Past it the sender has stalled or gone. */
const GUESS_MS = 150
/** A fresh state's jump from where the ship was drawn fades out over this long. */
const BLEND_MS = 100
/** A jump bigger than this, in metres, is a real one (a respawn, a lag spike): it snaps. */
const SNAP = 10

/** s moved by ds: round the lap on a closed path, stopped at the ends of a branch. */
function along(track: Track, path: number, s: number, ds: number) {
  const p = track.paths[path]
  if (!p) return s + ds
  return p.closed ? wrap(s + ds, p.length) : Math.min(p.length, Math.max(0, s + ds))
}

/**
 * Where a ship is now: its newest state carried forward at its speed and heading, the way
 * stepShip moves it. Drawing and bumping both use this, so you hit what you see.
 */
export function ghostNow(track: Track, newest: Seen | null, now: number): Relayed | null {
  if (!newest) return null
  const { w } = newest
  const dt = Math.min(GUESS_MS, Math.max(0, now - newest.at)) / 1000
  const p = track.paths[w.p]
  const curve = p ? (p.curve[sampleIndex(p, w.d)] ?? 0) : 0
  const ds = (w.v * Math.cos(w.h) * dt) / Math.max(MIN_STRETCH, 1 - curve * w.x)
  return {
    path: w.p,
    s: along(track, w.p, w.d, ds),
    x: w.x + w.v * Math.sin(w.h) * dt,
    y: w.y,
    yaw: w.h,
    speed: w.v,
    boosting: w.b > 0,
  }
}

/** One relayed ship: its newest states, and the jump the last one made, fading out. */
/** A relayed ship: its newest state, and the jump from where it was drawn still fading out. */
export type Tracked = { last: Seen | null; off: { s: number; x: number; y: number }; offAt: number }

export const relayed = (): Tracked => ({ last: null, off: { s: 0, x: 0, y: 0 }, offAt: 0 })

/** Where to draw the ship now, and where to bump it. */
export function drawAt(track: Track, t: Tracked, now: number): Relayed | null {
  const g = ghostNow(track, t.last, now)
  if (!g) return null
  const k = Math.max(0, 1 - (now - t.offAt) / BLEND_MS)
  if (k === 0) return g
  return {
    ...g,
    s: along(track, g.path, g.s, t.off.s * k),
    x: g.x + t.off.x * k,
    y: g.y + t.off.y * k,
  }
}

/** Takes a fresh state. The ship carries on from where it was drawn and eases onto the state. */
export function receive(track: Track, t: Tracked, w: Wire, now: number) {
  const before = drawAt(track, t, now)
  t.last = { at: now, w }
  const after = ghostNow(track, t.last, now)
  t.off = { s: 0, x: 0, y: 0 }
  if (!before || !after || before.path !== after.path) return
  const p = track.paths[after.path]
  let ds = before.s - after.s
  // Across the start line the short way, not back round the whole lap.
  if (p) ds = shortWay(p, ds)
  const dx = before.x - after.x
  if (Math.abs(ds) > SNAP || Math.abs(dx) > SNAP) return
  t.off = { s: ds, x: dx, y: before.y - after.y }
  t.offAt = now
}

/**
 * Whether the state's path is a road on this track. The server only range-checks p, and a state
 * on a path the track doesn't have would throw in progress and stop the frame loop.
 */
export const knownPath = (track: Track, w: Wire) =>
  w.p === 0 || track.branches.some((b) => b.path === w.p)

/**
 * Seats that started this race and have since left. Only while the room is playing: at a normal
 * start the room held is still the lobby's, and nobody has left yet.
 */
export const leavers = (players: boolean[], room: { playing: boolean; racing: boolean[] }) =>
  players.map((p, seat) => p && room.playing && !room.racing[seat])

export const wireProgress = (track: Track, w: Wire, finished: boolean) =>
  progress(track, { path: w.p, s: w.d, lap: w.l, next: w.c, finished })

/** Seats by place: finishers by their place, then the rest by progress. */
export function standings(racers: { seat: number; progress: number; place?: number }[]): number[] {
  return [...racers]
    .sort((a, b) => {
      if (a.place && b.place) return a.place - b.place
      if (a.place || b.place) return a.place ? -1 : 1
      return b.progress - a.progress || a.seat - b.seat
    })
    .map((r) => r.seat)
}

export const ordinal = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][n] ?? 'th'}`

/** Pads by code points, so a Cyrillic name lines up like a Latin one. */
const shipName = (id: string) => SHIPS[id as ShipId]?.name ?? ''
const seatName = (names: string[], seat: number) => names[seat] || `p${seat + 1}`

/** Places, names, ships and times. A DNF has no place and `dnf` for a time. */
export function resultLines(
  over: { order: number[]; ms: number[] },
  names: string[],
  ships: string[],
): HudLine[] {
  // -1 in order only fills empty slots.
  const rows = over.order.flatMap((seat, i) =>
    seat < 0 ? [] : [{ seat, place: i + 1, ms: over.ms[i] ?? -1 }],
  )
  const w = Math.max(0, ...rows.map((r) => [...seatName(names, r.seat)].length))
  return rows.map((r) => ({
    text: `${pad(r.ms < 0 ? '' : ordinal(r.place), 3)} ${pad(seatName(names, r.seat), w)} ${pad(shipName(ships[r.seat] ?? ''), 7)} ${r.ms < 0 ? 'dnf' : formatTime(r.ms)}`,
    tone: SEAT_TONES[r.seat] ?? 'muted',
  }))
}

/** One row per seat: name and ship as they pick, the host, and races won. */
export function seatLines(
  room: { seats: boolean[]; names: string[]; ships: string[]; wins: number[]; host: number },
  you: number,
): HudLine[] {
  const w = Math.max(8, ...room.names.map((n) => [...n].length))
  return SEAT_TONES.map((tone, seat): HudLine => {
    if (!room.seats[seat]) return { text: '░░ open seat', tone: 'muted' }
    const name = room.names[seat] || 'picking…'
    const host = seat === room.host ? 'host' : '    '
    const wins = String(room.wins[seat] ?? 0).padStart(2)
    return {
      text: `██ ${pad(name, w)} ${pad(shipName(room.ships[seat] ?? ''), 7)} ${host} ${wins}${seat === you ? ' you' : ''}`,
      tone,
    }
  })
}
