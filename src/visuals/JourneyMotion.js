// Inertial 3D travel applied equally to dust, structures and color zones.
export default class JourneyMotion {
  constructor() {
    this.phase = 0; this.forward = 0; this.vertical = 0; this.lateral = 0
    this.reduction = 1; this.travel = { x: 0, y: 0, z: 0 }
  }
  update(direction, playing, reduced, dt) {
    const c = direction?.cameraEnergy || 0, kick = direction?.kick || 0
    this.reduction += ((reduced ? 0.14 : 1) - this.reduction) * (1 - Math.exp(-dt / 0.5))
    this.phase += dt * (playing ? 0.04 + c * 0.85 + (direction?.tension || 0) * 0.25 : 0)
    const targetForward = playing ? (0.12 + c * 1.6 + c ** 3 * 12 + kick * 3.8) * this.reduction : 0
    const targetVertical = playing ? Math.sin(this.phase) * (0.02 + c * c * 4.2) * this.reduction : 0
    const targetLateral = playing ? Math.sin(this.phase * 0.73 + 0.4) * c * c * 2.8 * this.reduction : 0
    const ease = 1 - Math.exp(-dt / (targetForward > this.forward ? 0.65 : 0.5))
    this.forward += (targetForward - this.forward) * ease
    this.vertical += (targetVertical - this.vertical) * (1 - Math.exp(-dt / 1.1))
    this.lateral += (targetLateral - this.lateral) * (1 - Math.exp(-dt / 1.3))
    this.travel.x = -this.lateral * dt; this.travel.y = -this.vertical * dt; this.travel.z = this.forward * dt
    return this.travel
  }
}
