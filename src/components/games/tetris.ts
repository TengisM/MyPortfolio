import * as THREE from 'three'
import type { GameHud, StartGame } from './types'

const W = 10
const H = 20

// The seven pieces, each as its spawn-orientation matrix.
const SHAPES: number[][][] = [
  [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  [
    [1, 1],
    [1, 1],
  ],
  [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ],
  [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ],
  [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
]

// A blue-leaning terminal palette, one colour per piece.
const COLORS = ['#5b8cff', '#ffc56d', '#c4b5fd', '#9be3a1', '#ff7ab2', '#7dd3fc', '#67e8f9']
const LINE_SCORES = [0, 100, 300, 500, 800]

type Piece = { type: number; shape: number[][]; x: number; y: number }

const rotate = (m: number[][]): number[][] =>
  (m[0] ?? []).map((_, i) => m.map((row) => row[i] ?? 0).reverse())

const cells = (p: Piece): [number, number][] => {
  const out: [number, number][] = []
  p.shape.forEach((row, dy) => {
    row.forEach((v, dx) => {
      if (v) out.push([p.x + dx, p.y + dy])
    })
  })
  return out
}

export const start: StartGame = (stage, onHud) => {
  // ---- game state -----------------------------------------------------------------------------
  let board: number[][] = []
  let bag: number[] = []
  let piece: Piece
  let next = 0
  let score = 0
  let lines = 0
  let level = 1
  let over = false
  let paused = false
  let fallTimer = 0
  let flashRows: number[] = []
  let flashTimer = 0
  // Redraw only when something changed. Rendering every frame for a board that moves a few
  // times a second was most of the lag.
  let dirty = true

  const draw = () => {
    if (bag.length === 0) {
      bag = [0, 1, 2, 3, 4, 5, 6]
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[bag[i], bag[j]] = [bag[j] as number, bag[i] as number]
      }
    }
    return bag.pop() as number
  }

  const fits = (p: Piece) =>
    cells(p).every(([x, y]) => x >= 0 && x < W && y < H && (y < 0 || !board[y]?.[x]))

  const spawn = () => {
    const type = next
    next = draw()
    const shape = SHAPES[type] as number[][]
    piece = { type, shape, x: Math.floor((W - shape.length) / 2), y: type === 0 ? -1 : 0 }
    if (!fits(piece)) over = true
  }

  const reset = () => {
    board = Array.from({ length: H }, () => Array(W).fill(0))
    bag = []
    score = 0
    lines = 0
    level = 1
    over = false
    paused = false
    flashRows = []
    next = draw()
    spawn()
    dirty = true
    pushHud()
  }

  const preview = () => {
    const shape = SHAPES[next] as number[][]
    return shape
      .filter((row) => row.some(Boolean))
      .map((row) => row.map((v) => (v ? '██' : '  ')).join(''))
  }

  const pushHud = () => {
    const hud: GameHud = {
      score,
      lines: [`level ${level}`, `lines ${lines}`, '', 'next', ...preview()],
      over,
      paused,
    }
    onHud(hud)
  }

  const lock = () => {
    dirty = true
    for (const [x, y] of cells(piece)) {
      if (y < 0) {
        over = true
        continue
      }
      const row = board[y]
      if (row) row[x] = piece.type + 1
    }
    const full = board.flatMap((row, y) => (row.every(Boolean) ? [y] : []))
    if (full.length) {
      flashRows = full
      flashTimer = 0.15
      lines += full.length
      score += (LINE_SCORES[full.length] ?? 0) * level
      level = 1 + Math.floor(lines / 10)
    }
    if (!over) spawn()
    pushHud()
  }

  const clearFlashed = () => {
    dirty = true
    board = board.filter((_, y) => !flashRows.includes(y))
    while (board.length < H) board.unshift(Array(W).fill(0))
    flashRows = []
  }

  const move = (dx: number, dy: number) => {
    const moved = { ...piece, x: piece.x + dx, y: piece.y + dy }
    if (fits(moved)) {
      piece = moved
      dirty = true
      return true
    }
    return false
  }

  const turn = () => {
    const shape = rotate(piece.shape)
    for (const kick of [0, -1, 1, -2, 2]) {
      const turned = { ...piece, shape, x: piece.x + kick }
      if (fits(turned)) {
        piece = turned
        dirty = true
        return
      }
    }
  }

  const ghostY = () => {
    let y = piece.y
    while (fits({ ...piece, y: y + 1 })) y++
    return y
  }

  // ---- rendering --------------------------------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  })
  // 1.5x is sharp enough for cubes and far cheaper than 2x on a full-screen canvas.
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))
  renderer.domElement.className = 'absolute inset-0 h-full w-full'
  stage.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200)
  scene.add(new THREE.AmbientLight('#ffffff', 0.9))
  const sun = new THREE.DirectionalLight('#ffffff', 1.6)
  sun.position.set(-6, 10, 14)
  scene.add(sun)

  const root = new THREE.Group()
  // Board coordinates: cell (x, y) sits at (x - W/2 + 0.5, H/2 - y - 0.5).
  scene.add(root)
  // A fixed tilt so the board reads as 3D. It used to sway, which forced a redraw every frame.
  root.rotation.set(-0.08, 0.12, 0)

  const primary =
    getComputedStyle(document.documentElement).getPropertyValue('--c-primary').trim() || '#5b8cff'
  const frame = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(W + 0.3, H + 0.3, 1.2)),
    new THREE.LineBasicMaterial({ color: primary }),
  )
  root.add(frame)

  const gridPoints: THREE.Vector3[] = []
  for (let x = 0; x <= W; x++) {
    gridPoints.push(
      new THREE.Vector3(x - W / 2, -H / 2, -0.55),
      new THREE.Vector3(x - W / 2, H / 2, -0.55),
    )
  }
  for (let y = 0; y <= H; y++) {
    gridPoints.push(
      new THREE.Vector3(-W / 2, y - H / 2, -0.55),
      new THREE.Vector3(W / 2, y - H / 2, -0.55),
    )
  }
  root.add(
    new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(gridPoints),
      new THREE.LineBasicMaterial({ color: '#26304a' }),
    ),
  )

  const COUNT = W * H + 8
  const blocks = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.88, 0.88, 0.88),
    // Lambert: cheap per-vertex lighting, plenty for flat-faced cubes.
    new THREE.MeshLambertMaterial(),
    COUNT,
  )
  root.add(blocks)

  const m = new THREE.Matrix4()
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0)
  const color = new THREE.Color()
  const white = new THREE.Color('#ffffff')
  const pieceColors = COLORS.map((c) => new THREE.Color(c))
  const ghostColor = new THREE.Color('#33405e')
  const at = (x: number, y: number) => m.makeTranslation(x - W / 2 + 0.5, H / 2 - y - 0.5, 0)

  const paint = () => {
    let i = 0
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const v = board[y]?.[x] ?? 0
        if (v) {
          blocks.setMatrixAt(i, at(x, y))
          color.copy(pieceColors[v - 1] as THREE.Color)
          if (flashRows.includes(y)) color.lerp(white, 0.85)
          blocks.setColorAt(i, color)
        } else {
          blocks.setMatrixAt(i, hidden)
        }
        i++
      }
    }
    const live = over ? [] : cells(piece)
    const gy = over ? 0 : ghostY() - piece.y
    for (let k = 0; k < 4; k++) {
      const c = live[k]
      if (c && c[1] + gy >= 0) {
        blocks.setMatrixAt(i, at(c[0], c[1] + gy))
        blocks.setColorAt(i, ghostColor)
      } else blocks.setMatrixAt(i, hidden)
      i++
    }
    for (let k = 0; k < 4; k++) {
      const c = live[k]
      if (c && c[1] >= 0) {
        blocks.setMatrixAt(i, at(c[0], c[1]))
        blocks.setColorAt(i, pieceColors[piece.type] as THREE.Color)
      } else blocks.setMatrixAt(i, hidden)
      i++
    }
    blocks.instanceMatrix.needsUpdate = true
    if (blocks.instanceColor) blocks.instanceColor.needsUpdate = true
  }

  const resize = () => {
    const w = stage.clientWidth
    const h = stage.clientHeight
    if (!w || !h) return
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    // Back off far enough that the board fits both vertically and horizontally.
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    const fitHeight = (H + 2) / 2 / tanV
    const fitWidth = (W + 2) / 2 / (tanV * camera.aspect)
    camera.position.z = Math.max(fitHeight, fitWidth)
    camera.updateProjectionMatrix()
    dirty = true
  }
  const ro = new ResizeObserver(resize)
  ro.observe(stage)
  resize()

  // ---- loop -------------------------------------------------------------------------------------
  const clock = new THREE.Clock()
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05)
    if (!over && !paused) {
      if (flashRows.length) {
        flashTimer -= dt
        if (flashTimer <= 0) clearFlashed()
      } else {
        fallTimer += dt
        const interval = Math.max(0.08, 0.8 - (level - 1) * 0.07)
        if (fallTimer >= interval) {
          fallTimer = 0
          if (!move(0, 1)) lock()
        }
      }
    }
    if (dirty) {
      dirty = false
      paint()
      renderer.render(scene, camera)
    }
  })

  reset()

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
      if (paused || flashRows.length)
        return ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(key)
      switch (key) {
        case 'ArrowLeft':
        case 'a':
          move(-1, 0)
          return true
        case 'ArrowRight':
        case 'd':
          move(1, 0)
          return true
        case 'ArrowUp':
        case 'w':
          turn()
          return true
        case 'ArrowDown':
        case 's':
          if (move(0, 1)) {
            score += 1
            pushHud()
          }
          fallTimer = 0
          return true
        case ' ': {
          let dropped = 0
          while (move(0, 1)) dropped++
          score += dropped * 2
          lock()
          return true
        }
        default:
          return false
      }
    },
    dispose() {
      renderer.setAnimationLoop(null)
      ro.disconnect()
      renderer.dispose()
      blocks.geometry.dispose()
      ;(blocks.material as THREE.Material).dispose()
      renderer.domElement.remove()
    },
  }
}
