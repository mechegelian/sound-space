import test from 'node:test'
import assert from 'node:assert/strict'
import AudioEventInterpreter from '../src/audio/AudioEventInterpreter.js'
import LegacyInterpreter from './fixtures/journey-v8-interpreter.js'
import StardustWorldDynamics from '../src/visuals/StardustWorldDynamics.js'
import JourneyMotion from '../src/visuals/JourneyMotion.js'
import JourneyEvents from '../src/visuals/JourneyEvents.js'

function rig(Interpreter = AudioEventInterpreter) {
  const interpreter = new Interpreter()
  const mapping = { values: { bass: 0, mid: 0, high: 0, energy: 0 }, transient: { id: 0, age: 10, strength: 0, bass: 0, mid: 0, high: 0 } }
  const transport = { objectUrl: 'test', context: { state: 'running' }, audio: { currentTime: 0, readyState: 4, paused: false, seeking: false, ended: false } }
  const tick = () => { transport.audio.currentTime += 1 / 60; mapping.transient.age += 1 / 60; interpreter.update(mapping, transport, 1 / 60) }
  return { interpreter, mapping, transport, tick }
}
const strong = { bass: 0.88, mid: 0.78, high: 0.65, energy: 0.88 }

test('intensity reaches overload with sustained rhythmic input and releases to darkness', () => {
  const r = rig(), motion = new JourneyMotion()
  r.tick()
  const phases = new Set()
  let peak = 0, highestSpeed = 0
  for (let i = 0; i < 900; i++) {
    const gain = i < 180 ? i / 180 : 1
    for (const key of Object.keys(strong)) r.mapping.values[key] = strong[key] * gain
    if (i > 60 && i % 24 === 0) Object.assign(r.mapping.transient, { id: r.mapping.transient.id + 1, age: 0, strength: 0.85, bass: 0.65, mid: 0.2, high: 0.15 })
    r.tick(); motion.update(r.interpreter.direction, true, false, 1 / 60)
    peak = Math.max(peak, r.interpreter.direction.intensity); highestSpeed = Math.max(highestSpeed, motion.forward)
    phases.add(r.interpreter.direction.phase)
  }
  assert.ok(peak > 0.9 && peak <= 1)
  assert.ok(highestSpeed > 8)
  assert.ok(phases.has('RISING') && phases.has('DENSE') && phases.has('IMPACT'))
  r.mapping.values = { bass: 0, mid: 0, high: 0, energy: 0 }
  for (let i = 0; i < 600; i++) { r.tick(); motion.update(r.interpreter.direction, true, false, 1 / 60); phases.add(r.interpreter.direction.phase) }
  assert.ok(phases.has('RELEASE'))
  assert.ok(r.interpreter.direction.intensity < 0.01 && r.interpreter.direction.heat < 0.01)
  assert.ok(motion.forward < 0.2)
  console.log('intensity peak / travel peak:', peak.toFixed(3), highestSpeed.toFixed(2))
})

test('actual encounters exceed the old maximum generated clusters by at least 2.5x', () => {
  const old = rig(LegacyInterpreter), next = rig(), world = new StardustWorldDynamics(20)
  old.mapping.values = { ...strong }; next.mapping.values = { ...strong }
  let oldCount = 0, lastOldId = 0
  for (let frame = 0; frame < 3600; frame++) {
    old.tick(); next.tick(); world.update(next.interpreter, 1 / 60)
    if (old.interpreter.structure.id !== lastOldId) { lastOldId = old.interpreter.structure.id; oldCount += old.interpreter.structure.pair ? 2 : 1 }
  }
  console.log('encounters vs prior generated clusters:', world.events.encounters, oldCount, 'traversals', world.events.traversals)
  assert.ok(world.events.encounters / oldCount >= 2.5)
  assert.ok(world.events.traversals > 0)
})

test('background rhythm moves dust with no clusters, and bands produce different velocity directions', () => {
  const results = []
  for (const band of ['bass', 'mid', 'high']) {
    const r = rig(), world = new StardustWorldDynamics(1200)
    // Disable local effects: the continuous field must carry the event by itself.
    world.events.update = () => {}
    for (let i = 0; i < 90; i++) { r.tick(); world.update(r.interpreter, 1 / 60) }
    Object.assign(r.mapping.transient, { id: 1, age: 0, strength: 0.85, bass: 0, mid: 0, high: 0, [band]: 1 })
    const sums = [0, 0, 0]
    for (let i = 0; i < 30; i++) {
      r.tick(); world.update(r.interpreter, 1 / 60)
      for (let n = 0; n < world.velocities.length; n++) sums[n % 3] += Math.abs(world.velocities[n])
    }
    results.push(sums)
  }
  assert.ok(results[0][2] > results[0][0] * 2, 'kick is primarily depth movement')
  assert.ok(results[1][0] > results[1][2] * 3, 'mid transient shears laterally')
  assert.ok(results[2][2] > 4000, 'high transient reaches background particles')
  assert.notDeepEqual(results[0], results[2])
})

test('scale, shapes and spatial color regions vary without per-frame particle creation', () => {
  const events = new JourneyEvents(), classes = new Set(), shapes = new Set()
  const camera = { x: 0, y: 0, z: 0 }
  for (let id = 1; id <= 80; id++) {
    events.spawn({ id, intensity: 0.95, strength: 0.85, kind: 'mid', pair: false }, camera, { x: 0, y: 0, z: 0.1 }, 1 / 60)
    const a = events.attractors[(events.nextAttractor - 1) % events.attractors.length]
    classes.add(a.scaleClass); shapes.add(a.shape)
    assert.ok(a.z < -5, 'structures appear ahead, never on the lens')
  }
  assert.equal(classes.size, 5); assert.equal(shapes.size, 7)
})

test('reduced motion preserves director intensity while lowering inertial travel', () => {
  const full = new JourneyMotion(), reduced = new JourneyMotion()
  const d = { cameraEnergy: 0.9, kick: 0.2, tension: 0.2 }
  let previous = 0
  for (let i = 0; i < 480; i++) {
    full.update(d, true, false, 1 / 60); reduced.update(d, true, true, 1 / 60)
    assert.ok(Math.abs(full.forward - previous) < 0.4, 'acceleration is continuous')
    previous = full.forward
  }
  assert.ok(reduced.forward < full.forward * 0.2)
  assert.ok(Math.abs(reduced.vertical) < Math.abs(full.vertical) * 0.2)
  assert.equal(d.cameraEnergy, 0.9)
})

test('rhythmic dust detects repeated pulses on a sustained bed without inventing constant-noise beats', () => {
  const r = rig(); r.mapping.values = { ...strong }; r.mapping.targets = { ...strong }
  for (let i = 0; i < 240; i++) { r.mapping.rms = 0.3 * (1 + Math.sin(i * 1.1) * 0.02); r.tick() }
  assert.equal(r.interpreter.direction.pulse.id, 0)
  for (let i = 0; i < 600; i++) {
    r.mapping.rms = 0.3 + 0.22 * Math.exp(-(i % 20) / 5)
    r.tick()
  }
  assert.ok(r.interpreter.direction.pulse.id >= 24, 'most 3 Hz repetitions should visibly pulse')
  assert.equal(r.interpreter.event.id, 0, 'dust rhythm is independent of explosion scheduling')
})
