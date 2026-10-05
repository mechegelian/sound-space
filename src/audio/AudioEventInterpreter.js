import { smoothValue } from './AudioAnalyzer.js'
import AudioDirection from './AudioDirection.js'
const FEATURE_KEYS = ['low', 'mid', 'high', 'energy']
const SOURCE_KEYS = ['bass', 'mid', 'high', 'energy']

// A visual vocabulary, not genre classification. All event scheduling and
// audio-to-world decisions live here; renderers only consume these outputs.
export default class AudioEventInterpreter {
  constructor() {
    this.state = 'CALM'
    this.candidate = 'CALM'
    this.candidateAge = 0
    this.stateAge = 0
    this.sustain = 0
    this.structureCooldown = 0
    this.eventCooldown = 0
    this.lastTransient = 0
    this.lastFile = null
    this.lastPlaybackTime = 0
    this.epoch = 0
    this.direction = new AudioDirection()
    this.features = { low: 0, mid: 0, high: 0, energy: 0, flow: 0, compression: 0, texture: 0, turbulence: 0, exposure: 0.14, playing: false }
    this.event = { id: 0, strength: 0, kind: 'TEXTURE', burst: false, age: Infinity }
    this.structure = { id: 0, kind: 'mid', strength: 0, pair: false }
  }

  update(mapping, transport, delta) {
    const dt = Math.min(0.1, Math.max(0, delta))
    const audio = transport.audio
    const playing = !!audio && !audio.paused && !audio.ended && !audio.seeking && audio.readyState >= 2 && transport.context?.state === 'running'
    const playbackTime = audio?.currentTime || 0
    const changed = transport.objectUrl !== this.lastFile || Math.abs(playbackTime - this.lastPlaybackTime) > 0.75
    if (changed) {
      this.epoch++
      this.sustain = 0
      this.structureCooldown = 1.2
      // Decoder warm-up can briefly read silence before the first real sample.
      // Do not mistake that transport transition for a natural acoustic event.
      this.eventCooldown = 0.4
      this.lastTransient = mapping.transient.id
    }
    this.lastFile = transport.objectUrl
    this.lastPlaybackTime = playbackTime
    this.direction.update(mapping, playing, changed, dt)
    const f = this.features, v = mapping.values
    for (let i = 0; i < FEATURE_KEYS.length; i++) {
      const key = FEATURE_KEYS[i]
      f[key] = smoothValue(f[key], playing ? v[SOURCE_KEYS[i]] : 0, dt, 0.45, 0.9)
    }
    f.playing = playing
    f.flow = smoothValue(f.flow, Math.min(1, f.mid * 1.1 + f.low * 0.4), dt, 0.8, 1.4)
    f.compression = smoothValue(f.compression, f.low * f.low, dt, 0.6, 1.2)
    f.texture = smoothValue(f.texture, f.high, dt, 0.35, 0.8)
    f.turbulence = smoothValue(f.turbulence, Math.max(0, f.energy - 0.36) * (f.mid + f.high), dt, 0.6, 0.8)
    f.exposure = smoothValue(f.exposure, 0.14 + f.energy * 0.36, dt, 0.9, 0.7)

    let desired = 'FLOW'
    if (f.energy < (this.state === 'CALM' ? 0.1 : 0.06)) desired = 'CALM'
    else if (f.energy > 0.53 && f.low + f.mid > 0.7) desired = 'BUILD'
    else if (f.high > Math.max(f.low, f.mid) * 1.18) desired = 'TEXTURE'
    if (desired !== this.candidate) { this.candidate = desired; this.candidateAge = 0 }
    this.candidateAge += dt; this.stateAge += dt
    if (this.candidateAge > 0.8 && this.stateAge > 1.3) {
      if (this.state !== desired) this.stateAge = 0
      this.state = desired
    }

    this.structureCooldown = Math.max(0, this.structureCooldown - dt)
    this.eventCooldown = Math.max(0, this.eventCooldown - dt)
    this.event.age += dt
    const meaningful = (mapping.targets || v).energy > 0.16
    this.sustain = Math.max(0, this.sustain + (playing && meaningful && f.energy > 0.16 ? dt : -dt * 2))
    if (this.sustain > 0.55 && this.structureCooldown === 0 && playing && this.direction.release < 0.4) {
      const s = this.structure
      s.id++
      s.kind = f.low > f.mid && f.low > f.high ? 'low' : f.high > f.mid * 1.2 ? 'high' : 'mid'
      s.strength = Math.min(1, f.energy * 1.15)
      s.pair = f.energy > 0.49 && f.low + f.mid > 0.58
      s.intensity = this.direction.intensity
      // <= 36% of the old interval, with deterministic variable spacing.
      const previousInterval = s.pair ? 5.8 : 6.5 + (1 - f.energy) * 3
      this.structureCooldown = previousInterval / 3.2 * (0.85 + (s.id * 0.61803398875 % 1) * 0.3)
      this.sustain = 0
    }
    const onset = mapping.transient
    if (onset.id !== this.lastTransient) {
      this.lastTransient = onset.id
      if (playing && !changed && onset.age < 0.25 && onset.strength > 0.14 && this.eventCooldown === 0) {
        this.event.id++
        this.event.strength = onset.strength
        this.event.kind = onset.strength > 0.62 ? 'IMPACT' : 'TRANSIENT'
        this.event.burst = onset.strength > 0.5 || (onset.high > 0.45 && this.event.id % 2 === 0)
        this.event.high = onset.high
        this.event.age = 0
        this.eventCooldown = onset.strength > 0.62 ? 0.22 : 0.30
      }
    }
    return this.features
  }
}
