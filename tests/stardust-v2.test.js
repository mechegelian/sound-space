import test from 'node:test'
import assert from 'node:assert/strict'
import StardustDynamics, { createStardust } from '../src/visuals/StardustDynamics.js'
import LegacyStardustDynamics from './fixtures/stardust-v1-baseline.js'

const mapped = (bass = 0, mid = 0, high = 0, energy = 0, onset = 0) => ({
  values: { bass, mid, high, energy }, targets: { bass, mid, high, energy: onset },
})
const distance = (a, b) => {
  let total = 0
  for (let i = 0; i < a.length; i += 3) total += Math.hypot(a[i] - b[i], a[i + 1] - b[i + 1], a[i + 2] - b[i + 2])
  return total / (a.length / 3)
}

test('V2 particles retain deterministic local identities and reusable history buffers', () => {
  const particles = createStardust(1200), repeat = createStardust(1200)
  for (const key of ['base', 'seeds', 'sizes', 'tints', 'affinities', 'response', 'directions', 'brightness']) {
    assert.ok(particles[key] instanceof Float32Array, `${key} must use a typed buffer`)
    assert.deepEqual(particles[key], repeat[key], `${key} must be stable and reproducible`)
  }
  assert.equal(particles.affinities.length, 3600)
  assert.equal(particles.memory.length, 3600)
  assert.equal(particles.activity.length, 1200)
  assert.ok(Math.max(...particles.sizes) > Math.min(...particles.sizes) * 1.8)
  assert.ok(Math.max(...particles.response) - Math.min(...particles.response) > 0.2)
  const dynamics = new StardustDynamics(1200)
  const refs = Object.fromEntries(Object.entries(dynamics.particles).filter(([, value]) => ArrayBuffer.isView(value)))
  const waves = dynamics.waves, waveRefs = [...waves]
  for (let i = 0; i < 240; i++) dynamics.update(mapped(0.8, 0.45, 0.35, 0.8, i < 15 ? 0.9 : 0), 1 / 60)
  for (const [key, ref] of Object.entries(refs)) assert.equal(dynamics.particles[key], ref, `${key} was reallocated`)
  assert.equal(dynamics.waves, waves)
  assert.deepEqual(dynamics.waves, waveRefs)
  assert.ok(waves.length >= 2 && waves.length <= 8)
  assert.ok(distance(dynamics.particles.positions, dynamics.particles.memory) > 0.0001, 'motion history follows movement')
  assert.ok(distance(dynamics.particles.positions, dynamics.particles.memory) < 0.8, 'history remains short')
})

test('V2 substantially exceeds V1 audio movement without moving the entire field uniformly', () => {
  const presets = {
    bass: mapped(0.72, 0.08, 0.04, 0.75),
    mid: mapped(0.04, 0.72, 0.04, 0.75),
    high: mapped(0.04, 0.08, 0.72, 0.75),
  }
  const results = {}
  let oldTotal = 0, newTotal = 0
  for (const [name, input] of Object.entries(presets)) {
    const oldActive = new LegacyStardustDynamics(1200), oldIdle = new LegacyStardustDynamics(1200)
    const active = new StardustDynamics(1200), idle = new StardustDynamics(1200)
    let oldMotion = 0, newMotion = 0
    for (let frame = 0; frame < 300; frame++) {
      oldActive.update(input, 1 / 60); oldIdle.update(mapped(), 1 / 60)
      active.update(input, 1 / 60); idle.update(mapped(), 1 / 60)
      if (frame >= 60 && frame % 6 === 0) {
        oldMotion += distance(oldActive.particles.positions, oldIdle.particles.positions)
        newMotion += distance(active.particles.positions, idle.particles.positions)
      }
    }
    assert.ok(Number.isFinite(newMotion) && newMotion > 0)
    oldTotal += oldMotion; newTotal += newMotion
    results[name] = { multiplier: Number((newMotion / oldMotion).toFixed(2)), positions: active.particles.positions.slice() }
    let smallest = Infinity, largest = 0
    for (let n = 0; n < active.particles.positions.length; n += 3) {
      const local = Math.hypot(active.particles.positions[n] - idle.particles.positions[n], active.particles.positions[n + 1] - idle.particles.positions[n + 1], active.particles.positions[n + 2] - idle.particles.positions[n + 2])
      smallest = Math.min(smallest, local); largest = Math.max(largest, local)
    }
    assert.ok(largest - smallest > 0.1, `${name} needs meaningful spatial variation`)
  }
  assert.ok(newTotal / oldTotal >= 1.5, `matched audio displacement V2/V1 was ${(newTotal / oldTotal).toFixed(2)}`)
  assert.ok(distance(results.bass.positions, results.mid.positions) > 0.12)
  assert.ok(distance(results.mid.positions, results.high.positions) > 0.12)
  console.log('V2/V1 matched audio displacement:', JSON.stringify(Object.fromEntries(Object.entries(results).map(([name, value]) => [name, value.multiplier]))), 'combined', (newTotal / oldTotal).toFixed(2))
})

test('pressure waves illuminate particle fronts, remain pooled, and decay after a transient', () => {
  const dynamics = new StardustDynamics(1800)
  const active = mapped(0.85, 0.25, 0.2, 0.85, 0.95)
  let peak = 0, minimumLit = Infinity, maximumLit = 0
  for (let frame = 0; frame < 80; frame++) {
    dynamics.update(active, 1 / 60)
    const activity = dynamics.particles.activity
    let lit = 0
    for (const value of activity) {
      assert.ok(Number.isFinite(value) && value >= 0)
      peak = Math.max(peak, value)
      if (value > 0.05) lit++
    }
    minimumLit = Math.min(minimumLit, lit); maximumLit = Math.max(maximumLit, lit)
  }
  assert.equal(dynamics.event, 1, 'a held level must not repeatedly launch waves')
  assert.ok(peak > 0.1, 'particles at the wavefront brighten')
  assert.ok(maximumLit - minimumLit > 30, 'the front travels to different particles')
  for (let frame = 0; frame < 420; frame++) dynamics.update(mapped(), 1 / 60)
  assert.ok(Math.max(...dynamics.particles.activity) < 0.01)
  dynamics.update(active, 1 / 60)
  assert.equal(dynamics.event, 2, 'a new event after quiet should rearm')
})
