import { boardLines, postTime } from './race-board.ts'
import {
  boostLine,
  CONTROLS,
  controlInput,
  createMenu,
  createPicker,
  cruise,
  hudPusher,
  lapLine,
  lapLines,
  menuCue,
  norm,
  soundKey,
  stepCues,
} from './race-menus.ts'
import { advance, createShip, type ShipState, type StepEvents, tuning } from './race-physics.ts'
import {
  createShuffle,
  formatTime,
  lapTotal,
  SHIPS,
  TRACK_NAMES,
  type TrackId,
} from './race-rules.ts'
import { TRACKS } from './race-track-defs.ts'
import { createRaceView } from './race-view.ts'
import type { GameHud, HudLine, HudTone, StartGame } from './types'

// The solo racer: pick a ship, type a name, three laps against the clock, then the week's board.
// Physics in race-physics, drawing in race-view, menus in race-menus; this file holds the run.

// Seconds the track's name shows before 3, 2, 1.
const INTRO = 1.5
const COUNT = 3
const GO_SHOW = 0.7
const SPLIT_SHOW = 2

type Phase = 'pick' | 'countdown' | 'racing' | 'result'

export const start: StartGame = (stage, onHud, options) => {
  let phase: Phase = 'pick'
  let paused = false
  const shuffle = createShuffle()
  let trackId: TrackId = 'coaster'
  let st: ShipState | null = null
  let carry = 0
  // Seconds since the countdown began.
  let count = 0
  let banner = ''
  let bannerTone: HudTone | undefined
  // Seconds before the banner clears. Infinity: it stays.
  let bannerLeft = Number.POSITIVE_INFINITY
  const held = new Set<string>()
  const menu = createMenu()
  let board: HudLine[] = []
  // Bumped on every start and finish, so a slow answer for an earlier run can't land on a later one.
  let run = 0
  let best: { ms: number; track: TrackId } | null = null
  // The last countdown number beeped, so each sounds once.
  let beeped = 0

  const view = createRaceView(stage)
  const picker = createPicker(
    {
      showcase: (ship) => view.showcase(ship),
      done: () => race(true),
    },
    'enter to race',
  )
  const ship = () => picker.ship()
  const track = () => TRACKS[trackId]
  let tune = tuning(SHIPS[ship()].stats)
  view.showcase(ship())

  const flash = (text: string, seconds: number, tone?: HudTone) => {
    banner = text
    bannerTone = tone
    bannerLeft = seconds
  }

  const hud = (): GameHud => {
    const base = { banner: banner || undefined, bannerTone, over: false, paused }
    if (phase === 'pick') return { ...base, ...picker.hud() }
    const laps = st?.laps ?? []
    if (phase === 'result') {
      return {
        ...base,
        score: formatTime(lapTotal(laps)),
        label: `total on ${TRACK_NAMES[trackId]}`,
        lines: [...lapLines(laps), '', ...board, '', ...menu.lines()],
      }
    }
    return {
      ...base,
      score: formatTime(st?.time ?? 0),
      label: 'time',
      lines: [
        TRACK_NAMES[trackId],
        lapLine(st),
        boostLine(st),
        view.audio.muted ? 'sound off · m' : '',
        ...lapLines(laps),
      ],
    }
  }

  const huds = hudPusher(onHud, hud)
  const pushHud = huds.push

  /** From the countdown. A new track comes from the shuffle; R keeps the same one. */
  const race = (newTrack: boolean) => {
    if (newTrack) {
      trackId = shuffle.next()
      view.setTrack(track())
    }
    tune = tuning(SHIPS[ship()].stats)
    st = createShip(track(), 0)
    // The board for the last run no longer shows, so its answer is dropped.
    run++
    // The first autopilot call plans the track's line. Done here it can't stall the finish.
    cruise(track(), tune, st)
    view.setShips([{ id: 0, ship: ship(), color: SHIPS[ship()].color }])
    carry = 0
    paused = false
    phase = 'countdown'
    // A restart skips the track's name: the player knows where they are.
    count = newTrack ? 0 : INTRO
    beeped = 0
    flash(newTrack ? TRACK_NAMES[trackId] : '3', Number.POSITIVE_INFINITY)
    pushHud()
  }

  const finish = (laps: number[]) => {
    phase = 'result'
    menu.reset()
    const total = lapTotal(laps)
    if (!best || total < best.ms) best = { ms: total, track: trackId }
    board = ['scoreboard loading…']
    const token = ++run
    const runName = picker.name
    postTime({ track: trackId, name: runName, ship: ship(), lapMs: laps }).then(
      (got) => {
        if (token !== run) return
        try {
          board = boardLines(got, runName, Date.now())
        } catch {
          // A reply that isn't the board's shape.
          board = ['scoreboard offline']
        }
        pushHud()
      },
      (err: unknown) => {
        if (token !== run) return
        board = [err instanceof Error ? err.message : 'scoreboard offline']
        pushHud()
      },
    )
  }

  const onEvents = (ev: StepEvents) => {
    const lap = stepCues(view, ev)
    if (lap) flash(lap.text, SPLIT_SHOW, lap.tone)
    if (ev.finished && st) finish([...st.laps])
  }

  view.loop((dt) => {
    if (paused || !st || phase === 'pick') return
    if (bannerLeft !== Number.POSITIVE_INFINITY) {
      bannerLeft -= dt
      if (bannerLeft <= 0) flash('', Number.POSITIVE_INFINITY)
    }
    if (phase === 'countdown') {
      count += dt
      if (count >= INTRO + COUNT) {
        phase = 'racing'
        flash('go', GO_SHOW)
        view.audio.cue('go')
      } else if (count >= INTRO) {
        const n = Math.ceil(INTRO + COUNT - count)
        flash(String(n), Number.POSITIVE_INFINITY)
        if (n !== beeped) {
          beeped = n
          view.audio.cue('count')
        }
      }
    } else {
      // After the line the autopilot cruises the ship on under the results.
      const input = phase === 'racing' ? controlInput(held) : cruise(track(), tune, st)
      const out = advance(track(), tune, st, input, dt, carry)
      carry = out.carry
      if (phase === 'racing') onEvents(out.events)
    }
    view.draw([{ ...st, id: 0 }], 0, dt)
    huds.tick(dt)
    pushHud(phase !== 'racing')
  })

  const pause = (on: boolean) => {
    if (phase !== 'countdown' && phase !== 'racing') return
    paused = on
    pushHud()
  }

  // Keys let go while the tab is in the background never send keyup.
  const onBlur = () => {
    held.clear()
    pause(true)
  }
  addEventListener('blur', onBlur)

  const choose = () => {
    const item = menu.item()
    if (item === 'play again') race(true)
    else if (item === 'choose ship') {
      phase = 'pick'
      flash('', Number.POSITIVE_INFINITY)
      picker.open()
      pushHud()
    } else options?.onQuit?.()
  }

  pushHud()

  return {
    key(raw, repeat) {
      const key = norm(raw)
      // Any key is the gesture browsers wait for before they play sound.
      view.audio.unlock()
      const typing = phase === 'pick' && picker.step === 'name'
      if (soundKey(view.audio, key, repeat, typing)) {
        pushHud()
        return true
      }
      if (phase === 'pick') {
        const used = picker.key(raw, repeat)
        if (used) {
          if (!repeat) view.audio.cue(key === 'Enter' ? 'pick' : 'tick')
          pushHud()
        }
        return used
      }
      if (phase === 'result') {
        const got = menu.key(raw, repeat)
        menuCue(view.audio, got, key, repeat)
        if (got === 'choose') choose()
        else pushHud()
        return got !== false
      }
      if (CONTROLS.has(key)) {
        held.add(key)
        return true
      }
      if (key === 'p') {
        if (!repeat) pause(!paused)
        return true
      }
      if (key === 'r') {
        if (!repeat) race(false)
        return true
      }
      return false
    },
    keyup(raw) {
      held.delete(norm(raw))
    },
    summary() {
      return best
        ? `race: best ${formatTime(best.ms)} on ${TRACK_NAMES[best.track]}`
        : 'race exited'
    },
    dispose() {
      huds.stop()
      removeEventListener('blur', onBlur)
      view.dispose()
    },
  }
}
