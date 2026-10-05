const smooth = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x) }

// Fixed pools. Events live in the same floating coordinate frame as the dust.
export default class JourneyEvents {
  constructor() {
    this.attractors = Array.from({ length: 12 }, () => ({ active: false, age: 0, life: 9, gain: 0, x: 0, y: 0, z: 0, vx: 0, radius: 3, strength: 0, kind: 'mid', pair: 0, collided: false, phase: 'BIRTH', shape: 0, scaleClass: 'MEDIUM', ax: 1, ay: 1, az: 1, rotation: 0, cosine: 1, sine: 0, tension: 0 }))
    this.waves = Array.from({ length: 5 }, () => ({ active: false, age: 0, life: 2, x: 0, y: 0, z: 0, radius: 0, width: 0.5, strength: 0, speed: 3 }))
    this.bursts = Array.from({ length: 8 }, () => ({ active: false, age: 0, life: 0.72, x: 0, y: 0, z: 0, strength: 0, tint: 0 }))
    this.nextAttractor = 0; this.nextWave = 0; this.nextBurst = 0
    this.zones = Array.from({ length: 4 }, () => ({ age: 20, life: 10, x: 0, y: 0, z: 0, radius: 5, warm: 0, peak: 0, ethereal: 0 }))
    this.zonePositions = new Float32Array(16)
    this.zoneWeights = new Float32Array(12)
    this.nextZone = 0
    this.encounters = 0; this.traversals = 0
    this.structureId = 0; this.eventId = 0; this.epoch = 0
    this.collisions = 0; this.burstCount = 0; this.waveCount = 0; this.clusterCount = 0
    this.fragmentCount = 8 * 25
    this.fragments = { positions: new Float32Array(this.fragmentCount * 3), sizes: new Float32Array(this.fragmentCount), colors: new Float32Array(this.fragmentCount * 3), alphas: new Float32Array(this.fragmentCount) }
    this.fragmentDirections = new Float32Array(this.fragmentCount * 3)
    for (let i = 0; i < this.fragmentCount; i++) {
      const angle = i * 2.3999632297, y = 1 - 2 * ((i % 25) + 0.5) / 25, r = Math.sqrt(1 - y * y)
      this.fragmentDirections[i * 3] = Math.cos(angle) * r
      this.fragmentDirections[i * 3 + 1] = y
      this.fragmentDirections[i * 3 + 2] = Math.sin(angle) * r
    }
  }

  emit(x, y, z, strength, burst = true, high = false) {
    const wave = this.waves[this.nextWave++ % this.waves.length]
    Object.assign(wave, { active: true, age: 0, x, y, z, strength, radius: 0, life: 0.8 + strength * 2.1, speed: 1.2 + strength * 5.5, width: 0.18 + strength * 0.5 })
    this.waveCount++
    if (burst) {
      const b = this.bursts[this.nextBurst++ % this.bursts.length]
      Object.assign(b, { active: true, age: 0, x, y, z, strength, tint: high ? 1 : 0.2, life: 0.48 + strength * 0.28 })
      this.burstCount++
    }
  }

  spawn(structure, camera, travel, dt = 1) {
    const number = structure.pair ? 2 : 1
    // Alternating lanes put events beside the viewing corridor, never at lens.
    const intensity = structure.intensity || 0
    const variant = structure.id * 0.61803398875 % 1
    const scaleSample = (structure.id * 0.754877666 % 1) * (0.65 + intensity * 0.35)
    const scaleClass = scaleSample < 0.16 ? 'MICRO' : scaleSample < 0.36 ? 'SMALL' : scaleSample < 0.65 ? 'MEDIUM' : scaleSample < 0.87 ? 'LARGE' : 'MASSIVE'
    const radius = scaleSample < 0.16 ? 0.65 + variant * 0.7 : scaleSample < 0.36 ? 1.4 + variant * 1.1 : scaleSample < 0.65 ? 2.6 + variant * 1.6 : scaleSample < 0.87 ? 4.5 + variant * 2.2 : 7.2 + variant * 2.2
    const crossing = intensity > 0.55 && variant < 0.62
    const lane = crossing ? Math.sin(structure.id) * 0.45 : (structure.id % 2 ? -1 : 1) * (1.4 + variant * 2.2)
    const speed = typeof travel === 'object' ? travel.z / Math.max(0.001, dt) : 0
    const lead = 1 + variant * 0.8
    for (let side = 0; side < number; side++) {
      const a = this.attractors[this.nextAttractor++ % this.attractors.length]
      const shape = (structure.id * 3 + side) % 7
      Object.assign(a, { active: true, age: 0, life: 5.5 + radius * 0.6 + variant * 2,
        x: camera.x + lane + (number === 2 ? side === 0 ? -2.4 : 2.4 : 0),
        y: camera.y + (crossing ? 0 : Math.sin(structure.id * 1.7) * 2) - (travel?.y || 0) / Math.max(0.001, dt) * lead,
        z: camera.z - Math.min(20, 5 + speed * lead + variant * 3),
        vx: number === 2 ? (side === 0 ? 1 : -1) * (0.7 + intensity * 0.7) : Math.sin(structure.id) * 0.2,
        radius, scaleClass, shape, rotation: variant * 6.28, density: 0.65 + variant,
        ax: shape === 1 ? 0.45 : shape === 2 ? 1.6 : shape === 5 ? 0.8 : 1,
        ay: shape === 2 ? 0.23 : shape === 1 ? 0.5 : shape === 6 ? 0.6 : 1,
        az: shape === 1 || shape === 5 ? 2 : shape === 4 ? 0.7 : 1,
        strength: structure.strength, kind: structure.kind, pair: number === 2 ? structure.id : 0,
        collided: false, gain: 0, phase: 'BIRTH', tension: 0, encountered: false, crossed: false })
      this.clusterCount++
    }
  }

  update(interpreter, dt, travel, camera) {
    const tx = typeof travel === 'object' ? travel.x : 0, ty = typeof travel === 'object' ? travel.y : 0, tz = typeof travel === 'object' ? travel.z : travel
    const direction = interpreter.direction
    if (interpreter.epoch !== this.epoch) {
      this.epoch = interpreter.epoch
      // Seek/file replacement releases old structures, without moving the viewer.
      for (const a of this.attractors) if (a.active) a.age = Math.max(a.age, a.life - 1.5)
    }
    if (interpreter.structure.id !== this.structureId) {
      this.structureId = interpreter.structure.id
      this.spawn(interpreter.structure, camera, travel, dt)
      const zone = this.zones[this.nextZone++ % 4]
      Object.assign(zone, { age: 0, life: 7 + (direction?.intensity || 0) * 5,
        x: camera.x - tx / Math.max(dt, 0.001), y: camera.y - ty / Math.max(dt, 0.001), z: camera.z - Math.min(17, 7 + tz / Math.max(dt, 0.001)),
        radius: 5 + (direction?.intensity || 0) * 7, warm: direction?.heat || 0, peak: (direction?.intensity || 0) ** 5, ethereal: direction?.ethereal || 0 })
    }
    if (interpreter.event.id !== this.eventId) {
      this.eventId = interpreter.event.id
      const e = interpreter.event
      const side = this.eventId % 2 ? -1 : 1
      this.emit(camera.x + side * (1.3 + this.eventId % 3 * 0.65), camera.y + Math.sin(this.eventId * 2.1), camera.z - 3.5 - this.eventId % 4,
        e.strength, e.burst, e.high > 0.45)
    }
    for (const a of this.attractors) {
      if (!a.active) continue
      a.age += dt * (direction?.release > 0.4 ? 2 : 1); a.x += tx; a.y += ty; a.z += tz
      a.rotation += dt * (0.04 + a.strength * 0.13)
      a.cosine = Math.cos(a.rotation); a.sine = Math.sin(a.rotation)
      a.invX = 1 / (a.radius * a.ax); a.invY = 1 / (a.radius * a.ay); a.invZ = 1 / (a.radius * a.az)
      a.bound = a.radius * Math.max(a.ax, a.ay, a.az)
      a.x += a.vx * dt * (a.collided ? 0.25 : 1)
      a.gain = smooth(a.age / (1.4 - (direction?.intensity || 0) * 0.6)) * smooth((a.life - a.age) / 2.2) * a.strength
      const proximity = Math.hypot(a.x - camera.x, a.y - camera.y, a.z - camera.z)
      if (!a.encountered && a.gain > 0.08 && proximity < a.radius + 4) { a.encountered = true; this.encounters++ }
      if (!a.crossed && a.gain > 0.08 && proximity < a.radius && a.radius > 4) { a.crossed = true; this.traversals++ }
      a.phase = a.age < 0.6 ? 'BIRTH' : a.age < 1.7 ? 'GROWTH' : a.age < a.life - 2.2 ? 'ACTIVE' : a.age < a.life - 0.5 ? 'DECAY' : 'RELEASE'
      if (a.age >= a.life) { a.active = false; a.gain = 0 }
    }
    for (let i = 0; i < this.attractors.length; i++) {
      const a = this.attractors[i]
      if (!a.active || !a.pair || a.collided || a.gain < 0.18) continue
      for (let j = i + 1; j < this.attractors.length; j++) {
        const b = this.attractors[j]
        if (!b.active || b.pair !== a.pair || b.collided) continue
        const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
        a.tension = b.tension = Math.max(0, 1 - distance / 4.8)
        if (distance < 0.85 + Math.min(a.radius, b.radius) * 0.12) {
          a.collided = b.collided = true
          a.age = b.age = a.life - 2
          this.collisions++
          const magnitude = Math.min(1, (a.strength + b.strength) * 0.22 + Math.sqrt(a.radius * b.radius) * 0.055 + Math.abs(a.vx - b.vx) * 0.08 + (direction?.intensity || 0) * 0.2)
          this.emit((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, magnitude, true)
        }
      }
    }
    for (const w of this.waves) {
      if (!w.active) continue
      w.age += dt; w.x += tx; w.y += ty; w.z += tz; w.radius = w.age * w.speed
      w.active = w.age < w.life
    }
    const { positions, sizes, colors, alphas } = this.fragments
    for (let slot = 0; slot < this.bursts.length; slot++) {
      const b = this.bursts[slot]
      if (b.active) { b.age += dt; b.x += tx; b.y += ty; b.z += tz; b.active = b.age < b.life }
      const fade = b.active ? Math.exp(-b.age * 6 / b.life) * smooth(b.age / 0.018) : 0
      const radius = (1 - Math.exp(-b.age * 5)) * (0.35 + b.strength * 0.85)
      for (let j = 0; j < 25; j++) {
        const index = slot * 25 + j, n = index * 3
        const scale = j === 0 ? 0 : radius * (0.55 + j % 5 * 0.11)
        positions[n] = b.x + this.fragmentDirections[n] * scale
        positions[n + 1] = b.y + this.fragmentDirections[n + 1] * scale
        positions[n + 2] = b.z + this.fragmentDirections[n + 2] * scale
        sizes[index] = j === 0 ? 6 : 1.2 + j % 3
        alphas[index] = fade * (0.35 + b.strength * 0.65)
        colors[n] = j % 3 === 0 ? 0.7 : 0.12 + b.tint * 0.3
        colors[n + 1] = j % 3 === 0 ? 0.12 : 0.65 + b.tint * 0.3
        colors[n + 2] = 1
        const heat = (direction?.heat || 0) * b.strength
        colors[n] += (1 - colors[n]) * heat
        colors[n + 1] += (0.32 + b.strength * 0.4 - colors[n + 1]) * heat
        colors[n + 2] *= 1 - heat * 0.88
      }
    }
    for (let i = 0; i < 4; i++) {
      const zone = this.zones[i]
      zone.age += dt; zone.x += tx; zone.y += ty; zone.z += tz
      const gain = smooth(zone.age / 1.1) * smooth((zone.life - zone.age) / 2)
      const n = i * 4, w = i * 3
      this.zonePositions[n] = zone.x; this.zonePositions[n + 1] = zone.y; this.zonePositions[n + 2] = zone.z; this.zonePositions[n + 3] = zone.radius
      this.zoneWeights[w] = zone.warm * gain * Math.min(1, (direction?.heat || 0) * 2)
      this.zoneWeights[w + 1] = zone.peak * gain * (1 - (direction?.release || 0))
      this.zoneWeights[w + 2] = zone.ethereal * gain
    }
  }
}
