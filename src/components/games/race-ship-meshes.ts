import * as THREE from 'three'
import { SHIPS, type ShipId } from './race-rules.ts'

// The five ships, built from three.js shapes: clearcoat paint with a livery (graphite belly,
// stripe, panel seams, soot at the tail), metal engine bells with a glowing core, swept fins,
// intakes, vents, nav lights and hover emitters underneath. Each has its own outline from behind
// so you can tell them apart in a pack: Vega's tail fins, Kestrel's twin pods, Lancer's needle,
// Wisp's flat wedge and Torch's wide body. Nose toward -z, up +y, origin in the middle of the
// hull, about 3 m long. Browser only: the livery and numbers are drawn on canvases.

/** How far above the road the view holds a ship's origin. The shadow lies on the road. */
export const HOVER = 0.65

/** The pieces the view animates, kept in the group's userData. */
export type ShipParts = {
  /** Every engine core. Brighter while boosting. */
  engine: THREE.MeshBasicMaterial
  /** One pivot per exhaust flame, at its nozzle. The view sets each one's z scale to the length. */
  flame: THREE.Group
  /** The soft shadow on the road under the ship. */
  shadow: THREE.MeshBasicMaterial
}

export function shipParts(ship: THREE.Group): ShipParts {
  return ship.userData as ShipParts
}

const WHITE = new THREE.Color('#ffffff')
const PAINT_BASE = new THREE.Color('#d9dde2')
/** Race numbers, painted on fins and pods. */
const NUMBER: Record<ShipId, string> = {
  vega: '03',
  kestrel: '11',
  lancer: '27',
  wisp: '08',
  torch: '64',
}

/** Points round a hull's cross-section, and cross-sections from tail to nose. */
const RING = 32
const ROWS = 10

/**
 * A rounded body w × h × l whose front (-z) end is scaled by front across and frontH up. square
 * below 1 flattens the sides into panels with rounded corners; 1 is an ellipse. uv: u runs round
 * from the belly (0) over the right side (0.25) and the top (0.5); v runs from tail (0) to nose.
 */
function hull(w: number, h: number, l: number, front: number, frontH = front, square = 0.4) {
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  const ring = (j: number) => {
    const v = j / ROWS
    const z = l / 2 - v * l
    // The nose rounds off over its last rows instead of ending in a flat taper.
    const ease = v > 0.75 ? Math.sqrt(1 - ((v - 0.75) / 0.25) ** 2 * 0.5) : 1
    const sx = (1 + (front - 1) * v) * ease
    const sy = (1 + (frontH - 1) * v) * ease
    for (let i = 0; i <= RING; i++) {
      const a = -Math.PI / 2 + (i / RING) * Math.PI * 2
      const c = Math.cos(a)
      const s = Math.sin(a)
      pos.push(
        Math.sign(c) * Math.abs(c) ** square * (w / 2) * sx,
        Math.sign(s) * Math.abs(s) ** square * (h / 2) * sy,
        z,
      )
      uv.push(i / RING, v)
    }
  }
  const row = RING + 1
  for (let j = 0; j <= ROWS; j++) ring(j)
  for (let j = 0; j < ROWS; j++) {
    for (let i = 0; i < RING; i++) {
      const a = j * row + i
      const b = a + 1
      idx.push(a, a + row, b, b, a + row, b + row)
    }
  }
  const sides = pos.length / 3
  // End caps on their own vertices, so the edge stays sharp.
  for (const [j, sign] of [
    [0, 1],
    [ROWS, -1],
  ] as const) {
    const start = pos.length / 3
    ring(j)
    const centre = pos.length / 3
    pos.push(0, 0, l / 2 - (j / ROWS) * l)
    uv.push(0.5, j / ROWS)
    for (let i = 0; i < RING; i++) {
      if (sign > 0) idx.push(centre, start + i, start + i + 1)
      else idx.push(centre, start + i + 1, start + i)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  // The seam under the belly has two copies of each vertex: give both the same normal.
  const n = geo.getAttribute('normal') as THREE.BufferAttribute
  for (let j = 0; j <= ROWS && j * row + RING < sides; j++) {
    const a = j * row
    const b = a + RING
    const x = (n.getX(a) + n.getX(b)) / 2
    const y = (n.getY(a) + n.getY(b)) / 2
    const z = (n.getZ(a) + n.getZ(b)) / 2
    n.setXYZ(a, x, y, z)
    n.setXYZ(b, x, y, z)
  }
  return geo
}

/** A cone pointing at -z with its base at z = 0. */
function noseCone(r: number, l: number) {
  return new THREE.ConeGeometry(r, l, 18).translate(0, l / 2, 0).rotateX(-Math.PI / 2)
}

/**
 * A swept fin standing up from y = 0: root chord along z from 0 back, tip chord at height, its
 * leading edge pushed back by sweep. Bevelled, thickness across x.
 */
function finGeometry(height: number, root: number, tip: number, sweep: number, thick: number) {
  const shape = new THREE.Shape()
  shape.moveTo(0, 0)
  shape.lineTo(root, 0)
  shape.lineTo(sweep + tip, height)
  shape.lineTo(sweep, height)
  shape.closePath()
  const bevel = Math.min(thick * 0.45, 0.03)
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thick - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 1,
  })
  // Shape x runs back along the ship, y up; the extrusion becomes the thickness across x.
  geo.translate(0, 0, -(thick - bevel * 2) / 2)
  geo.rotateY(-Math.PI / 2)
  geo.computeVertexNormals()
  return geo
}

const css = (c: THREE.Color) => `#${c.getHexString()}`

/**
 * The hull's paint job on the hull uv: paint, a graphite belly, a white stripe over the top with
 * trim pinstripes, panel seams and a little soot toward the tail.
 */
function livery(paint: THREE.Color, trim: THREE.Color): THREE.CanvasTexture {
  const W = 512
  const H = 256
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (ctx) {
    // Canvas y runs down from the nose (v = 1) to the tail (v = 0).
    ctx.fillStyle = css(paint)
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = '#2a2e35'
    ctx.fillRect(0, 0, W * 0.19, H)
    ctx.fillRect(W * 0.81, 0, W * 0.19, H)
    ctx.fillStyle = css(trim)
    ctx.fillRect(W * 0.19, 0, 3, H)
    ctx.fillRect(W * 0.81 - 3, 0, 3, H)
    ctx.fillStyle = '#eef1f4'
    ctx.fillRect(W * 0.47, 0, W * 0.06, H)
    ctx.fillStyle = css(trim)
    ctx.fillRect(W * 0.455, 0, 4, H)
    ctx.fillRect(W * 0.545 - 4, 0, 4, H)
    // Panel seams across and along, and a couple of hatches.
    ctx.strokeStyle = 'rgba(8, 10, 14, 0.5)'
    ctx.lineWidth = 1.5
    for (const v of [0.24, 0.5, 0.76]) {
      ctx.beginPath()
      ctx.moveTo(0, v * H)
      ctx.lineTo(W, v * H)
      ctx.stroke()
    }
    for (const u of [0.33, 0.67]) {
      ctx.beginPath()
      ctx.moveTo(u * W, 0)
      ctx.lineTo(u * W, H)
      ctx.stroke()
    }
    ctx.strokeRect(W * 0.36, H * 0.56, W * 0.06, H * 0.14)
    ctx.strokeRect(W * 0.58, H * 0.56, W * 0.06, H * 0.14)
    // Soot and wear toward the engines.
    const soot = ctx.createLinearGradient(0, H, 0, H * 0.55)
    soot.addColorStop(0, 'rgba(10, 8, 6, 0.38)')
    soot.addColorStop(1, 'rgba(10, 8, 6, 0)')
    ctx.fillStyle = soot
    ctx.fillRect(0, 0, W, H)
    for (let k = 0; k < 900; k++) {
      ctx.fillStyle = `rgba(0, 0, 0, ${Math.random() * 0.08})`
      ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2)
    }
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/** A race number in a white roundel, as a see-through decal w metres wide. */
function decal(text: string, trim: THREE.Color, w: number) {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = '#f2f4f6'
    ctx.beginPath()
    ctx.arc(64, 64, 58, 0, Math.PI * 2)
    ctx.fill()
    ctx.lineWidth = 8
    ctx.strokeStyle = css(trim)
    ctx.stroke()
    ctx.fillStyle = '#16191e'
    ctx.font = '800 64px "JetBrains Mono Variable", monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, 64, 68)
  }
  const map = new THREE.CanvasTexture(canvas)
  map.colorSpace = THREE.SRGBColorSpace
  return new THREE.Mesh(
    new THREE.PlaneGeometry(w, w),
    new THREE.MeshStandardMaterial({
      map,
      transparent: true,
      roughness: 0.4,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  )
}

/** The ship in its own paint, with trim and running lights in color. */
export function shipMesh(id: ShipId, color: string): THREE.Group {
  const group = new THREE.Group()
  const trim = new THREE.Color(color)
  // A shade darker than the menu colour: in sunlight the tone curve lifts it back.
  const paintColor = new THREE.Color(SHIPS[id].color).lerp(PAINT_BASE, 0.08).multiplyScalar(0.85)
  const clearcoat = { metalness: 0.3, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.06 }
  const body = new THREE.MeshPhysicalMaterial({ map: livery(paintColor, trim), ...clearcoat })
  const paint = new THREE.MeshPhysicalMaterial({ color: paintColor, ...clearcoat })
  const carbon = new THREE.MeshStandardMaterial({
    color: '#23262c',
    metalness: 0.5,
    roughness: 0.5,
  })
  const metal = new THREE.MeshStandardMaterial({ color: '#a3aab3', metalness: 1, roughness: 0.28 })
  const soot = new THREE.MeshStandardMaterial({
    color: '#14161a',
    metalness: 0.3,
    roughness: 0.8,
    side: THREE.DoubleSide,
  })
  // Metal reflects in its own colour, so a dark canopy would mirror nothing: a blue-grey visor.
  const glass = new THREE.MeshPhysicalMaterial({
    color: '#4c6075',
    metalness: 0.75,
    roughness: 0.06,
    clearcoat: 1,
  })
  const lit = new THREE.MeshBasicMaterial({ color: trim.clone().lerp(WHITE, 0.4) })
  const engine = new THREE.MeshBasicMaterial({
    color: trim.clone().lerp(WHITE, 0.55).multiplyScalar(1.5),
  })
  const hover = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#8fe9ff').multiplyScalar(1.2),
  })
  const red = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff3b30').multiplyScalar(2) })
  const green = new THREE.MeshBasicMaterial({ color: new THREE.Color('#3bff7a').multiplyScalar(2) })
  // Flames fade from the nozzle to their tip through their vertex colours.
  // A soft glow over each engine's mouth, brightest in the middle.
  const heat = new THREE.MeshBasicMaterial({
    color: trim.clone().lerp(WHITE, 0.5),
    vertexColors: true,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const flameMaterial = new THREE.MeshBasicMaterial({
    color: trim.clone().lerp(WHITE, 0.45),
    vertexColors: true,
    transparent: true,
    opacity: 0.7,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const shadow = new THREE.MeshBasicMaterial({
    color: '#000000',
    vertexColors: true,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  })
  const flame = new THREE.Group()

  const add = (
    geo: THREE.BufferGeometry,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
    rz = 0,
    ry = 0,
    into: THREE.Object3D = group,
  ) => {
    const mesh = new THREE.Mesh(geo, material)
    mesh.position.set(x, y, z)
    mesh.rotation.set(0, ry, rz)
    into.add(mesh)
    return mesh
  }

  /** A canopy and the dark seal it sits in. */
  const canopy = (w: number, h: number, l: number, y: number, z: number) => {
    add(hull(w * 1.12, h * 0.55, l * 1.06, 0.5), carbon, 0, y - h * 0.22, z)
    add(hull(w, h, l, 0.5, 0.5, 0.7), glass, 0, y, z)
  }

  /** A swept fin at x, standing on y, from z back; tilt leans its top outward. */
  const fin = (
    x: number,
    y: number,
    z: number,
    size: [height: number, root: number, tip: number, sweep: number],
    tilt: number,
    number = false,
  ) => {
    const [height, root, tip, sweep] = size
    const mesh = add(finGeometry(height, root, tip, sweep, 0.06), paint, x, y, z, tilt)
    // A running light along the tip.
    add(
      new THREE.BoxGeometry(0.02, 0.02, tip * 0.8),
      lit,
      0,
      height + 0.005,
      sweep + tip / 2,
      0,
      0,
      mesh,
    )
    if (number) {
      // Outside face only, or both faces of a fin on the centre line.
      for (const side of x === 0 ? [-1, 1] : [Math.sign(x)]) {
        const d = decal(NUMBER[id], trim, Math.min(height, root) * 0.55)
        d.position.set(side * 0.034, height * 0.42, sweep * 0.42 + root * 0.42)
        d.rotation.y = (side * Math.PI) / 2
        mesh.add(d)
      }
    }
    return mesh
  }

  /** A side intake: a dark mouth with a metal lip. */
  const intake = (x: number, y: number, z: number, h: number, l: number) => {
    const side = Math.sign(x)
    add(new THREE.BoxGeometry(0.07, h, l), soot, x, y, z)
    add(new THREE.BoxGeometry(0.075, h + 0.03, 0.03), metal, x + side * 0.004, y, z - l / 2)
  }

  /** Cooling slats across the top. */
  const vents = (y: number, z: number, w: number, n: number) => {
    for (let k = 0; k < n; k++) {
      add(new THREE.BoxGeometry(w, 0.02, 0.035), carbon, 0, y, z + k * 0.07)
    }
  }

  /** Anti-grav emitters under the hull, glowing faintly down at the road. */
  const emitter = (x: number, y: number, z: number, w: number, l: number) => {
    add(new THREE.BoxGeometry(w + 0.06, 0.04, l + 0.06), carbon, x, y + 0.01, z)
    add(new THREE.PlaneGeometry(w, l).rotateX(Math.PI / 2), hover, x, y - 0.012, z)
  }

  /** Red to port, green to starboard. */
  const navLights = (x: number, y: number, z: number) => {
    add(new THREE.SphereGeometry(0.035, 8, 6), red, -x, y, z)
    add(new THREE.SphereGeometry(0.035, 8, 6), green, x, y, z)
  }

  /**
   * An engine whose bell opens at the back face z: a flared metal bell, soot inside, a glowing
   * core just inside the mouth so the chase camera sees it, a haze of heat over the mouth, and
   * its flame. wide stretches it across for a slot engine.
   */
  const nozzle = (x: number, y: number, z: number, r: number, wide = 1) => {
    const bell = [
      new THREE.Vector2(r * 0.78, -0.16),
      new THREE.Vector2(r * 0.9, -0.1),
      new THREE.Vector2(r * 1.06, -0.04),
      new THREE.Vector2(r * 1.18, 0),
      new THREE.Vector2(r * 1.24, 0.01),
    ]
    const outer = add(new THREE.LatheGeometry(bell, 24).rotateX(Math.PI / 2), metal, x, y, z)
    outer.scale.x = wide
    const inner = add(
      new THREE.LatheGeometry(
        bell.map((p) => new THREE.Vector2(p.x * 0.93, p.y)),
        24,
      ).rotateX(Math.PI / 2),
      soot,
      x,
      y,
      z,
    )
    inner.scale.x = wide
    add(new THREE.CircleGeometry(r * 0.8, 24), engine, x, y, z - 0.07).scale.x = wide
    const glow = new THREE.CircleGeometry(r * 1.6, 24)
    // Vertex 0 is the middle: full colour there, fading to nothing at the rim.
    const falloff = new Float32Array(glow.getAttribute('position').count * 3)
    falloff.fill(1, 0, 3)
    glow.setAttribute('color', new THREE.BufferAttribute(falloff, 3))
    const haze = add(glow, heat, x, y, z + 0.03)
    haze.scale.x = wide
    haze.renderOrder = 2
    // A crisp metal lip.
    add(new THREE.TorusGeometry(r * 1.21, r * 0.045, 6, 24), metal, x, y, z + 0.005).scale.x = wide
    // Turbine ring round the core.
    add(new THREE.TorusGeometry(r * 0.84, r * 0.06, 6, 24), carbon, x, y, z - 0.065).scale.x = wide

    const cone = new THREE.ConeGeometry(r * 0.75, 1, 16, 4, true)
      .translate(0, 0.5, 0)
      .rotateX(Math.PI / 2)
    const pos = cone.getAttribute('position') as THREE.BufferAttribute
    const fade = new Float32Array(pos.count * 3)
    for (let i = 0; i < pos.count; i++)
      fade.fill(Math.max(0, 1 - pos.getZ(i)) ** 1.5, i * 3, i * 3 + 3)
    cone.setAttribute('color', new THREE.BufferAttribute(fade, 3))
    const plume = new THREE.Mesh(cone, flameMaterial)
    plume.scale.x = wide
    // The pivot sits at the core, so stretching it lengthens the flame without moving it.
    const pivot = new THREE.Group()
    pivot.position.set(x, y, z - 0.06)
    pivot.scale.z = 0.4
    pivot.add(plume)
    flame.add(pivot)
  }

  let width = 1.4
  let length = 3
  switch (id) {
    case 'vega': {
      add(hull(1.2, 0.42, 3, 0.3, 0.45), body, 0, 0, 0)
      canopy(0.5, 0.28, 1, 0.3, -0.2)
      add(hull(2.2, 0.08, 1, 0.55, 0.55, 0.3), body, 0, -0.05, 0.75)
      vents(0.215, 0.45, 0.32, 4)
      for (const side of [-1, 1]) {
        fin(side * 0.6, 0.12, 0.62, [0.62, 0.86, 0.42, 0.36], -side * 0.18, true)
        intake(side * 0.37, 0, -0.1, 0.16, 0.5)
        nozzle(side * 0.32, 0, 1.5, 0.17)
      }
      emitter(0, -0.21, -0.55, 0.5, 0.5)
      emitter(0, -0.21, 0.55, 0.7, 0.45)
      navLights(0.92, -0.05, 0.95)
      add(new THREE.CylinderGeometry(0.008, 0.008, 0.32), carbon, 0.22, 0.36, 1.05)
      width = 2.2
      break
    }
    case 'kestrel': {
      add(hull(0.55, 0.4, 1.6, 0.45), body, 0, 0.05, -0.2)
      canopy(0.36, 0.22, 0.7, 0.3, -0.35)
      // Struts out to the pods.
      add(hull(1.4, 0.07, 0.34, 1, 1, 0.3), carbon, 0, 0, 0.6)
      add(hull(1.4, 0.07, 0.3, 1, 1, 0.3), carbon, 0, 0, -0.5)
      emitter(0, -0.16, -0.2, 0.32, 0.8)
      for (const side of [-1, 1]) {
        add(hull(0.6, 0.6, 2.6, 1, 1, 1), body, side * 0.85, 0, 0.1)
        add(noseCone(0.3, 0.6), paint, side * 0.85, 0, -1.2)
        // Metal bands round each pod, and a fin on top with the number.
        add(
          new THREE.CylinderGeometry(0.312, 0.312, 0.06, 24, 1, true).rotateX(Math.PI / 2),
          metal,
          side * 0.85,
          0,
          0.92,
        )
        add(
          new THREE.CylinderGeometry(0.312, 0.312, 0.04, 24, 1, true).rotateX(Math.PI / 2),
          metal,
          side * 0.85,
          0,
          -0.75,
        )
        fin(side * 0.85, 0.27, 0.55, [0.34, 0.7, 0.32, 0.3], 0, true)
        emitter(side * 0.85, -0.29, 0.1, 0.22, 1.6)
        nozzle(side * 0.85, 0, 1.41, 0.24)
      }
      navLights(1.16, 0, -0.6)
      width = 2.3
      break
    }
    case 'lancer': {
      add(hull(0.6, 0.38, 2.6, 0.25, 0.4), body, 0, 0, 0.2)
      add(noseCone(0.1, 0.9), paint, 0, 0, -1.1)
      // A pitot probe off the nose.
      add(new THREE.CylinderGeometry(0.012, 0.012, 0.5).rotateX(Math.PI / 2), metal, 0, 0, -2.15)
      canopy(0.3, 0.2, 0.9, 0.22, 0.1)
      add(hull(1.7, 0.05, 0.6, 0.4, 0.4, 0.3), body, 0, 0, 1.05)
      fin(0, 0.17, 0.62, [0.52, 0.72, 0.34, 0.34], 0, true)
      vents(0.2, 0.7, 0.2, 3)
      for (const side of [-1, 1]) {
        // Strakes along the sides, and winglets on the tailplane.
        add(new THREE.BoxGeometry(0.04, 0.05, 0.7), metal, side * 0.22, -0.04, 0.75)
        fin(side * 0.74, 0.02, 0.85, [0.16, 0.42, 0.2, 0.18], -side * 0.25)
        intake(side * 0.22, 0.06, 0.2, 0.1, 0.36)
      }
      emitter(0, -0.2, 0.1, 0.36, 1.4)
      navLights(0.72, 0.03, 1.3)
      nozzle(0, 0, 1.5, 0.26)
      width = 1.7
      length = 3.6
      break
    }
    case 'wisp': {
      add(hull(2.1, 0.26, 2.9, 0.12, 0.35), body, 0, 0, 0)
      canopy(0.45, 0.22, 0.9, 0.18, 0.1)
      vents(0.14, 0.7, 0.5, 4)
      // Metal leading edges, from the back corners to the nose.
      const edge = Math.atan2(0.925, 2.9)
      for (const side of [-1, 1]) {
        add(new THREE.BoxGeometry(0.04, 0.03, 3.04), metal, side * 0.59, 0.03, 0, 0, side * edge)
        fin(side * 1.0, 0.04, 0.72, [0.3, 0.68, 0.36, 0.24], -side * 0.12, true)
        emitter(side * 0.55, -0.12, 0.45, 0.32, 0.9)
      }
      emitter(0, -0.12, -0.5, 0.3, 0.7)
      navLights(1.02, 0.05, 1.3)
      // A slot engine across the tail: a wide housing round a stretched bell.
      add(hull(1.0, 0.24, 0.4, 1, 1, 0.3), carbon, 0, 0, 1.28)
      nozzle(0, 0, 1.47, 0.1, 6)
      width = 2.1
      length = 2.9
      break
    }
    case 'torch': {
      add(hull(2, 0.55, 2.7, 0.55), body, 0, 0, 0.1)
      add(hull(1.1, 0.3, 0.6, 0.5), paint, 0, -0.08, -1.55)
      canopy(0.6, 0.3, 0.9, 0.38, -0.3)
      // The engine block, and a light bar over it.
      add(hull(1.6, 0.5, 0.4, 1, 1, 0.3), carbon, 0, 0.02, 1.35)
      add(new THREE.BoxGeometry(1.5, 0.03, 0.03), lit, 0, 0.29, 1.16)
      vents(0.29, 0.55, 0.9, 5)
      for (const side of [-1, 1]) {
        // Radiator pods on the flanks, slatted, with the number.
        const pod = add(hull(0.28, 0.32, 1.2, 0.8, 0.8, 0.3), carbon, side * 1.05, -0.02, 0.2)
        for (let k = 0; k < 5; k++) {
          add(
            new THREE.BoxGeometry(0.02, 0.22, 0.04),
            metal,
            side * 0.14,
            0,
            -0.3 + k * 0.13,
            0,
            0,
            pod,
          )
        }
        const d = decal(NUMBER[id], trim, 0.22)
        d.position.set(side * 0.142, 0, 0.38)
        d.rotation.y = (side * Math.PI) / 2
        pod.add(d)
        intake(side * 0.62, 0.05, -0.75, 0.18, 0.5)
        nozzle(side * 0.55, 0.02, 1.55, 0.15)
      }
      emitter(0, -0.28, -0.4, 1.1, 0.6)
      emitter(0, -0.28, 0.6, 1.1, 0.5)
      navLights(1.2, 0.05, -0.2)
      nozzle(0, 0.02, 1.55, 0.22)
      width = 2.3
      length = 3.2
      break
    }
  }

  // A soft oval of shadow: dark in the middle, fading out to the rim through vertex alpha.
  const oval = new THREE.CircleGeometry(0.5, 24).rotateX(-Math.PI / 2)
  const fadeOut = new Float32Array(oval.getAttribute('position').count * 4)
  fadeOut[3] = 1
  oval.setAttribute('color', new THREE.BufferAttribute(fadeOut, 4))
  const blob = new THREE.Mesh(oval, shadow)
  blob.scale.set(width * 1.15, 1, length * 1.05)
  blob.position.y = -HOVER + 0.05
  blob.renderOrder = 1
  group.add(blob, flame)
  const parts: ShipParts = { engine, flame, shadow }
  group.userData = parts
  return group
}
