import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { GameId } from '@/components/terminal/shell'
import type { Game, GameHud, HudLine, StartGame } from './types'

const KEYS = {
  tetris: '← → move · ↑ rotate · ↓ soft drop · space hard drop · p pause · esc quit',
  tron: 'arrows or wasd steer · p pause · r reset the score · esc quit',
  tron2: 'p1 (blue) wasd · p2 (amber) arrows · p pause · r reset the score · esc quit',
}

// On-screen buttons for touch screens, mapped to the same keys the keyboard sends.
const PADS = {
  tetris: [
    { label: '←', key: 'ArrowLeft' },
    { label: '↻', key: 'ArrowUp' },
    { label: '→', key: 'ArrowRight' },
    { label: '↓', key: 'ArrowDown' },
    { label: 'drop', key: ' ' },
  ],
  tron: [
    { label: '←', key: 'ArrowLeft' },
    { label: '↑', key: 'ArrowUp' },
    { label: '↓', key: 'ArrowDown' },
    { label: '→', key: 'ArrowRight' },
  ],
}

// Each game loads on its own, so Tetris players never download Tron and the other way round.
const LOADERS: Record<GameId, () => Promise<{ start: StartGame }>> = {
  tetris: () => import('./tetris'),
  tron: () => import('./tron'),
}

const HUD_LINE = 'mt-1 min-h-5 whitespace-pre'

function HudRow({ line }: { line: HudLine }) {
  if (typeof line === 'string') return <p className={`text-muted-foreground ${HUD_LINE}`}>{line}</p>
  const tone =
    line.tone === 'primary'
      ? 'text-primary'
      : line.tone === 'pink'
        ? 'tok-kw'
        : line.tone === 'green'
          ? 'tok-str'
          : line.tone === 'amber'
            ? 'tok-num'
            : line.tone === 'bold'
              ? 'text-foreground font-bold'
              : 'text-muted-foreground'
  return <p className={`${tone} ${HUD_LINE}`}>{line.text}</p>
}

/**
 * The game as a second tmux window: it fills the screen above the status bar (which shows
 * `1:tetris*`), and Esc switches back to the shell.
 */
export default function GameWindow({
  game,
  players = 1,
  onExit,
}: {
  game: GameId
  players?: 1 | 2
  onExit: (summary: string) => void
}) {
  const stageRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Game | null>(null)
  const [hud, setHud] = useState<GameHud>({ score: 0, lines: [], over: false, paused: false })
  const [failed, setFailed] = useState(false)
  const scoreRef = useRef(0)
  const quit = () =>
    onExit(gameRef.current?.summary?.() ?? `${game} exited. score: ${scoreRef.current}`)

  useEffect(() => {
    let disposed = false
    const stage = stageRef.current
    if (!stage) return
    const onHud = (h: GameHud) => {
      scoreRef.current = h.score
      setHud(h)
    }
    LOADERS[game]()
      .then((m) => {
        if (disposed) return
        gameRef.current = m.start(stage, onHud, { players })
      })
      .catch(() => setFailed(true))
    return () => {
      disposed = true
      gameRef.current?.dispose()
      gameRef.current = null
    }
  }, [game, players])

  // Read through a ref so the listener never holds a stale onExit.
  const quitRef = useRef(quit)
  quitRef.current = quit
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        quitRef.current()
        return
      }
      if (gameRef.current?.key(e.key)) e.preventDefault()
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])

  // Portalled to <body> so no transformed ancestor can trap `fixed`. bottom-8 leaves the
  // terminal's status bar showing underneath.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={game}
      data-lenis-prevent=""
      className="crt bg-background fixed inset-x-0 top-0 bottom-8 z-70 flex flex-col font-mono"
    >
      <p className="px-4 pt-4 text-sm md:px-8">
        <span className="tok-str">tenggis@ulaanbaatar</span>
        <span className="text-muted-foreground">:</span>
        <span className="text-primary">~/tenggis-port/games</span>
        <span className="text-muted-foreground">$ </span>./{game}
        {players === 2 ? ' --2p' : ''}
      </p>

      <div className="flex min-h-0 flex-1 flex-col items-stretch gap-4 p-4 md:flex-row md:gap-8 md:px-8">
        <div ref={stageRef} className="relative min-h-0 flex-1" />
        <div className="shrink-0 text-sm md:w-56">
          <p className="text-muted-foreground">{hud.label ?? 'score'}</p>
          <p className="text-primary text-3xl font-bold">{hud.score}</p>
          {/* On phones Tron's rider list wraps into rows so the arena keeps the height. Tetris
              stays a column: its next-piece preview is drawn line by line. */}
          <div className={game === 'tron' ? 'flex flex-wrap gap-x-4 md:block' : undefined}>
            {hud.lines.map((l, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: lines repeat (preview rows), position is the identity.
              <HudRow key={i} line={l} />
            ))}
          </div>
          {hud.paused ? <p className="mt-4 font-bold">paused. p to resume</p> : null}
          {hud.over ? (
            <p className="text-destructive mt-4 font-bold">game over. r to restart</p>
          ) : null}
          {failed ? <p className="text-destructive mt-4">could not load the game.</p> : null}
          <p className="text-muted-foreground mt-6 hidden text-xs leading-relaxed md:block">
            {game === 'tetris' ? KEYS.tetris : players === 2 ? KEYS.tron2 : KEYS.tron}
          </p>
          <button
            type="button"
            onClick={quit}
            className="border-border hover:border-primary hover:text-primary mt-6 rounded-md border px-3 py-1 text-xs transition-colors"
          >
            esc: back to the shell
          </button>
        </div>
      </div>

      <div className="flex flex-wrap justify-center gap-2 p-3 md:hidden">
        {PADS[game].map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => gameRef.current?.key(p.key)}
            className="border-border active:bg-primary active:text-primary-foreground min-h-12 min-w-12 rounded-lg border px-3 text-lg"
          >
            {p.label}
          </button>
        ))}
        {hud.over ? (
          <button
            type="button"
            onClick={() => gameRef.current?.key('r')}
            className="border-primary text-primary min-h-12 rounded-lg border px-4"
          >
            restart
          </button>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
