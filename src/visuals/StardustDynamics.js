export function createStardust(count) {
  const base = new Float32Array(count * 3)
  const positions = new Float32Array(count * 3)
  const seeds = new Float32Array(count)
  const sizes = new Float32Array(count)
  const tints = new Float32Array(count)
  const affinities = new Float32Array(count * 3)
  const response = new Float32Array(count)
  const directions = new Float32Array(count)
  const brightness = new Float32Array(count)
  const memory = new Float32Array(count * 3)
  const activity = new Float32Array(count)
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
    // Spatially coherent affinities, with small stable individual differences.
    // Regions overlap: there are no hard bands or isolated particle categories.
    affinities[i * 3] = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(x * 1.65 - z * 0.8))
    affinities[i * 3 + 1] = 0.35 + 0.65 * (0.5 + 0.5 * Math.cos(y * 2.1 + z * 1.4))
    affinities[i * 3 + 2] = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(z * 2.3 - x * 1.6 + 1.5))
    response[i] = 0.7 + random() * 0.6
    directions[i] = Math.tanh((z + y * 0.4) * 2.4)
    brightness[i] = 0.6 + random() ** 2 * 0.8
  }
  positions.set(base)
  memory.set(base)
  return { count, base, positions, seeds, sizes, tints, affinities, response, directions, brightness, memory, activity }
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
    this.lastTransient = 0
    this.waves = Array.from({ length: 4 }, () => ({ age: 4, life: 2.4, speed: 2, width: 0.24, strength: 0, x: 0, y: 0, z: 0 }))
    this.activeWaves = new Array(4)
    this.pulses = this.waves
    this.motion = { macro: 0, meso: 0, micro: 0 }
  }

  launchWave(strength, bass, mid, high) {
    const wave = this.waves[this.event % this.waves.length]
    wave.age = 0
    wave.strength = Math.min(1, Math.max(0.08, strength))
    wave.life = 0.65 + wave.strength * 1.6
    wave.speed = 0.85 + wave.strength * 1.55
    wave.width = 0.12 + wave.strength * 0.17
    // Smaller high-frequency onsets originate in outer pockets; kicks near core.
    const bright = high > bass && high > mid
    wave.x = (this.event % 2 ? 1 : -1) * (bright ? 0.95 : 0.38)
    wave.y = this.event % 3 === 0 ? -0.32 : 0.32
    wave.z = bright ? 0.45 : -0.12
    this.event++
  }

  update(mapping, delta) {
    const step = Math.min(0.1, Math.max(0, delta))
    const { bass, mid, high, energy } = mapping.values
    this.time += step
    // Different nonlinear envelopes: strong sections unlock broad motion while
    // quiet input retains fine structure. These are NOT whole-object scales.
    const macro = bass * 0.65 + bass * bass * 1.15
    const meso = mid * 0.6 + mid * mid * 1.25
    const micro = high * 0.45 + high * high * 1.15
    this.motion.macro = macro; this.motion.meso = meso; this.motion.micro = micro
    this.flowTime += step * (0.12 + meso * 0.7 + energy * 0.2)
    this.fineTime += step * (1.1 + micro * 5.5)
    const onset = mapping.targets.energy
    if (mapping.transient) {
      if (mapping.transient.id !== this.lastTransient) {
        this.lastTransient = mapping.transient.id
        this.launchWave(mapping.transient.strength, mapping.transient.bass, mapping.transient.mid, mapping.transient.high)
      }
    } else {
      // Keep the standalone values/targets interface usable for deterministic
      // simulations. Live audio uses the quieter onset detector in the mapper.
      this.cooldown = Math.max(0, this.cooldown - step)
      if (onset < 0.23 || onset < this.baseline * 0.72) this.armed = true
      if (this.armed && !this.cooldown && onset > 0.43 && onset - this.baseline > 0.14) {
        this.launchWave(Math.min(1, (onset - this.baseline) * 1.8), bass, mid, high)
        this.cooldown = 0.65
        this.armed = false
      }
    }
    this.baseline += (onset - this.baseline) * (1 - Math.exp(-step / 0.8))
    let waveCount = 0
    for (const wave of this.waves) {
      wave.age += step
      if (wave.age < wave.life) {
        wave.radius = wave.age * wave.speed
        wave.decay = 1 - wave.age / wave.life
        wave.inverseWidth = 1 / wave.width
        this.activeWaves[waveCount++] = wave
      }
    }

    const { count, base, positions, seeds, affinities, response, directions, memory, activity } = this.particles
    const time = this.time, flow = this.flowTime, fine = this.fineTime
    const settle = 1 - Math.exp(-step / 0.055)
    const remember = 1 - Math.exp(-step / (0.055 + energy * 0.07))
    for (let i = 0; i < count; i++) {
      const n = i * 3, seed = seeds[i], phase = seed * Math.PI * 2
      const bx = base[n], by = base[n + 1], bz = base[n + 2]
      const low = macro * affinities[n] * response[i]
      const middle = meso * affinities[n + 1] * response[i]
      const upper = micro * affinities[n + 2] * response[i]
      // Opposing, spatially coherent vortices produce folds and streams.
      const twist = time * 0.018 * (0.4 + seed) + middle * 0.72 * Math.sin(by * 1.9 + flow) * directions[i]
      const c = Math.cos(twist), s = Math.sin(twist)
      const pressure = low * 0.44 * Math.sin(flow * 0.7 + bx * 1.4 + by * 0.8 + bz * 0.65)
      let x = (bx * c - bz * s) * (1 + pressure)
      let z = (bx * s + bz * c) * (1 + pressure * 0.7)
      let y = by * (1 + pressure * 0.5)
      // Broad offset density waves are stronger near their own low-affinity region.
      y += low * 0.22 * Math.sin(bx * 1.7 - bz * 1.2 + flow * 0.6)
      z += low * 0.16 * Math.cos(by * 1.4 + flow * 0.75)
      const drift = middle * 0.5 + energy * 0.11
      // Nearby particles share streamlines; individual phase only perturbs the
      // flow slightly. This preserves legible folds when viewed from inside.
      x += Math.sin(by * 1.7 + bz * 0.7 + flow + phase * 0.04) * drift
      y += Math.cos(bx * 1.5 + phase * 0.04 + flow * 0.8) * drift * 0.75
      z += Math.sin(bx * 1.2 - by + phase * 0.04 + flow * 0.65) * drift
      y -= Math.sin(by * 4.0 + bz * 1.4 + flow * 0.5) * middle * 0.13
      x += Math.sin(flow + phase + by) * 0.035
      y += Math.cos(flow * 0.8 + phase + bx) * 0.026
      z += Math.sin(flow * 0.65 + phase - by) * 0.035
      // Fine disturbances have their own frequency, direction and spatial scale.
      const detail = upper * (0.055 + seed * 0.095)
      x += Math.sin(fine + phase + by * 4) * detail
      y += Math.cos(fine * 1.3 + phase + bz * 3) * detail
      z += Math.sin(fine * 0.85 + phase + bx * 5) * detail * 0.7
      let accent = 0
      for (let j = 0; j < waveCount; j++) {
        const wave = this.activeWaves[j]
        const dx = bx - wave.x, dy = by - wave.y, dz = bz - wave.z
        const distance = Math.max(0.05, Math.sqrt(dx * dx + dy * dy + dz * dz))
        const front = (distance - wave.radius) * wave.inverseWidth
        if (front > 4 || front < -6) continue
        const envelope = Math.exp(-front * front) * wave.decay
        const wake = Math.exp(-(front + 1.6) * (front + 1.6) * 0.6) * 0.2
        const push = (envelope - wake * wave.decay) * wave.strength * 0.95 * response[i] / distance
        x += dx * push; y += dy * push; z += dz * push
        accent += envelope * wave.strength
      }
      positions[n] += (x - positions[n]) * settle
      positions[n + 1] += (y - positions[n + 1]) * settle
      positions[n + 2] += (z - positions[n + 2]) * settle
      memory[n] += (positions[n] - memory[n]) * remember
      memory[n + 1] += (positions[n + 1] - memory[n + 1]) * remember
      memory[n + 2] += (positions[n + 2] - memory[n + 2]) * remember
      activity[i] += (Math.min(1.5, accent) - activity[i]) * settle
    }
    return positions
  }
}
