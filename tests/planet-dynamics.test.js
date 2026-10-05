import test from 'node:test'
import assert from 'node:assert/strict'
import PlanetDynamics, { bassDrive } from '../src/visuals/PlanetDynamics.js'

test('nonlinear bass response is restrained for quiet audio and capped for loud audio', () => {
  assert.equal(bassDrive(0), 0)
  assert.ok(bassDrive(0.08) < 0.03)
  assert.ok(bassDrive(0.45) > 0.7)
  assert.equal(bassDrive(1), 1)
  assert.equal(bassDrive(4), 1)
})

test('a sustained bass note creates one ripple, while separate strong onsets rearm', () => {
  const dynamics = new PlanetDynamics()
  const analyzer = { targets: { bass: 0.5 }, values: { bass: 0.5 } }
  for (let i = 0; i < 180; i++) dynamics.update(analyzer, 1 / 60)
  assert.equal(dynamics.event, 1)
  assert.ok(dynamics.drive > 0.8 && dynamics.drive <= 1)
  analyzer.targets.bass = analyzer.values.bass = 0
  for (let i = 0; i < 90; i++) dynamics.update(analyzer, 1 / 60)
  assert.ok(dynamics.drive < 0.01)
  analyzer.targets.bass = analyzer.values.bass = 0.5
  dynamics.update(analyzer, 1 / 60)
  assert.equal(dynamics.event, 2)
  analyzer.targets.bass = 0
  dynamics.update(analyzer, 1 / 60)
  analyzer.targets.bass = 0.5
  dynamics.update(analyzer, 1 / 60)
  assert.equal(dynamics.event, 2)
})
