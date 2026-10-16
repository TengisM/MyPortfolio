import * as THREE from 'three'
import type { HudTone } from './types'

// The Tron arena in Three.js: floor, border, light cycles and their walls. It draws; it doesn't
// decide anything. The offline game (tron.ts) and the online one (tron-online.ts) feed it moves.

/** Headings: 0 up, 1 right, 2 down, 3 left. Grid y grows downward, like the screen. */
export type Dir = 0 | 1 | 2 | 3
export const DX = [0, 1, 0, -1] as const
export const DY = [-1, 0, 1, 0] as const

const ARROWS: Record<string, Dir> = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 }
const WASD: Record<string, Dir> = { w: 0, d: 1, s: 2, a: 3 }

/** The heading a key asks for, and whether it came from WASD (player 1 in two-player mode). */
export function keyToDir(key: string): { dir: Dir; wasd: boolean } | null {
  const arrow = ARROWS[key]
  if (arrow !== undefined) return { dir: arrow, wasd: false }
  const wasd = WASD[key.toLowerCase()]
  return wasd !== undefined && key.length === 1 ? { dir: wasd, wasd: true } : null
}

export const COLORS: Record<HudTone, string> = {
  primary: '#5b8cff',
  pink: '#ff7ab2',
  green: '#9be3a1',
  amber: '#ffc56d',
  muted: '#8a93a8',
  bold: '#eef1f8',
}

const WALL = 0.16
const WALL_HEIGHT = 0.7
const TILT = 0.5

type Cycle = {
  x: number
  y: number
  dir: Dir
  alive: boolean
  segments: number
  /** 1 while riding, falls to 0 as the trail derezzes after a crash. */
  fade: number
  trail: THREE.InstancedMesh
  material: THREE.MeshBasicMaterial
  bike: THREE.Mesh
}

export type Arena = ReturnType<typeof createArena>

/**
 * @param tones one per rider slot (seat); its colour.
 * @param onSwipe a swipe on the canvas, for touch screens.
 * @param frame called every animation frame with the seconds since the last one. It returns how
 *   far the riders are between cells (0 to 1), or null when nothing moves.
 */
export function createArena(
  stage: HTMLElement,
  W: number,
  H: number,
  tones: HudTone[],
  onSwipe: (d: Dir) => void,
  frame: (dt: number) => number | null,
) {
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

  // Which slot covers each cell, so a bike can stop short of a wall it's about to hit.
  const grid = new Uint8Array(W * H)
  const free = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && grid[y * W + x] === 0

  const cycles: Cycle[] = tones.map((tone) => {
    const color = new THREE.Color(COLORS[tone])
    const material = new THREE.MeshBasicMaterial({
      color,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
    })
    // A cell is crossed at most once per round, so W * H segments is the ceiling (+1 live piece).
    const trail = new THREE.InstancedMesh(wallGeometry, material, W * H + 1)
    trail.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    trail.count = 0
    trail.frustumCulled = false
    scene.add(trail)
    const bike = new THREE.Mesh(
      bikeGeometry,
      new THREE.MeshBasicMaterial({ color: color.clone().lerp(new THREE.Color('#ffffff'), 0.55) }),
    )
    bike.position.z = 0.3
    bike.visible = false
    scene.add(bike)
    return { x: 0, y: 0, dir: 0, alive: false, segments: 0, fade: 0, trail, material, bike }
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
  const touch = (c: Cycle, index: number) => {
    c.trail.instanceMatrix.addUpdateRange(index * 16, 16)
    c.trail.instanceMatrix.needsUpdate = true
  }

  let dirty = true

  // ---- camera ---------------------------------------------------------------------------------
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
    onSwipe(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0)
  }
  renderer.domElement.addEventListener('pointerdown', onDown)
  renderer.domElement.addEventListener('pointerup', onUp)

  // ---- loop -----------------------------------------------------------------------------------
  const clock = new THREE.Clock()
  // Held while nothing moves, so a redraw for a resize doesn't snap bikes back a half cell.
  let t = 0
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05)
    const progress = frame(dt)
    if (progress !== null) {
      t = progress
      dirty = true
    }

    // Crashed trails fade out over 0.6s.
    for (const c of cycles) {
      if (c.alive || c.fade <= 0) continue
      c.fade = Math.max(0, c.fade - dt / 0.6)
      c.material.opacity = 0.9 * c.fade
      if (c.fade === 0) c.trail.visible = false
      dirty = true
    }

    if (!dirty) return
    dirty = false
    // Between ticks, slide each bike and its newest wall piece towards the next cell. A bike
    // about to crash stops short of the wall instead of driving into it.
    for (const c of cycles) {
      if (!c.alive) continue
      const ahead = free(c.x + DX[c.dir], c.y + DY[c.dir]) ? t : Math.min(t, 0.35)
      c.trail.setMatrixAt(c.segments, wallMatrix(c.x, c.y, c.dir, ahead))
      touch(c, c.segments)
      c.bike.position.set(toWorldX(c.x) + DX[c.dir] * ahead, toWorldY(c.y) - DY[c.dir] * ahead, 0.3)
      c.bike.rotation.z = c.dir === 1 || c.dir === 3 ? 0 : Math.PI / 2
    }
    renderer.render(scene, camera)
  })

  return {
    /** Clears the board and puts each listed rider on its start cell. */
    reset(riders: { slot: number; x: number; y: number; dir: Dir }[]) {
      grid.fill(0)
      // Last round's progress would draw a stub of wall ahead of every bike.
      t = 0
      for (const c of cycles) {
        c.alive = false
        c.fade = 0
        c.segments = 0
        c.trail.count = 0
        c.trail.visible = false
        c.bike.visible = false
      }
      for (const r of riders) {
        const c = cycles[r.slot]
        if (!c) continue
        Object.assign(c, { x: r.x, y: r.y, dir: r.dir, alive: true, fade: 1 })
        c.material.opacity = 0.9
        c.trail.count = 1
        c.trail.visible = true
        c.bike.visible = true
        grid[r.y * W + r.x] = r.slot + 1
      }
      dirty = true
    },
    /** A rider moved one cell, to (x, y) heading dir. Lays the wall it left behind. */
    advance(slot: number, x: number, y: number, dir: Dir) {
      const c = cycles[slot]
      if (!c?.alive) return
      // The wall runs from the old cell to the new one, whatever the heading is now.
      const moved = (x > c.x ? 1 : x < c.x ? 3 : y > c.y ? 2 : 0) as Dir
      c.trail.setMatrixAt(c.segments, wallMatrix(c.x, c.y, moved, 1))
      touch(c, c.segments)
      c.segments++
      c.trail.count = c.segments + 1
      c.x = x
      c.y = y
      c.dir = dir
      grid[y * W + x] = slot + 1
      dirty = true
    },
    /** A rider crashed: the bike goes and its trail derezzes. */
    crash(slot: number) {
      const c = cycles[slot]
      if (!c?.alive) return
      c.alive = false
      c.bike.visible = false
      for (let i = 0; i < grid.length; i++) if (grid[i] === slot + 1) grid[i] = 0
      dirty = true
    },
    dispose() {
      renderer.setAnimationLoop(null)
      ro.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onDown)
      renderer.domElement.removeEventListener('pointerup', onUp)
      for (const c of cycles) {
        c.material.dispose()
        ;(c.bike.material as THREE.Material).dispose()
        c.trail.dispose()
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
