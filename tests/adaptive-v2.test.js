import test from 'node:test'
import assert from 'node:assert/strict'
import AudioAnalyzer, { bandEnergy } from '../src/audio/AudioAnalyzer.js'
import AdaptiveSensitivity from '../src/visuals/AdaptiveSensitivity.js'

// Deterministic waveform + matching spectral envelopes represent texture,
// tones, and impulses without requiring an AudioContext in Node.
function fixture() {
  const waveform = new Float32Array(2048)
  const spectrum = new Float32Array(1024).fill(-Infinity)
  let seed = 78193
  const engine = {
    objectUrl: 'local-audio', context: { state: 'running', sampleRate: 48000 },
    audio: { paused: false, ended: false, seeking: false, readyState: 4 },
    analyser: {
      fftSize: 2048, frequencyBinCount: 1024,
      getFloatTimeDomainData(buffer) { buffer.set(waveform) },
      getFloatFrequencyData(buffer) { buffer.set(spectrum) },
    },
  }
  const analyzer = new AudioAnalyzer(engine)
  const mapping = new AdaptiveSensitivity()
  function frame(amplitude = 0, kind = 'broadband') {
    for (let i = 0; i < waveform.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      waveform[i] = amplitude * (kind === 'bass' ? Math.sin(i * 2 * Math.PI * 80 / 48000)
        : kind === 'mid' ? Math.sin(i * 2 * Math.PI * 1000 / 48000)
          : seed / 2147483648 - 1)
    }
    spectrum.fill(-Infinity)
    if (amplitude > 0) {
      if (kind === 'bass' || kind === 'mid') spectrum[kind === 'bass' ? 3 : 43] = 20 * Math.log10(amplitude / Math.SQRT2)
      else {
        const start = kind === 'rain' ? 100 : 1
        const end = 500
        const bin = 20 * Math.log10(amplitude / Math.sqrt(3 * (end - start)))
        for (let i = start; i < end; i++) spectrum[i] = bin
      }
    }
    analyzer.update(1 / 60)
    mapping.update(analyzer, 1 / 60)
  }
  return { engine, analyzer, mapping, waveform, spectrum, frame }
}

test('AUTO ignores silence/residue and keeps steady quiet broadband detailed without repeated onsets', () => {
  const f = fixture()
  for (let i = 0; i < 180; i++) f.frame(i < 90 ? 0 : 0.00003)
  assert.equal(f.mapping.values.energy, 0)
  assert.equal(f.mapping.transient.id, 0)
  for (let i = 0; i < 180; i++) f.frame(0.0015)
  const events = f.mapping.transient.id
  const spectrum = f.mapping.spectrum, values = f.mapping.values, transient = f.mapping.transient
  for (let i = 0; i < 900; i++) f.frame(0.0015 * (1 + 0.06 * Math.sin(i * 0.05)))
  assert.ok(f.mapping.values.energy > 0.2 && f.mapping.values.energy < 0.4)
  assert.equal(f.analyzer.values.energy, 0, 'raw analyzer retains its original quiet gate')
  assert.equal(f.mapping.transient.id, events, 'constant texture is not repeated transient activity')
  assert.equal(f.mapping.spectrum, spectrum)
  assert.equal(f.mapping.values, values)
  assert.equal(f.mapping.transient, transient)
})

test('quiet rain-like clicks create small treble impulses while a loud bass onset creates a strong impulse', () => {
  const f = fixture()
  for (let i = 0; i < 120; i++) f.frame(0.0008, 'rain')
  assert.equal(f.mapping.transient.id, 0, 'starting transport does not trigger a pressure wave')
  for (let click = 0; click < 8; click++) {
    for (let i = 0; i < 3; i++) f.frame(0.006, 'rain')
    assert.ok(f.mapping.transient.strength > 0.15 && f.mapping.transient.strength < 0.4)
    assert.ok(f.mapping.transient.high > 0.9)
    for (let i = 0; i < 31; i++) f.frame(0.0008, 'rain')
  }
  assert.ok(f.mapping.transient.id >= 6 && f.mapping.transient.id <= 8)
  for (let i = 0; i < 120; i++) f.frame(0)
  const rainCount = f.mapping.transient.id
  for (let i = 0; i < 3; i++) f.frame(0.85, 'bass')
  assert.equal(f.mapping.transient.id, rainCount + 1)
  assert.ok(f.mapping.transient.strength > 0.65)
  assert.ok(f.mapping.transient.bass > 0.95)
  const strongCount = f.mapping.transient.id
  for (let i = 0; i < 600; i++) f.frame(0.85, 'bass')
  assert.equal(f.mapping.transient.id, strongCount, 'sustained loud signal does not retrigger')
  assert.ok(f.mapping.values.energy < 0.95)
})

test('sensitivity controls smoothly change only visual gain, preserve silence, and do not create onsets', () => {
  const f = fixture()
  for (let i = 0; i < 180; i++) f.frame(0.002, 'mid')
  const normal = f.mapping.values.energy
  const raw = { ...f.analyzer.values }
  const events = f.mapping.transient.id
  assert.equal(f.mapping.sensitivity, 'auto')
  assert.equal(f.mapping.setSensitivity('2'), true)
  f.frame(0.002, 'mid')
  assert.ok(Math.abs(f.mapping.values.energy - normal) < 0.02)
  for (let i = 0; i < 240; i++) f.frame(0.002, 'mid')
  assert.ok(f.mapping.values.energy > normal * 1.6 && f.mapping.values.energy < 1)
  assert.deepEqual(f.analyzer.values, raw)
  assert.equal(f.mapping.transient.id, events)
  assert.equal(f.mapping.setSensitivity('0.5'), true)
  for (let i = 0; i < 360; i++) f.frame(0.002, 'mid')
  assert.ok(f.mapping.values.energy < normal * 0.65)
  assert.equal(f.mapping.setSensitivity('invalid'), false)
  assert.equal(f.mapping.sensitivity, '0.5')
  f.mapping.setSensitivity('AUTO')
  for (let i = 0; i < 600; i++) f.frame(0)
  assert.equal(f.mapping.values.energy, 0)
  assert.equal(f.mapping.gainTarget, 1)
})

test('seek, resume, and replacement seed onset envelopes without phantom acoustic events', () => {
  const f = fixture()
  for (let i = 0; i < 120; i++) f.frame(0.001)
  for (const flag of ['paused', 'seeking']) {
    f.engine.audio[flag] = true
    f.frame(0.8, 'bass')
    assert.equal(f.mapping.targets.energy, 0)
    f.engine.audio[flag] = false
    f.frame(0.8, 'bass')
    assert.equal(f.mapping.transient.id, 0)
    for (let i = 0; i < 30; i++) f.frame(0.8, 'bass')
    assert.equal(f.mapping.transient.id, 0)
  }
  f.engine.objectUrl = 'replacement'
  f.frame(0.002, 'rain')
  assert.ok(f.mapping.reference < 0.002)
  assert.equal(f.mapping.transient.id, 0)
  assert.equal(f.mapping.transient.age, Infinity)
  assert.ok(f.mapping.targets.high > f.mapping.targets.bass)
  assert.equal(bandEnergy(f.spectrum, 48000, 2048, 20, 250), 0)
})
