import * as THREE from 'three'
import type { GameHud, HudLine, HudTone, StartGame } from './types'

// Directions: 0 up, 1 right, 2 down, 3 left. Grid y grows downward, like the screen.
type Dir = 0 | 1 | 2 | 3
const DX = [0, 1, 0, -1] as const
const DY = [-1, 0, 1, 0] as const
const reverse = (d: Dir) => ((d + 2) % 4) as Dir
const left = (d: Dir) => ((d + 3) % 4) as Dir
const right = (d: Dir) => ((d + 1) % 4) as Dir

type Control = 'solo' | 'p1' | 'p2' | 'bot'

type Rider = {
  name: string
  tone: HudTone
  control: Control
  /** How hard a bot steers at the nearest player. 0 just survives. */
  aggression: number
  /** Random jitter in a bot's choices, so bots don't all move alike. */
  wander: number
  x: number
  y: number
  dir: Dir
  queue: Dir[]
  alive: boolean
  wins: number
  segments: number
  /** 1 while riding, falls to 0 as the trail derezzes after a crash. */
  fade: number
  trail: THREE.InstancedMesh
  trailMaterial: THREE.MeshBasicMaterial
  bike: THREE.Mesh
}

const COLORS: Record<HudTone, string> = {
  primary: '#5b8cff',
  pink: '#ff7ab2',
  green: '#9be3a1',
  amber: '#ffc56d',
  muted: '#8a93a8',
  bold: '#eef1f8',
}

const WALL = 0.16
const WALL_HEIGHT = 0.7
const COUNTDOWN = 2.4
const ROUND_PAUSE = 2.2
// Cells per second. Rounds start calm and speed up so they end.
const BASE_SPEED = 11
const MAX_EXTRA_SPEED = 7
// Flood fill stops counting here: past this a bot treats the space as "plenty".
const SPACE_CAP = 500

export const start: StartGame = (stage, onHud, options) => {
  const players = options?.players ?? 1

  // Arena size follows the screen's shape, so phones get a tall arena and desktops a wide one.
  const aspect = stage.clientWidth / Math.max(1, stage.clientHeight)
  const W = aspect >= 1 ? Math.min(64, Math.max(34, Math.round(34 * aspect))) : 30
  const H = aspect >= 1 ? 34 : Math.min(54, Math.max(30, Math.round(30 / aspect)))
  // Which rider is on each cell: 0 free, otherwise rider index + 1.
  const grid = new Uint8Array(W * H)
  const free = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && grid[y * W + x] === 0

  // ---- rendering ------------------------------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))
  renderer.domElement.className = 'absolute inset-0 h-full w-full touch-none'
  stage.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400)
  camera.up.set(0, 0, 1)

  const toWorldX = (x: number) => x - W / 2 + 0.5
  const toWorldY = (y: number) => H / 2 - y - 0.5

  const floorPoints: THREE.Vector3[] = []
  for (let x = 0; x <= W; x += 2) {
    floorPoints.push(
      new THREE.Vector3(x - W / 2, -H / 2, 0),
      new THREE.Vector3(x - W / 2, H / 2, 0),
    )
  }
  for (let y = 0; y <= H; y += 2) {
    floorPoints.push(
      new THREE.Vector3(-W / 2, y - H / 2, 0),
      new THREE.Vector3(W / 2, y - H / 2, 0),
    )
  }
  const floorGeometry = new THREE.BufferGeometry().setFromPoints(floorPoints)
  const floorMaterial = new THREE.LineBasicMaterial({ color: '#222b40' })
  scene.add(new THREE.LineSegments(floorGeometry, floorMaterial))

  const borderGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(W, H, WALL_HEIGHT))
  const borderMaterial = new THREE.LineBasicMaterial({ color: COLORS.primary })
  const border = new THREE.LineSegments(borderGeometry, borderMaterial)
  border.position.z = WALL_HEIGHT / 2
  scene.add(border)

  // One unit box for every wall piece. Vertex colours darken its foot and light its top edge;
  // the material colour tints that per rider. Unlit, so no lighting cost at all.
  const wallGeometry = new THREE.BoxGeometry(1, 1, 1)
  const shade: number[] = []
  const pos = wallGeometry.getAttribute('position')
  for (let i = 0; i < pos.count; i++) {
    const v = pos.getZ(i) > 0 ? 1 : 0.25
    shade.push(v, v, v)
  }
  wallGeometry.setAttribute('color', new THREE.Float32BufferAttribute(shade, 3))
  const bikeGeometry = new THREE.BoxGeometry(0.95, 0.5, 0.55)

  const SPAWNS: { x: number; y: number; dir: Dir }[] = [
    { x: 3, y: Math.floor(H / 2) - 2, dir: 1 },
    { x: W - 4, y: Math.floor(H / 2) + 1, dir: 3 },
    { x: Math.floor(W / 2) + 2, y: 2, dir: 2 },
    { x: Math.floor(W / 2) - 3, y: H - 3, dir: 0 },
  ]

  const ROSTER: Pick<Rider, 'name' | 'tone' | 'control' | 'aggression' | 'wander'>[] =
    players === 2
      ? [
          { name: 'p1', tone: 'primary', control: 'p1', aggression: 0, wander: 0 },
          { name: 'p2', tone: 'amber', control: 'p2', aggression: 0, wander: 0 },
          { name: 'bot-1', tone: 'pink', control: 'bot', aggression: 1.2, wander: 4 },
          { name: 'bot-2', tone: 'green', control: 'bot', aggression: 0.4, wander: 8 },
        ]
      : [
          { name: 'you', tone: 'primary', control: 'solo', aggression: 0, wander: 0 },
          { name: 'bot-1', tone: 'pink', control: 'bot', aggression: 1.4, wander: 4 },
          { name: 'bot-2', tone: 'amber', control: 'bot', aggression: 0.6, wander: 6 },
          { name: 'bot-3', tone: 'green', control: 'bot', aggression: 0.3, wander: 10 },
        ]

  const riders: Rider[] = ROSTER.map((r) => {
    const color = new THREE.Color(COLORS[r.tone])
    const trailMaterial = new THREE.MeshBasicMaterial({
      color,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
    })
    // A cell is crossed at most once per round, so W * H segments is the ceiling (+1 live piece).
    const trail = new THREE.InstancedMesh(wallGeometry, trailMaterial, W * H + 1)
    trail.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    trail.count = 0
    trail.frustumCulled = false
    scene.add(trail)
    const bike = new THREE.Mesh(
      bikeGeometry,
      new THREE.MeshBasicMaterial({ color: color.clone().lerp(new THREE.Color('#ffffff'), 0.55) }),
    )
    bike.position.z = 0.3
    scene.add(bike)
    return {
      ...r,
      x: 0,
      y: 0,
      dir: 0,
      queue: [],
      alive: true,
      wins: 0,
      segments: 0,
      fade: 1,
      trail,
      trailMaterial,
      bike,
    }
  })

  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const s = new THREE.Vector3()
  const p = new THREE.Vector3()

  /** A wall from cell (x, y) reaching `len` cells in `dir`. Corners meet at cell centres. */
  const wallMatrix = (x: number, y: number, dir: Dir, len: number) => {
    const cx = toWorldX(x) + (DX[dir] * len) / 2
    const cy = toWorldY(y) - (DY[dir] * len) / 2
    const across = dir === 1 || dir === 3
    p.set(cx, cy, WALL_HEIGHT / 2)
    s.set(across ? len + WALL : WALL, across ? WALL : len + WALL, WALL_HEIGHT)
    return m.compose(p, q, s)
  }

  // Upload only the instances that changed, not the whole buffer. Three clears the ranges after
  // each upload.
  const touch = (r: Rider, from: number, count: number) => {
    r.trail.instanceMatrix.addUpdateRange(from * 16, count * 16)
    r.trail.instanceMatrix.needsUpdate = true
  }

  // ---- game state -----------------------------------------------------------------------------
  type Phase = 'countdown' | 'running' | 'over'
  let phase: Phase = 'countdown'
  let phaseTimer = COUNTDOWN
  let round = 0
  let roundTime = 0
  let tickTimer = 0
  let paused = false
  let message = ''
  let goTimer = 0
  let dirty = true

  const humans = riders.filter((r) => r.control !== 'bot')

  const pushHud = () => {
    const rows: HudLine[] = riders.map((r) => ({
      text: `██ ${r.name.padEnd(6)} ${String(r.wins).padStart(2)}${r.alive ? '' : '  ✗'}`,
      tone: r.tone,
    }))
    const hud: GameHud = {
      score: players === 2 ? round : (riders[0]?.wins ?? 0),
      label: players === 2 ? 'round' : 'rounds won',
      lines: [
        players === 2 ? 'wins' : `round ${round}`,
        ...rows,
        '',
        message ? { text: message, tone: 'bold' } : '',
      ],
      over: false,
      paused,
    }
    onHud(hud)
  }

  const startRound = () => {
    round++
    grid.fill(0)
    riders.forEach((r, i) => {
      const spawn = SPAWNS[i] as (typeof SPAWNS)[number]
      r.x = spawn.x
      r.y = spawn.y
      r.dir = spawn.dir
      r.queue = []
      r.alive = true
      r.segments = 0
      r.fade = 1
      r.trailMaterial.opacity = 0.9
      r.trail.count = 1
      r.trail.visible = true
      r.bike.visible = true
      grid[r.y * W + r.x] = i + 1
    })
    phase = 'countdown'
    phaseTimer = COUNTDOWN
    roundTime = 0
    tickTimer = 0
    message = '3'
    dirty = true
    pushHud()
  }

  const resetMatch = () => {
    for (const r of riders) r.wins = 0
    round = 0
    paused = false
    startRound()
  }

  // ---- bots -----------------------------------------------------------------------------------
  // Reused between calls: a visit stamp per cell and a BFS queue, so thinking allocates nothing.
  const seen = new Uint32Array(W * H)
  const bfs = new Int32Array(W * H)
  let stamp = 0

  /** How many free cells are reachable from (x, y), up to SPACE_CAP. */
  const space = (x: number, y: number) => {
    stamp++
    let head = 0
    let tail = 0
    bfs[tail++] = y * W + x
    seen[y * W + x] = stamp
    while (head < tail && tail < SPACE_CAP) {
      const c = bfs[head++] as number
      const cx = c % W
      const cy = (c - cx) / W
      for (let d = 0; d < 4; d++) {
        const nx = cx + (DX[d] as number)
        const ny = cy + (DY[d] as number)
        if (!free(nx, ny)) continue
        const n = ny * W + nx
        if (seen[n] === stamp) continue
        seen[n] = stamp
        bfs[tail++] = n
      }
    }
    return tail
  }

  const straightRun = (x: number, y: number, d: Dir) => {
    let n = 0
    while (n < 12 && free(x + DX[d] * (n + 1), y + DY[d] * (n + 1))) n++
    return n
  }

  /** Picks straight, left or right: most room first, then the cut-off, then a little noise. */
  const think = (r: Rider): Dir => {
    let best = r.dir
    let bestScore = -Infinity
    const target = humans
      .filter((h) => h.alive)
      .map((h) => ({ x: h.x + DX[h.dir] * 4, y: h.y + DY[h.dir] * 4 }))
      .sort(
        (a, b) =>
          Math.abs(a.x - r.x) + Math.abs(a.y - r.y) - Math.abs(b.x - r.x) - Math.abs(b.y - r.y),
      )[0]
    for (const d of [r.dir, left(r.dir), right(r.dir)]) {
      const nx = r.x + DX[d]
      const ny = r.y + DY[d]
      if (!free(nx, ny)) continue
      const room = space(nx, ny)
      let score = room * 2 + straightRun(nx, ny, d) + (d === r.dir ? 2 : 0)
      score += Math.random() * r.wander
      // A cell another rider could also enter next tick risks a head-on crash.
      for (const o of riders) {
        if (o === r || !o.alive) continue
        if (Math.abs(o.x - nx) + Math.abs(o.y - ny) === 1) score -= 40
      }
      // Hunt only with room to spare: being cut off yourself loses the round.
      if (target && room >= SPACE_CAP * 0.6) {
        score -= (Math.abs(target.x - nx) + Math.abs(target.y - ny)) * r.aggression
      }
      if (score > bestScore) {
        bestScore = score
        best = d
      }
    }
    return best
  }

  // ---- simulation -----------------------------------------------------------------------------
  const crash = (r: Rider) => {
    r.alive = false
    r.bike.visible = false
    // The trail derezzes, which opens its cells back up.
    const id = riders.indexOf(r) + 1
    for (let i = 0; i < grid.length; i++) if (grid[i] === id) grid[i] = 0
  }

  const tick = () => {
    for (const r of riders) {
      if (!r.alive) continue
      if (r.control === 'bot') r.dir = think(r)
      else {
        const next = r.queue.shift()
        if (next !== undefined && next !== reverse(r.dir)) r.dir = next
      }
    }
    const moving = riders.filter((r) => r.alive)
    const doomed = new Set<Rider>()
    for (const r of moving) {
      if (!free(r.x + DX[r.dir], r.y + DY[r.dir])) doomed.add(r)
    }
    // Two riders entering the same cell: head-on, both go.
    for (let i = 0; i < moving.length; i++) {
      for (let j = i + 1; j < moving.length; j++) {
        const a = moving[i] as Rider
        const b = moving[j] as Rider
        if (a.x + DX[a.dir] === b.x + DX[b.dir] && a.y + DY[a.dir] === b.y + DY[b.dir]) {
          doomed.add(a)
          doomed.add(b)
        }
      }
    }
    for (const r of moving) {
      if (doomed.has(r)) continue
      r.trail.setMatrixAt(r.segments, wallMatrix(r.x, r.y, r.dir, 1))
      touch(r, r.segments, 1)
      r.segments++
      r.trail.count = r.segments + 1
      r.x += DX[r.dir]
      r.y += DY[r.dir]
      grid[r.y * W + r.x] = riders.indexOf(r) + 1
    }
    for (const r of doomed) crash(r)
    if (doomed.size) settle()
  }

  /** After a crash: decide whether the round is over and who took it. */
  const settle = () => {
    const alive = riders.filter((r) => r.alive)
    const humansAlive = humans.filter((r) => r.alive)
    let done = false
    if (alive.length <= 1) {
      done = true
      const winner = alive[0]
      if (winner) {
        winner.wins++
        message = winner.control === 'solo' ? 'you win the round' : `${winner.name} wins the round`
      } else message = 'draw'
    } else if (humansAlive.length === 0) {
      // Nobody left to play: don't make people watch the bots finish.
      done = true
      message = players === 2 ? 'both players derezzed' : 'you derezzed'
    }
    if (done) {
      phase = 'over'
      phaseTimer = ROUND_PAUSE
    }
    pushHud()
  }

  const steer = (r: Rider | undefined, d: Dir) => {
    if (!r?.alive || phase === 'over') return
    const last = r.queue[r.queue.length - 1] ?? r.dir
    if (d === last || d === reverse(last) || r.queue.length >= 3) return
    r.queue.push(d)
  }

  // ---- camera ---------------------------------------------------------------------------------
  const TILT = 0.5
  const corners = [-1, 1].flatMap((sx) =>
    [-1, 1].flatMap((sy) =>
      [0, WALL_HEIGHT].map((z) => new THREE.Vector3((sx * W) / 2, (sy * H) / 2, z)),
    ),
  )
  const v = new THREE.Vector3()
  const resize = () => {
    const w = stage.clientWidth
    const h = stage.clientHeight
    if (!w || !h) return
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    // Back the camera off until every arena corner is on screen.
    let d = Math.max(W, H)
    for (let i = 0; i < 60; i++) {
      camera.position.set(0, -d * Math.sin(TILT), d * Math.cos(TILT))
      camera.lookAt(0, 0, 0)
      camera.updateMatrixWorld()
      const fits = corners.every((c) => {
        v.copy(c).project(camera)
        return Math.abs(v.x) <= 0.96 && Math.abs(v.y) <= 0.94
      })
      if (fits) break
      d *= 1.04
    }
    dirty = true
  }
  const ro = new ResizeObserver(resize)
  ro.observe(stage)
  resize()

  // Swipes steer the first player on touch screens.
  let touchStart: { x: number; y: number } | null = null
  const onDown = (e: PointerEvent) => {
    touchStart = { x: e.clientX, y: e.clientY }
  }
  const onUp = (e: PointerEvent) => {
    if (!touchStart) return
    const dx = e.clientX - touchStart.x
    const dy = e.clientY - touchStart.y
    touchStart = null
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return
    const d: Dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0
    steer(humans[0], d)
  }
  renderer.domElement.addEventListener('pointerdown', onDown)
  renderer.domElement.addEventListener('pointerup', onUp)

  // ---- loop -----------------------------------------------------------------------------------
  const clock = new THREE.Clock()
  renderer.setAnimationLoop(() => {
    const dt = paused ? 0 : Math.min(clock.getDelta(), 0.05)

    if (paused) {
      // Nothing moves; only a resize needs a redraw.
    } else if (phase === 'countdown') {
      phaseTimer -= dt
      const shown = String(Math.ceil((phaseTimer / COUNTDOWN) * 3))
      if (phaseTimer <= 0) {
        phase = 'running'
        message = 'go'
        goTimer = 0.7
        pushHud()
      } else if (shown !== message) {
        message = shown
        pushHud()
      }
    } else if (phase === 'running') {
      roundTime += dt
      if (goTimer > 0) {
        goTimer -= dt
        if (goTimer <= 0 && message === 'go') {
          message = ''
          pushHud()
        }
      }
      const step = 1 / (BASE_SPEED + Math.min(MAX_EXTRA_SPEED, roundTime * 0.12))
      tickTimer += dt
      while (tickTimer >= step && phase === 'running') {
        tickTimer -= step
        tick()
      }
      dirty = true
    } else {
      phaseTimer -= dt
      if (phaseTimer <= 0) startRound()
    }

    // Crashed trails fade out over 0.6s.
    for (const r of riders) {
      if (paused || r.alive || r.fade <= 0) continue
      r.fade = Math.max(0, r.fade - dt / 0.6)
      r.trailMaterial.opacity = 0.9 * r.fade
      if (r.fade === 0) r.trail.visible = false
      dirty = true
    }

    if (!dirty) return
    dirty = false
    // Between ticks, slide each bike and its newest wall piece towards the next cell.
    const step = 1 / (BASE_SPEED + Math.min(MAX_EXTRA_SPEED, roundTime * 0.12))
    const t = phase === 'running' ? Math.min(1, tickTimer / step) : 0
    for (const r of riders) {
      if (!r.alive) continue
      const ahead = free(r.x + DX[r.dir], r.y + DY[r.dir]) ? t : Math.min(t, 0.35)
      r.trail.setMatrixAt(r.segments, wallMatrix(r.x, r.y, r.dir, ahead))
      touch(r, r.segments, 1)
      r.bike.position.set(toWorldX(r.x) + DX[r.dir] * ahead, toWorldY(r.y) - DY[r.dir] * ahead, 0.3)
      r.bike.rotation.z = r.dir === 1 || r.dir === 3 ? 0 : Math.PI / 2
    }
    renderer.render(scene, camera)
  })

  startRound()

  const STEER: Record<string, Dir> = { up: 0, right: 1, down: 2, left: 3 }
  const ARROWS: Record<string, keyof typeof STEER> = {
    ArrowUp: 'up',
    ArrowRight: 'right',
    ArrowDown: 'down',
    ArrowLeft: 'left',
  }
  const WASD: Record<string, keyof typeof STEER> = { w: 'up', d: 'right', s: 'down', a: 'left' }

  return {
    key(key) {
      const lower = key.length === 1 ? key.toLowerCase() : key
      const arrow = ARROWS[key]
      const wasd = WASD[lower]
      if (arrow || wasd) {
        if (players === 2) {
          if (wasd) steer(riders[0], STEER[wasd] as Dir)
          if (arrow) steer(riders[1], STEER[arrow] as Dir)
        } else steer(riders[0], STEER[(arrow ?? wasd) as string] as Dir)
        return true
      }
      if (lower === 'p') {
        paused = !paused
        clock.getDelta()
        pushHud()
        return true
      }
      if (lower === 'r') {
        resetMatch()
        return true
      }
      if ((key === ' ' || key === 'Enter') && phase === 'over') {
        startRound()
        return true
      }
      return key === ' '
    },
    summary() {
      const played = phase === 'over' ? round : round - 1
      if (players === 2) {
        return `tron exited. ${riders.map((r) => `${r.name} ${r.wins}`).join(', ')}.`
      }
      return `tron exited. you won ${riders[0]?.wins ?? 0} of ${Math.max(0, played)} rounds.`
    },
    dispose() {
      renderer.setAnimationLoop(null)
      ro.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onDown)
      renderer.domElement.removeEventListener('pointerup', onUp)
      for (const r of riders) {
        r.trailMaterial.dispose()
        ;(r.bike.material as THREE.Material).dispose()
        r.trail.dispose()
      }
      wallGeometry.dispose()
      bikeGeometry.dispose()
      floorGeometry.dispose()
      floorMaterial.dispose()
      borderGeometry.dispose()
      borderMaterial.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}
