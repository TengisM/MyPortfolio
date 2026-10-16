import * as THREE from 'three'
import { COLORS, cells, H, type Tetris, W } from './tetris-engine'

// Draws Tetris: your board in front, and online, a column of smaller boards for the other players.
// It only redraws when told something changed. Rendering every frame for a board that moves a few
// times a second was most of the lag.

const FADED = new THREE.Color('#2a3146')

type Mini = {
  group: THREE.Group
  blocks: THREE.InstancedMesh
  frame: THREE.LineSegments
  color: THREE.Color
}

export function createTetrisView(stage: HTMLElement, frameColor: string) {
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

  // Board coordinates: cell (x, y) sits at (x - W/2 + 0.5, H/2 - y - 0.5) inside a board's group.
  const world = new THREE.Group()
  scene.add(world)
  // A fixed tilt so the boards read as 3D.
  world.rotation.set(-0.08, 0.12, 0)

  const cube = new THREE.BoxGeometry(0.88, 0.88, 0.88)
  // Lambert: cheap per-vertex lighting, plenty for flat-faced cubes.
  const material = new THREE.MeshLambertMaterial()
  const frameGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(W + 0.3, H + 0.3, 1.2))
  const disposables: { dispose: () => void }[] = [cube, material, frameGeometry]

  const makeFrame = (color: string) => {
    const lineMaterial = new THREE.LineBasicMaterial({ color })
    disposables.push(lineMaterial)
    return new THREE.LineSegments(frameGeometry, lineMaterial)
  }

  // ---- your board ---------------------------------------------------------------------------------
  const main = new THREE.Group()
  world.add(main)
  const mainFrame = makeFrame(frameColor)
  main.add(mainFrame)

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
  const gridGeometry = new THREE.BufferGeometry().setFromPoints(gridPoints)
  const gridMaterial = new THREE.LineBasicMaterial({ color: '#26304a' })
  disposables.push(gridGeometry, gridMaterial)
  main.add(new THREE.LineSegments(gridGeometry, gridMaterial))

  // The board, then five cells of ghost and five of falling piece (bonus pieces have five).
  const blocks = new THREE.InstancedMesh(cube, material, W * H + 10)
  main.add(blocks)

  const m = new THREE.Matrix4()
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0)
  const color = new THREE.Color()
  const white = new THREE.Color('#ffffff')
  const pieceColors = COLORS.map((c) => new THREE.Color(c))
  const ghostColor = new THREE.Color('#33405e')
  const at = (x: number, y: number) => m.makeTranslation(x - W / 2 + 0.5, H / 2 - y - 0.5, 0)

  let dirty = true

  const finish = (mesh: THREE.InstancedMesh) => {
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }

  /** Your board. No game yet (the countdown, or watching a round): an empty board. Faded: out. */
  const drawMain = (game: Tetris | null, faded = false) => {
    const s = game?.state
    let i = 0
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const v = s?.board[y]?.[x] ?? 0
        if (v) {
          blocks.setMatrixAt(i, at(x, y))
          color.copy(pieceColors[v - 1] as THREE.Color)
          if (s?.flashRows.includes(y)) color.lerp(white, 0.85)
          if (faded) color.lerp(FADED, 0.7)
          blocks.setColorAt(i, color)
        } else blocks.setMatrixAt(i, hidden)
        i++
      }
    }
    const piece = s && !s.over && !faded ? s.piece : null
    const live = piece ? cells(piece) : []
    const drop = piece && game ? game.ghostY() - piece.y : 0
    for (let k = 0; k < 5; k++) {
      const c = live[k]
      if (c && c[1] + drop >= 0) {
        blocks.setMatrixAt(i, at(c[0], c[1] + drop))
        blocks.setColorAt(i, ghostColor)
      } else blocks.setMatrixAt(i, hidden)
      i++
    }
    for (let k = 0; k < 5; k++) {
      const c = live[k]
      if (piece && c && c[1] >= 0) {
        blocks.setMatrixAt(i, at(c[0], c[1]))
        blocks.setColorAt(i, pieceColors[piece.type] as THREE.Color)
      } else blocks.setMatrixAt(i, hidden)
      i++
    }
    finish(blocks)
    dirty = true
  }

  // ---- the other players ------------------------------------------------------------------------
  let minis: Mini[] = []
  let layout = { left: -W / 2, right: W / 2 }

  const place = () => {
    const n = minis.length
    const gap = 0.8
    const scale = n ? Math.min(0.5, (H - (n - 1) * gap) / (n * H)) : 0
    const x = W / 2 + 1.2 + (W * scale) / 2
    const total = n * H * scale + (n - 1) * gap
    minis.forEach((mini, i) => {
      mini.group.scale.setScalar(scale)
      mini.group.position.set(x, total / 2 - (H * scale) / 2 - i * (H * scale + gap), 0)
    })
    layout = { left: -W / 2 - 0.2, right: n ? W / 2 + 1.2 + W * scale + 0.2 : W / 2 + 0.2 }
    world.position.x = -(layout.left + layout.right) / 2
    resize()
  }

  /** One small board per other player, in the order given, framed in their colour. */
  const setOpponents = (colors: string[]) => {
    for (const mini of minis) {
      world.remove(mini.group)
      mini.blocks.dispose()
      ;(mini.frame.material as THREE.Material).dispose()
    }
    minis = colors.map((c) => {
      const group = new THREE.Group()
      const frame = new THREE.LineSegments(frameGeometry, new THREE.LineBasicMaterial({ color: c }))
      const mesh = new THREE.InstancedMesh(cube, material, W * H)
      for (let i = 0; i < W * H; i++) mesh.setMatrixAt(i, hidden)
      group.add(frame, mesh)
      world.add(group)
      return { group, blocks: mesh, frame, color: new THREE.Color(c) }
    })
    place()
    dirty = true
  }

  /** Paint player i's board from the text their game sent: one base-36 digit per cell. */
  const drawOpponent = (i: number, board: string, faded: boolean) => {
    const mini = minis[i]
    if (!mini) return
    ;(mini.frame.material as THREE.LineBasicMaterial).color.copy(faded ? FADED : mini.color)
    for (let k = 0; k < W * H; k++) {
      const v = Number.parseInt(board[k] ?? '0', 36) || 0
      if (v) {
        mini.blocks.setMatrixAt(k, at(k % W, Math.floor(k / W)))
        color.copy(pieceColors[v - 1] ?? FADED)
        if (faded) color.lerp(FADED, 0.7)
        mini.blocks.setColorAt(k, color)
      } else mini.blocks.setMatrixAt(k, hidden)
    }
    finish(mini.blocks)
    dirty = true
  }

  /** Recolour your board's frame: online it takes your seat's colour. */
  const setFrame = (c: string) => {
    ;(mainFrame.material as THREE.LineBasicMaterial).color.set(c)
    dirty = true
  }

  function resize() {
    const w = stage.clientWidth
    const h = stage.clientHeight
    if (!w || !h) return
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    // Back off far enough that every board fits both vertically and horizontally.
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    const fitHeight = (H + 2) / 2 / tanV
    const fitWidth = (layout.right - layout.left + 2) / 2 / (tanV * camera.aspect)
    camera.position.z = Math.max(fitHeight, fitWidth)
    camera.updateProjectionMatrix()
    dirty = true
  }
  const ro = new ResizeObserver(resize)
  ro.observe(stage)
  resize()

  const clock = new THREE.Clock()

  return {
    drawMain,
    setOpponents,
    drawOpponent,
    setFrame,
    /** Run `tick` every frame with the seconds since the last one, then draw if anything changed. */
    loop(tick: (dt: number) => void) {
      renderer.setAnimationLoop(() => {
        tick(Math.min(clock.getDelta(), 0.05))
        if (dirty) {
          dirty = false
          renderer.render(scene, camera)
        }
      })
    },
    dispose() {
      renderer.setAnimationLoop(null)
      ro.disconnect()
      setOpponents([])
      blocks.dispose()
      for (const d of disposables) d.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}
