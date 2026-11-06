// The racer's sound, synthesised with the Web Audio API: no files. A deep thruster engine, a dark
// growl over a fluttering rumble, spooling up with the throttle; a boost roar; air rushing past louder the faster you go; spray on water; and short cues for pads,
// walls, landings, the countdown, laps, the finish and the menus. Other ships online are heard
// where they are, with a little Doppler as they pass. The music lives in race-music. Browsers
// keep audio off until a key is pressed, so nothing starts before unlock().

import { store, stored } from './race-board.ts'
import { clamp } from './race-math.ts'
import { biquad, type Mood, type Music, startMusic } from './race-music.ts'
import { FAST } from './race-rules.ts'

export type Cue =
  | 'count'
  | 'go'
  | 'pad'
  | 'boost'
  | 'land'
  | 'lap'
  | 'best'
  | 'finish'
  | 'tick'
  | 'pick'

/** The followed ship, each frame. accel is the change in speed per second. */
export type EngineState = {
  speed: number
  boosting: boolean
  accel: number
  water: boolean
  air: boolean
}

type Vec = { x: number; y: number; z: number }

/** Another ship, for positional sound. */
export type Heard = { id: number; at: Vec; speed: number; boosting: boolean }

export type RaceAudio = {
  /** Starts sound. Call it on every key: the first one is the gesture browsers wait for. */
  unlock(): void
  /** The followed ship's engine, wind and spray, or null for silence (menus, pauses). */
  engine(state: EngineState | null): void
  /** Other ships around a listener at the camera. */
  others(list: Heard[], ear: { at: Vec; forward: Vec; up: Vec }, dt: number): void
  /** A wall scrape or hit, strength 0 to 1 (the share of speed it cost). */
  wall(strength: number): void
  cue(kind: Cue): void
  /** Menus or racing, how fast, and whether paused: the music follows along. */
  mood(m: Mood): void
  readonly muted: boolean
  /** Turns the music off or on, remembered for next time. */
  toggleMusic(): void
  /** Turns sound off or on, remembered for next time. */
  toggleMute(): void
  dispose(): void
}

const MUTE_KEY = 'race-muted'
const MUSIC_KEY = 'race-music'
const MASTER = 0.5
/** Speed of sound for the Doppler shift, scaled down so a pass at racing speed is audible. */
const SOUND_SPEED = 260
const WALL_GAP = 0.09
/** The engine's level as a whole. Its parts are balanced inside it. */
const ENGINE = 0.95

function load(key: string, fallback: boolean) {
  const v = stored(key)
  return v === null ? fallback : v === '1'
}

const save = (key: string, on: boolean) => store(key, on ? '1' : '0')

/** Two seconds of white noise, looped by every noise voice. */
function noiseBuffer(ctx: AudioContext) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  return buf
}

/** A big, bright space for the cues: decaying stereo noise as an impulse response. */
function room(ctx: AudioContext, seconds: number) {
  const length = Math.floor(ctx.sampleRate * seconds)
  const buf = ctx.createBuffer(2, length, ctx.sampleRate)
  for (let c = 0; c < 2; c++) {
    const data = buf.getChannelData(c)
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3
  }
  const conv = ctx.createConvolver()
  conv.buffer = buf
  return conv
}

type Graph = ReturnType<typeof build>

function build(ctx: AudioContext, muted: boolean) {
  const master = ctx.createGain()
  master.gain.value = muted ? 0 : MASTER
  const squash = ctx.createDynamicsCompressor()
  squash.threshold.value = -16
  squash.ratio.value = 4
  squash.attack.value = 0.005
  squash.release.value = 0.2
  master.connect(squash).connect(ctx.destination)

  const reverb = room(ctx, 1.6)
  const wet = ctx.createGain()
  wet.gain.value = 0.28
  reverb.connect(wet).connect(master)
  /** Where one-shot cues go: dry, and a share into the room. */
  const cues = ctx.createGain()
  cues.connect(master)
  const send = ctx.createGain()
  send.gain.value = 0.6
  cues.connect(send).connect(reverb)

  const noise = noiseBuffer(ctx)
  const loop = () => {
    const src = ctx.createBufferSource()
    src.buffer = noise
    src.loop = true
    // Started at a random point, so two noise voices never line up.
    src.start(0, Math.random() * 2)
    return src
  }
  const gain = (v = 0) => {
    const g = ctx.createGain()
    g.gain.value = v
    return g
  }
  const osc = (type: OscillatorType, f: number) => {
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.value = f
    o.start()
    return o
  }

  // ---- the engine: a deep thruster ------------------------------------------------------------
  // Two low saws a hair apart, filtered dark, make the growl, and its pitch is the revs. A
  // flutter on the growl and the rumble, quicker as the revs climb, makes the throb. Beside them
  // a throaty band of noise that swells on the throttle, a sub tone for headphones, and a quiet
  // whine tuned to the growl's sixth harmonic so it blends in. Nearly all of it sits between 80
  // and 500 Hz: low enough not to get shrill, high enough for laptop speakers to play.
  const engineGain = gain(0)
  engineGain.connect(master)
  const engineSend = gain(0.08)
  engineGain.connect(engineSend).connect(reverb)
  // The flutter: the growl and the rumble pass through a gain an LFO swings around 1.
  const throb = gain(1)
  throb.connect(engineGain)
  const throbRate = osc('sine', 8)
  const throbDepth = gain(0.12)
  throbRate.connect(throbDepth).connect(throb.gain)

  const growlA = osc('sawtooth', 45)
  const growlB = osc('sawtooth', 45)
  const growlTone = biquad(ctx, 'lowpass', 150, 0.8)
  const growlSoft = biquad(ctx, 'lowpass', 220, 0.5)
  const growlGain = gain(0)
  growlA.connect(growlTone)
  growlB.connect(growlTone)
  growlTone.connect(growlSoft).connect(growlGain).connect(throb)

  const deep = biquad(ctx, 'lowpass', 110, 0.9)
  const deeper = biquad(ctx, 'lowpass', 140, 0.6)
  const rumbleGain = gain(0)
  loop().connect(deep).connect(deeper).connect(rumbleGain).connect(throb)

  const throat = biquad(ctx, 'bandpass', 120, 1.2)
  const throatGain = gain(0)
  loop().connect(throat).connect(throatGain).connect(engineGain)

  const sub = osc('sine', 45)
  const subGain = gain(0.035)
  sub.connect(subGain).connect(engineGain)
  // The hover: a slow wobble on the sub.
  const hover = osc('sine', 6.2)
  const hoverDepth = gain(0.012)
  hover.connect(hoverDepth).connect(subGain.gain)

  const whine = osc('sine', 270)
  const whineGain = gain(0)
  whine.connect(whineGain).connect(engineGain)

  // ---- boost: a roar of band-passed noise --------------------------------------------------------
  const roar = biquad(ctx, 'bandpass', undefined, 0.9)
  const boostGain = gain(0)
  loop().connect(roar).connect(boostGain).connect(master)

  // ---- wind and spray -------------------------------------------------------------------------
  const air = biquad(ctx, 'bandpass', undefined, 0.55)
  const windGain = gain(0)
  loop().connect(air).connect(windGain).connect(master)
  const hissFilter = biquad(ctx, 'highpass', 5000)
  const hissGain = gain(0)
  loop().connect(hissFilter).connect(hissGain).connect(master)
  const sprayFilter = biquad(ctx, 'highpass', 1800)
  const sprayGain = gain(0)
  loop().connect(sprayFilter).connect(sprayGain).connect(master)

  return {
    master,
    room: reverb,
    cues,
    noise,
    engine: {
      engineGain,
      throbRate,
      throbDepth,
      growlA,
      growlB,
      growlTone,
      growlSoft,
      growlGain,
      deep,
      deeper,
      rumbleGain,
      throat,
      throatGain,
      sub,
      whine,
      whineGain,
    },
    boost: { roar, boostGain },
    wind: { air, windGain, hissGain },
    sprayGain,
  }
}

type Voice = {
  growl: OscillatorNode
  whine: OscillatorNode
  tone: BiquadFilterNode
  gain: GainNode
  panner: PannerNode
  distance: number
}

export function createRaceAudio(): RaceAudio {
  let ctx: AudioContext | null = null
  let g: Graph | null = null
  let muted = load(MUTE_KEY, false)
  let musicOn = load(MUSIC_KEY, true)
  let music: Music | null = null
  let wasBoosting = false
  let revs = 0
  let lastTick = 0
  let lastWall = 0
  const voices = new Map<number, Voice>()
  const seen = new Set<number>()

  const now = () => ctx?.currentTime ?? 0
  /** Glides a parameter towards v over about tau seconds. */
  const glide = (p: AudioParam, v: number, tau = 0.06) => p.setTargetAtTime(v, now(), tau)
  // The engine is updated every frame, mostly to the targets it already has.
  const aimed = new WeakMap<AudioParam, number>()
  /** A glide, skipped when the target is within a hair of the last one given. */
  const aim = (p: AudioParam, v: number, tau = 0.06) => {
    const was = aimed.get(p)
    if (was !== undefined && Math.abs(v - was) <= 0.002 * Math.abs(was) + 1e-5) return
    aimed.set(p, v)
    glide(p, v, tau)
  }

  const onVisible = () => {
    if (!ctx) return
    if (document.hidden) void ctx.suspend()
    else void ctx.resume()
  }

  /** A short tone with a fast attack and an exponential fall, optionally gliding to glideTo. */
  const tone = (
    f: number,
    seconds: number,
    type: OscillatorType,
    level: number,
    delay = 0,
    glideTo?: number,
  ) => {
    if (!ctx || !g) return
    const t = now() + delay
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(f, t)
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + seconds)
    const env = ctx.createGain()
    env.gain.setValueAtTime(0.0001, t)
    env.gain.exponentialRampToValueAtTime(level, t + 0.006)
    env.gain.exponentialRampToValueAtTime(0.0001, t + seconds)
    o.connect(env).connect(g.cues)
    o.start(t)
    o.stop(t + seconds + 0.05)
  }

  /** A burst of filtered noise, its filter optionally sweeping to sweepTo. */
  const burst = (
    seconds: number,
    type: BiquadFilterType,
    f: number,
    level: number,
    sweepTo?: number,
    q = 1,
  ) => {
    if (!ctx || !g) return
    const t = now()
    const src = ctx.createBufferSource()
    src.buffer = g.noise
    const filter = biquad(ctx, type, undefined, q)
    filter.frequency.setValueAtTime(f, t)
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, t + seconds)
    const env = ctx.createGain()
    env.gain.setValueAtTime(0.0001, t)
    env.gain.exponentialRampToValueAtTime(level, t + 0.01)
    env.gain.exponentialRampToValueAtTime(0.0001, t + seconds)
    src.connect(filter).connect(env).connect(g.cues)
    src.start(t, Math.random() * 1.5)
    src.stop(t + seconds + 0.05)
  }

  const silence = () => {
    if (!g) return
    aim(g.engine.engineGain.gain, 0, 0.12)
    aim(g.boost.boostGain.gain, 0, 0.12)
    aim(g.wind.windGain.gain, 0, 0.12)
    aim(g.wind.hissGain.gain, 0, 0.12)
    aim(g.sprayGain.gain, 0, 0.12)
    wasBoosting = false
    // Back from a pause or a menu, the turbine spools up again.
    revs = 0
  }

  const voice = (id: number): Voice | null => {
    if (!ctx || !g) return null
    const existing = voices.get(id)
    if (existing) return existing
    // The same thruster as yours, simpler: one dark saw growl and its quiet whine.
    const growl = ctx.createOscillator()
    growl.type = 'sawtooth'
    const whine = ctx.createOscillator()
    whine.type = 'sine'
    const tone = biquad(ctx, 'lowpass', 300, 0.7)
    const gain = ctx.createGain()
    gain.gain.value = 0
    const whineGain = ctx.createGain()
    whineGain.gain.value = 0.12
    const panner = ctx.createPanner()
    panner.panningModel = 'HRTF'
    panner.distanceModel = 'inverse'
    panner.refDistance = 6
    panner.maxDistance = 600
    panner.rolloffFactor = 1.3
    growl.connect(tone)
    whine.connect(whineGain).connect(tone)
    tone.connect(gain).connect(panner).connect(g.master)
    growl.start()
    whine.start()
    const v = { growl, whine, tone, gain, panner, distance: -1 }
    voices.set(id, v)
    return v
  }

  const cue = (kind: Cue) => {
    if (!ctx) return
    switch (kind) {
      case 'count':
        tone(660, 0.16, 'square', 0.09)
        tone(1320, 0.16, 'sine', 0.06)
        break
      case 'go':
        tone(880, 0.55, 'square', 0.1)
        tone(1320, 0.55, 'sine', 0.08)
        tone(1760, 0.5, 'triangle', 0.06)
        break
      case 'pad':
        // A rising charge and a shimmer.
        tone(220, 0.32, 'sawtooth', 0.12, 0, 990)
        tone(440, 0.28, 'square', 0.05, 0.02, 1760)
        burst(0.3, 'highpass', 3000, 0.1, 7000)
        break
      case 'boost':
        // A whoosh falling into the roar, and a kick underneath.
        burst(0.6, 'bandpass', 1600, 0.16, 220, 1.2)
        tone(55, 0.5, 'sine', 0.35, 0, 110)
        break
      case 'land':
        tone(70, 0.32, 'sine', 0.55, 0, 38)
        burst(0.22, 'lowpass', 600, 0.3, 150)
        break
      case 'lap':
        tone(988, 0.2, 'triangle', 0.14)
        tone(1319, 0.34, 'triangle', 0.14, 0.12)
        break
      case 'best':
        tone(988, 0.18, 'triangle', 0.14)
        tone(1319, 0.18, 'triangle', 0.14, 0.1)
        tone(1760, 0.42, 'triangle', 0.14, 0.2)
        break
      case 'finish':
        for (const [i, f] of [523, 659, 784, 1047].entries()) {
          tone(f, 0.22, 'triangle', 0.13, i * 0.11)
        }
        tone(1047, 1.2, 'sine', 0.1, 0.44)
        tone(1568, 1.2, 'sine', 0.06, 0.44)
        break
      case 'tick':
        tone(1800, 0.035, 'square', 0.035)
        break
      case 'pick':
        tone(1200, 0.06, 'square', 0.05)
        tone(1800, 0.09, 'square', 0.045, 0.06)
        break
    }
  }

  const drop = (id: number) => {
    const v = voices.get(id)
    if (!v) return
    v.growl.stop()
    v.whine.stop()
    v.panner.disconnect()
    voices.delete(id)
  }

  return {
    unlock() {
      if (!ctx) {
        const Ctx =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (!Ctx) return
        try {
          ctx = new Ctx()
          g = build(ctx, muted)
          music = startMusic(ctx, g.master, g.room, g.noise)
          music.setOn(musicOn && !muted)
        } catch {
          // No audio on this device. The game plays on in silence.
          ctx = null
          g = null
          music = null
          return
        }
        document.addEventListener('visibilitychange', onVisible)
      }
      if (ctx.state === 'suspended' && !document.hidden) void ctx.resume()
    },

    engine(state) {
      if (!g || !ctx) return
      if (!state) {
        silence()
        return
      }
      const e = g.engine
      const k = clamp(state.speed / FAST, 0, 1.3)
      const push = clamp(state.accel / 20, 0, 1)
      // The revs run ahead of the speed on the throttle and fall back slowly when it's let go:
      // the spool-up is most of what makes a throttle feel good.
      const t = now()
      const dt = clamp(t - lastTick, 0, 0.1)
      lastTick = t
      const want = k + 0.2 * push + (state.boosting ? 0.18 : 0)
      revs += (want - revs) * (1 - Math.exp(-dt / (want > revs ? 0.22 : 0.7)))
      const f = 40 + 45 * revs
      aim(e.growlA.frequency, f, 0.03)
      aim(e.growlB.frequency, f * 1.013, 0.03)
      aim(e.growlTone.frequency, 180 + 320 * revs, 0.05)
      aim(e.growlSoft.frequency, 250 + 450 * revs, 0.05)
      aim(e.growlGain.gain, 0.05 + 0.04 * revs + 0.03 * push, 0.08)
      aim(e.throbRate.frequency, 8 + 14 * revs, 0.1)
      aim(e.throbDepth.gain, 0.12 + 0.2 * push + (state.boosting ? 0.1 : 0), 0.1)
      aim(e.deep.frequency, 90 + 200 * revs, 0.1)
      aim(e.deeper.frequency, 120 + 260 * revs, 0.1)
      aim(e.rumbleGain.gain, 0.4 + 0.3 * revs, 0.1)
      aim(e.throat.frequency, 110 + 300 * revs, 0.06)
      aim(e.throatGain.gain, 0.06 + 0.08 * revs + 0.1 * push, 0.08)
      aim(e.sub.frequency, f, 0.05)
      aim(e.whine.frequency, f * 6, 0.03)
      aim(e.whineGain.gain, 0.004 + 0.008 * revs + (state.boosting ? 0.006 : 0))
      aim(e.engineGain.gain, ENGINE, 0.15)

      aim(g.boost.roar.frequency, 150 + 250 * k)
      aim(g.boost.boostGain.gain, state.boosting ? 0.1 : 0, state.boosting ? 0.06 : 0.2)
      if (state.boosting && !wasBoosting) cue('boost')
      wasBoosting = state.boosting

      // Air: barely there at cruising pace, a dark rush near the top.
      aim(g.wind.air.frequency, 220 + 1000 * k, 0.1)
      aim(g.wind.windGain.gain, 0.26 * k * k * (state.air ? 1.3 : 1), 0.12)
      aim(g.wind.hissGain.gain, 0.025 * clamp(k - 0.5, 0, 1) ** 2 * 4, 0.12)
      aim(g.sprayGain.gain, state.water && !state.air ? 0.22 * k : 0, 0.08)
    },

    others(list, ear, dt) {
      // Solo, and online with nobody else on the road, there's nothing to place.
      if (!ctx || !g || (list.length === 0 && voices.size === 0)) return
      const l = ctx.listener
      if (l.positionX) {
        l.positionX.value = ear.at.x
        l.positionY.value = ear.at.y
        l.positionZ.value = ear.at.z
        l.forwardX.value = ear.forward.x
        l.forwardY.value = ear.forward.y
        l.forwardZ.value = ear.forward.z
        l.upX.value = ear.up.x
        l.upY.value = ear.up.y
        l.upZ.value = ear.up.z
      } else {
        l.setPosition(ear.at.x, ear.at.y, ear.at.z)
        l.setOrientation(ear.forward.x, ear.forward.y, ear.forward.z, ear.up.x, ear.up.y, ear.up.z)
      }
      seen.clear()
      for (const h of list) {
        const v = voice(h.id)
        if (!v) continue
        seen.add(h.id)
        const p = v.panner
        if (p.positionX) {
          p.positionX.value = h.at.x
          p.positionY.value = h.at.y
          p.positionZ.value = h.at.z
        } else p.setPosition(h.at.x, h.at.y, h.at.z)
        const d = Math.hypot(h.at.x - ear.at.x, h.at.y - ear.at.y, h.at.z - ear.at.z)
        // Closing in raises the pitch, pulling away lowers it.
        const closing = v.distance < 0 || dt <= 0 ? 0 : (v.distance - d) / dt
        v.distance = d
        const doppler = clamp(SOUND_SPEED / (SOUND_SPEED - clamp(closing, -120, 120)), 0.7, 1.5)
        const k = clamp(h.speed / FAST, 0, 1.3)
        const f = (40 + 45 * k + (h.boosting ? 10 : 0)) * doppler
        glide(v.growl.frequency, f, 0.04)
        glide(v.whine.frequency, f * 6, 0.04)
        glide(v.tone.frequency, 260 + 400 * k, 0.1)
        glide(v.gain.gain, 0.08 + 0.06 * k, 0.1)
      }
      for (const id of voices.keys()) if (!seen.has(id)) drop(id)
    },

    wall(strength) {
      if (!ctx || strength <= 0.01) return
      const t = now()
      if (t - lastWall < WALL_GAP) return
      lastWall = t
      const s = clamp(strength * 3, 0, 1)
      // A grinding scrape, and a thud when it's a real hit.
      burst(0.16, 'bandpass', 2600, 0.08 + 0.25 * s, 900, 6)
      burst(0.2, 'lowpass', 1200, 0.1 + 0.35 * s, 300)
      if (s > 0.35) tone(95, 0.28, 'sine', 0.5 * s, 0, 45)
    },

    cue,

    mood(m) {
      music?.mood(m)
    },

    get muted() {
      return muted
    },

    toggleMusic() {
      musicOn = !musicOn
      save(MUSIC_KEY, musicOn)
      music?.setOn(musicOn && !muted)
    },

    toggleMute() {
      muted = !muted
      save(MUTE_KEY, muted)
      if (g) glide(g.master.gain, muted ? 0 : MASTER, 0.05)
      // Muted, the music stops building notes nobody hears.
      music?.setOn(musicOn && !muted)
    },

    dispose() {
      document.removeEventListener('visibilitychange', onVisible)
      for (const id of [...voices.keys()]) drop(id)
      music?.stop()
      music = null
      void ctx?.close()
      ctx = null
      g = null
    },
  }
}
