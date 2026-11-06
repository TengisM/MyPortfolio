import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { createRaceAudio, type EngineState, type Heard, type RaceAudio } from './race-audio.ts'
import { clamp, wrap } from './race-math.ts'
import { FAST, KMH_PER_MS, SHIPS, type ShipId, type TrackId } from './race-rules.ts'
import {
  type BuiltScenery,
  buildScenery,
  LOOKS,
  type Look,
  skyMaterial,
  sunDirection,
} from './race-scenery.ts'
import { HOVER, type ShipParts, shipMesh, shipParts } from './race-ship-meshes.ts'
import { TRACKS } from './race-track-defs.ts'
import {
  type BuiltTrack,
  buildTrackMeshes,
  ROAD,
  type TrackLayout,
  WATER_CREST,
} from './race-track-mesh.ts'
import { frameAt, newFrame, sampleIndex, type Track, type TrackPath } from './race-tracks.ts'

// The race in three.js: the track from race-track-mesh and its surroundings from race-scenery, in
// daylight, the ships, a chase camera, motion blur at speed, trails and spray. It draws the state
// it's handed and decides nothing.

export type ShipDraw = {
  id: number
  path: number
  s: number
  x: number
  y: number
  yaw: number
  speed: number
  boosting: boolean
  /** Watchers and ships that are out, online. Drawn see-through. */
  faded?: boolean
}

export type RaceView = {
  /** The race's sound. The view feeds it the ships each frame; games add the cues it can't see. */
  readonly audio: RaceAudio
  setTrack(track: Track): void
  setShips(ships: { id: number; ship: ShipId; color: string; label?: string }[]): void
  /** Turntable of one ship, for the ship menu. No track. */
  showcase(ship: ShipId): void
  /** Poses the ships and moves the camera behind the one whose id is follow. */
  draw(ships: ShipDraw[], follow: number, dt: number): void
  /** A short flash: pad when the followed ship takes a pad, wall when it hits a wall. */
  pulse(kind: 'pad' | 'wall'): void
  /** Runs frame every animation frame with the seconds since the last one, then renders. */
  loop(frame: (dt: number) => void): void
  dispose(): void
}

const TRAIL = 24
const SPRAY = 600
const FOV_REST = 68
/** Frames rendered after the game stops drawing (a pause) before the picture is left as it is. */
const STILL_FRAMES = 4
const FOV_FAST = 92
/** Extra degrees of view while boosting. */
const FOV_BOOST = 12
const CAM_BACK = 6.6
/** Metres the camera falls back at full speed, so the ship pulling away reads as acceleration. */
const CAM_STRETCH = 1.4
const CAM_UP = 2.2
const LOOK_AHEAD = 14
const LOOK_UP = 0.9
/** Seconds the camera takes to catch up with the road turning under it. */
const CAM_LAG = 0.15
/** Seconds a hull takes to settle onto a new road's tilt, where a shortcut leaves or joins. */
const ROLL_LAG = 0.06
/** Seconds a hull takes to ease across a step between roads, and the largest step it eases. */
const POP_LAG = 0.08
const POP_MAX = 2
// Bloom only catches what's brighter than daylight: the sun, engines and pads.
const BLOOM = 0.3
const BLOOM_FROM = 1.1
/** Speed, m/s, where motion blur begins. */
const BLUR_FROM = 30
/** Speed, m/s, from which the camera and ship buzz. */
const BUZZ_FROM = 60
/** Specks of dust in the air round the followed ship, still in the world so they stream past. */
const DUST = 420
/** Metres ahead dust appears, and how far behind the camera it's recycled. */
const DUST_AHEAD = 160
const DUST_BEHIND = 2

/** The ship menu sits on the grid this many metres before the start line. */
const MENU_GRID = 30
/** The menu camera: metres behind the turntable and above it. */
const MENU_BACK = 7
const MENU_UP = 2.6
const Z_UP = new THREE.Vector3(0, 0, 1)

const WHITE = new THREE.Color('#ffffff')
const PAD_FLASH = new THREE.Color('#bdefff')
const WALL_FLASH = new THREE.Color('#ff5a3c')

/**
 * Blur toward the middle of the screen, stronger at the edges, and a light vignette. amount is 0
 * at rest and about 1 when boosting flat out.
 */
const SPEED_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    amount: { value: 0 },
    centre: { value: new THREE.Vector2(0.5, 0.56) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float amount;
    uniform vec2 centre;
    varying vec2 vUv;
    void main() {
      vec2 dir = vUv - centre;
      float k = amount * smoothstep(0.08, 0.75, length(dir)) * 0.12;
      vec3 col = vec3(0.0);
      if (k < 0.0005) {
        col = texture2D(tDiffuse, vUv).rgb;
      } else {
        for (int i = 0; i < 10; i++) {
          col += texture2D(tDiffuse, vUv - dir * k * (float(i) / 9.0)).rgb;
        }
        col /= 10.0;
      }
      // A touch more colour than the tone curve leaves, and a light vignette.
      float grey = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = max(mix(vec3(grey), col, 1.12), 0.0);
      col *= 1.0 - 0.32 * dot(dir, dir);
      gl_FragColor = vec4(col, 1.0);
    }`,
}

// ---- view -----------------------------------------------------------------------------------------

type ShipView = {
  id: number
  root: THREE.Group
  parts: ShipParts
  engine: THREE.Color
  color: THREE.Color
  materials: { m: THREE.Material; opacity: number; transparent: boolean }[]
  faded: boolean
  trail: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>
  /** Ring of past tail points: centre xyz then right xyz. */
  history: Float32Array
  head: number
  clock: number
  label: THREE.Sprite | null
  heading: THREE.Vector3
  last: THREE.Vector3
  bank: number
  /** The up the hull is drawn with: eased, so a change of road never snaps its tilt. */
  up: THREE.Vector3
  /** The road it was on last frame, where it was drawn, and the step a road change left to ease out. */
  path: number
  drawn: THREE.Vector3
  pop: THREE.Vector3
  spray: number
  /** Next draw starts the trail and banking over. */
  fresh: boolean
  seen: boolean
}

function disposeObject(root: THREE.Object3D) {
  root.traverse((o) => {
    const drawn =
      o instanceof THREE.Mesh ||
      o instanceof THREE.Points ||
      o instanceof THREE.Line ||
      o instanceof THREE.Sprite
    if (!drawn) return
    o.geometry.dispose()
    const list: THREE.Material[] = Array.isArray(o.material) ? o.material : [o.material]
    for (const m of list) {
      if ('map' in m && m.map instanceof THREE.Texture) m.map.dispose()
      m.dispose()
    }
  })
}

function dotTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 64, 64)
  }
  return new THREE.CanvasTexture(canvas)
}

function labelSprite(text: string, color: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.font = '600 34px "JetBrains Mono Variable", monospace'
    ctx.textAlign = 'center'
    // Outlined, so the name reads against bright sky as well as dark road.
    ctx.lineWidth = 7
    ctx.lineJoin = 'round'
    ctx.strokeStyle = 'rgba(10, 12, 16, 0.75)'
    ctx.strokeText(text, 128, 44)
    ctx.fillStyle = color
    ctx.fillText(text, 128, 44)
  }
  const map = new THREE.CanvasTexture(canvas)
  map.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, fog: false }),
  )
  sprite.scale.set(4, 1, 1)
  return sprite
}

/** Two ribbons of TRAIL points each, as quads between neighbours. */
function trailGeometry() {
  const g = new THREE.BufferGeometry()
  const pos = new THREE.BufferAttribute(new Float32Array(TRAIL * 4 * 3), 3)
  const col = new THREE.BufferAttribute(new Float32Array(TRAIL * 4 * 3), 3)
  pos.setUsage(THREE.DynamicDrawUsage)
  col.setUsage(THREE.DynamicDrawUsage)
  g.setAttribute('position', pos)
  g.setAttribute('color', col)
  const idx: number[] = []
  for (let r = 0; r < 2; r++) {
    for (let k = 0; k + 1 < TRAIL; k++) {
      const a = (r * TRAIL + k) * 2
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  }
  g.setIndex(idx)
  return g
}

export function createRaceView(stage: HTMLElement): RaceView {
  const renderer = new THREE.WebGLRenderer({ powerPreference: 'high-performance' })
  // 1.5x is sharp enough and far cheaper than 2x on a full-screen canvas with bloom.
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))
  renderer.domElement.className = 'absolute inset-0 h-full w-full'
  stage.appendChild(renderer.domElement)

  // Film-like response, so sunlit paint and a bright sky roll off instead of clipping.
  renderer.toneMapping = THREE.ACESFilmicToneMapping

  const scene = new THREE.Scene()
  const fog = new THREE.FogExp2('#ffffff', 0.0003)
  scene.fog = fog
  // The land reaches about 8 km from the camera; the sky sits at the far plane whatever it is.
  const camera = new THREE.PerspectiveCamera(FOV_REST, 1, 0.3, 12000)
  scene.add(camera)

  // ---- light and sky ------------------------------------------------------------------------------
  const sun = new THREE.DirectionalLight('#ffffff', 2.5)
  scene.add(sun, sun.target)
  const fill = new THREE.HemisphereLight('#ffffff', '#808080', 0.6)
  // World up is +z.
  fill.position.set(0, 0, 1)
  scene.add(fill)
  // A little light from the camera, so a ship's back stays readable upside down in a loop.
  const rim = new THREE.DirectionalLight('#ffffff', 0.35)
  rim.position.set(0, 2, 4)
  camera.add(rim, rim.target)

  const dome = new THREE.SphereGeometry(100, 48, 24)
  const sky = new THREE.Mesh(dome, skyMaterial(LOOKS.coaster))
  sky.frustumCulled = false
  sky.renderOrder = -1
  scene.add(sky)

  // Metal reflects the sky: a blurred copy of it, remade when the place changes.
  const pmrem = new THREE.PMREMGenerator(renderer)
  let env: THREE.WebGLRenderTarget | null = null
  let lookId: TrackId | null = null
  const sunDir = new THREE.Vector3()

  const applyLook = (id: TrackId) => {
    if (lookId === id) return
    lookId = id
    const look: Look = LOOKS[id]
    const old = sky.material
    sky.material = skyMaterial(look)
    old.dispose()
    fog.color.set(look.haze)
    fog.density = look.fog
    sunDirection(look, sunDir)
    sun.color.set(look.sun.color)
    sun.intensity = look.sun.power
    sun.position.copy(sunDir).multiplyScalar(1000)
    fill.color.set(look.fill.sky)
    fill.groundColor.set(look.fill.ground)
    fill.intensity = look.fill.power
    renderer.toneMappingExposure = look.exposure

    const envScene = new THREE.Scene()
    const envSky = new THREE.Mesh(dome, skyMaterial(look, 0.08))
    envScene.add(envSky)
    env?.dispose()
    env = pmrem.fromScene(envScene, 0, 0.1, 1000)
    envSky.material.dispose()
    scene.environment = env.texture
    scene.environmentIntensity = 0.7
  }
  applyLook('coaster')

  // Multisampled, since rendering through the composer skips the canvas's own antialiasing.
  const composer = new EffectComposer(
    renderer,
    new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }),
  )
  const renderPass = new RenderPass(scene, camera)
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), BLOOM, 0.4, BLOOM_FROM)
  const speedPass = new ShaderPass(SPEED_SHADER)
  // ShaderPass copies the uniforms; this is its copy.
  const blurAmount: THREE.IUniform<number> = speedPass.uniforms.amount ?? { value: 0 }
  const output = new OutputPass()
  composer.addPass(renderPass)
  composer.addPass(bloom)
  composer.addPass(speedPass)
  composer.addPass(output)

  const time: THREE.IUniform<number> = { value: 0 }
  let scenery: BuiltScenery | null = null
  const placeScenery = (track: Track, layout: TrackLayout) => {
    if (scenery) {
      scene.remove(scenery.group, scenery.props)
      disposeObject(scenery.group)
      disposeObject(scenery.props)
    }
    scenery = buildScenery(track, layout)
    // Dust takes the colour of the place's haze.
    dustMaterial.color.set(LOOKS[track.id].horizon).lerp(WHITE, 0.6)
    scene.add(scenery.group, scenery.props)
    applyLook(track.id)
  }

  // ---- spray --------------------------------------------------------------------------------------
  const sprayPos = new Float32Array(SPRAY * 3)
  // White droplets fading out through their alpha.
  const sprayCol = new Float32Array(SPRAY * 4)
  const sprayVel = new Float32Array(SPRAY * 3)
  const sprayUp = new Float32Array(SPRAY * 3)
  const sprayLife = new Float32Array(SPRAY)
  const sprayMax = new Float32Array(SPRAY).fill(1)
  let sprayNext = 0
  let sprayLive = 0
  const sprayGeometry = new THREE.BufferGeometry()
  const sprayPosAttr = new THREE.BufferAttribute(sprayPos, 3).setUsage(THREE.DynamicDrawUsage)
  const sprayColAttr = new THREE.BufferAttribute(sprayCol, 4).setUsage(THREE.DynamicDrawUsage)
  sprayGeometry.setAttribute('position', sprayPosAttr)
  sprayGeometry.setAttribute('color', sprayColAttr)
  const sprayMaterial = new THREE.PointsMaterial({
    size: 0.25,
    map: dotTexture(),
    vertexColors: true,
    transparent: true,
    depthWrite: false,
  })
  const spray = new THREE.Points(sprayGeometry, sprayMaterial)
  spray.frustumCulled = false
  scene.add(spray)

  // ---- dust in the air -----------------------------------------------------------------------------
  const dustPos = new Float32Array(DUST * 3)
  const dustGeometry = new THREE.BufferGeometry()
  const dustAttr = new THREE.BufferAttribute(dustPos, 3).setUsage(THREE.DynamicDrawUsage)
  dustGeometry.setAttribute('position', dustAttr)
  const dustMaterial = new THREE.PointsMaterial({
    size: 0.06,
    map: dotTexture(),
    transparent: true,
    opacity: 0,
    depthWrite: false,
  })
  const dust = new THREE.Points(dustGeometry, dustMaterial)
  dust.frustumCulled = false
  scene.add(dust)
  // The followed ship's road and place, which dust is scattered ahead along.
  let followPath: TrackPath | null = null
  let followS = 0
  let dustFresh = true
  const D = newFrame()
  const forward = new THREE.Vector3()
  const speck = new THREE.Vector3()
  /** Puts speck i somewhere ahead along the road: anywhere up to DUST_AHEAD, or only far ahead. */
  const scatter = (i: number, anywhere: boolean) => {
    if (!followPath) return
    const ahead = anywhere
      ? 4 + Math.random() * DUST_AHEAD
      : DUST_AHEAD * (0.7 + Math.random() * 0.3)
    const at = followPath.closed
      ? wrap(followS + ahead, followPath.length)
      : Math.min(followS + ahead, followPath.length)
    frameAt(followPath, at, D)
    let lat = (Math.random() - 0.5) * 34
    const lift = 0.3 + Math.random() ** 1.5 * 9
    // Kept out of the camera's own path: a speck that passes the lens fills the screen.
    if (Math.abs(lat) < 3 && lift > 0.8 && lift < 4.5)
      lat = Math.sign(lat || 1) * (3 + Math.random() * 2)
    for (let k = 0; k < 3; k++) {
      dustPos[i * 3 + k] = (D.p[k] as number) + (D.r[k] as number) * lat + (D.n[k] as number) * lift
    }
  }

  // ---- speed readout --------------------------------------------------------------------------------
  // Bottom centre of the race, where the eye already is. Plain DOM over the canvas.
  const readout = document.createElement('div')
  readout.style.cssText =
    'position:absolute;left:50%;bottom:14px;transform:translateX(-50%);display:none;' +
    'align-items:baseline;gap:6px;pointer-events:none;color:#fff;' +
    'font-family:"JetBrains Mono Variable",monospace;font-variant-numeric:tabular-nums;' +
    'text-shadow:0 1px 4px rgba(0,0,0,0.7)'
  const kmh = document.createElement('span')
  kmh.style.cssText = 'font-size:44px;font-weight:700;line-height:1'
  const unit = document.createElement('span')
  unit.style.cssText = 'font-size:14px;opacity:0.85'
  unit.textContent = 'km/h'
  readout.append(kmh, unit)
  stage.appendChild(readout)
  let shownKmh = -1
  let shownBoost = false

  // ---- screen flash -------------------------------------------------------------------------------
  const flashColor = new THREE.Color()
  const flashAmount: THREE.IUniform<number> = { value: 0 }
  const flashMaterial = new THREE.ShaderMaterial({
    uniforms: { color: { value: flashColor }, amount: flashAmount },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }`,
    // Strongest at the screen's edges.
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      uniform float amount;
      varying vec2 vUv;
      void main() {
        float edge = smoothstep(0.45, 0.95, length(vUv - 0.5) * 1.4);
        gl_FragColor = vec4(color * amount * edge, 1.0);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
  })
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), flashMaterial)
  flash.frustumCulled = false
  flash.renderOrder = 10
  scene.add(flash)

  // ---- showcase turntable -------------------------------------------------------------------------
  const turntable = new THREE.Group()
  turntable.visible = false
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: WHITE,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.95, 2.1, 64), ringMaterial)
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1.95, 64),
    new THREE.MeshStandardMaterial({ color: ROAD, metalness: 0.7, roughness: 0.35 }),
  )
  turntable.add(disc, ring)
  scene.add(turntable)
  // One per ship, built the first time it's shown: stepping through the menu only swaps them.
  const showcased = new Map<ShipId, THREE.Group>()

  // ---- state --------------------------------------------------------------------------------------
  // ---- sound ----------------------------------------------------------------------------------------
  const audio = createRaceAudio()
  // What draw saw this frame, for animate to play once the camera is in place.
  let drew = false
  let heard: EngineState | null = null
  let lastSpeed = 0
  const nearby: Heard[] = []
  const earAt = new THREE.Vector3()
  const earForward = new THREE.Vector3()

  const fleet = new THREE.Group()
  scene.add(fleet)
  let built: BuiltTrack | null = null
  const views = new Map<number, ShipView>()
  let mode: 'race' | 'showcase' = 'race'
  let elapsed = 0
  let padFlash = 0
  let wallFlash = 0
  let shake = 0
  let speedNow = 0
  let blur = 0

  const camPos = new THREE.Vector3()
  const camAim = new THREE.Vector3()
  const camOff = new THREE.Vector3()
  const camUp = new THREE.Vector3(0, 0, 1)
  const lag = new THREE.Vector3()
  const lastBase = new THREE.Vector3()
  const lookAt = new THREE.Vector3()
  let camFresh = true
  // Frames in a row with nothing drawn or moving.
  let still = 0
  let fov = FOV_REST
  let fovTarget = FOV_REST
  let boostTarget = 0

  // Scratch, reused every frame.
  const F = newFrame()
  const heading = new THREE.Vector3()
  const up = new THREE.Vector3()
  const right = new THREE.Vector3()
  const side = new THREE.Vector3()
  const base = new THREE.Vector3()
  const pos = new THREE.Vector3()
  const tail = new THREE.Vector3()
  const want = new THREE.Vector3()
  const wantAim = new THREE.Vector3()
  const look = new THREE.Vector3()
  const basis = new THREE.Matrix4()
  const tilt = new THREE.Vector3()

  const setMode = (next: typeof mode) => {
    if (mode === next) return
    mode = next
    const race = next === 'race'
    fleet.visible = race
    spray.visible = race
    turntable.visible = !race
    camera.fov = race ? fov : 40
    camera.updateProjectionMatrix()
    camFresh = true
  }

  const setFaded = (v: ShipView, faded: boolean) => {
    if (v.faded === faded) return
    v.faded = faded
    for (const { m, opacity, transparent } of v.materials) {
      m.transparent = faded || transparent
      m.opacity = opacity * (faded ? 0.3 : 1)
      m.needsUpdate = true
    }
  }

  const clearShips = () => {
    for (const v of views.values()) {
      fleet.remove(v.root, v.trail)
      disposeObject(v.root)
      disposeObject(v.trail)
      if (v.label) {
        fleet.remove(v.label)
        disposeObject(v.label)
      }
    }
    views.clear()
  }

  const clearShowcase = () => {
    for (const mesh of showcased.values()) {
      turntable.remove(mesh)
      disposeObject(mesh)
    }
    showcased.clear()
  }

  const emitSpray = (speed: number) => {
    const i = sprayNext
    sprayNext = (sprayNext + 1) % SPRAY
    const s = Math.random() < 0.5 ? -1 : 1
    // From the road under the back corners, flung out, up and left behind.
    tail
      .copy(base)
      .addScaledVector(up, -HOVER)
      .addScaledVector(heading, -1.4)
      .addScaledVector(right, s * (0.6 + Math.random() * 0.5))
    side
      .copy(heading)
      .multiplyScalar(speed * 0.25)
      .addScaledVector(right, s * (2 + Math.random() * 4))
      .addScaledVector(up, 3 + Math.random() * 5)
    tail.toArray(sprayPos, i * 3)
    side.toArray(sprayVel, i * 3)
    up.toArray(sprayUp, i * 3)
    sprayMax[i] = 0.5 + Math.random() * 0.4
    sprayLife[i] = sprayMax[i] as number
    sprayLive = SPRAY
  }

  const pose = (v: ShipView, d: ShipDraw, path: TrackPath, dt: number) => {
    frameAt(path, d.s, F)
    const cy = Math.cos(d.yaw)
    const sy = Math.sin(d.yaw)
    heading.set(F.t[0] * cy + F.r[0] * sy, F.t[1] * cy + F.r[1] * sy, F.t[2] * cy + F.r[2] * sy)
    up.set(F.n[0], F.n[1], F.n[2])
    right.crossVectors(heading, up)
    const lift = d.y + HOVER
    base.set(
      F.p[0] + F.r[0] * d.x + F.n[0] * lift,
      F.p[1] + F.r[1] * d.x + F.n[1] * lift,
      F.p[2] + F.r[2] * d.x + F.n[2] * lift,
    )
    if (!v.fresh && v.last.distanceToSquared(base) > 40 * 40) v.fresh = true
    v.last.copy(base)
    // Where a shortcut leaves or joins, the new road can sit a little higher or lower than the
    // old one under the ship. The hull eases across that step instead of popping.
    if (v.fresh) v.pop.set(0, 0, 0)
    else if (d.path !== v.path) {
      v.pop
        .copy(v.drawn)
        .addScaledVector(heading, d.speed * dt)
        .sub(base)
      if (v.pop.lengthSq() > POP_MAX * POP_MAX) v.pop.set(0, 0, 0)
    }
    v.path = d.path
    v.pop.multiplyScalar(Math.exp(-dt / POP_LAG))
    base.add(v.pop)
    v.drawn.copy(base)
    pos.copy(base).addScaledVector(up, 0.06 * Math.sin(elapsed * 5 + d.id * 1.7))
    if (v.fresh) {
      v.heading.copy(heading)
      v.bank = 0
      v.up.copy(up)
    } else v.up.lerp(up, 1 - Math.exp(-dt / ROLL_LAG)).normalize()
    // Bank into turns: right turns swing the heading clockwise about up.
    side.crossVectors(v.heading, heading)
    const turn = Math.atan2(side.dot(up), v.heading.dot(heading))
    const rate = dt > 0 ? turn / dt : 0
    v.bank += (clamp(rate * 0.12, -0.5, 0.5) - v.bank) * (1 - Math.exp(-dt / 0.2))
    v.heading.copy(heading)
    // Drawn square to the eased up; the position above stays exactly on the road.
    side.copy(heading).addScaledVector(v.up, -heading.dot(v.up)).normalize()
    tilt.crossVectors(side, v.up)
    basis.makeBasis(tilt, v.up, side.negate())
    v.root.quaternion.setFromRotationMatrix(basis)
    v.root.rotateZ(v.bank)
    // The hull rattles a little at high speed.
    const rattle =
      clamp((d.speed - BUZZ_FROM) / (FAST - BUZZ_FROM), 0, 1) * (d.boosting ? 0.012 : 0.006)
    if (rattle > 0) {
      v.root.rotateX(Math.sin(elapsed * 43 + d.id) * rattle)
      v.root.rotateZ(Math.sin(elapsed * 37 + d.id * 2) * rattle)
    }
    v.root.position.copy(pos)

    setFaded(v, d.faded ?? false)
    const fade = v.faded ? 0.3 : 1
    v.parts.engine.color.copy(v.engine).multiplyScalar(d.boosting ? 1.8 : 1)
    const flame =
      0.2 + Math.min(d.speed / FAST, 1) * 0.5 + (d.boosting ? 0.9 : 0) + Math.random() * 0.1
    for (const pivot of v.parts.flame.children) pivot.scale.z = flame
    // Lighter as the ship bobs up, and gone a few metres up in a jump.
    v.parts.shadow.opacity =
      (0.5 - 0.06 * Math.sin(elapsed * 5 + d.id * 1.7)) * fade * clamp(1 - d.y / 4, 0, 1)

    // Trail: a new point every 60th of a second; the newest always sits at the ship.
    v.clock += dt
    if (v.fresh) {
      tail.copy(base).addScaledVector(heading, -1.5)
      for (let k = 0; k < TRAIL; k++) {
        tail.toArray(v.history, k * 6)
        right.toArray(v.history, k * 6 + 3)
      }
    } else if (v.clock >= 1 / 60) {
      v.clock = 0
      v.head = (v.head + 1) % TRAIL
    }
    tail.copy(base).addScaledVector(heading, -1.5).addScaledVector(up, -0.15)
    tail.toArray(v.history, v.head * 6)
    right.toArray(v.history, v.head * 6 + 3)
    const tp = v.trail.geometry.getAttribute('position') as THREE.BufferAttribute
    const tc = v.trail.geometry.getAttribute('color') as THREE.BufferAttribute
    const P = tp.array as Float32Array
    const C = tc.array as Float32Array
    const h = v.history
    for (let k = 0; k < TRAIL; k++) {
      const at = ((v.head - k + TRAIL) % TRAIL) * 6
      const u = k / (TRAIL - 1)
      const w = 0.08 * (1 - u) + 0.015
      const glow = (1 - u) ** 2 * fade
      for (let r = 0; r < 2; r++) {
        const off = r === 0 ? -0.75 : 0.75
        for (let e = 0; e < 2; e++) {
          const o = off + (e === 0 ? -w : w)
          const vi = ((r * TRAIL + k) * 2 + e) * 3
          for (let j = 0; j < 3; j++) {
            P[vi + j] = (h[at + j] as number) + (h[at + 3 + j] as number) * o
          }
          C[vi] = v.color.r * glow
          C[vi + 1] = v.color.g * glow
          C[vi + 2] = v.color.b * glow
        }
      }
    }
    tp.needsUpdate = true
    tc.needsUpdate = true

    if (v.label) v.label.position.copy(pos).addScaledVector(up, 1.8)

    if (d.y < 0.05 && d.speed > 12 && path.water[sampleIndex(path, d.s)]) {
      v.spray += d.speed * dt * 1.2
      while (v.spray >= 1) {
        v.spray -= 1
        emitSpray(d.speed)
      }
    }
    v.fresh = false
  }

  /** Puts the camera behind the ship just posed: base, heading and up still hold its pose. */
  const chase = (d: ShipDraw, dt: number) => {
    // Look halfway between the road and the ship's heading, so a slide doesn't swing the view.
    const half = d.yaw / 2
    look.set(
      F.t[0] * Math.cos(half) + F.r[0] * Math.sin(half),
      F.t[1] * Math.cos(half) + F.r[1] * Math.sin(half),
      F.t[2] * Math.cos(half) + F.r[2] * Math.sin(half),
    )
    const pace = clamp(d.speed / FAST, 0, 1)
    want
      .copy(look)
      .multiplyScalar(-(CAM_BACK + CAM_STRETCH * pace * pace))
      .addScaledVector(up, CAM_UP)
    wantAim.copy(look).multiplyScalar(LOOK_AHEAD).addScaledVector(up, LOOK_UP)
    if (!camFresh) {
      // A sideways hop where a shortcut joins is soaked up and eased out instead of jumping.
      side.copy(lastBase).addScaledVector(heading, d.speed * dt)
      side.subVectors(base, side)
      const hop = side.length()
      if (hop > 40) {
        camFresh = true
        dustFresh = true
      } else if (hop > 2.5) lag.sub(side)
    }
    lastBase.copy(base)
    if (camFresh) {
      camOff.copy(want)
      camAim.copy(wantAim)
      camUp.copy(up)
      lag.set(0, 0, 0)
      camFresh = false
    } else {
      // Smoothed in the ship's frame, so speed adds no lag but a loop's turning up does.
      const k = 1 - Math.exp(-dt / CAM_LAG)
      camOff.lerp(want, k)
      camAim.lerp(wantAim, k)
      camUp.lerp(up, k).normalize()
      lag.multiplyScalar(Math.exp(-dt / 0.2))
    }
    camPos.copy(base).add(lag).add(camOff)
    lookAt.copy(base).add(lag).add(camAim)
    fovTarget = FOV_REST + (FOV_FAST - FOV_REST) * pace + (d.boosting ? FOV_BOOST : 0)
    boostTarget = d.boosting ? 1 : 0
    speedNow = d.speed
  }

  const animate = (dt: number) => {
    time.value = elapsed
    padFlash = Math.max(0, padFlash - dt / 0.35)
    wallFlash = Math.max(0, wallFlash - dt / 0.3)
    shake = Math.max(0, shake - dt / 0.25)
    if (wallFlash > padFlash) {
      flashColor.copy(WALL_FLASH)
      flashAmount.value = wallFlash * 0.35
    } else {
      flashColor.copy(PAD_FLASH)
      flashAmount.value = padFlash * 0.18
    }
    bloom.strength = BLOOM + padFlash * 0.3
    scenery?.update(dt)

    if (mode === 'showcase') {
      turntable.rotation.z += dt * 0.7
      camera.up.set(0, 0, 1)
      camera.position
        .copy(turntable.position)
        .addScaledVector(menuHeading, -MENU_BACK)
        .addScaledVector(Z_UP, MENU_UP)
      camera.lookAt(look.copy(turntable.position).setZ(turntable.position.z + 0.5))
      sky.position.copy(camera.position)
      blur = 0
      blurAmount.value = 0
      readout.style.display = 'none'
      shownKmh = -1
      audio.engine(null)
      audio.others([], { at: camera.position, forward: menuHeading, up: Z_UP }, dt)
      audio.mood({ racing: false, pace: 0, paused: false })
      return
    }

    camera.up.copy(camUp)
    camera.position.copy(camPos)
    if (shake > 0) {
      const a = 0.3 * shake * shake
      camera.position.x += (Math.random() - 0.5) * a
      camera.position.y += (Math.random() - 0.5) * a
      camera.position.z += (Math.random() - 0.5) * a
    }
    // A fine buzz at high speed: smooth, so it reads as vibration rather than noise.
    const buzz =
      clamp((speedNow - BUZZ_FROM) / (FAST - BUZZ_FROM), 0, 1) * (0.03 + boostTarget * 0.03)
    if (buzz > 0) {
      camera.position.x += Math.sin(elapsed * 61) * buzz
      camera.position.y += Math.sin(elapsed * 53 + 1.3) * buzz
      camera.position.z += Math.sin(elapsed * 47 + 2.1) * buzz
    }
    camera.lookAt(lookAt)
    sky.position.copy(camera.position)
    fov += (fovTarget - fov) * (1 - Math.exp(-dt / 0.3))
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }

    // Motion blur builds with speed, more while boosting and for a moment after a pad.
    const fast = clamp((speedNow - BLUR_FROM) / (FAST - BLUR_FROM), 0, 1)
    const blurTarget = Math.min(1, fast * 0.7 + boostTarget * 0.4 + padFlash * 0.3)
    blur += (blurTarget - blur) * (1 - Math.exp(-dt / 0.25))
    blurAmount.value = blur

    // Dust: still in the world, recycled from behind the camera to far ahead.
    dustMaterial.opacity = clamp((speedNow - 25) / 60, 0, 1) * 0.6
    if (followPath) {
      if (dustFresh) {
        for (let i = 0; i < DUST; i++) scatter(i, true)
        dustFresh = false
      } else {
        forward.subVectors(lookAt, camera.position).normalize()
        for (let i = 0; i < DUST; i++) {
          speck.fromArray(dustPos, i * 3).sub(camera.position)
          if (speck.dot(forward) < -DUST_BEHIND || speck.lengthSq() > 4 * DUST_AHEAD * DUST_AHEAD) {
            scatter(i, false)
          }
        }
      }
      dustAttr.needsUpdate = true
    }

    // The speed readout, touched only when it changes.
    const shown = Math.round(speedNow * KMH_PER_MS)
    readout.style.display = 'flex'
    if (shown !== shownKmh) {
      shownKmh = shown
      kmh.textContent = String(shown)
    }
    const boosting = boostTarget > 0
    if (boosting !== shownBoost) {
      shownBoost = boosting
      kmh.style.color = boosting ? '#aee9ff' : '#ffffff'
    }

    // Sound, heard from the camera. A frame the game didn't draw (paused) is silent.
    audio.engine(drew ? heard : null)
    earAt.copy(camera.position)
    camera.getWorldDirection(earForward)
    audio.others(drew ? nearby : [], { at: earAt, forward: earForward, up: camera.up }, dt)
    audio.mood({ racing: true, pace: speedNow / FAST, paused: !drew })
    drew = false

    if (sprayLive > 0) {
      let live = 0
      for (let i = 0; i < SPRAY; i++) {
        let life = sprayLife[i] as number
        if (life <= 0) continue
        life -= dt
        sprayLife[i] = life
        const glow = life > 0 ? (life / (sprayMax[i] as number)) * 0.5 : 0
        for (let j = 0; j < 3; j++) {
          const at = i * 3 + j
          const vel =
            ((sprayVel[at] as number) - (sprayUp[at] as number) * 12 * dt) * (1 - 1.5 * dt)
          sprayVel[at] = vel
          sprayPos[at] = (sprayPos[at] as number) + vel * dt
        }
        sprayCol[i * 4] = WATER_CREST.r
        sprayCol[i * 4 + 1] = WATER_CREST.g
        sprayCol[i * 4 + 2] = WATER_CREST.b
        sprayCol[i * 4 + 3] = glow
        if (life > 0) live++
      }
      sprayLive = live
      sprayPosAttr.needsUpdate = true
      sprayColAttr.needsUpdate = true
    }
  }

  const resize = () => {
    const w = stage.clientWidth
    const h = stage.clientHeight
    if (!w || !h) return
    still = 0
    renderer.setSize(w, h, false)
    composer.setSize(w, h)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  const ro = new ResizeObserver(resize)
  ro.observe(stage)
  resize()

  // Renders from the start, so the dark backdrop shows before a game hands over its frame.
  const timer = new THREE.Timer()
  let frame: ((dt: number) => void) | null = null
  renderer.setAnimationLoop((now) => {
    timer.update(now)
    const dt = Math.min(timer.getDelta(), 0.1)
    elapsed += dt
    frame?.(dt)
    // Paused, nothing is drawn and nothing moves: after a few frames to settle, the last
    // picture stays on screen instead of being rendered again every frame.
    const moving = drew || mode !== 'race' || padFlash > 0 || wallFlash > 0 || shake > 0
    animate(dt)
    still = moving ? 0 : still + 1
    if (still < STILL_FRAMES) composer.render(dt)
  })

  /** The menu's turntable on the grid, facing up the start straight. */
  const menuHeading = new THREE.Vector3(0, 1, 0)
  const placeMenu = (track: Track) => {
    const main = track.paths[0]
    if (!main) return
    const f = frameAt(main, main.length - MENU_GRID)
    turntable.position.set(f.p[0], f.p[1], f.p[2] + 0.06)
    menuHeading.set(f.t[0], f.t[1], 0).normalize()
  }

  let builtFor: Track | null = null
  const setTrack = (track: Track) => {
    // The menu builds the first track. A race that draws it again keeps those meshes.
    if (track !== builtFor) {
      if (built) {
        scene.remove(built.group)
        disposeObject(built.group)
      }
      built = buildTrackMeshes(track, time)
      builtFor = track
      scene.add(built.group)
      placeScenery(track, built.layout)
    }
    still = 0
    dustFresh = true
    followPath = null
    placeMenu(track)
    camFresh = true
    for (const v of views.values()) v.fresh = true
  }

  return {
    audio,
    setTrack,
    setShips(list) {
      clearShips()
      for (const s of list) {
        const root = shipMesh(s.ship, s.color)
        const parts = shipParts(root)
        const materials: ShipView['materials'] = []
        root.traverse((o) => {
          if (!(o instanceof THREE.Mesh)) return
          const m = o.material as THREE.Material
          if (!materials.some((x) => x.m === m)) {
            materials.push({ m, opacity: m.opacity, transparent: m.transparent })
          }
        })
        const trail = new THREE.Mesh(
          trailGeometry(),
          new THREE.MeshBasicMaterial({
            vertexColors: true,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
          }),
        )
        trail.frustumCulled = false
        const label = s.label ? labelSprite(s.label, s.color) : null
        fleet.add(root, trail)
        if (label) fleet.add(label)
        views.set(s.id, {
          id: s.id,
          root,
          parts,
          engine: parts.engine.color.clone(),
          // Trails are pale and faint in daylight: vapour, not neon.
          color: new THREE.Color(s.color).lerp(WHITE, 0.45).multiplyScalar(0.55),
          materials,
          faded: false,
          trail,
          history: new Float32Array(TRAIL * 6),
          head: 0,
          clock: 0,
          label,
          heading: new THREE.Vector3(),
          last: new THREE.Vector3(),
          bank: 0,
          up: new THREE.Vector3(0, 0, 1),
          path: 0,
          drawn: new THREE.Vector3(),
          pop: new THREE.Vector3(),
          spray: 0,
          fresh: true,
          seen: false,
        })
      }
    },
    showcase(ship) {
      // Before the first race there's no track yet: the menu opens on the first one's grid.
      if (!built) setTrack(TRACKS.coaster)
      let mesh = showcased.get(ship)
      if (!mesh) {
        mesh = shipMesh(ship, SHIPS[ship].color)
        // Ships are built y-up; the world is z-up.
        mesh.rotation.x = Math.PI / 2
        mesh.position.z = HOVER
        showcased.set(ship, mesh)
        turntable.add(mesh)
      }
      for (const m of showcased.values()) m.visible = m === mesh
      ringMaterial.color.set(SHIPS[ship].color).multiplyScalar(0.8)
      setMode('showcase')
    },
    draw(list, follow, dt) {
      if (!built) return
      setMode('race')
      const { paths } = built.layout
      for (const v of views.values()) v.seen = false
      drew = true
      heard = null
      nearby.length = 0
      for (const d of list) {
        const v = views.get(d.id)
        const path = paths[d.path]
        if (!v || !path) continue
        v.seen = true
        pose(v, d, path, dt)
        if (d.id === follow) {
          chase(d, dt)
          followPath = path
          followS = d.s
          heard = {
            speed: d.speed,
            boosting: d.boosting,
            accel: dt > 0 ? (d.speed - lastSpeed) / dt : 0,
            water: path.water[sampleIndex(path, d.s)] === 1,
            air: d.y > 0.3,
          }
          lastSpeed = d.speed
        } else if (!d.faded) {
          nearby.push({ id: d.id, at: v.root.position, speed: d.speed, boosting: d.boosting })
        }
      }
      for (const v of views.values()) {
        v.root.visible = v.seen
        v.trail.visible = v.seen
        if (v.label) v.label.visible = v.seen && v.id !== follow
        if (!v.seen) v.fresh = true
      }
    },
    pulse(kind) {
      if (kind === 'pad') {
        padFlash = 1
        audio.cue('pad')
      } else {
        wallFlash = 1
        shake = 1
      }
    },
    loop(f) {
      frame = f
    },
    dispose() {
      renderer.setAnimationLoop(null)
      ro.disconnect()
      clearShips()
      clearShowcase()
      if (built) disposeObject(built.group)
      built = null
      if (scenery) {
        disposeObject(scenery.group)
        disposeObject(scenery.props)
      }
      scenery = null
      for (const o of [spray, dust, flash, turntable]) disposeObject(o)
      readout.remove()
      audio.dispose()
      sky.material.dispose()
      dome.dispose()
      env?.dispose()
      pmrem.dispose()
      for (const pass of [renderPass, bloom, speedPass, output]) pass.dispose()
      composer.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}
