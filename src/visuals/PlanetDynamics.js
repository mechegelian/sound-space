import { smoothValue } from '../audio/AudioAnalyzer.js'

export function bassDrive(bass) {
  return Math.min(1, Math.max(0, (bass - 0.035) / 0.5)) ** 1.6
}

// Visual envelopes only; the existing analyzer remains the audio data source.
export default class PlanetDynamics {
  constructor() {
    this.drive = 0
    this.flash = 0
    this.pulse = 0
    this.baseline = 0
    this.cooldown = 0
    this.armed = true
    this.event = 0
  }

  update(analyzer, delta) {
    const step = Math.min(0.1, Math.max(0, delta))
    const bass = analyzer.targets.bass
    this.cooldown = Math.max(0, this.cooldown - step)
    this.flash *= Math.exp(-step / 0.28)
    if (bass < 0.15) this.armed = true
    if (this.armed && this.cooldown === 0 && bass > 0.24 && bass - this.baseline > 0.085) {
      this.event++
      this.flash = Math.max(this.flash, Math.min(1, bass * 2.2))
      this.cooldown = 0.7
      this.armed = false
    }
    this.baseline = smoothValue(this.baseline, bass, step, 0.3, 0.45)
    this.drive = smoothValue(this.drive, bassDrive(analyzer.values.bass), step, 0.06, 0.3)
    this.pulse = smoothValue(this.pulse, this.flash, step, 0.045, 0.16)
    return this
  }
}
