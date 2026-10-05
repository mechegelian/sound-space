// Archived Milestone 7A dynamics. Used only for a matched audio-motion benchmark.
export function createStardust(count) {
  const base = new Float32Array(count * 3)
  const positions = new Float32Array(count * 3)
  const seeds = new Float32Array(count)
  const sizes = new Float32Array(count)
  const tints = new Float32Array(count)
  let seed = 7319
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
  const gaussian = () => Math.sqrt(-2 * Math.log(Math.max(0.000001, random()))) * Math.cos(random() * Math.PI * 2)
  for (let i = 0; i < count; i++) {
    const cluster = random()
    let x, y, z
    if (cluster < 0.55) {
      x = gaussian() * 0.72 - 0.25
      y = gaussian() * 0.40 + Math.sin(x * 1.5) * 0.35
      z = gaussian() * 0.53
    } else if (cluster < 0.82) {
      x = gaussian() * 0.45 + 0.95
      y = gaussian() * 0.39 + 0.4
      z = gaussian() * 0.42 - 0.32
    } else {
      x = gaussian() * 0.49 - 1.05
      y = gaussian() * 0.49 - 0.53
      z = gaussian() * 0.47 + 0.4
    }
    // Smoothly compress the tails, without clipping onto a spherical surface.
    const radius = Math.hypot(x, y, z)
    const taper = 1 / (1 + Math.max(0, radius - 1.5) * 0.4)
    base[i * 3] = x * taper * 1.12
    base[i * 3 + 1] = y * taper
    base[i * 3 + 2] = z * taper
    seeds[i] = random()
    sizes[i] = 1.25 + random() ** 3 * 3.2
    tints[i] = Math.min(1, Math.max(0, 0.5 + y * 0.23 + (random() - 0.5) * 0.5))
  }
  positions.set(base)
  return { count, base, positions, seeds, sizes, tints }
}

export default class StardustDynamics {
  constructor(count) {
    this.particles = createStardust(count)
    this.time = 0
    this.flowTime = 0
    this.fineTime = 0
    this.baseline = 0
    this.cooldown = 0
    this.armed = true
    this.event = 0
    this.pulses = Array.from({ length: 3 }, () => ({ age: 3, strength: 0, x: 0, y: 0, z: 0 }))
  }

  update(mapping, delta) {
    const step = Math.min(0.1, Math.max(0, delta))
    const { bass, mid, high, energy } = mapping.values
    this.time += step
    this.flowTime += step * (0.12 + mid * 0.5 + energy * 0.14)
    this.fineTime += step * (1.1 + high * 2.1)
    const onset = mapping.targets.energy
    this.cooldown = Math.max(0, this.cooldown - step)
    if (onset < 0.23 || onset < this.baseline * 0.72) this.armed = true
    if (this.armed && !this.cooldown && onset > 0.43 && onset - this.baseline > 0.14) {
      const pulse = this.pulses[this.event % 3]
      pulse.age = 0
      pulse.strength = Math.min(1, (onset - this.baseline) * 1.8)
      pulse.x = this.event % 2 ? 0.65 : -0.65
      pulse.y = this.event % 3 === 0 ? -0.25 : 0.25
      pulse.z = 0.15
      this.event++
      this.cooldown = 0.9
      this.armed = false
    }
    this.baseline += (onset - this.baseline) * (1 - Math.exp(-step / 0.8))
    for (const pulse of this.pulses) pulse.age += step

    const { count, base, positions, seeds } = this.particles
    const time = this.time, flow = this.flowTime, fine = this.fineTime
    for (let i = 0; i < count; i++) {
      const n = i * 3, seed = seeds[i], phase = seed * Math.PI * 2
      const bx = base[n], by = base[n + 1], bz = base[n + 2]
      const twist = time * 0.018 * (0.4 + seed) + mid * 0.38 * Math.sin(by * 1.9 + flow)
      const c = Math.cos(twist), s = Math.sin(twist)
      const pressure = bass * (0.12 + seed * 0.16) * Math.sin(time * 0.65 + by * 0.8 + phase * 0.3)
      let x = (bx * c - bz * s) * (1 + pressure)
      let z = (bx * s + bz * c) * (1 + pressure * 0.7)
      let y = by * (1 + pressure * 0.5)
      const drift = 0.035 + mid * 0.28 + energy * 0.09
      x += Math.sin(by * 1.7 + bz * 0.7 + flow + phase) * drift
      y += Math.cos(bx * 1.5 + phase + flow * 0.8) * drift * 0.75
      z += Math.sin(bx * 1.2 - by + phase + flow * 0.65) * drift
      const detail = high * (0.02 + seed * 0.06)
      x += Math.sin(fine + phase + by * 4) * detail
      y += Math.cos(fine * 1.3 + phase + bz * 3) * detail
      for (const pulse of this.pulses) {
        if (pulse.age >= 2.5) continue
        const dx = bx - pulse.x, dy = by - pulse.y, dz = bz - pulse.z
        const distance = Math.max(0.05, Math.hypot(dx, dy, dz))
        const front = (distance - pulse.age * 1.65) / 0.28
        const push = Math.exp(-front * front) * pulse.strength * 0.38 * (1 - pulse.age / 2.5) / distance
        x += dx * push; y += dy * push; z += dz * push
      }
      positions[n] = x; positions[n + 1] = y; positions[n + 2] = z
    }
    return positions
  }
}
