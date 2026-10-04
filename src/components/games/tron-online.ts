import { createArena, type Dir, keyToDir } from './tron-view'
import type { GameHud, HudLine, HudTone, StartGame } from './types'

// Online Tron. The Go API runs the match (api/internal/service/tron); this connects, sends turns
// and draws what the server says happened. No local simulation, so what you see is what counts.

/** Seat colours, in seat order. Seat 0 is whoever opened the room. */
const SEAT_TONES: HudTone[] = ['primary', 'amber', 'pink', 'green']

type Cell = [seat: number, x: number, y: number, dir: Dir]
type ServerMessage =
  | {
      t: 'room'
      code: string
      you: number
      host: number
      seats: boolean[]
      bots: boolean[]
      wins: number[]
      playing: boolean
    }
  | { t: 'round'; round: number; w: number; h: number; count: number; r: Cell[] }
  | { t: 'tick'; m: Cell[]; x?: number[]; ms: number }
  | { t: 'over'; win: number; wins: number[] }
  | { t: 'error'; msg: string }

/**
 * Where the game socket lives. Vercel can't proxy a WebSocket, so production sets VITE_TRON_WS
 * to the API host. In development the Vite proxy forwards /api, sockets included.
 */
function socketUrl() {
  const configured = import.meta.env.VITE_TRON_WS as string | undefined
  if (configured) return configured
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/tron/ws`
}

export const start: StartGame = (stage, onHud, options) => {
  const joining = options?.room && options.room !== 'new' ? options.room.toUpperCase() : null

  type Phase = 'connecting' | 'lobby' | 'waiting' | 'countdown' | 'running' | 'over' | 'closed'
  let phase: Phase = 'connecting'
  let code = ''
  let you = -1
  let host = -1
  let seats = [false, false, false, false]
  let bots = [false, false, false, false]
  let wins = [0, 0, 0, 0]
  let rounds = 0
  const alive = new Set<number>()
  let countMs = 2400
  let countdownEnd = 0
  let goAt = 0
  let lastTick = 0
  let stepMs = 90
  let message = 'connecting…'
  let note = ''
  // The last turn sent this tick. Held keys repeat; one message per change is enough.
  let lastSent: Dir | null = null
  let leaving = false
  let opened = false
  let ws: WebSocket | null = null

  const name = (seat: number) =>
    seat === you ? 'you' : bots[seat] ? `bot-${seat + 1}` : `p${seat + 1}`
  const onLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  const link = () => `${location.origin}${location.pathname}?tron=${code}`
  const copyLink = () =>
    navigator.clipboard
      ?.writeText(link())
      .then(() => {
        note = 'invite link copied'
        pushHud()
      })
      .catch(() => {})

  const pushHud = () => {
    const inRound = phase === 'countdown' || phase === 'running' || phase === 'over'
    const rows: HudLine[] = SEAT_TONES.map((tone, seat) =>
      seats[seat]
        ? {
            text: `██ ${name(seat).padEnd(5)} ${seat === host ? 'host' : '    '} ${String(wins[seat] ?? 0).padStart(2)}${inRound && !alive.has(seat) ? '  ✗' : ''}`,
            tone,
          }
        : { text: '░░ open seat', tone: 'muted' },
    )
    const hud: GameHud = {
      score: wins[you] ?? 0,
      label: 'rounds won',
      lines: [
        code ? `room ${code}` : 'room …',
        ...rows,
        '',
        // No https:// on the link, so it fits the panel. Browsers add it back when pasted.
        ...(code
          ? [
              `invite: tron join ${code}`,
              'or send',
              `${location.host}${location.pathname}?tron=${code}`,
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
        ...(note ? [{ text: note, tone: 'bold' as const }] : []),
      ],
      banner: message || undefined,
      over: false,
      paused: false,
    }
    onHud(hud)
  }

  const lobbyMessage = () => {
    const riders = seats.filter(Boolean).length
    if (you !== host) return 'waiting for the host to start'
    return riders >= 2 ? 'press enter to start' : 'invite a friend, or press b for a bot'
  }

  // ---- drawing --------------------------------------------------------------------------------
  const frame = (): number | null => {
    const now = performance.now()
    if (phase === 'countdown') {
      const left = countdownEnd - now
      const shown = left > 0 ? String(Math.ceil(left / (countMs / 3))) : 'go'
      if (shown !== message) {
        message = shown
        pushHud()
      }
      return null
    }
    if (phase !== 'running') return null
    if (message === 'go' && now - goAt > 700) {
      message = ''
      pushHud()
    }
    return Math.min(1, (now - lastTick) / stepMs)
  }

  const send = (msg: object) => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
  }

  const steer = (dir: Dir) => {
    if (phase !== 'running' || !alive.has(you) || dir === lastSent) return
    lastSent = dir
    send({ t: 'turn', d: dir })
  }

  // The server's arena is 56 by 34. A round message says so; a different size rebuilds this.
  let size = { w: 56, h: 34 }
  const makeArena = () => createArena(stage, size.w, size.h, SEAT_TONES, steer, frame)
  let arena = makeArena()

  // ---- server messages ------------------------------------------------------------------------
  const handle = (msg: ServerMessage) => {
    const now = performance.now()
    switch (msg.t) {
      case 'room': {
        const first = !code
        ;({ code, you, host, seats, bots, wins } = msg)
        if (!msg.playing) {
          phase = 'lobby'
          message = lobbyMessage()
        } else if (phase === 'connecting') {
          // Joined mid-match: watch until the next round.
          phase = 'waiting'
          message = 'match in progress. you ride next round'
        }
        // Enter on `tron online` still counts as the click the clipboard asks for.
        if (first && !joining) copyLink()
        pushHud()
        return
      }
      case 'round':
        if (msg.w !== size.w || msg.h !== size.h) {
          size = { w: msg.w, h: msg.h }
          arena.dispose()
          arena = makeArena()
        }
        arena.reset(msg.r.map(([slot, x, y, dir]) => ({ slot, x, y, dir })))
        alive.clear()
        for (const [seat] of msg.r) alive.add(seat)
        countMs = msg.count
        countdownEnd = now + msg.count
        phase = 'countdown'
        lastSent = null
        note = ''
        message = '3'
        pushHud()
        return
      case 'tick':
        // Ticks before your first round describe a board you never saw. Skip them.
        if (phase !== 'countdown' && phase !== 'running') return
        if (phase === 'countdown') {
          phase = 'running'
          message = 'go'
          goAt = now
        }
        for (const [seat, x, y, dir] of msg.m) arena.advance(seat, x, y, dir)
        for (const seat of msg.x ?? []) {
          arena.crash(seat)
          alive.delete(seat)
        }
        lastTick = now
        stepMs = msg.ms
        lastSent = null
        if (msg.x?.length) pushHud()
        return
      case 'over':
        wins = msg.wins
        rounds++
        phase = 'over'
        message =
          msg.win === you
            ? 'you win the round'
            : msg.win >= 0
              ? `${name(msg.win)} wins the round`
              : // No winner with bots still riding: every person crashed.
                alive.size > 0
                ? 'all players derezzed'
                : 'draw'
        pushHud()
        return
      case 'error':
        if (!code) {
          // Refused before getting a room: the server hangs up next.
          phase = 'closed'
          message = msg.msg
        } else note = msg.msg
        pushHud()
        return
    }
  }

  // ---- connection -----------------------------------------------------------------------------
  // A free server sleeps when idle and takes a few seconds to wake. Say so instead of hanging.
  const slow = setTimeout(() => {
    if (phase === 'connecting') {
      note = 'the game server is waking up, give it a few seconds'
      pushHud()
    }
  }, 3000)
  try {
    ws = new WebSocket(socketUrl())
    ws.onopen = () => {
      opened = true
      send(joining ? { t: 'join', code: joining } : { t: 'create' })
    }
    ws.onmessage = (e) => {
      try {
        handle(JSON.parse(String(e.data)) as ServerMessage)
      } catch {
        // A message this client doesn't understand. Ignore it rather than break the game.
      }
    }
    ws.onclose = () => {
      clearTimeout(slow)
      if (leaving || phase === 'closed') return
      phase = 'closed'
      message = opened ? 'disconnected from the game server' : "can't reach the game server"
      if (!opened) {
        note = import.meta.env.DEV
          ? 'is the API running? cd api && make run'
          : 'it may be restarting. try again in a minute'
      }
      pushHud()
    }
  } catch {
    phase = 'closed'
    message = "can't reach the game server"
  }
  pushHud()

  return {
    key(key) {
      const steering = keyToDir(key)
      if (steering) {
        steer(steering.dir)
        return true
      }
      if (key === 'Enter') {
        if (phase === 'lobby' && you === host) send({ t: 'start' })
        return true
      }
      // Bots fill empty seats. Host only; the server says so if a guest tries.
      if (key.toLowerCase() === 'b' || key === '+') {
        send({ t: 'addbot' })
        return true
      }
      if (key === '-') {
        send({ t: 'dropbot' })
        return true
      }
      if (key.toLowerCase() === 'c' && code) {
        copyLink()
        return true
      }
      return key === ' '
    },
    summary() {
      if (!code) return 'tron online closed.'
      return `left room ${code}. you won ${wins[you] ?? 0} of ${rounds} rounds.`
    },
    dispose() {
      leaving = true
      clearTimeout(slow)
      ws?.close()
      arena.dispose()
    },
  }
}
