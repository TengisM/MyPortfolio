/** A colour the HUD can print a line in. Each maps to a fixed class in game-window. */
export type HudTone = 'primary' | 'pink' | 'green' | 'amber' | 'muted' | 'bold'

/** One HUD line: plain text, or text in a colour (Tron prints each rider in theirs). */
export type HudLine = string | { text: string; tone: HudTone }

/** What the overlay shows next to the board. */
export type GameHud = {
  score: number
  /** What the big number counts. Defaults to "score". */
  label?: string
  /** Extra lines under the score: level, next piece, riders. Monospace. */
  lines: HudLine[]
  /** Big text over the middle of the board: a countdown, "go", who won the round. */
  banner?: string
  over: boolean
  paused: boolean
}

/**
 * A running game. `key` returns true when it used the key, so the page doesn't scroll. `repeat`
 * is the browser's own auto-repeat; Tetris ignores it and times held keys itself, with `keyup`.
 */
export type Game = {
  key: (key: string, repeat?: boolean) => boolean
  keyup?: (key: string) => void
  /** The line the shell prints after the game closes. */
  summary?: () => string
  dispose: () => void
}

/** `room`: 'new' opens an online room (Tron or Tetris), four letters join one. */
export type GameOptions = { players?: 1 | 2; room?: string }

export type StartGame = (
  stage: HTMLElement,
  onHud: (hud: GameHud) => void,
  options?: GameOptions,
) => Game
