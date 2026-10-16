import { createControls, createTetris, pieceRows, randomSeed, type Tetris } from './tetris-engine'
import { createTetrisView } from './tetris-view'
import type { GameHud, StartGame } from './types'

export const start: StartGame = (stage, onHud) => {
  let game: Tetris = createTetris(randomSeed())
  let paused = false
  let painted = -1
  let shownHud = ''

  const controls = createControls(() => game)
  const primary =
    getComputedStyle(document.documentElement).getPropertyValue('--c-primary').trim() || '#5b8cff'
  const view = createTetrisView(stage, primary)

  const pushHud = () => {
    const s = game.state
    const hud: GameHud = {
      score: s.score,
      lines: [
        `level ${s.level}`,
        `lines ${s.lines}`,
        '',
        'hold',
        ...(s.hold === null ? ['  -'] : pieceRows(s.hold)),
        '',
        'next',
        ...pieceRows(s.next),
      ],
      over: s.over,
      paused,
    }
    // A HUD update re-renders React. Most moves don't change it, so only send real changes.
    const key = JSON.stringify(hud)
    if (key === shownHud) return
    shownHud = key
    onHud(hud)
  }

  const reset = () => {
    game = createTetris(randomSeed())
    paused = false
    painted = -1
    controls.releaseAll()
  }

  view.loop((dt) => {
    if (!paused && !game.state.over) {
      controls.update(dt)
      game.step(dt)
    }
    if (game.state.rev !== painted) {
      painted = game.state.rev
      view.drawMain(game)
      pushHud()
    }
  })

  // Keys let go while the tab is in the background never send keyup.
  const onBlur = () => controls.releaseAll()
  addEventListener('blur', onBlur)

  return {
    key(key, repeat) {
      if (game.state.over) {
        if (key === 'r' || key === 'Enter') reset()
        return key === 'r' || key === 'Enter'
      }
      if (key === 'p') {
        paused = !paused
        controls.releaseAll()
        pushHud()
        return true
      }
      if (paused) return controls.press(key, true)
      return controls.press(key, repeat)
    },
    keyup(key) {
      controls.release(key)
    },
    dispose() {
      removeEventListener('blur', onBlur)
      view.dispose()
    },
  }
}
