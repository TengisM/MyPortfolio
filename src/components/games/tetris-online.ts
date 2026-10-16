import { type GameSocket, openGameSocket } from './game-socket'
import { createControls, createTetris, pieceRows, type Tetris } from './tetris-engine'
import { createTetrisView } from './tetris-view'
import { COLORS as TONE_COLORS } from './tron-view'
import type { GameHud, HudLine, HudTone, StartGame } from './types'

// Online Tetris, up to four players. Everyone plays their own board here in the browser, so moves
// never wait on the network. The Go API (api/internal/service/tetris) runs the room: it hands out
// one seed so everyone gets the same pieces, raises two garbage rows on every board each minute,
// passes boards around so you can watch the others, and calls the last one standing the winner.
// Nobody can attack anybody.

/** Seat colours, in seat order. Seat 0 is whoever opened the room. */
const SEAT_TONES: HudTone[] = ['primary', 'amber', 'pink', 'green']
const seatColor = (seat: number) => TONE_COLORS[SEAT_TONES[seat] ?? 'muted']

type Seats = [boolean, boolean, boolean, boolean]
type ServerMessage =
  | {
      t: 'room'
      code: string
      you: number
      host: number
      seats: Seats
      wins: number[]
      alive: Seats
      playing: boolean
    }
  | {
      t: 'round'
      round: number
      seed: number
      count: number
      garbage: number
      rows: number
      players: Seats
    }
  | { t: 'board'; s: number; b: string; l: number }
  | { t: 'garbage'; rows: number; hole: number }
  | { t: 'out'; s: number }
  | { t: 'over'; win: number; wins: number[] }
  | { t: 'error'; msg: string }

/** Boards go out at most this often. Fast enough to watch, light on the server. */
const SEND_MS = 80

export const start: StartGame = (stage, onHud, options) => {
  const joining = options?.room && options.room !== 'new' ? options.room.toUpperCase() : null

  // waiting: joined mid-round, watching until the next one. out: you topped out, watching.
  type Phase = 'connecting' | 'lobby' | 'waiting' | 'countdown' | 'playing' | 'out' | 'closed'
  let phase: Phase = 'connecting'
  let code = ''
  let you = -1
  let host = -1
  let seats: Seats = [false, false, false, false]
  let wins = [0, 0, 0, 0]
  let alive: Seats = [false, false, false, false]
  // True from the first round on: boards of players who are out show faded.
  let played = false
  let rounds = 0
  let boards = ['', '', '', '']
  let lines = [0, 0, 0, 0]
  let opponents: number[] = []

  let game: Tetris | null = null
  let seed = 0
  let countMs = 3000
  let countdownEnd = 0
  let garbageEvery = 60_000
  let garbageRows = 2
  let nextGarbageAt = 0

  let message = 'connecting…'
  // When the banner clears itself (a "go" or a "+2 rows"). 0: it stays.
  let messageUntil = 0
  let result = ''
  let note = ''
  let painted = -1
  let sentRev = -1
  let sentAt = 0
  let shownHud = ''
  let socket: GameSocket | null = null

  const controls = createControls(() => (phase === 'playing' ? game : null))
  const view = createTetrisView(stage, seatColor(0))
  view.drawMain(null)

  const name = (seat: number) => (seat === you ? 'you' : `p${seat + 1}`)
  const onLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  const link = () => `${location.origin}${location.pathname}?tetris=${code}`
  const copyLink = () =>
    navigator.clipboard
      ?.writeText(link())
      .then(() => {
        note = 'invite link copied'
      })
      .catch(() => {})

  const send = (msg: object) => socket?.send(msg)

  const flash = (text: string, ms = 0) => {
    message = text
    messageUntil = ms ? performance.now() + ms : 0
  }

  const lobbyMessage = () => {
    if (you !== host) return 'waiting for the host to start'
    return seats.filter(Boolean).length >= 2
      ? 'press enter to start'
      : 'send the invite link to a friend'
  }

  const faded = (seat: number) => played && !alive[seat]

  // ---- drawing --------------------------------------------------------------------------------
  const drawOpponents = () => {
    const list = seats.flatMap((taken, seat) => (taken && seat !== you ? [seat] : []))
    if (list.join() !== opponents.join()) {
      opponents = list
      view.setOpponents(list.map(seatColor))
    }
    opponents.forEach((seat, i) => {
      view.drawOpponent(i, boards[seat] ?? '', faded(seat))
    })
  }

  const drawMain = () => {
    view.drawMain(game, phase === 'out' || phase === 'waiting' || (played && !alive[you]))
  }

  const pushHud = () => {
    const now = performance.now()
    const inRound = phase === 'countdown' || phase === 'playing' || phase === 'out'
    const rows: HudLine[] = SEAT_TONES.map((tone, seat) =>
      seats[seat]
        ? {
            text: `██ ${name(seat).padEnd(4)} ${seat === host ? 'host' : '    '} ${String(wins[seat] ?? 0).padStart(2)}${played ? ` ${String(lines[seat] ?? 0).padStart(3)} ln` : ''}${faded(seat) ? ' ✗' : ''}`,
            tone,
          }
        : { text: '░░ open seat', tone: 'muted' },
    )
    const left = Math.max(0, Math.ceil((nextGarbageAt - now) / 1000))
    const s = game?.state
    const hud: GameHud = {
      score: wins[you] ?? 0,
      label: 'rounds won',
      lines: [
        code ? `room ${code}` : 'room …',
        ...rows,
        ...(inRound || phase === 'waiting'
          ? [
              '',
              {
                text: `+${garbageRows} rows in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`,
                tone: left <= 5 ? ('pink' as const) : ('muted' as const),
              },
            ]
          : []),
        ...(s && inRound
          ? [
              '',
              'hold',
              ...(s.hold === null ? ['  -'] : pieceRows(s.hold)),
              '',
              'next',
              ...pieceRows(s.next),
            ]
          : []),
        // The invite only matters before a round. During one it would crowd the board on a phone.
        ...(code && phase === 'lobby'
          ? [
              '',
              `invite: tetris join ${code}`,
              'or send',
              `${location.host}${location.pathname}?tetris=${code}`,
              // A localhost link opens the friend's own computer. Vite prints a Network URL with
              // `pnpm dev --host`; opened from there, the link works across the Wi-Fi.
              ...(onLocalhost
                ? [
                    { text: "friends can't open localhost.", tone: 'muted' as const },
                    { text: 'use the Network URL instead', tone: 'muted' as const },
                  ]
                : []),
            ]
          : []),
        ...(result && phase === 'lobby'
          ? ['', { text: lobbyMessage(), tone: 'bold' as const }]
          : []),
        ...(note ? [{ text: note, tone: 'bold' as const }] : []),
      ],
      banner: message || undefined,
      over: false,
      paused: false,
    }
    // Called every frame. Most frames change nothing, and a HUD update re-renders React.
    const key = JSON.stringify(hud)
    if (key === shownHud) return
    shownHud = key
    onHud(hud)
  }

  // ---- server messages ------------------------------------------------------------------------
  const handle = (msg: ServerMessage) => {
    const now = performance.now()
    switch (msg.t) {
      case 'room': {
        const first = !code
        ;({ code, you, host, seats, wins } = msg)
        view.setFrame(seatColor(you))
        if (msg.playing && phase === 'connecting') {
          // Joined mid-round: watch the others until the next one.
          phase = 'waiting'
          alive = msg.alive
          played = true
          flash('round in progress. you play the next one')
        } else if (!msg.playing && phase !== 'closed') {
          phase = 'lobby'
          flash(result || lobbyMessage())
        }
        // Enter on `tetris online` still counts as the click the clipboard asks for.
        if (first && !joining) copyLink()
        drawOpponents()
        drawMain()
        return
      }
      case 'round':
        if (msg.players[you]) rounds++
        played = true
        alive = [...msg.players] as Seats
        boards = ['', '', '', '']
        lines = [0, 0, 0, 0]
        seed = msg.seed
        countMs = msg.count
        countdownEnd = now + msg.count
        garbageEvery = msg.garbage
        garbageRows = msg.rows
        nextGarbageAt = countdownEnd + garbageEvery
        game = null
        result = ''
        note = ''
        sentRev = -1
        controls.releaseAll()
        phase = msg.players[you] ? 'countdown' : 'waiting'
        flash(phase === 'countdown' ? '3' : 'watching this round')
        drawOpponents()
        drawMain()
        return
      case 'board':
        if (msg.s === you) return
        boards[msg.s] = msg.b
        lines[msg.s] = msg.l
        drawOpponents()
        return
      case 'garbage':
        nextGarbageAt = now + garbageEvery
        if (phase === 'playing' && game) {
          game.addGarbage(msg.rows, msg.hole)
          flash(`+${msg.rows} rows`, 900)
        }
        return
      case 'out':
        alive[msg.s] = false
        drawOpponents()
        return
      case 'over':
        wins = msg.wins
        if (msg.win >= 0) alive = [false, false, false, false].map((_, s) => s === msg.win) as Seats
        result =
          msg.win === you ? 'you win!' : msg.win >= 0 ? `${name(msg.win)} wins` : 'nobody wins'
        // The winner's board freezes where it was. The room message that follows opens the lobby.
        phase = 'lobby'
        controls.releaseAll()
        flash(result)
        drawOpponents()
        drawMain()
        return
      case 'error':
        if (!code) {
          // Refused before getting a room: the server hangs up next.
          phase = 'closed'
          flash(msg.msg)
        } else note = msg.msg
        return
    }
  }

  // ---- every frame ----------------------------------------------------------------------------
  view.loop((dt) => {
    const now = performance.now()
    if (messageUntil && now > messageUntil) flash('')
    if (phase === 'countdown') {
      const left = countdownEnd - now
      if (left > 0) flash(String(Math.ceil(left / (countMs / 3))))
      else {
        game = createTetris(seed)
        phase = 'playing'
        painted = -1
        flash('go', 700)
      }
    }
    if (phase === 'playing' && game) {
      controls.update(dt)
      game.step(dt)
      if (game.state.over) {
        // Topped out. The last board goes first, so the others see how it ended.
        send({ t: 'board', b: game.snapshot(), l: game.state.lines })
        send({ t: 'dead' })
        phase = 'out'
        alive[you] = false
        controls.releaseAll()
        flash('you topped out', 1500)
        painted = -1
      } else if (game.state.rev !== sentRev && now - sentAt >= SEND_MS) {
        sentRev = game.state.rev
        sentAt = now
        send({ t: 'board', b: game.snapshot(), l: game.state.lines })
      }
    }
    if (game && game.state.rev !== painted) {
      painted = game.state.rev
      drawMain()
    }
    pushHud()
  })

  // ---- connection -----------------------------------------------------------------------------
  socket = openGameSocket('tetris', joining ? { t: 'join', code: joining } : { t: 'create' }, {
    message: (msg) => handle(msg as ServerMessage),
    slow: (text) => {
      if (phase === 'connecting') note = text
    },
    down: (text, why) => {
      // Refused with an error before: that message says more than "disconnected".
      if (phase === 'closed') return
      phase = 'closed'
      flash(text)
      note = why ?? ''
    },
  })

  // Keys let go while the tab is in the background never send keyup.
  const onBlur = () => controls.releaseAll()
  addEventListener('blur', onBlur)

  return {
    key(key, repeat) {
      if (key === 'Enter') {
        if (phase === 'lobby' && you === host) send({ t: 'start' })
        return true
      }
      // c holds a piece mid-round. Outside one it copies the invite link.
      if (key.toLowerCase() === 'c' && phase !== 'playing' && code) {
        copyLink()
        return true
      }
      return controls.press(key, repeat)
    },
    keyup(key) {
      controls.release(key)
    },
    summary() {
      if (!code) return 'tetris online closed.'
      return `left room ${code}. you won ${wins[you] ?? 0} of ${rounds} rounds.`
    },
    dispose() {
      removeEventListener('blur', onBlur)
      socket?.close()
      view.dispose()
    },
  }
}
