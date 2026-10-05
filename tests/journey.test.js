import test from 'node:test'
import assert from 'node:assert/strict'
import AudioEventInterpreter from '../src/audio/AudioEventInterpreter.js'
import StardustWorldDynamics from '../src/visuals/StardustWorldDynamics.js'
import JourneyEvents from '../src/visuals/JourneyEvents.js'

function fixture() {
  const interpreter = new AudioEventInterpreter()
  const mapping = { values: { bass: 0, mid: 0, high: 0, energy: 0 }, transient: { id: 0, strength: 0, age: Infinity, bass: 0, mid: 0, high: 0 } }
  const transport = { objectUrl: 'local', context: { state: 'running' }, audio: { paused: false, ended: false, seeking: false, readyState: 4, currentTime: 0 } }
  const tick = (frames = 1) => { for (let i = 0; i < frames; i++) { transport.audio.currentTime += 1 / 60; mapping.transient.age += 1 / 60; interpreter.update(mapping, transport, 1 / 60) } }
  return { interpreter, mapping, transport, tick }
}

test('journey interpretation has hysteresis, calm restraint, sustained structures, and separate impulses', () => {
  const f = fixture(); f.tick(240)
  assert.equal(f.interpreter.state, 'CALM'); assert.equal(f.interpreter.structure.id, 0)
  f.mapping.values = { bass: 0.1, mid: 0.32, high: 0.08, energy: 0.34 }
  f.tick(30); assert.equal(f.interpreter.state, 'CALM', 'state cannot chatter on a short change')
  f.tick(240); assert.equal(f.interpreter.state, 'FLOW')
  assert.ok(f.interpreter.structure.id > 0); assert.equal(f.interpreter.event.id, 0)
  const prior = f.interpreter.structure.id
  f.tick(60); assert.equal(f.interpreter.structure.id, prior, 'sustained input is rate-limited')
  f.mapping.transient = { id: 1, strength: 0.78, high: 0.1, bass: 0.8, mid: 0.1, age: 0 }
  f.tick(); assert.equal(f.interpreter.event.kind, 'IMPACT'); assert.equal(f.interpreter.event.id, 1)
  f.tick(60); assert.equal(f.interpreter.event.id, 1)
  f.transport.audio.currentTime = 100
  const epoch = f.interpreter.epoch
  f.tick(); assert.equal(f.interpreter.epoch, epoch + 1); assert.equal(f.interpreter.event.id, 1)
})

test('world surrounds the visitor, recycles in darkness, and pause/seek preserve continuity', () => {
  const world = new StardustWorldDynamics(1500), f = fixture(), camera = { x: 0, y: 0, z: 1.5 }
  const refs = { positions: world.particles.positions, memory: world.particles.memory, velocity: world.velocities }
  let front = 0, behind = 0, above = 0, below = 0
  for (let n = 0; n < refs.positions.length; n += 3) {
    if (refs.positions[n + 2] < camera.z) front++; else behind++
    if (refs.positions[n + 1] > 0) above++; else below++
  }
  assert.ok(Math.min(front, behind, above, below) > 450)
  for (let i = 0; i < 360; i++) { f.tick(); world.update(f.interpreter, 1 / 60, camera) }
  assert.ok(world.distance > 0.5)
  f.transport.audio.paused = true
  for (let i = 0; i < 480; i++) { f.tick(); world.update(f.interpreter, 1 / 60, camera) }
  assert.ok(world.speed < 0.0001)
  const position = refs.positions.slice()
  f.transport.audio.currentTime = 300; f.tick(); world.update(f.interpreter, 1 / 60, camera)
  let peak = 0
  for (let i = 0; i < position.length; i++) peak = Math.max(peak, Math.abs(position[i] - refs.positions[i]))
  assert.ok(peak < 0.02, 'seeking must not teleport the field')
  camera.x = 9; camera.z = -6
  world.update(f.interpreter, 1 / 60, camera)
  assert.ok(world.wraps > 0)
  for (let n = 0; n < refs.positions.length; n += 3) {
    assert.ok(Math.abs(refs.positions[n] - camera.x) <= 18.01)
    assert.ok(Math.abs(refs.positions[n + 2] - camera.z) <= 24.01)
  }
  assert.equal(world.particles.positions, refs.positions)
  assert.equal(world.particles.memory, refs.memory)
  assert.equal(world.velocities, refs.velocity)
})

test('pooled cluster lifecycle produces a local collision, short fragments and smooth release', () => {
  const events = new JourneyEvents(), f = fixture(), camera = { x: 0, y: 0, z: 0 }
  const attractors = [...events.attractors], bursts = [...events.bursts], fragments = events.fragments.positions
  f.interpreter.structure = { id: 1, kind: 'low', strength: 0.85, pair: true }
  const phases = new Set()
  let peak = 0
  for (let i = 0; i < 720; i++) {
    events.update(f.interpreter, 1 / 60, 0, camera)
    for (const a of events.attractors) if (a.active) phases.add(a.phase)
    peak = Math.max(peak, ...events.fragments.alphas)
  }
  assert.equal(events.clusterCount, 2); assert.equal(events.collisions, 1)
  assert.equal(events.burstCount, 1); assert.ok(peak > 0.1)
  assert.ok(phases.has('BIRTH') && phases.has('GROWTH') && phases.has('ACTIVE') && phases.has('RELEASE'))
  assert.equal(events.attractors.some(a => a.active), false)
  assert.equal(events.bursts.some(b => b.active), false)
  assert.equal(Math.max(...events.fragments.alphas), 0)
  assert.equal(events.fragments.positions, fragments)
  events.attractors.forEach((a, i) => assert.equal(a, attractors[i]))
  events.bursts.forEach((b, i) => assert.equal(b, bursts[i]))
  assert.ok(events.bursts.every(b => b.life < 1))
})

test('texture, ocean-like sustained lows, and strong rhythmic input have distinct world controls', () => {
  const presets = [
    { bass: 0.02, mid: 0.08, high: 0.3, energy: 0.3 },
    { bass: 0.38, mid: 0.3, high: 0.02, energy: 0.4 },
    { bass: 0.8, mid: 0.4, high: 0.05, energy: 0.82 },
  ]
  const result = presets.map(values => {
    const f = fixture(); f.mapping.values = values; f.tick(300)
    return f.interpreter
  })
  assert.equal(result[0].state, 'TEXTURE')
  assert.equal(result[1].state, 'FLOW')
  assert.equal(result[2].state, 'BUILD')
  assert.equal(result[2].structure.pair, true)
  assert.ok(result[2].features.compression > result[0].features.compression * 10)
  assert.equal(result[0].structure.pair, false)
})

test('decoder startup and fading previous-file energy cannot create spurious world events', () => {
  const f = fixture(); f.tick()
  f.mapping.transient = { id: 1, age: 0, strength: 0.6, bass: 0.1, mid: 0.1, high: 0.8 }
  f.tick(10)
  assert.equal(f.interpreter.event.id, 0)
  f.mapping.values = { bass: 0.8, mid: 0.4, high: 0.1, energy: 0.8 }
  f.mapping.targets = { energy: 0 }
  f.tick(300)
  assert.equal(f.interpreter.structure.id, 0, 'only fading envelopes remain after a silent replacement')
})
