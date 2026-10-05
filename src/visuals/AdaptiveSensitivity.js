import { bandEnergy, smoothValue, waveformRms } from '../audio/AudioAnalyzer.js'

const KEYS = ['bass', 'mid', 'high', 'energy']
const SENSITIVITIES = ['auto', '0.5', '1', '1.5', '2']

// Visual-only adaptation. No gain node, playback changes, or writes to AudioAnalyzer.
export default class AdaptiveSensitivity {
  constructor() {
    this.values = { bass: 0, mid: 0, high: 0, energy: 0 }
    this.targets = { bass: 0, mid: 0, high: 0, energy: 0 }
    this.reference = 0.012
    this.initialized = false
    this.file = null
    this.spectrum = null
    this.rms = 0
    this.sensitivity = 'auto'
    this.gain = 1
    this.gainTarget = 1
    // Separate from the deliberately slower visual envelopes. The id changes
    // once per onset; renderers can consume it without polling React state.
    this.transient = { id: 0, strength: 0, bass: 0, mid: 0, high: 0, age: Infinity }
    this.fastRms = 0
    this.onsetReference = 0
    this.onsetInitialized = false
    this.onsetArmed = true
    this.onsetPeak = 0
    this.cooldown = 0
  }

  setSensitivity(mode) {
    const next = String(mode).toLowerCase()
    if (!SENSITIVITIES.includes(next)) return false
    this.sensitivity = next
    this.gainTarget = next === 'auto' ? 1 : Number(next)
    return true
  }

  updateTransient(step, gate, bass, mid, high) {
    if (!this.onsetInitialized) {
      this.fastRms = this.rms
      this.onsetReference = this.rms
      this.onsetInitialized = true
      return
    }
    const previous = this.fastRms
    this.fastRms = smoothValue(this.fastRms, this.rms, step, 0.025, 0.09)
    const floor = Math.max(0.0004, this.onsetReference)
    const contrast = Math.max(0, (this.fastRms - this.onsetReference) / floor)
    const riseRate = (this.fastRms - previous) / (Math.max(0.001, step) * floor)
    if (contrast < 0.12 || this.fastRms < this.onsetPeak * 0.75) this.onsetArmed = true
    if (this.onsetArmed && this.cooldown === 0 && gate > 0.2 &&
        contrast > 0.38 && riseRate > 1.4 && this.fastRms - this.onsetReference > 0.00014) {
      const absolute = 1 - Math.exp(-5 * this.fastRms)
      const relative = 1 - Math.exp(-0.5 * contrast)
      // Quiet natural onsets make small disturbances. A quiet sound does not
      // become an explosion merely because it follows digital silence.
      const rawStrength = 0.12 + 0.2 * relative + 0.68 * absolute
      this.transient.strength = 1 - (1 - rawStrength) ** this.gain
      const sum = Math.max(0.000001, bass + mid + high)
      this.transient.bass = bass / sum
      this.transient.mid = mid / sum
      this.transient.high = high / sum
      this.transient.id++
      this.transient.age = 0
      this.onsetArmed = false
      this.onsetPeak = this.fastRms
      this.cooldown = 0.28
    }
    // This reference is for onset contrast only. It follows local texture
    // faster than loudness adaptation, so steady wind/rain cannot keep firing.
    this.onsetReference = smoothValue(this.onsetReference, this.rms, step, 0.7, 1.5)
  }

  update(analyzer, delta) {
    const step = Math.min(0.1, Math.max(0, delta))
    const { engine } = analyzer
    const { audio, context, analyser } = engine
    this.gain = smoothValue(this.gain, this.gainTarget, step, 0.4, 0.4)
    this.cooldown = Math.max(0, this.cooldown - step)
    this.transient.age += step
    if (engine.objectUrl !== this.file) {
      this.file = engine.objectUrl
      this.initialized = false
      this.onsetInitialized = false
      this.onsetArmed = true
      this.cooldown = 0
      this.transient.strength = 0
      this.transient.age = Infinity
    }
    for (const key of KEYS) this.targets[key] = 0
    this.rms = 0
    const playing = analyser && analyzer.waveform && context?.state === 'running' &&
      !audio.paused && !audio.ended && !audio.seeking && audio.readyState >= 2
    if (playing) {
      this.rms = waveformRms(analyzer.waveform)
      // Absolute floor avoids amplifying digital silence/quantization residue.
      const gatePosition = Math.min(1, Math.max(0, (this.rms - 0.00012) / 0.00048))
      const gate = gatePosition * gatePosition * (3 - 2 * gatePosition)
      if (gate > 0) {
        if (!this.initialized) {
          this.reference = Math.max(0.0005, this.rms)
          this.initialized = true
        }
        // Hold through silence. Slow recovery avoids pumping or runaway gain.
        this.reference = smoothValue(this.reference, Math.max(0.0005, this.rms), step, 3, 10)
        const relative = 1 - Math.exp(-0.7 * this.rms / this.reference)
        const absolute = 1 - Math.exp(-4 * this.rms)
        // A small gated minimum keeps a quiet passage visible even while the
        // reference is recovering from loud audio; true silence still maps to 0.
        const baseEnergy = gate * (0.10 + 0.35 * relative + 0.55 * absolute)
        const energy = 1 - (1 - baseEnergy) ** this.gain
        // Prefer unsmoothed band targets for transient identity. The visual
        // envelopes below provide their own attack/release smoothing.
        let { bass, mid, high } = analyzer.targets || analyzer.values
        if (this.rms < 0.012) {
          // The original analyzer's gate deliberately removes these low levels.
          // Reuse its float waveform and the SAME node for ungated band ratios.
          if (this.spectrum?.length !== analyser.frequencyBinCount) this.spectrum = new Float32Array(analyser.frequencyBinCount)
          analyser.getFloatFrequencyData(this.spectrum)
          bass = bandEnergy(this.spectrum, context.sampleRate, analyser.fftSize, 20, 250)
          mid = bandEnergy(this.spectrum, context.sampleRate, analyser.fftSize, 250, 2000)
          high = bandEnergy(this.spectrum, context.sampleRate, analyser.fftSize, 2000, 12000)
        }
        const peak = Math.max(bass, mid, high, 0.000001)
        this.targets.bass = energy * (bass / peak) ** 0.7
        this.targets.mid = energy * (mid / peak) ** 0.7
        this.targets.high = energy * (high / peak) ** 0.7
        this.targets.energy = energy
        this.updateTransient(step, gate, bass, mid, high)
      } else {
        // Let a real onset emerge from silence, without increasing sensitivity
        // during silence or treating quantization/decoder residue as activity.
        this.updateTransient(step, 0, 0, 0, 0)
      }
    } else {
      // Transport changes must not look like an acoustic impulse. The next
      // decoded frame seeds the onset envelope while visible motion fades.
      this.onsetInitialized = false
      this.onsetArmed = true
      this.transient.strength = 0
      this.transient.age = Infinity
    }
    for (const key of KEYS) {
      this.values[key] = smoothValue(this.values[key], this.targets[key], step, 0.18, 0.65)
      if (this.values[key] < 0.00001) this.values[key] = 0
    }
    return this.values
  }
}
