export type ShipId = 'vega' | 'kestrel' | 'lancer' | 'wisp' | 'torch'
export type TrackId = 'coaster' | 'skyway' | 'tidal'
export type Stats = { accel: number; top: number; handling: number; boost: number }

export const SHIPS: Record<ShipId, { name: string; stats: Stats; color: string }> = {
  vega: { name: 'Vega', stats: { accel: 3, top: 3, handling: 3, boost: 3 }, color: '#4da3ff' },
  kestrel: {
    name: 'Kestrel',
    stats: { accel: 5, top: 2, handling: 4, boost: 1 },
    color: '#ffd23f',
  },
  lancer: { name: 'Lancer', stats: { accel: 2, top: 5, handling: 1, boost: 4 }, color: '#ff4d6d' },
  wisp: { name: 'Wisp', stats: { accel: 3, top: 2, handling: 5, boost: 2 }, color: '#3dffb5' },
  torch: { name: 'Torch', stats: { accel: 2, top: 3, handling: 2, boost: 5 }, color: '#ff8a1f' },
}

export const SHIP_ORDER: ShipId[] = ['vega', 'kestrel', 'lancer', 'wisp', 'torch']
export const TRACK_ORDER: TrackId[] = ['coaster', 'skyway', 'tidal']
export const TRACK_NAMES: Record<TrackId, string> = {
  coaster: 'Coaster',
  skyway: 'Skyway',
  tidal: 'Tidal',
}
export const LAPS = 3
/**
 * km/h shown per m/s of ship speed. Ships race like craft much bigger than the 3 m they're drawn,
 * so the readout uses a game scale, 1.58 times true km/h: about 400 at top speed, 600 to 650
 * boosting.
 */
export const KMH_PER_MS = 5.7
/** About the fastest boosted speed, m/s: the view is widest and the engine highest here. */
export const FAST = 115

const NAME_RE = /^[\p{L}\p{N}_ -]{1,16}$/u

export function cleanName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, ' ')
  return NAME_RE.test(name) ? name : null
}

function swap(a: TrackId[], i: number, j: number) {
  const t = a[i] as TrackId
  a[i] = a[j] as TrackId
  a[j] = t
}

export function createShuffle(rng: () => number = Math.random): { next(): TrackId } {
  let bag: TrackId[] = []
  let last: TrackId | null = null
  function refill() {
    bag = [...TRACK_ORDER]
    for (let i = bag.length - 1; i > 0; i--) {
      swap(bag, i, Math.floor(rng() * (i + 1)))
    }
    if (bag[0] === last) swap(bag, 0, 1)
  }
  return {
    next() {
      if (bag.length === 0) refill()
      const id = bag.shift() as TrackId
      last = id
      return id
    },
  }
}

/** s padded with spaces to w characters. Counts characters, not UTF-16 units, so any name lines up. */
export const pad = (s: string, w: number) => s + ' '.repeat(Math.max(0, w - [...s].length))

/** A run's time: its laps added up, ms. */
export const lapTotal = (laps: readonly number[]) => laps.reduce((a, b) => a + b, 0)

export function formatTime(ms: number): string {
  const cs = Math.floor(ms / 10)
  const m = Math.floor(cs / 6000)
  const s = Math.floor((cs % 6000) / 100)
  const c = cs % 100
  return `${m}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`
}

export function formatDelta(ms: number): string {
  const cs = Math.round(Math.abs(ms) / 10)
  const sign = ms < 0 ? '-' : '+'
  return `${sign}${Math.floor(cs / 100)}.${String(cs % 100).padStart(2, '0')}`
}

export function statBar(n: number): string {
  return '█'.repeat(n) + '░'.repeat(5 - n)
}
