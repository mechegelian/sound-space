import { createStardust } from './StardustDynamics.js'
import JourneyEvents from './JourneyEvents.js'
import JourneyMotion from './JourneyMotion.js'

export const WORLD_HALF_SIZE = [18, 12, 24]

export default class StardustWorldDynamics {
  constructor(count = 9000) {
    // Retain V2's typed attributes, stable affinities and motion-memory buffers.
    this.particles = createStardust(count)
    this.activeCount = count
    this.velocities = new Float32Array(count * 3)
    this.events = new JourneyEvents()
    this.motion = new JourneyMotion()
    this.reducedMotion = false
    this.activeAttractors = new Array(12); this.activeWaves = new Array(5)
    this.rhythmTable = new Float32Array(129)
    for (let i = 0; i <= 128; i++) { const t = i * 1.4 / 128; this.rhythmTable[i] = (1 - Math.exp(-t / 0.025)) * Math.exp(-t / 0.25) }
    this.time = 0; this.distance = 0; this.speed = 0; this.wraps = 0
    this.travelStep = 0
    let seed = 19173
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
    const p = this.particles
    for (let i = 0; i < count; i++) {
      const n = i * 3
      const x = (random() - 0.5) * 36, z = (random() - 0.5) * 48
      // Infinite-looking ribbons interspersed with sparse open space. These
      // are density seeds, not an object silhouette or a fixed central mass.
      const y = random() < 0.58 ? Math.sin(x * 0.3 + z * 0.17) * 4 + (random() + random() - 1) * 2 : (random() - 0.5) * 24
      p.positions[n] = x; p.positions[n + 1] = y; p.positions[n + 2] = z
      p.affinities[n] = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(x * 0.3 + z * 0.2))
      p.affinities[n + 1] = 0.4 + 0.6 * (0.5 + 0.5 * Math.cos(y * 0.7 - z * 0.25))
      p.affinities[n + 2] = 0.3 + 0.7 * random()
      p.tints[i] = random()
      p.brightness[i] = 0.3 + random() ** 2 * 1.2
    }
    p.base.set(p.positions); p.memory.set(p.positions)
  }

  update(interpreter, delta, camera = { x: 0, y: 0, z: 0 }) {
    const dt = Math.min(0.05, Math.max(0, delta)), f = interpreter.features
    this.time += dt
    const d = interpreter.direction
    const travel = this.motion.update(d, f.playing, this.reducedMotion, dt)
    this.speed = this.motion.forward
    if (!f.playing && this.speed < 0.00001) this.speed = 0
    this.travelStep = this.speed * dt; this.distance += this.travelStep
    this.events.update(interpreter, dt, travel, camera)
    let attractorCount = 0, waveCount = 0
    for (const a of this.events.attractors) if (a.active && a.gain > 0.001) this.activeAttractors[attractorCount++] = a
    for (const w of this.events.waves) if (w.active) this.activeWaves[waveCount++] = w
    const { positions, memory, activity, affinities, seeds, response, count } = this.particles
    const velocity = this.velocities, time = this.time
    const intensity = d?.intensity || 0
    const drive = intensity * intensity
    const inertia = 1 - Math.exp(-dt / (0.30 - intensity * 0.17)), remember = 1 - Math.exp(-dt / (0.07 + f.energy * 0.05))
    const activeCount = Math.min(count, this.activeCount)
    const illuminate = 1 - Math.exp(-dt / 0.06)
    for (let i = 0; i < activeCount; i++) {
      const n = i * 3, phase = seeds[i] * 6.28318
      let x = positions[n], y = positions[n + 1], z = positions[n + 2]
      const low = (f.compression * 1.5 + drive * f.low * 2.5) * affinities[n]
      const middle = (f.flow * 1.8 + drive * f.mid * 3) * affinities[n + 1]
      const high = (f.texture * 1.5 + drive * f.high * 2.5) * affinities[n + 2]
      // Slowly changing directional flow + broad rolling compression.
      let vx = Math.sin(y * 0.45 + z * 0.18 + time * 0.09) * (0.025 + middle * 0.34)
      let vy = Math.cos(x * 0.32 - z * 0.22 + time * 0.07) * (0.018 + middle * 0.22)
      let vz = Math.sin(x * 0.25 + y * 0.4 + time * 0.1) * (0.02 + low * 0.5)
      vx += Math.sin(z * 0.38 + time * 0.2) * low * 0.55
      vy += Math.cos(x * 0.4 + time * 0.15) * low * 0.35
      vx += Math.sin(time * 3.2 + phase + y * 2) * high * 0.075
      vy += Math.cos(time * 4.1 + phase + z * 2) * high * 0.07
      // Rhythm belongs to the whole field, with depth/phase offsets and distinct
      // low compression, mid shear, and high directional acceleration.
      const pulse = d?.pulse
      let rhythm = 0
      if (pulse && pulse.age < 1.4) {
        const age = pulse.age - (0.5 + 0.5 * Math.sin(z * 0.25 + x * 0.12)) * 0.12
        if (age > 0) {
          const sample = Math.min(127.999, age * (128 / 1.4)), index = sample | 0
          const envelope = pulse.strength * (this.rhythmTable[index] + (this.rhythmTable[index + 1] - this.rhythmTable[index]) * (sample - index))
          const local = 0.5 + seeds[i] * 0.5
          const depth = z - camera.z
          vx += -Math.tanh((x - camera.x) * 0.3) * envelope * pulse.low * 4.5 * local
          vy += Math.sin(x * 0.4 + phase * 0.1) * envelope * pulse.mid * 8 * local
          vx += Math.cos(y * 0.35 + z * 0.15) * envelope * pulse.mid * 10 * local
          vz += Math.tanh(depth * 0.22) * envelope * pulse.low * 16 * local
          vx += Math.sin(phase + y * 0.8) * envelope * pulse.high * 4 * local
          vz += envelope * pulse.high * 6 * affinities[n + 2]
          rhythm = envelope * (0.15 + pulse.high * 0.4) * local
        }
      }
      let glow = rhythm
      for (let j = 0; j < attractorCount; j++) {
        const a = this.activeAttractors[j]
        const dx = a.x - x, dy = a.y - y, dz = a.z - z
        if (Math.abs(dx) > a.bound || Math.abs(dy) > a.bound || Math.abs(dz) > a.bound) continue
        const lx = dx * a.cosine - dz * a.sine, lz = dx * a.sine + dz * a.cosine
        const nx = lx * a.invX, ny = dy * a.invY, nz = lz * a.invZ
        const normalized = nx * nx + ny * ny + nz * nz
        if (normalized > 1) continue
        const falloff = 1 - normalized
        const pull = a.gain * falloff * (a.kind === 'low' ? 2.6 : 1.8) * (1 + a.tension * 0.7) * a.density
        const release = a.phase === 'RELEASE' || a.phase === 'DECAY' ? -0.8 : 1
        const longitudinal = a.shape === 1 || a.shape === 5 ? 0.1 : 1
        const hollow = a.shape === 5 ? Math.max(-0.8, Math.sqrt(nx * nx + ny * ny) - 0.35) * 3 : 1
        vx += dx * pull * release * hollow
        vy += dy * pull * release * (a.shape === 2 ? 2 : hollow)
        vz += dz * pull * release * longitudinal
        if (a.shape === 6) vy += Math.sin(lx * 2 + a.rotation) * pull * a.radius * 0.4
        if (a.kind !== 'low') {
          const swirl = 1.3 + f.turbulence * 1.4
          vx += -dz * pull * swirl; vz += dx * pull * swirl
        }
        glow += falloff * a.gain * 0.28
      }
      for (let j = 0; j < waveCount; j++) {
        const w = this.activeWaves[j]
        const dx = x - w.x, dy = y - w.y, dz = z - w.z, d2 = dx * dx + dy * dy + dz * dz
        const max = w.radius + w.width * 3
        if (d2 > max * max) continue
        const distance = Math.max(0.12, Math.sqrt(d2)), front = (distance - w.radius) / w.width
        if (Math.abs(front) > 3) continue
        const hit = Math.exp(-front * front) * w.strength * (1 - w.age / w.life)
        const push = hit * (2 + w.strength * 5) / distance
        vx += dx * push; vy += dy * push; vz += dz * push
        glow += hit * 1.3
      }
      // An inertial velocity field keeps attraction, release and impulses fluid.
      velocity[n] += (vx * response[i] - velocity[n]) * inertia
      velocity[n + 1] += (vy * response[i] - velocity[n + 1]) * inertia
      velocity[n + 2] += (vz * response[i] - velocity[n + 2]) * inertia
      x += velocity[n] * dt + travel.x; y += velocity[n + 1] * dt + travel.y; z += velocity[n + 2] * dt + travel.z
      // Recycling happens at dark, fogged boundaries relative to the visitor.
      let wrapped = false
      if (x - camera.x > 18) { x -= 36; wrapped = true }
      else if (x - camera.x < -18) { x += 36; wrapped = true }
      if (y - camera.y > 12) { y -= 24; wrapped = true }
      else if (y - camera.y < -12) { y += 24; wrapped = true }
      if (z - camera.z > 24) { z -= 48; wrapped = true }
      else if (z - camera.z < -24) { z += 48; wrapped = true }
      positions[n] = x; positions[n + 1] = y; positions[n + 2] = z
      if (wrapped) {
        this.wraps++
        memory[n] = x; memory[n + 1] = y; memory[n + 2] = z
        velocity[n] *= 0.3; velocity[n + 1] *= 0.3; velocity[n + 2] *= 0.3
      } else {
        memory[n] += (x - memory[n]) * remember
        memory[n + 1] += (y - memory[n + 1]) * remember
        memory[n + 2] += (z - memory[n + 2]) * remember
      }
      activity[i] += (Math.min(1.5, glow) - activity[i]) * illuminate
    }
    return positions
  }
}
