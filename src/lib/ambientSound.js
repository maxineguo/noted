// Generates focus/ambient audio purely with the Web Audio API. No external audio files —
// which means no hosting cost, no broken links, and it keeps working offline.

let audioCtx = null
let active = null // { chain: AudioNode[], gainNode, timers: number[] }

const PRESET_GAIN_MULTIPLIER = {
  'white-noise': 0.32,
  rain: 0.4,
  forest: 0.7,
  lofi: 1,
}

function getCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  return audioCtx
}

function makeNoiseBuffer(ctx, seconds = 4) {
  const size = Math.floor(ctx.sampleRate * seconds)
  const buffer = ctx.createBuffer(1, size, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1
  return buffer
}

function noiseSource(ctx) {
  const src = ctx.createBufferSource()
  src.buffer = makeNoiseBuffer(ctx)
  src.loop = true
  return src
}

// Short chirps for the forest bed.
function scheduleChirps(ctx, destination, timers) {
  function chirpOnce() {
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    const startFreq = 1800 + Math.random() * 1400
    osc.type = 'sine'
    osc.frequency.setValueAtTime(startFreq, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(startFreq * (Math.random() > 0.5 ? 1.4 : 0.7), ctx.currentTime + 0.12)
    g.gain.setValueAtTime(0, ctx.currentTime)
    g.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.02)
    g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.18)
    osc.connect(g)
    g.connect(destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.2)
    timers.push(setTimeout(chirpOnce, 2500 + Math.random() * 5000))
  }
  timers.push(setTimeout(chirpOnce, 1500))
}

// Individual droplet "plips" — this, layered under quiet filtered noise, is what actually
// reads as rain rather than generic static.
function scheduleRaindrops(ctx, destination, timers) {
  function drop() {
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    const freq = 500 + Math.random() * 1400
    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(Math.max(80, freq * 0.5), ctx.currentTime + 0.05)
    const peak = 0.05 + Math.random() * 0.06
    g.gain.setValueAtTime(0.0001, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(peak, ctx.currentTime + 0.004)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.09)
    osc.connect(g)
    g.connect(destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.12)
    timers.push(setTimeout(drop, 40 + Math.random() * 160))
  }
  drop()
}

// A slow, soft chord loop — actual musical content instead of filtered noise — plus a very
// quiet noise layer underneath for warmth/texture.
const LOFI_CHORDS = [
  [220, 261.63, 329.63], // Am
  [174.61, 220, 261.63], // F
  [196, 246.94, 293.66], // G
  [130.81, 164.81, 196], // C
]
function scheduleLofiChords(ctx, destination, timers) {
  let index = 0
  const chordSeconds = 3.6
  function playChord() {
    const chord = LOFI_CHORDS[index % LOFI_CHORDS.length]
    index += 1
    const chordGain = ctx.createGain()
    chordGain.gain.setValueAtTime(0.0001, ctx.currentTime)
    chordGain.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 0.9)
    chordGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + chordSeconds)
    chordGain.connect(destination)
    chord.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      osc.type = 'triangle'
      osc.frequency.value = freq * (i === 0 ? 0.5 : 1) // root note dropped an octave for warmth
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 1100
      osc.connect(filter)
      filter.connect(chordGain)
      osc.start()
      osc.stop(ctx.currentTime + chordSeconds + 0.1)
    })
    timers.push(setTimeout(playChord, chordSeconds * 1000))
  }
  playChord()
}

const BUILDERS = {
  'white-noise': (ctx) => {
    const src = noiseSource(ctx)
    return { input: src, chain: [src] }
  },
  rain: (ctx, destination, timers) => {
    const src = noiseSource(ctx)
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 4200
    filter.Q.value = 0.5
    const noiseGain = ctx.createGain()
    noiseGain.gain.value = 0.4 // noise bed sits under the droplets, not the main event
    src.connect(filter)
    filter.connect(noiseGain)
    scheduleRaindrops(ctx, destination, timers)
    return { input: noiseGain, chain: [src] }
  },
  forest: (ctx, destination, timers) => {
    const src = noiseSource(ctx)
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 700
    src.connect(filter)
    scheduleChirps(ctx, destination, timers)
    return { input: filter, chain: [src] }
  },
  lofi: (ctx, destination, timers) => {
    const src = noiseSource(ctx)
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 1800
    const noiseGain = ctx.createGain()
    noiseGain.gain.value = 0.06 // just a whisper of vinyl-like texture under the chords
    src.connect(filter)
    filter.connect(noiseGain)
    scheduleLofiChords(ctx, destination, timers)
    return { input: noiseGain, chain: [src] }
  },
}

export function isAmbientSupported() {
  return typeof window !== 'undefined' && !!(window.AudioContext || window.webkitAudioContext)
}

export function stopAmbient() {
  if (active) {
    active.timers.forEach((t) => clearTimeout(t))
    try {
      active.chain[0]?.stop()
    } catch {
      /* already stopped */
    }
    active = null
  }
}

export function playAmbient(kind, volume = 0.5) {
  stopAmbient()
  if (!kind || kind === 'silence' || !BUILDERS[kind] || !isAmbientSupported()) return
  const ctx = getCtx()
  if (ctx.state === 'suspended') ctx.resume()
  const gainNode = ctx.createGain()
  gainNode.gain.value = volume * (PRESET_GAIN_MULTIPLIER[kind] ?? 1)
  const timers = []
  const { input, chain } = BUILDERS[kind](ctx, gainNode, timers)
  input.connect(gainNode)
  gainNode.connect(ctx.destination)
  chain[0].start()
  active = { chain, gainNode, timers, kind }
}

export function setAmbientVolume(volume) {
  if (active?.gainNode) active.gainNode.gain.value = volume * (PRESET_GAIN_MULTIPLIER[active.kind] ?? 1)
}

// A few short beeps when the study timer finishes.
export function playTimerFinishedChime() {
  if (!isAmbientSupported()) return
  const ctx = getCtx()
  if (ctx.state === 'suspended') ctx.resume()
  const beepAt = [0, 0.35, 0.7]
  beepAt.forEach((delay) => {
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 880
    g.gain.setValueAtTime(0.0001, ctx.currentTime + delay)
    g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + delay + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + 0.28)
    osc.connect(g)
    g.connect(ctx.destination)
    osc.start(ctx.currentTime + delay)
    osc.stop(ctx.currentTime + delay + 0.3)
  })
}
