import test from 'node:test'
import assert from 'node:assert/strict'
import AudioAnalyzer, { bandEnergy, smoothValue, waveformRms } from '../src/audio/AudioAnalyzer.js'

test('Hz ranges select independent bands at different sample rates', () => {
  for (const sampleRate of [22050, 44100, 48000, 96000]) {
    for (const [hz, band] of [[100, 0], [1000, 1], [6000, 2]]) {
      const spectrum = new Float32Array(1024).fill(-Infinity)
      spectrum[Math.round(hz * 2048 / sampleRate)] = -12
      const values = [[20, 250], [250, 2000], [2000, 12000]].map(([lo, hi]) =>
        bandEnergy(spectrum, sampleRate, 2048, lo, hi))
      assert.ok(values[band] > 0.6 && values[band] <= 1)
      values.forEach((value, index) => { if (index !== band) assert.equal(value, 0) })
    }
  }
})

test('RMS measures signal amplitude and rejects DC/silence', () => {
  assert.equal(waveformRms(new Float32Array(2048)), 0)
  assert.equal(waveformRms(new Float32Array(2048).fill(0.25)), 0)
  const wave = Float32Array.from({ length: 2048 }, (_, i) => 0.5 * Math.sin(i * Math.PI / 32))
  assert.ok(Math.abs(waveformRms(wave) - 0.5 / Math.sqrt(2)) < 0.00001)
})

test('exponential smoothing is frame-rate independent and releases gently', () => {
  const results = [30, 60, 120].map(fps => {
    let value = 0
    for (let i = 0; i < fps; i++) value = smoothValue(value, 1, 1 / fps)
    for (let i = 0; i < fps; i++) value = smoothValue(value, 0, 1 / fps)
    return value
  })
  assert.ok(Math.abs(results[0] - results[2]) < 1e-10)
  assert.ok(results[0] > 0 && results[0] < 0.12)
})

test('playback gate, silence, seeking, stable buffers, and smooth idle return', () => {
  let silent = false
  const engine = {
    audio: { paused: false, ended: false, seeking: false, readyState: 4 },
    context: { state: 'running', sampleRate: 48000 },
    analyser: {
      frequencyBinCount: 1024, fftSize: 2048,
      getFloatFrequencyData(buffer) { buffer.fill(-Infinity); buffer[4] = -12 },
      getFloatTimeDomainData(buffer) {
        for (let i = 0; i < buffer.length; i++) buffer[i] = silent ? 0 : 0.3 * Math.sin(i * 0.1)
      },
    },
  }
  const analyzer = new AudioAnalyzer(engine)
  for (let i = 0; i < 120; i++) analyzer.update(1 / 60)
  const values = analyzer.values
  const spectrum = analyzer.spectrum
  const waveform = analyzer.waveform
  assert.ok(values.bass > 0.6 && values.energy > 0.4)
  engine.audio.paused = true
  const before = values.bass
  analyzer.update(1 / 60)
  assert.ok(values.bass > 0 && values.bass < before)
  for (let i = 0; i < 240; i++) analyzer.update(1 / 60)
  assert.ok(values.bass < 0.001)
  engine.audio.paused = false
  engine.audio.seeking = true
  analyzer.update(1 / 60)
  assert.equal(analyzer.targets.bass, 0)
  engine.audio.seeking = false
  silent = true
  analyzer.update(1 / 60)
  assert.equal(analyzer.targets.bass, 0)
  assert.equal(analyzer.targets.energy, 0)
  assert.equal(analyzer.values, values)
  assert.equal(analyzer.spectrum, spectrum)
  assert.equal(analyzer.waveform, waveform)
})
