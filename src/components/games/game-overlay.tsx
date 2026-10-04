import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { GameId } from '@/components/terminal/shell'
import type { Game, GameHud } from './types'

const TITLES: Record<GameId, string> = { tetris: 'tetris', snake: 'snake' }

const KEYS: Record<GameId, string> = {
  tetris: '← → move   ↑ rotate   ↓ soft drop   space hard drop   p pause   esc quit',
  snake: '← ↑ → ↓ or WASD steer   p pause   esc quit',
}

// On-screen buttons for touch screens, mapped to the same keys the keyboard sends.
const PADS: Record<GameId, { label: string; key: string }[]> = {
  tetris: [
    { label: '←', key: 'ArrowLeft' },
    { label: '↻', key: 'ArrowUp' },
    { label: '→', key: 'ArrowRight' },
    { label: '↓', key: 'ArrowDown' },
    { label: 'drop', key: ' ' },
  ],
  snake: [
    { label: '←', key: 'ArrowLeft' },
    { label: '↑', key: 'ArrowUp' },
    { label: '↓', key: 'ArrowDown' },
    { label: '→', key: 'ArrowRight' },
  ],
}

/** A full-screen CRT-style window that runs one game until the player quits. */
export default function GameOverlay({
  game,
  onExit,
}: {
  game: GameId
  onExit: (summary: string) => void
}) {
  const stageRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Game | null>(null)
  const [hud, setHud] = useState<GameHud>({ score: 0, lines: [], over: false, paused: false })
  const [failed, setFailed] = useState(false)
  const scoreRef = useRef(0)

  useEffect(() => {
    let disposed = false
    const stage = stageRef.current
    if (!stage) return
    const onHud = (h: GameHud) => {
      scoreRef.current = h.score
      setHud(h)
    }
    const load = game === 'tetris' ? import('./tetris') : import('./snake')
    load
      .then((m) => {
        if (disposed) return
        gameRef.current = m.start(stage, onHud)
      })
      .catch(() => setFailed(true))

    // Lock the page behind the game.
    const prevOverflow = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    return () => {
      disposed = true
      gameRef.current?.dispose()
      gameRef.current = null
      document.documentElement.style.overflow = prevOverflow
    }
  }, [game])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'q') {
        e.preventDefault()
        onExit(`${TITLES[game]} exited. score: ${scoreRef.current}`)
        return
      }
      if (gameRef.current?.key(e.key)) e.preventDefault()
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [game, onExit])

  // Portalled to <body>: the hero animates with transforms, and a transformed ancestor would
  // turn `fixed` into "fixed to the terminal box" instead of to the screen.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={TITLES[game]}
      data-lenis-prevent=""
      className="crt bg-background/95 fixed inset-0 z-50 flex flex-col font-mono backdrop-blur"
    >
      <div className="border-border flex items-center justify-between gap-4 border-b px-4 py-3 text-sm">
        <span>
          <span className="tok-str">tenggis@ulaanbaatar</span>
          <span className="text-muted-foreground">:</span>
          <span className="text-primary">~/tenggis-port/games</span>
          <span className="text-muted-foreground">$ </span>./{TITLES[game]}
        </span>
        <button
          type="button"
          onClick={() => onExit(`${TITLES[game]} exited. score: ${scoreRef.current}`)}
          className="border-border hover:border-primary hover:text-primary rounded-md border px-3 py-1 transition-colors"
        >
          esc
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 p-4 md:flex-row md:gap-10">
        <div ref={stageRef} className="relative aspect-square w-full flex-1 md:h-full md:w-auto" />
        <div className="w-full shrink-0 text-sm md:w-56">
          <p className="text-muted-foreground">score</p>
          <p className="text-primary text-3xl font-bold">{hud.score}</p>
          {hud.lines.map((l) => (
            <p key={l} className="text-muted-foreground mt-2 whitespace-pre">
              {l}
            </p>
          ))}
          {hud.paused ? <p className="mt-4 font-bold">paused. p to resume</p> : null}
          {hud.over ? (
            <p className="text-destructive mt-4 font-bold">game over. r to restart</p>
          ) : null}
          {failed ? <p className="text-destructive mt-4">could not load the game.</p> : null}
          <p className="text-muted-foreground mt-6 hidden text-xs leading-relaxed md:block">
            {KEYS[game]}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap justify-center gap-2 p-4 md:hidden">
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
