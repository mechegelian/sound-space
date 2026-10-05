import test from 'node:test'
import assert from 'node:assert/strict'
import AdaptiveSensitivity from '../src/visuals/AdaptiveSensitivity.js'
import StardustDynamics, { createStardust } from '../src/visuals/StardustDynamics.js'

function analyzer(amplitude = 0) {
  const instance = {
    waveform: new Float32Array(2048),
    values: { bass: 0.5, mid: 0.01, high: 0, energy: 0.5 },
    engine: {
      objectUrl: 'first', context: { state: 'running', sampleRate: 48000 },
      audio: { paused: false, ended: false, seeking: false, readyState: 4 },
      analyser: { fftSize: 2048, frequencyBinCount: 1024,
        getFloatFrequencyData(data) { data.fill(-Infinity); data[4] = -62 },
      },
    },
  }
  for (let i = 0; i < instance.waveform.length; i++) instance.waveform[i] = amplitude * Math.sin(i * 0.1)
  return instance
}

test('quiet samples below the original gate respond; silence and paused data do not', () => {
  const input = analyzer(0.001)
  input.values = { bass: 0, mid: 0, high: 0, energy: 0 }
  const original = JSON.stringify(input.values)
  const mapping = new AdaptiveSensitivity()
  for (let i = 0; i < 120; i++) mapping.update(input, 1 / 60)
  assert.ok(mapping.values.energy > 0.2 && mapping.values.energy < 0.4)
  assert.ok(mapping.values.bass > mapping.values.high + 0.15)
  assert.equal(JSON.stringify(input.values), original)
  const reference = mapping.reference, buffer = mapping.spectrum, values = mapping.values
  input.waveform.fill(0)
  for (let i = 0; i < 480; i++) mapping.update(input, 1 / 60)
  assert.equal(mapping.values.energy, 0)
  assert.equal(mapping.reference, reference)
  assert.equal(mapping.spectrum, buffer)
  assert.equal(mapping.values, values)
  input.engine.audio.paused = true
  input.waveform.fill(0.3)
  mapping.update(input, 1 / 60)
  assert.equal(mapping.targets.energy, 0)
})

test('loud adaptation remains bounded, quiet passages recover, replacement resets reference', () => {
  const mapping = new AdaptiveSensitivity(), loud = analyzer(0.6)
  for (let i = 0; i < 600; i++) mapping.update(loud, 1 / 60)
  assert.ok(mapping.values.energy > 0.65 && mapping.values.energy < 0.95)
  const previousReference = mapping.reference
  const quiet = analyzer(0.001)
  mapping.update(quiet, 1 / 60)
  assert.ok(mapping.reference > previousReference * 0.99)
  assert.ok(mapping.targets.energy > 0.09)
  quiet.engine.objectUrl = 'replacement'
  mapping.update(quiet, 1 / 60)
  assert.ok(mapping.reference < 0.002)
  quiet.engine.audio.seeking = true
  mapping.update(quiet, 1 / 60)
  assert.equal(mapping.targets.energy, 0)
})

test('seeded distribution has volume, irregular density, and a long axis', () => {
  const cloud = createStardust(1500)
  assert.deepEqual(cloud.base, createStardust(1500).base)
  let x2 = 0, y2 = 0, z2 = 0, inner = 0, outer = 0
  for (let i = 0; i < cloud.base.length; i += 3) {
    const x = cloud.base[i], y = cloud.base[i + 1], z = cloud.base[i + 2]
    x2 += x * x; y2 += y * y; z2 += z * z
    const radius = Math.hypot(x, y, z)
    if (radius < 0.7) inner++
    if (radius > 1.5) outer++
  }
  assert.ok(x2 > y2 * 1.7 && z2 / 1500 > 0.1)
  assert.ok(inner > 100 && outer > 100)
})

const mapped = (bass = 0, mid = 0, high = 0, energy = 0) => ({ values: { bass, mid, high, energy }, targets: { energy } })
function meanDistance(a, b) {
  let distance = 0
  for (let i = 0; i < a.length; i += 3) distance += Math.hypot(a[i] - b[i], a[i + 1] - b[i + 1], a[i + 2] - b[i + 2])
  return distance / (a.length / 3)
}

test('idle drifts; audio motion is local, bounded, and uses stable buffers', () => {
  const idle = new StardustDynamics(600), bass = new StardustDynamics(600), high = new StardustDynamics(600)
  const positions = bass.particles.positions
  for (let i = 0; i < 120; i++) {
    idle.update(mapped(), 1 / 60)
    bass.update(mapped(0.7, 0.05, 0, 0.7), 1 / 60)
    high.update(mapped(0, 0.05, 0.7, 0.7), 1 / 60)
  }
  assert.equal(bass.particles.positions, positions)
  assert.ok(meanDistance(idle.particles.positions, idle.particles.base) > 0.015)
  assert.ok(meanDistance(bass.particles.positions, high.particles.positions) > 0.07)
  const localChanges = []
  for (let i = 0; i < positions.length; i += 3) {
    const r = Math.hypot(...positions.subarray(i, i + 3))
    assert.ok(Number.isFinite(r) && r < 3.45)
    localChanges.push(r / Math.max(0.01, Math.hypot(...bass.particles.base.subarray(i, i + 3))))
  }
  assert.ok(Math.max(...localChanges) - Math.min(...localChanges) > 0.2)
})

test('transients propagate through particles and do not retrigger on a held tone', () => {
  const cloud = new StardustDynamics(600), control = new StardustDynamics(600)
  const active = mapped(0.7, 0.2, 0.1, 0.8), noOnset = mapped(0.7, 0.2, 0.1, 0.8)
  noOnset.targets.energy = 0
  for (let i = 0; i < 30; i++) { cloud.update(active, 1 / 60); control.update(noOnset, 1 / 60) }
  assert.equal(cloud.event, 1)
  assert.ok(meanDistance(cloud.particles.positions, control.particles.positions) > 0.01)
  for (let i = 0; i < 180; i++) cloud.update(active, 1 / 60)
  assert.equal(cloud.event, 1)
  for (let i = 0; i < 90; i++) cloud.update(mapped(), 1 / 60)
  cloud.update(active, 1 / 60)
  assert.equal(cloud.event, 2)
})
