import { type GameSocket, openGameSocket } from './game-socket'
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
import {
  drawAt,
  encode,
  knownPath,
  leavers,
  ordinal,
  type Relayed,
  receive,
  relayed,
  resultLines,
  SEAT_TONES,
  seatLines,
  standings,
  type Tracked,
  type Wire,
  wireProgress,
} from './race-net.ts'
import {
  advance,
  bump,
  createShip,
  progress,
  type ShipState,
  type StepEvents,
  tuning,
} from './race-physics.ts'
import {
  formatTime,
  lapTotal,
  SHIPS,
  type ShipId,
  TRACK_NAMES,
  type TrackId,
} from './race-rules.ts'
import { TRACKS } from './race-track-defs.ts'
import { createRaceView, type ShipDraw } from './race-view.ts'
import { COLORS as TONE_COLORS } from './tron-view'
import type { GameHud, HudLine, HudTone, StartGame } from './types'

// Online racing, up to four players. Each ship runs in its own browser, so steering never waits
// on the network. The Go API (api/internal/service/race) runs the room: seats, the host, the
// track, the countdown, finish order and the 30 second cut-off. It relays each ship's state to
// the others, and each browser bumps its own ship off the others it draws.

const seatColor = (seat: number) => TONE_COLORS[SEAT_TONES[seat] ?? 'muted']

type Seats = [boolean, boolean, boolean, boolean]
type Room = {
  t: 'room'
  code: string
  you: number
  host: number
  seats: Seats
  names: string[]
  ships: string[]
  wins: number[]
  racing: Seats
  playing: boolean
}
type ServerMessage =
  | Room
  | { t: 'race'; round: number; track: TrackId; count: number; players: Seats }
  | ({ t: 's'; s: number } & Wire)
  | { t: 'done'; s: number; ms: number; place: number }
  | { t: 'over'; order: number[]; ms: number[]; win: number; wins: number[] }
  | { t: 'error'; msg: string }

// States go out 20 times a second. The server drops anyone past 40 messages a second.
const SEND_MS = 50
// The server's cut-off after the first finisher. Only counted down on the HUD.
const CUTOFF_MS = 30_000
const GO_MS = 700
const SPLIT_MS = 2000
const NOTE_MS = 4000

export const start: StartGame = (stage, onHud, options) => {
  const joining = options?.room && options.room !== 'new' ? options.room.toUpperCase() : null

  // pick: the ship menu or name entry, in the lobby. finished: crossed the line, watching the
  // leader. watching: joined mid-race, or hadn't picked a ship when it started.
  type Phase =
    | 'connecting'
    | 'pick'
    | 'lobby'
    | 'countdown'
    | 'racing'
    | 'finished'
    | 'watching'
    | 'result'
    | 'closed'
  let phase: Phase = 'connecting'
  let room: Room = {
    t: 'room',
    code: '',
    you: -1,
    host: -1,
    seats: [false, false, false, false],
    names: ['', '', '', ''],
    ships: ['', '', '', ''],
    wins: [0, 0, 0, 0],
    racing: [false, false, false, false],
    playing: false,
  }
  let races = 0

  // This race.
  let trackId: TrackId = 'coaster'
  let players: Seats = [false, false, false, false]
  // Names and ships when the race began: the results still name someone who has left.
  let raceNames = ['', '', '', '']
  let raceShips = ['', '', '', '']
  // Racers who left during this race.
  let left = [false, false, false, false]
  // Finish place per seat, 0 until they finish, and their time.
  let places = [0, 0, 0, 0]
  let times = [-1, -1, -1, -1]
  let relays: Tracked[] = []
  let grid: ShipState[] = []
  let countdownEnd = 0
  // The last countdown number beeped, so each sounds once.
  let beeped = 0
  let counting = false
  // Joined after the countdown: when the race began is unknown, so no clock.
  let late = false
  let cutoffAt = 0
  let over: { order: number[]; ms: number[] } | null = null
  let st: ShipState | null = null
  let tune = tuning(SHIPS.vega.stats)
  let carry = 0
  let sentAt = 0
  let follow = 0

  let banner = 'connecting…'
  let bannerTone: HudTone | undefined
  // When the banner clears itself, in performance.now() ms. 0: it stays.
  let bannerUntil = 0
  let note = ''
  let noteTone: HudTone = 'pink'
  let noteUntil = 0
  const held = new Set<string>()
  const menu = createMenu()
  let socket: GameSocket | null = null

  const view = createRaceView(stage)
  const send = (msg: object) => socket?.send(msg)
  const track = () => TRACKS[trackId]
  const you = () => room.you
  const isShip = (id: string): id is ShipId => id in SHIPS
  const picked = () => isShip(room.ships[you()] ?? '')
  const pickedShip = (): ShipId => {
    const id = room.ships[you()] ?? ''
    return isShip(id) ? id : picker.ship()
  }

  const picker = createPicker(
    {
      showcase: (ship) => view.showcase(ship),
      done: (ship, name) => {
        send({ t: 'pick', ship, name })
        phase = 'lobby'
        view.showcase(ship)
        pushHud()
      },
    },
    'enter to take your seat',
  )

  const flash = (text: string, ms = 0, tone?: HudTone) => {
    banner = text
    bannerTone = tone
    bannerUntil = ms ? performance.now() + ms : 0
  }
  const say = (text: string, tone: HudTone = 'pink', ms = NOTE_MS) => {
    note = text
    noteTone = tone
    noteUntil = ms ? performance.now() + ms : 0
  }

  const onLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  const link = () => `${location.origin}${location.pathname}?race=${room.code}`
  const copyLink = () =>
    navigator.clipboard
      ?.writeText(link())
      .then(() => say('invite link copied', 'bold'))
      .catch(() => {})

  // ---- where everyone is ----------------------------------------------------------------------
  const inRace = (seat: number) => players[seat] === true && !left[seat]

  /** Where to draw another seat now: its relayed ship, or its grid slot before the first state. */
  const ghost = (seat: number, now: number): Relayed | null => {
    const relay = relays[seat]
    const drawn = relay ? drawAt(track(), relay, now) : null
    if (drawn) return drawn
    const g = grid[seat]
    return g ? { ...g, boosting: false } : null
  }

  /**
   * Progress from the newest state as it arrived. The drawn ship is carried forward to now, so a
   * place can trail the picture by that state's age: a few metres at racing speed.
   */
  const progressOf = (seat: number) => {
    if (seat === you() && st) return progress(track(), st)
    const w = relays[seat]?.last?.w
    if (w) return wireProgress(track(), w, places[seat] !== 0)
    const g = grid[seat]
    return g ? progress(track(), g) : 0
  }

  const order = () =>
    standings(
      [0, 1, 2, 3].filter(inRace).map((seat) => ({
        seat,
        progress: progressOf(seat),
        place: places[seat] || undefined,
      })),
    )

  /** The camera stays on the race leader once you're not driving. */
  const leader = () => {
    const racing = order().filter((seat) => places[seat] === 0)
    return racing[0] ?? follow
  }

  // ---- HUD ------------------------------------------------------------------------------------
  const lobbyLine = (): HudLine => {
    if (you() !== room.host) return 'waiting for the host to start'
    const ready = room.ships.filter((s, seat) => room.seats[seat] && isShip(s)).length
    if (ready >= 2) return { text: 'enter starts the race', tone: 'bold' }
    if (room.seats.filter(Boolean).length < 2) {
      return 'need at least 2 players to start: send the invite link to a friend'
    }
    return 'waiting for players to pick a ship'
  }

  const inviteLines = (): HudLine[] => [
    'c copies the invite link',
    `invite: race join ${room.code}`,
    'or send',
    `${location.host}${location.pathname}?race=${room.code}`,
    // A localhost link opens the friend's own computer. Vite prints a Network URL with
    // `pnpm dev --host`; opened from there, the link works across the Wi-Fi.
    ...(onLocalhost
      ? [
          { text: "friends can't open localhost.", tone: 'muted' as const },
          { text: 'use the Network URL instead', tone: 'muted' as const },
        ]
      : []),
  ]

  const standingLines = (): HudLine[] => [
    ...order().map((seat, i): HudLine => {
      const time = places[seat] ? ` ${formatTime(times[seat] ?? 0)}` : ''
      return {
        text: `${ordinal(i + 1)} ${raceNames[seat]}${time}`,
        tone: SEAT_TONES[seat] ?? 'muted',
      }
    }),
    ...[0, 1, 2, 3]
      .filter((seat) => players[seat] && left[seat])
      .map((seat): HudLine => ({ text: `    ${raceNames[seat]} dnf`, tone: 'muted' })),
  ]

  const hud = (): GameHud => {
    const now = performance.now()
    const base = { banner: banner || undefined, bannerTone, over: false, paused: false }
    const roomLine = room.code ? `room ${room.code}` : 'room …'
    const noteLines: HudLine[] = note ? [{ text: note, tone: noteTone }] : []
    if (phase === 'connecting' || phase === 'closed') {
      return { ...base, score: '', label: '', lines: [roomLine, ...noteLines] }
    }
    if (phase === 'pick') {
      const p = picker.hud()
      return {
        ...base,
        ...p,
        lines: [
          ...p.lines,
          '',
          roomLine,
          ...seatLines(room, you()),
          ...(picker.step === 'ship' ? ['', 'c copies the invite link'] : []),
          ...noteLines,
        ],
      }
    }
    if (phase === 'lobby') {
      return {
        ...base,
        score: room.wins[you()] ?? 0,
        label: 'races won',
        lines: [
          roomLine,
          ...seatLines(room, you()),
          '',
          'track: shuffled',
          '← → changes your ship',
          '',
          ...inviteLines(),
          '',
          lobbyLine(),
          ...noteLines,
        ],
      }
    }
    if (phase === 'result') {
      const at = over?.order.indexOf(you()) ?? -1
      const ms = at >= 0 ? (over?.ms[at] ?? -1) : -1
      return {
        ...base,
        score: at < 0 ? '-' : ms < 0 ? 'dnf' : ordinal(at + 1),
        label: `on ${TRACK_NAMES[trackId]}`,
        lines: [
          ...(over ? resultLines(over, raceNames, raceShips) : []),
          '',
          ...seatLines(room, you()),
          '',
          ...menu.lines(),
          ...noteLines,
        ],
      }
    }
    // In the race: driving, finished or watching.
    const laps = st?.laps ?? []
    const total = lapTotal(laps)
    const clock = st
      ? phase === 'finished'
        ? total
        : st.time
      : late
        ? null
        : Math.max(0, now - countdownEnd)
    const mine = st && phase !== 'watching'
    const place = mine ? order().indexOf(you()) : -1
    const cut = Math.max(0, Math.ceil((cutoffAt - now) / 1000))
    return {
      ...base,
      score: clock === null ? TRACK_NAMES[trackId] : formatTime(clock),
      label: clock === null ? 'watching' : phase === 'finished' ? 'your time' : 'time',
      lines: [
        ...(clock === null ? [] : [TRACK_NAMES[trackId]]),
        ...(mine
          ? [
              ...(place >= 0 ? [{ text: ordinal(place + 1), tone: 'bold' as const }] : []),
              lapLine(st),
              boostLine(st),
            ]
          : [
              ...(clock === null ? [] : [{ text: 'watching this race', tone: 'muted' as const }]),
              ...(players[you()] ? [] : ['you race the next one']),
            ]),
        ...(phase === 'finished' ? [{ text: 'watching the leader', tone: 'muted' as const }] : []),
        '',
        ...lapLines(laps),
        ...(laps.length ? [''] : []),
        ...standingLines(),
        ...(cutoffAt
          ? [
              {
                text: `cut-off in 0:${String(cut).padStart(2, '0')}`,
                tone: cut <= 10 ? ('pink' as const) : ('muted' as const),
              },
            ]
          : []),
        ...noteLines,
      ],
    }
  }

  const huds = hudPusher(onHud, hud)
  const pushHud = huds.push

  // ---- server messages ------------------------------------------------------------------------
  const startRace = (msg: Extract<ServerMessage, { t: 'race' }>) => {
    if (!(msg.track in TRACKS)) {
      // A newer server than this page.
      say(`unknown track ${msg.track}. reload the page to update the game`, 'pink', 0)
      pushHud()
      return
    }
    const now = performance.now()
    trackId = msg.track
    players = [...msg.players] as Seats
    raceNames = room.names.map((n, seat) => n || `p${seat + 1}`)
    raceShips = [...room.ships]
    // A late joiner hears the players the race started with, so anyone gone since is a DNF.
    left = leavers(players, room)
    places = [0, 0, 0, 0]
    times = [-1, -1, -1, -1]
    relays = [relayed(), relayed(), relayed(), relayed()]
    cutoffAt = 0
    over = null
    note = ''
    held.clear()
    countdownEnd = now + msg.count
    counting = msg.count > 0
    late = !counting
    view.setTrack(track())
    grid = [0, 1, 2, 3].map((seat) => createShip(track(), seat))
    view.setShips(
      [0, 1, 2, 3].flatMap((seat) => {
        const ship = raceShips[seat] ?? ''
        if (!players[seat] || !isShip(ship)) return []
        const label = seat === you() ? undefined : raceNames[seat]
        return [{ id: seat, ship, color: seatColor(seat), label }]
      }),
    )
    const ship = raceShips[you()] ?? ''
    if (players[you()] && isShip(ship)) {
      races++
      tune = tuning(SHIPS[ship].stats)
      st = createShip(track(), you())
      // The first autopilot call plans the track's line. Done here it can't stall the finish.
      cruise(track(), tune, st)
      carry = 0
      follow = you()
      phase = counting ? 'countdown' : 'racing'
      flash(counting ? String(Math.ceil(msg.count / 1000)) : '')
    } else {
      st = null
      follow = leader()
      phase = 'watching'
      if (!counting) flash('')
    }
    pushHud()
  }

  const handle = (msg: ServerMessage) => {
    const now = performance.now()
    switch (msg.t) {
      case 'room': {
        const first = !room.code
        room = msg
        // The server is up: the "waking up" note no longer applies.
        if (first) say('', 'muted', 0)
        // A racer who left is a DNF and stops being drawn.
        const gone = leavers(players, msg)
        left = left.map((was, seat) => was || gone[seat] === true)
        if (phase === 'connecting') {
          if (msg.playing) phase = 'watching'
          else {
            phase = 'pick'
            picker.open()
          }
          flash('')
        }
        // Enter on `race online` still counts as the click the clipboard asks for.
        if (first && !joining) copyLink()
        pushHud()
        return
      }
      case 'race':
        startRace(msg)
        return
      case 's': {
        const relay = relays[msg.s]
        if (msg.s !== you() && players[msg.s] && relay && knownPath(track(), msg)) {
          receive(track(), relay, msg, now)
        }
        return
      }
      case 'done':
        places[msg.s] = msg.place
        times[msg.s] = msg.ms
        if (msg.place === 1) cutoffAt = now + CUTOFF_MS
        if (msg.s === you()) flash(`${ordinal(msg.place)} · ${formatTime(msg.ms)}`, 2500)
        pushHud()
        return
      case 'over': {
        over = { order: msg.order, ms: msg.ms }
        room = { ...room, wins: msg.wins }
        const winner = raceNames[msg.win] ?? ''
        flash(
          msg.win === you() ? 'you win!' : msg.win >= 0 ? `${winner} wins` : 'nobody finished',
          3000,
        )
        phase = 'result'
        cutoffAt = 0
        // A watcher who joined during the countdown: the numbers mustn't cover the result.
        counting = false
        menu.reset()
        held.clear()
        pushHud()
        return
      }
      case 'error':
        if (!room.code) {
          // Refused before getting a room: the server hangs up next.
          phase = 'closed'
          flash(msg.msg)
        } else say(msg.msg)
        pushHud()
        return
    }
  }

  // ---- every frame ----------------------------------------------------------------------------
  const onEvents = (ev: StepEvents) => {
    const lap = stepCues(view, ev)
    if (lap) flash(lap.text, SPLIT_MS, lap.tone)
    if (ev.finished && st) {
      send({ t: 'finish', ms: Math.round(lapTotal(st.laps)) })
      phase = 'finished'
      held.clear()
    }
  }

  view.loop((dt) => {
    const now = performance.now()
    if (bannerUntil && now > bannerUntil) flash('')
    if (noteUntil && now > noteUntil) say('', 'pink', 0)
    if (counting) {
      const ms = countdownEnd - now
      if (ms > 0) {
        const n = Math.ceil(ms / 1000)
        flash(String(n))
        if (n !== beeped) {
          beeped = n
          view.audio.cue('count')
        }
      } else {
        counting = false
        beeped = 0
        if (phase === 'countdown') {
          phase = 'racing'
          flash('go', GO_MS)
          view.audio.cue('go')
        } else flash('')
      }
    }
    if (phase === 'connecting' || phase === 'closed' || phase === 'pick' || phase === 'lobby') {
      pushHud()
      return
    }

    // Your own ship. After the line, and under the results, the autopilot cruises it.
    const driving = phase === 'racing' && st !== null && !st.finished
    if (st && phase !== 'countdown' && phase !== 'watching') {
      const input = driving ? controlInput(held) : cruise(track(), tune, st)
      const out = advance(track(), tune, st, input, dt, carry)
      carry = out.carry
      if (driving) onEvents(out.events)
    }

    const ships: ShipDraw[] = []
    if (st) ships.push({ ...st, id: you(), faded: phase === 'finished' })
    // Under the results the others have stopped sending, so only your cruising ship is drawn.
    const others =
      phase === 'result' && st ? [] : [0, 1, 2, 3].filter((s) => s !== you() && inRace(s))
    for (const seat of others) {
      const g = ghost(seat, now)
      if (!g) continue
      // Finished ships cruise on see-through, and nobody runs into them.
      const done = places[seat] !== 0
      if (driving && st && !done) bump(track(), st, g, dt)
      ships.push({ ...g, id: seat, faded: done })
    }

    if (st && (phase === 'racing' || phase === 'finished') && now - sentAt >= SEND_MS) {
      sentAt = now
      send(encode(st))
    }

    if (phase !== 'result') follow = driving || phase === 'countdown' ? you() : leader()
    view.draw(ships, follow, dt)
    huds.tick(dt)
    pushHud(phase === 'result')
  })

  // ---- connection -----------------------------------------------------------------------------
  socket = openGameSocket('race', joining ? { t: 'join', code: joining } : { t: 'create' }, {
    message: (msg) => handle(msg as ServerMessage),
    slow: (text) => {
      if (phase === 'connecting') say(text, 'muted', 0)
      pushHud()
    },
    down: (text, why) => {
      // Refused with an error before: that message says more than "disconnected".
      if (phase === 'closed') return
      phase = 'closed'
      flash(text)
      say(why ?? '', 'muted', 0)
      pushHud()
    },
  })

  // Keys let go while the tab is in the background never send keyup.
  const onBlur = () => held.clear()
  addEventListener('blur', onBlur)

  const toLobby = (pick: boolean) => {
    flash('')
    st = null
    if (pick || !picked()) {
      phase = 'pick'
      picker.open(pickedShip())
    } else {
      phase = 'lobby'
      view.showcase(pickedShip())
    }
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
        if (key === 'c' && picker.step === 'ship' && room.code) {
          copyLink()
          return true
        }
        const used = picker.key(raw, repeat)
        if (used && !repeat) view.audio.cue(key === 'Enter' ? 'pick' : 'tick')
        pushHud()
        return used
      }
      if (phase === 'result') {
        const got = menu.key(raw, repeat)
        menuCue(view.audio, got, key, repeat)
        if (got === 'choose') {
          const item = menu.item()
          if (item === 'exit') {
            options?.onQuit?.()
            return true
          }
          toLobby(item === 'choose ship')
        }
        pushHud()
        return got !== false
      }
      if (phase === 'lobby') {
        if (key === 'Enter') {
          if (!repeat && you() === room.host) send({ t: 'start' })
          return true
        }
        if (key === 'c') {
          copyLink()
          return true
        }
        if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'a' || key === 'd') {
          phase = 'pick'
          picker.open(pickedShip())
          picker.key(raw)
          pushHud()
          return true
        }
        return CONTROLS.has(key)
      }
      if (key === 'c' && phase !== 'racing' && phase !== 'closed' && room.code) {
        copyLink()
        return true
      }
      if (CONTROLS.has(key)) {
        held.add(key)
        return true
      }
      return key === 'Enter'
    },
    keyup(raw) {
      held.delete(norm(raw))
    },
    summary() {
      if (!room.code) return 'race online closed.'
      return `left room ${room.code}. you won ${room.wins[you()] ?? 0} of ${races} races.`
    },
    dispose() {
      huds.stop()
      removeEventListener('blur', onBlur)
      socket?.close()
      view.dispose()
    },
  }
}
