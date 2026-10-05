import { smoothValue } from './AudioAnalyzer.js'
const clamp = value => Math.max(0, Math.min(1, value))

// Continuous direction, separate from raw analysis and playback. A beat envelope
// is distributed through the dust even when no attractor or burst is on screen.
export default class AudioDirection {
  constructor() {
    this.energy = 0; this.history = 0; this.sustained = 0; this.density = 0; this.spectral = 0
    this.intensity = 0; this.cameraEnergy = 0; this.heat = 0; this.ethereal = 0
    this.tension = 0; this.release = 0; this.phase = 'CALM'; this.phaseAge = 0
    this.low = 0; this.mid = 0; this.high = 0; this.lastTransient = 0; this.grace = 0
    this.pulse = { id: 0, age: 10, strength: 0, low: 0, mid: 0, high: 0 }
    this.kick = 0; this.shear = 0; this.spark = 0
    this.fastRms = 0; this.rhythmReference = 0; this.rhythmCooldown = 0; this.rhythmArmed = true; this.rhythmPeak = 0; this.wasPlaying = false
  }

  update(mapping, playing, changed, dt) {
    const v = mapping.values, t = mapping.transient
    this.pulse.age += dt; this.phaseAge += dt
    this.grace = Math.max(0, this.grace - dt)
    this.rhythmCooldown = Math.max(0, this.rhythmCooldown - dt)
    if (changed) { this.lastTransient = t.id; this.grace = 0.4; this.history = this.energy; this.density *= 0.3 }
    const rms = mapping.rms || 0
    if (changed || !playing || !this.wasPlaying) {
      this.fastRms = this.rhythmReference = rms; this.rhythmArmed = true
      this.grace = Math.max(this.grace, 0.25)
    }
    this.wasPlaying = playing
    const e = playing ? v.energy : 0
    this.energy = smoothValue(this.energy, e, dt, 0.18, 0.4)
    this.history = smoothValue(this.history, this.energy, dt, 2.6, 2.6)
    this.sustained = smoothValue(this.sustained, this.energy > 0.48 ? this.energy : 0, dt, 1.2, 0.8)
    this.tension = smoothValue(this.tension, clamp((this.energy - this.history) * 3), dt, 0.55, 1.1)
    this.release = smoothValue(this.release, clamp((this.history - this.energy - 0.1) * 4), dt, 0.25, 1.4)
    const flux = Math.abs(v.bass - this.low) + Math.abs(v.mid - this.mid) + Math.abs(v.high - this.high)
    this.spectral = smoothValue(this.spectral, playing ? clamp(flux / Math.max(0.001, dt) * 0.32) : 0, dt, 0.2, 0.8)
    this.low = v.bass; this.mid = v.mid; this.high = v.high
    this.density *= Math.exp(-dt / 2)
    let adaptiveOnset = false
    if (t.id !== this.lastTransient) {
      this.lastTransient = t.id
      if (playing && !changed && this.grace === 0 && t.age < 0.25 && t.strength > 0.12) {
        adaptiveOnset = true
      }
    }
    // A fast relative envelope catches rhythm riding on a loud bed that the
    // intentionally conservative natural-event detector may not call an impact.
    // This only drives dust/camera rhythm; it does not spawn extra explosions.
    const previousFast = this.fastRms
    this.fastRms = smoothValue(this.fastRms, rms, dt, 0.018, 0.045)
    const reference = Math.max(0.0005, this.rhythmReference)
    const contrast = (this.fastRms - this.rhythmReference) / reference
    const rising = (this.fastRms - previousFast) / (Math.max(0.001, dt) * reference)
    if (contrast < 0.025 || this.fastRms < this.rhythmPeak * 0.90) this.rhythmArmed = true
    const rhythmicOnset = playing && this.grace === 0 && this.rhythmArmed && rms > 0.0006 && contrast > 0.09 && rising > 0.8
    if ((adaptiveOnset || rhythmicOnset) && this.rhythmCooldown === 0) {
      const p = this.pulse, bands = mapping.targets || v
      const sum = Math.max(0.000001, bands.bass + bands.mid + bands.high)
      p.id++; p.age = 0
      p.strength = adaptiveOnset ? t.strength : Math.min(1, 0.2 + 0.45 * (1 - Math.exp(-Math.max(0, contrast) * 3)) + 0.35 * (1 - Math.exp(-rms * 5)))
      p.low = adaptiveOnset ? t.bass : bands.bass / sum
      p.mid = adaptiveOnset ? t.mid : bands.mid / sum
      p.high = adaptiveOnset ? t.high : bands.high / sum
      this.density = Math.min(1, this.density + 0.16 + p.strength * 0.22)
      this.rhythmCooldown = 0.18; this.rhythmArmed = false; this.rhythmPeak = this.fastRms
    }
    this.rhythmReference = smoothValue(this.rhythmReference, rms, dt, 0.24, 0.24)
    const target = playing ? clamp(0.68 * this.energy ** 1.4 + 0.14 * v.bass ** 0.8 +
      0.16 * this.sustained + 0.20 * this.density * Math.sqrt(this.energy) + 0.10 * this.spectral * this.energy) : 0
    this.intensity = smoothValue(this.intensity, target, dt, 0.32, 0.85)
    this.cameraEnergy = smoothValue(this.cameraEnergy, clamp(this.intensity ** 1.5 + this.tension * 0.12), dt, 0.5, 0.8)
    this.heat = smoothValue(this.heat, clamp((this.intensity - 0.48) * 2.4) * (0.45 + v.bass * 0.55), dt, 1.1, 0.9)
    this.ethereal = smoothValue(this.ethereal, v.high * (0.6 + this.density * 0.4), dt, 0.6, 0.9)
    const p = this.pulse, shape = p.strength * (1 - Math.exp(-p.age / 0.025))
    this.kick = shape * p.low * Math.exp(-p.age / 0.30)
    this.shear = shape * p.mid * Math.exp(-p.age / 0.22)
    this.spark = shape * p.high * Math.exp(-p.age / 0.15)
    let phase = this.intensity < 0.13 ? 'CALM' : 'FLOW'
    if (this.release > 0.3) phase = 'RELEASE'
    else if (this.pulse.age < 0.35 && p.strength > 0.62) phase = 'IMPACT'
    else if (this.intensity > 0.66) phase = 'DENSE'
    else if (this.tension > 0.12) phase = 'RISING'
    if (phase !== this.phase && (this.phaseAge > 0.7 || phase === 'IMPACT' || phase === 'RELEASE')) { this.phase = phase; this.phaseAge = 0 }
  }
}
