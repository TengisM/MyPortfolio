import type { GameHud, StartGame } from './types'

const N = 22 // the board is N by N cells

type Cell = { x: number; y: number }
type Dir = Cell

const DIRS: Record<string, Dir> = {
  ArrowUp: { x: 0, y: -1 },
  w: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  s: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  a: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  d: { x: 1, y: 0 },
}

// Text-mode snake on a 2D canvas: square "character cells", a faint dot grid, the page's blue.
export const start: StartGame = (stage, onHud) => {
  const canvas = document.createElement('canvas')
  canvas.className = 'absolute inset-0 m-auto aspect-square max-h-full w-full'
  stage.appendChild(canvas)
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
  const css = getComputedStyle(document.documentElement)
  const primary = css.getPropertyValue('--c-primary').trim() || '#5b8cff'
  const muted = css.getPropertyValue('--c-border').trim() || '#303749'

  let snake: Cell[] = []
  let dir: Dir = { x: 1, y: 0 }
  let queue: Dir[] = []
  let food: Cell = { x: 0, y: 0 }
  let score = 0
  let tick = 0.12
  let acc = 0
  let over = false
  let paused = false
  // Waits for the first arrow key, so it doesn't crawl into a wall while you find the keys.
  let started = false
  let raf = 0
  let last = performance.now()

  const placeFood = () => {
    do {
      food = { x: Math.floor(Math.random() * N), y: Math.floor(Math.random() * N) }
    } while (snake.some((c) => c.x === food.x && c.y === food.y))
  }

  const pushHud = () => {
    const hud: GameHud = {
      score,
      lines: started
        ? [`length ${snake.length}`]
        : [`length ${snake.length}`, '', 'press an arrow key to start'],
      over,
      paused,
    }
    onHud(hud)
  }

  const reset = () => {
    const mid = Math.floor(N / 2)
    snake = [
      { x: mid, y: mid },
      { x: mid - 1, y: mid },
      { x: mid - 2, y: mid },
    ]
    dir = { x: 1, y: 0 }
    queue = []
    score = 0
    tick = 0.12
    over = false
    paused = false
    started = false
    placeFood()
    pushHud()
  }

  const step = () => {
    // Take queued turns one per step, and never straight back into the neck.
    const turn = queue.shift()
    if (turn && !(turn.x === -dir.x && turn.y === -dir.y)) dir = turn
    const head = snake[0] as Cell
    const nextHead = { x: head.x + dir.x, y: head.y + dir.y }
    const hitWall = nextHead.x < 0 || nextHead.y < 0 || nextHead.x >= N || nextHead.y >= N
    const hitSelf = snake.some((c) => c.x === nextHead.x && c.y === nextHead.y)
    if (hitWall || hitSelf) {
      over = true
      pushHud()
      return
    }
    snake.unshift(nextHead)
    if (nextHead.x === food.x && nextHead.y === food.y) {
      score += 10
      tick = Math.max(0.055, tick - 0.003)
      placeFood()
      pushHud()
    } else {
      snake.pop()
    }
  }

  const paint = () => {
    const size = Math.min(stage.clientWidth, stage.clientHeight)
    const dpr = Math.min(devicePixelRatio, 2)
    if (canvas.width !== Math.round(size * dpr)) {
      canvas.width = Math.round(size * dpr)
      canvas.height = Math.round(size * dpr)
    }
    const cell = canvas.width / N
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = muted
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        ctx.fillRect(x * cell + cell / 2 - dpr, y * cell + cell / 2 - dpr, dpr * 2, dpr * 2)
      }
    }
    ctx.strokeStyle = primary
    ctx.lineWidth = dpr
    ctx.strokeRect(dpr / 2, dpr / 2, canvas.width - dpr, canvas.height - dpr)
    snake.forEach((c, i) => {
      ctx.fillStyle = primary
      ctx.globalAlpha = i === 0 ? 1 : Math.max(0.35, 1 - i / (snake.length + 6))
      const pad = cell * 0.08
      ctx.fillRect(c.x * cell + pad, c.y * cell + pad, cell - pad * 2, cell - pad * 2)
    })
    ctx.globalAlpha = 1
    ctx.fillStyle = '#ff7ab2'
    ctx.beginPath()
    ctx.arc(food.x * cell + cell / 2, food.y * cell + cell / 2, cell * 0.32, 0, Math.PI * 2)
    ctx.fill()
  }

  const frame = (now: number) => {
    const dt = Math.min((now - last) / 1000, 0.05)
    last = now
    if (!over && !paused && started) {
      acc += dt
      while (acc >= tick) {
        acc -= tick
        step()
        if (over) break
      }
    }
    paint()
    raf = requestAnimationFrame(frame)
  }

  reset()
  raf = requestAnimationFrame(frame)

  return {
    key(key) {
      if (over) {
        if (key === 'r' || key === 'Enter') reset()
        return key === 'r' || key === 'Enter'
      }
      if (key === 'p') {
        paused = !paused
        pushHud()
        return true
      }
      const d = DIRS[key]
      if (!d) return false
      if (!started) {
        started = true
        pushHud()
      }
      if (queue.length < 3) queue.push(d)
      return true
    },
    dispose() {
      cancelAnimationFrame(raf)
      canvas.remove()
    },
  }
}
