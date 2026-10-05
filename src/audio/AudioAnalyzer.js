const BANDS = { bass: [20, 250], mid: [250, 2000], high: [2000, 12000] }
const BAND_KEYS = ['bass', 'mid', 'high']
const KEYS = ['bass', 'mid', 'high', 'energy']

export function smoothValue(current, target, delta, attack = 0.09, release = 0.45) {
  const time = target > current ? attack : release
  return current + (target - current) * (1 - Math.exp(-Math.max(0, delta) / time))
}

export function waveformRms(samples) {
  if (!samples.length) return 0
  let mean = 0
  for (let i = 0; i < samples.length; i++) mean += samples[i]
  mean /= samples.length
  let power = 0
  for (let i = 0; i < samples.length; i++) power += (samples[i] - mean) ** 2
  return Math.sqrt(power / samples.length)
}

export function bandEnergy(spectrum, sampleRate, fftSize, lowHz, highHz) {
  const hzPerBin = sampleRate / fftSize
  const start = Math.max(1, Math.ceil(lowHz / hzPerBin))
  const end = Math.min(spectrum.length, Math.ceil(highHz / hzPerBin))
  let power = 0
  for (let i = start; i < end; i++) {
    // Float frequency bins are decibels: sum linear power, not dB values.
    if (Number.isFinite(spectrum[i])) power += 10 ** (spectrum[i] / 10)
  }
  // Soft compression keeps both quiet and loud passages useful, within 0..1.
  return 1 - Math.exp(-4 * Math.sqrt(power))
}

export default class AudioAnalyzer {
  constructor(engine) {
    this.engine = engine
    this.values = { bass: 0, mid: 0, high: 0, energy: 0 }
    this.targets = { bass: 0, mid: 0, high: 0, energy: 0 }
    this.spectrum = null
    this.waveform = null
  }

  update(delta) {
    const { audio, analyser, context } = this.engine
    for (const key of KEYS) this.targets[key] = 0
    const playing = analyser && context?.state === 'running' &&
      !audio.paused && !audio.ended && !audio.seeking && audio.readyState >= 2

    if (playing) {
      if (this.spectrum?.length !== analyser.frequencyBinCount) {
        this.spectrum = new Float32Array(analyser.frequencyBinCount)
        this.waveform = new Float32Array(analyser.fftSize)
      }
      analyser.getFloatTimeDomainData(this.waveform)
      const rms = waveformRms(this.waveform)
      // Silence/decoder residue must not animate the planet. Ramp the gate to
      // avoid an abrupt threshold for very quiet passages (roughly -50 dBFS).
      const gate = Math.min(1, Math.max(0, (rms - 0.003) / 0.009))
      if (gate > 0) {
        analyser.getFloatFrequencyData(this.spectrum)
        for (const key of BAND_KEYS) {
          this.targets[key] = gate * bandEnergy(
            this.spectrum, context.sampleRate, analyser.fftSize, ...BANDS[key],
          )
        }
        this.targets.energy = gate * (1 - Math.exp(-3 * rms))
      }
    }

    // A stalled/background tab should not produce a huge jump on return.
    const step = Math.min(Math.max(delta, 0), 0.1)
    for (const key of KEYS) {
      this.values[key] = smoothValue(this.values[key], this.targets[key], step)
      if (this.values[key] < 0.00001) this.values[key] = 0
    }
    return this.values
  }
}
