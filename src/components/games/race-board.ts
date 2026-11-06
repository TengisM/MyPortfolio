import { formatTime, pad, type ShipId, type TrackId } from './race-rules.ts'
import type { HudLine } from './types.ts'

// The weekly scoreboard on the Go API (api/internal/service/race), and the racer's saved name.
// No three.js, so the tests run it under Node.

/** A value kept in localStorage. null when there's none, or when storage is refused (private mode). */
export function stored(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** Keeps a value in localStorage. Without storage it's forgotten next time; the game works on. */
export function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Nothing to keep it in.
  }
}

/** The last name typed, pre-filled next time. */
const NAME_KEY = 'race-name'

export const loadName = (): string => stored(NAME_KEY) ?? ''

export const saveName = (name: string) => store(NAME_KEY, name)

export type BoardEntry = {
  place: number
  name: string
  ship: ShipId
  total_ms: number
  lap_ms: number[]
}

/** Mirrors BoardView in board.go. */
export type BoardView = {
  track: TrackId
  /** RFC 3339: next Monday 00:00 UTC. */
  resets_at: string
  top: BoardEntry[]
  /** The name's best run this week, or null when it has none. */
  you: { place: number; total_ms: number } | null
  new_best: boolean
}

const BASE = '/api/race'
const OFFLINE = 'scoreboard offline'
// The free API host sleeps when idle and can take most of a minute to wake.
const WAIT_MS = 90_000

/** The handlers write sentence case; the game's copy is lowercase with no closing period. */
const quiet = (message: string) => message.toLowerCase().replace(/\.$/, '')

async function request(path: string, init?: RequestInit): Promise<BoardView> {
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), WAIT_MS)
  let res: Response
  let body: unknown
  try {
    res = await fetch(`${BASE}${path}`, { ...init, signal: abort.signal })
    body = await res.json()
  } catch {
    throw new Error(OFFLINE)
  } finally {
    clearTimeout(timer)
  }
  if (res.ok) return body as BoardView
  const message = (body as { message?: unknown } | null)?.message
  throw new Error(typeof message === 'string' && message ? quiet(message) : OFFLINE)
}

export function postTime(run: {
  track: TrackId
  name: string
  ship: ShipId
  lapMs: number[]
}): Promise<BoardView> {
  return request('/times', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ track: run.track, name: run.name, ship: run.ship, lap_ms: run.lapMs }),
  })
}

export function resetsIn(resetsAt: string, now: number): string {
  const minutes = Math.max(0, Math.floor((Date.parse(resetsAt) - now) / 60_000))
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  return days > 0 ? `resets in ${days}d ${hours}h` : `resets in ${hours}h ${minutes % 60}m`
}

/**
 * The top 10, the player's own row in the primary colour, their place under it when the run
 * missed the top 10, and when the board resets.
 */
export function boardLines(view: BoardView, name: string, now: number): HudLine[] {
  const key = name.toLowerCase()
  const width = Math.max(3, ...view.top.map((e) => [...e.name].length))
  const lines: HudLine[] = view.top.map((e) => {
    const text = `${String(e.place).padStart(2)} ${pad(e.name, width)} ${e.ship.padEnd(7)} ${formatTime(e.total_ms)}`
    return e.name.toLowerCase() === key ? { text, tone: 'primary' } : text
  })
  if (lines.length === 0) lines.push('no times this week')
  if (view.you && view.you.place > view.top.length) {
    lines.push({
      text: `${String(view.you.place).padStart(2)} ${pad('you', width)} ${''.padEnd(7)} ${formatTime(view.you.total_ms)}`,
      tone: 'primary',
    })
  }
  lines.push(resetsIn(view.resets_at, now))
  return lines
}
