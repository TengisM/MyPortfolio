// The connection to an online game room on the Go API. Online Tron and online Tetris both use it.

/**
 * Where the game socket lives. Vercel can't proxy a WebSocket, so production sets VITE_TRON_WS
 * to the API host's Tron socket, and Tetris sits next to it. In development the Vite proxy
 * forwards /api, sockets included.
 */
function socketUrl(game: 'tron' | 'tetris') {
  const configured = import.meta.env.VITE_TRON_WS as string | undefined
  if (configured) return configured.replace(/\/tron\/ws$/, `/${game}/ws`)
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/${game}/ws`
}

export type GameSocket = { send: (msg: object) => void; close: () => void }

/**
 * Opens the socket and says `hello` (create or join). The free server sleeps when idle and takes
 * up to a minute to wake. While it does, a socket can fail outright, so this keeps retrying for
 * WAKE_MS and reports what's happening instead of giving up. In development the API is local: if
 * it's down, it says so at once.
 */
export function openGameSocket(
  game: 'tron' | 'tetris',
  hello: object,
  on: {
    message: (msg: unknown) => void
    /** The server is slow to answer: probably waking up. */
    slow: (note: string) => void
    /** Gave up, or lost the connection. The game is over. */
    down: (message: string, note?: string) => void
  },
): GameSocket {
  const WAKE_MS = import.meta.env.DEV ? 0 : 90_000
  const startedAt = performance.now()
  let ws: WebSocket | null = null
  let opened = false
  let closed = false
  let retry: ReturnType<typeof setTimeout> | undefined
  const slow = setTimeout(() => {
    if (!opened) on.slow('the game server is waking up. this can take a minute')
  }, 3000)

  const giveUp = () => {
    clearTimeout(slow)
    closed = true
    on.down(
      "can't reach the game server",
      import.meta.env.DEV
        ? 'is the API running? cd api && make run'
        : 'it may be restarting. try again in a minute',
    )
  }

  const send = (msg: object) => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
  }

  const connect = () => {
    try {
      ws = new WebSocket(socketUrl(game))
    } catch {
      giveUp()
      return
    }
    ws.onopen = () => {
      opened = true
      clearTimeout(slow)
      send(hello)
    }
    ws.onmessage = (e) => {
      try {
        on.message(JSON.parse(String(e.data)))
      } catch {
        // A message this client doesn't understand. Ignore it rather than break the game.
      }
    }
    ws.onclose = () => {
      if (closed) return
      if (opened) {
        closed = true
        on.down('disconnected from the game server')
      } else if (performance.now() - startedAt < WAKE_MS) {
        retry = setTimeout(connect, 3000)
      } else giveUp()
    }
  }
  connect()

  return {
    send,
    close() {
      closed = true
      clearTimeout(slow)
      clearTimeout(retry)
      ws?.close()
    },
  }
}
