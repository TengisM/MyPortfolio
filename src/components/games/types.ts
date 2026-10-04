/** What the overlay shows next to the board. */
export type GameHud = {
  score: number
  /** Extra lines under the score: level, next piece, length. Plain text, monospace. */
  lines: string[]
  over: boolean
  paused: boolean
}

/** A running game. `key` returns true when it used the key, so the page doesn't scroll. */
export type Game = {
  key: (key: string) => boolean
  dispose: () => void
}

export type StartGame = (stage: HTMLElement, onHud: (hud: GameHud) => void) => Game
