// The racer's music, composed here and played by a small sequencer on the Web Audio clock: no
// files. Driving electronic at 132 bpm in A minor over a 16-bar chord loop: kick, clap, hats, a
// side-chained bass, a wide pad and a delayed arpeggio, arranged in a 32-bar cycle (intro, drive,
// breakdown, build with a riser). In the menus only the pad and arpeggio play; racing brings the
// whole band in, and a filter over the mix opens with speed and closes while paused.

export type Mood = {
  /** Racing, not in a menu. */
  racing: boolean
  /** Speed as a share of the fastest, 0 to about 1.2. */
  pace: number
  /** The race is paused: everything goes muffled. */
  paused: boolean
}

export type Music = {
  mood(m: Mood): void
  setOn(on: boolean): void
  stop(): void
}

const BPM = 132
const STEP = 60 / BPM / 4
const LOOKAHEAD = 0.3
const TICK_MS = 50
const LEVEL = 0.8
/** Each pad voice's level. */
const PAD = 0.07

/** Root for the bass, and the chord's notes for the pad and arpeggio, as MIDI numbers. */
type Chord = { root: number; notes: number[] }
const CHORDS: Chord[] = [
  { root: 45, notes: [57, 60, 64] }, // A minor
  { root: 41, notes: [53, 57, 60] }, // F
  { root: 48, notes: [55, 60, 64] }, // C
  { root: 43, notes: [55, 59, 62] }, // G
  { root: 45, notes: [57, 60, 64] }, // A minor
  { root: 41, notes: [53, 57, 60] }, // F
  { root: 38, notes: [57, 62, 65] }, // D minor
  { root: 40, notes: [56, 59, 64] }, // E
]
// Each chord lasts two bars.
const BARS_PER_CHORD = 2

// One bar of sixteenths for each part. 1 plays; for the bass, 2 plays an octave up.
const BASS = [1, 0, 0, 1, 0, 0, 2, 0, 1, 0, 1, 1, 0, 0, 2, 0]
const KICK = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]
const CLAP = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0]
const HAT = [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1]
const OPEN = [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0]
// Which chord tone the arpeggio plays on each sixteenth: 0 to 2 the chord, 3 and up an octave on.
const ARP = [0, 1, 2, 3, 2, 1, 4, 3, 0, 2, 3, 5, 4, 2, 3, 1]

/** What plays in each bar of the 32-bar cycle. */
function section(bar: number) {
  const b = bar % 32
  if (b < 8)
    return { drums: b >= 4 ? 0.5 : 0, kick: b >= 4, bass: b >= 4, roll: false, riser: b === 7 }
  if (b < 24) return { drums: 1, kick: true, bass: true, roll: false, riser: b === 23 }
  if (b < 28) return { drums: 0, kick: false, bass: true, roll: false, riser: false }
  return { drums: 1, kick: true, bass: false, roll: b === 31, riser: b >= 30 }
}

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12)

/** A filter with only the values given set: the rest are automated or left at their defaults. */
export function biquad(ctx: BaseAudioContext, type: BiquadFilterType, f?: number, q?: number) {
  const b = ctx.createBiquadFilter()
  b.type = type
  if (f !== undefined) b.frequency.value = f
  if (q !== undefined) b.Q.value = q
  return b
}

export function startMusic(
  ctx: AudioContext,
  out: AudioNode,
  room: AudioNode,
  noise: AudioBuffer,
): Music {
  // ---- buses ----------------------------------------------------------------------------------
  const level = ctx.createGain()
  level.gain.value = 0
  const tone = biquad(ctx, 'lowpass', 2400, 0.7)
  tone.connect(level).connect(out)
  const roomSend = ctx.createGain()
  roomSend.gain.value = 0.35
  roomSend.connect(room)

  const gain = (v: number) => {
    const g = ctx.createGain()
    g.gain.value = v
    return g
  }
  const wet = (from: AudioNode, v: number) => from.connect(gain(v)).connect(roomSend)
  // The pad and bass go through duck, which dips on every kick so the kick punches through.
  const duck = gain(1)
  duck.connect(tone)
  const drums = gain(0)
  drums.connect(tone)
  const bass = gain(0)
  bass.connect(duck)
  const pad = gain(0.5)
  pad.connect(duck)
  wet(pad, 0.8)
  const arp = gain(0.45)
  arp.connect(tone)
  wet(arp, 0.5)

  // A dotted-eighth echo on the arpeggio.
  const echo = ctx.createDelay(1)
  echo.delayTime.value = STEP * 3
  const feedback = ctx.createGain()
  feedback.gain.value = 0.38
  const echoTone = biquad(ctx, 'lowpass', 2800)
  arp.connect(echo)
  echo.connect(echoTone).connect(feedback).connect(echo)
  const echoOut = ctx.createGain()
  echoOut.gain.value = 0.5
  echoTone.connect(echoOut).connect(tone)

  // ---- voices -----------------------------------------------------------------------------------
  const env = (t: number, peak: number, attack: number, release: number) => {
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(peak, t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + release)
    return g
  }
  const osc = (type: OscillatorType, f: number, t: number, stop: number, detune = 0) => {
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(f, t)
    o.detune.value = detune
    o.start(t)
    o.stop(stop)
    return o
  }
  const hiss = (t: number, stop: number) => {
    const s = ctx.createBufferSource()
    s.buffer = noise
    s.start(t, Math.random() * 1.5)
    s.stop(stop)
    return s
  }

  const kick = (t: number, gain: number) => {
    const o = osc('sine', 150, t, t + 0.4)
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12)
    o.connect(env(t, 0.9 * gain, 0.003, 0.34)).connect(drums)
    duck.gain.cancelScheduledValues(t)
    duck.gain.setValueAtTime(0.35, t)
    duck.gain.linearRampToValueAtTime(1, t + STEP * 3)
  }
  const clap = (t: number, gain: number) => {
    const f = biquad(ctx, 'bandpass', 1700, 0.9)
    hiss(t, t + 0.3)
      .connect(f)
      .connect(env(t, 0.5 * gain, 0.002, 0.2))
      .connect(drums)
    osc('triangle', 190, t, t + 0.12)
      .connect(env(t, 0.25 * gain, 0.002, 0.09))
      .connect(drums)
  }
  const hat = (t: number, open: boolean, gain: number) => {
    const f = biquad(ctx, 'highpass', 7500)
    const length = open ? 0.22 : 0.045
    hiss(t, t + length + 0.05)
      .connect(f)
      .connect(env(t, (open ? 0.14 : 0.18) * gain, 0.002, length))
      .connect(drums)
  }
  const bassNote = (t: number, midi: number, steps: number) => {
    const end = t + STEP * steps
    const f = biquad(ctx, 'lowpass', undefined, 7)
    f.frequency.setValueAtTime(180, t)
    f.frequency.exponentialRampToValueAtTime(1500, t + 0.02)
    f.frequency.exponentialRampToValueAtTime(260, end)
    const g = env(t, 0.42, 0.005, STEP * steps)
    osc('sawtooth', hz(midi), t, end + 0.05).connect(f)
    osc('square', hz(midi - 12), t, end + 0.05).connect(f)
    f.connect(g).connect(bass)
  }
  const padChord = (t: number, chord: Chord, seconds: number) => {
    const f = biquad(ctx, 'lowpass', 1500)
    // Swells in, holds, and fades under the next chord, so the pad never drops out.
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(PAD, t + 0.35)
    g.gain.setValueAtTime(PAD, t + seconds)
    g.gain.setTargetAtTime(0, t + seconds, 0.25)
    for (const n of chord.notes) {
      for (const d of [-9, 9]) osc('sawtooth', hz(n), t, t + seconds + 1.5, d).connect(f)
    }
    f.connect(g).connect(pad)
  }
  const pluck = (t: number, midi: number, gain: number) => {
    const f = biquad(ctx, 'lowpass')
    f.frequency.setValueAtTime(3800, t)
    f.frequency.exponentialRampToValueAtTime(900, t + 0.14)
    osc('square', hz(midi), t, t + 0.2).connect(f)
    f.connect(env(t, 0.1 * gain, 0.003, 0.15)).connect(arp)
  }
  /** A bar of noise sweeping up into the next section. */
  const riser = (t: number) => {
    const length = STEP * 16
    const f = biquad(ctx, 'bandpass', undefined, 2)
    f.frequency.setValueAtTime(400, t)
    f.frequency.exponentialRampToValueAtTime(9000, t + length)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.16, t + length)
    g.gain.linearRampToValueAtTime(0.0001, t + length + 0.05)
    hiss(t, t + length + 0.1)
      .connect(f)
      .connect(g)
      .connect(arp)
  }

  // ---- the sequencer ----------------------------------------------------------------------------
  let step = 0
  let next = ctx.currentTime + 0.1
  let racing = false
  let on = true

  const play = (n: number, t: number) => {
    const bar = Math.floor(n / 16)
    const s = n % 16
    const chord = CHORDS[Math.floor(bar / BARS_PER_CHORD) % CHORDS.length] as Chord
    const part = section(bar)
    const band = racing ? 1 : 0
    if (s === 0 && bar % BARS_PER_CHORD === 0) padChord(t, chord, STEP * 16 * BARS_PER_CHORD)
    if (s === 0 && part.riser && band) riser(t)
    const tones = [...chord.notes, ...chord.notes.map((x) => x + 12)]
    const arpNote = tones[ARP[s] as number]
    if (arpNote !== undefined) pluck(t, arpNote, s % 4 === 0 ? 1 : 0.7)
    if (!band) return
    if (part.kick && KICK[s]) kick(t, 1)
    if (part.drums && CLAP[s]) clap(t, part.drums)
    if (part.roll && s >= 8) clap(t, 0.35 + (s - 8) * 0.08)
    if (part.drums && HAT[s]) hat(t, OPEN[s] === 1, part.drums)
    else if (part.drums && s % 2 === 1) hat(t, false, 0.4 * part.drums)
    const b = BASS[s]
    if (part.bass && b) bassNote(t, chord.root + (b === 2 ? 12 : 0), s === 0 ? 2 : 1)
  }

  const timer = setInterval(() => {
    if (ctx.state !== 'running') return
    // After a stall (a hidden tab, a long frame), pick up from now instead of catching up.
    if (next < ctx.currentTime) next = ctx.currentTime + 0.05
    while (next < ctx.currentTime + LOOKAHEAD) {
      // Off, the bars still count on, but no voices are built for a silent bus.
      if (on) play(step, next)
      step++
      next += STEP
    }
  }, TICK_MS)

  const glide = (p: AudioParam, v: number, tau: number) =>
    p.setTargetAtTime(v, ctx.currentTime, tau)
  let last: Mood = { racing: false, pace: -1, paused: false }

  return {
    mood(m) {
      // Called every frame: only a real change touches the mix.
      if (
        m.racing === last.racing &&
        m.paused === last.paused &&
        Math.abs(m.pace - last.pace) < 0.02
      ) {
        return
      }
      last = { ...m }
      racing = m.racing
      glide(drums.gain, m.racing ? 0.9 : 0, 0.6)
      glide(bass.gain, m.racing ? 0.75 : 0, 0.6)
      glide(arp.gain, m.racing ? 0.45 : 0.35, 0.6)
      // Muffled in menus and while paused; opens with speed while racing.
      const open = m.paused ? 700 : m.racing ? 3500 + 14000 * Math.min(1, m.pace) ** 1.5 : 2400
      glide(tone.frequency, open, m.paused ? 0.15 : 0.4)
      glide(level.gain, on ? LEVEL * (m.paused ? 0.6 : 1) : 0, 0.3)
    },
    setOn(value) {
      on = value
      glide(level.gain, on ? LEVEL : 0, 0.2)
    },
    stop() {
      clearInterval(timer)
      level.disconnect()
    },
  }
}
