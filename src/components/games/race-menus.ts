import type { RaceAudio } from './race-audio.ts'
import { autopilot, type Driving } from './race-autopilot.ts'
import { loadName, saveName } from './race-board.ts'
import type { Input, ShipState, StepEvents, Tuning } from './race-physics.ts'
import {
  cleanName,
  formatDelta,
  formatTime,
  LAPS,
  SHIP_ORDER,
  SHIPS,
  type ShipId,
  statBar,
} from './race-rules.ts'
import type { Track } from './race-tracks.ts'
import type { RaceView } from './race-view.ts'
import type { GameHud, HudLine, HudTone } from './types.ts'

// The racer's menus and HUD pieces. Solo (race.ts) and online (race-online.ts) share them. No
// three.js, so the tests run them under Node.

const NAME_MAX = 16
const NAME_RULE = 'letters, digits, space, - and _, up to 16'
const BOOST_CELLS = 10
// Share of speed a wall hit costs before the camera shakes. Scrapes along a wall cost less.
const WALL_PULSE = 0.12
// The clock changes every frame. Sending it to React 30 times a second is plenty.
const HUD_EVERY = 1 / 30
// Keys that move the result menu's cursor, and tick.
const MENU_MOVE = new Set(['ArrowUp', 'ArrowDown', 'w', 's'])
const MENU = ['play again', 'choose ship', 'exit'] as const
type MenuItem = (typeof MENU)[number]
// After the line the autopilot keeps the ship on the road under the results, at this speed.
const CRUISE: Driving = { boost: 'never', shortcuts: false }
const CRUISE_SPEED = 25 // m/s

/** Single letters come in as typed, so Shift+W is 'W'. Controls match either case. */
export const norm = (key: string) => (key.length === 1 ? key.toLowerCase() : key)
export const CONTROLS = new Set([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'a',
  'd',
  'w',
  's',
  ' ',
  'Shift',
])

/** The driving input from the keys held down, already passed through norm. */
export const controlInput = (held: ReadonlySet<string>): Input => ({
  steer:
    (held.has('ArrowRight') || held.has('d') ? 1 : 0) -
    (held.has('ArrowLeft') || held.has('a') ? 1 : 0),
  throttle: held.has('ArrowUp') || held.has('w'),
  brake: held.has('ArrowDown') || held.has('s') || held.has(' '),
  boost: held.has('Shift'),
})

export type Picker = {
  readonly step: 'ship' | 'name'
  readonly name: string
  ship(): ShipId
  /** Back to the ship menu, at the given ship or the last one shown. The name stays. */
  open(at?: ShipId): void
  /** Takes the raw key. True when it used it. */
  key(raw: string, repeat?: boolean): boolean
  hud(): Pick<GameHud, 'score' | 'label' | 'lines'>
}

/**
 * The ship menu, then the name entry. `confirm` is the last line under the name. Enter on a good
 * name saves it and calls done.
 */
export function createPicker(
  on: { showcase: (ship: ShipId) => void; done: (ship: ShipId, name: string) => void },
  confirm: string,
): Picker {
  let step: 'ship' | 'name' = 'ship'
  let shipAt = 0
  let name = loadName()
  const ship = (): ShipId => SHIP_ORDER[shipAt] ?? 'vega'

  return {
    get step() {
      return step
    },
    get name() {
      return name
    },
    ship,
    open(at) {
      step = 'ship'
      if (at) shipAt = Math.max(0, SHIP_ORDER.indexOf(at))
      on.showcase(ship())
    },
    key(raw, repeat) {
      const key = norm(raw)
      if (step === 'ship') {
        const move =
          key === 'ArrowRight' || key === 'd' ? 1 : key === 'ArrowLeft' || key === 'a' ? -1 : 0
        if (move) {
          shipAt = (shipAt + move + SHIP_ORDER.length) % SHIP_ORDER.length
          on.showcase(ship())
          return true
        }
        if (key !== 'Enter') return false
        // Held Enter auto-repeats: it mustn't run on through the name.
        if (!repeat) step = 'name'
        return true
      }
      if (key === 'Enter') {
        if (repeat) return true
        const clean = cleanName(name)
        if (!clean) return true
        name = clean
        saveName(clean)
        on.done(ship(), clean)
        return true
      }
      if (key === 'Backspace') name = [...name].slice(0, -1).join('')
      // One character, Cyrillic included. Named keys (Shift, Tab, F5) are longer.
      else if ([...raw].length === 1 && [...name].length < NAME_MAX) name += raw
      else return false
      return true
    },
    hud() {
      const shipName = SHIPS[ship()].name
      if (step === 'ship') {
        const s = SHIPS[ship()].stats
        return {
          score: shipName,
          label: `ship ${shipAt + 1}/${SHIP_ORDER.length}`,
          lines: [
            `accel     ${statBar(s.accel)}`,
            `top speed ${statBar(s.top)}`,
            `handling  ${statBar(s.handling)}`,
            `boost     ${statBar(s.boost)}`,
            '',
            '← → pick · enter chooses',
          ],
        }
      }
      return {
        score: shipName,
        label: 'ship',
        lines: [
          `name: ${name}_`,
          ...(cleanName(name) ? [] : [{ text: NAME_RULE, tone: 'pink' as const }]),
          '',
          confirm,
        ],
      }
    },
  }
}

/** play again / choose ship / exit, under the results. */
export function createMenu() {
  let at = 0
  return {
    item: (): MenuItem => MENU[at] ?? 'exit',
    reset() {
      at = 0
    },
    lines: (): HudLine[] =>
      MENU.map(
        (item, i): HudLine => (i === at ? { text: `> ${item}`, tone: 'primary' } : `  ${item}`),
      ),
    /** 'choose' on Enter. Otherwise true when it used the key. */
    key(raw: string, repeat?: boolean): boolean | 'choose' {
      const key = norm(raw)
      // The arrow still held from the last lap auto-repeats: it mustn't scroll the menu.
      if (repeat) return CONTROLS.has(key) || key === 'Enter'
      if (key === 'ArrowUp' || key === 'w') at = (at + MENU.length - 1) % MENU.length
      else if (key === 'ArrowDown' || key === 's') at = (at + 1) % MENU.length
      else if (key === 'Enter') return 'choose'
      else return CONTROLS.has(key)
      return true
    },
  }
}

export const lapLines = (laps: number[]): HudLine[] =>
  laps.map((ms, i) => `lap ${i + 1}  ${formatTime(ms)}`)

export const lapLine = (st: ShipState | null) => `lap ${Math.min((st?.lap ?? 0) + 1, LAPS)}/${LAPS}`

export function boostLine(st: ShipState | null): HudLine {
  const meter = Math.round((st?.meter ?? 1) * BOOST_CELLS)
  return {
    text: `boost ${'█'.repeat(meter)}${'░'.repeat(BOOST_CELLS - meter)}`,
    tone: st?.boosting ? 'primary' : 'muted',
  }
}

/**
 * Sends the HUD to React. A HUD update re-renders, so only real changes go out, and with force
 * false (the clock ticking) at most every HUD_EVERY seconds. tick counts that time down.
 */
export function hudPusher(onHud: (hud: GameHud) => void, hud: () => GameHud) {
  let wait = 0
  let shown = ''
  let stopped = false
  return {
    push(force = true) {
      if (stopped || (!force && wait > 0)) return
      const next = hud()
      const key = JSON.stringify(next)
      if (key === shown) return
      shown = key
      wait = HUD_EVERY
      onHud(next)
    },
    tick(dt: number) {
      wait -= dt
    },
    stop() {
      stopped = true
    },
  }
}

/**
 * The pulses and sounds for a step's events: pads, walls, landings, laps and the finish.
 * Returns the banner for a lap just ended, if one did.
 */
export function stepCues(
  view: Pick<RaceView, 'pulse' | 'audio'>,
  ev: StepEvents,
): { text: string; tone?: HudTone } | null {
  if (ev.pad) view.pulse('pad')
  if ((ev.wall ?? 0) >= WALL_PULSE) view.pulse('wall')
  if (ev.wall) view.audio.wall(ev.wall)
  if (ev.landed) view.audio.cue('land')
  let banner = null
  if (ev.lap) {
    banner = lapBanner(ev.lap)
    if (!ev.finished) view.audio.cue((ev.lap.delta ?? 0) < 0 ? 'best' : 'lap')
  }
  if (ev.finished) view.audio.cue('finish')
  return banner
}

/** M mutes and N turns the music off and on, except while a name is typed. True when used. */
export function soundKey(audio: RaceAudio, key: string, repeat = false, typing = false) {
  if (typing || (key !== 'm' && key !== 'n')) return false
  if (repeat) return true
  if (key === 'm') audio.toggleMute()
  else audio.toggleMusic()
  return true
}

/** The result menu's sounds: a pick on Enter, a tick when the cursor moves. */
export function menuCue(audio: RaceAudio, got: boolean | 'choose', key: string, repeat = false) {
  if (repeat || !got) return
  if (got === 'choose') audio.cue('pick')
  else if (MENU_MOVE.has(key)) audio.cue('tick')
}

/** `lap 2 · 0:58.41 · -1.20`: green when faster than the lap before, pink when slower. */
export function lapBanner(lap: NonNullable<StepEvents['lap']>): { text: string; tone?: HudTone } {
  const { n, ms, delta } = lap
  const split = delta === null ? '' : ` · ${formatDelta(delta)}`
  return {
    text: `lap ${n} · ${formatTime(ms)}${split}`,
    tone: delta === null ? undefined : delta < 0 ? 'green' : 'pink',
  }
}

/** Input that keeps a finished ship going round under the results. */
export function cruise(track: Track, tune: Tuning, ship: ShipState): Input {
  const drive = autopilot(track, tune, ship, CRUISE)
  return { ...drive, throttle: drive.throttle && ship.speed < CRUISE_SPEED, boost: false }
}
