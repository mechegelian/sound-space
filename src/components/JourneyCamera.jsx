import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { Vector3 } from 'three'

export default function JourneyCamera({ world, interpreter }) {
  const { camera, gl } = useThree()
  const controls = useRef(), interaction = useRef({ active: false, idle: 0, blend: 0 })
  const heading = useRef(new Vector3()), up = useRef(new Vector3(0, 1, 0))
  useEffect(() => {
    camera.position.set(0, 0, 1.5)
    camera.near = 0.025; camera.far = 100; camera.fov = 58
    camera.clearViewOffset(); camera.updateProjectionMatrix()
    const orbit = new OrbitControls(camera, gl.domElement)
    orbit.target.set(0, 0, -4)
    orbit.enablePan = false; orbit.enableDamping = true; orbit.dampingFactor = 0.065
    orbit.rotateSpeed = 0.32; orbit.zoomSpeed = 0.65
    orbit.minDistance = 0.4; orbit.maxDistance = 14
    const start = () => { interaction.current.active = true; interaction.current.idle = 0 }
    const end = () => { interaction.current.active = false; interaction.current.idle = 0 }
    orbit.addEventListener('start', start); orbit.addEventListener('end', end)
    controls.current = orbit
    camera.userData.journeyControls = orbit
    orbit.update()
    return () => {
      orbit.dispose(); controls.current = null
      delete camera.userData.journeyControls
      camera.fov = 45; camera.near = 0.1; camera.updateProjectionMatrix()
    }
  }, [camera, gl])
  useFrame((_, delta) => {
    const orbit = controls.current
    if (!orbit) return
    const dt = Math.min(0.05, delta), state = interaction.current
    state.idle = state.active ? 0 : state.idle + dt
    const target = state.idle > 2.5 ? 1 : 0
    state.blend += (target - state.blend) * (1 - Math.exp(-dt / (target ? 1.5 : 0.12)))
    const d = interpreter.direction, reduction = world.motion.reduction
    // Incremental heading changes preserve the view the user chose. There is no
    // target angle to snap back to; journey translation continues during input.
    const yaw = Math.sin(world.motion.phase * 0.73) * d.cameraEnergy ** 2 * 0.04 * dt * state.blend * reduction
    heading.current.copy(orbit.target).sub(camera.position).applyAxisAngle(up.current, yaw)
    orbit.target.copy(camera.position).add(heading.current)
    orbit.update(dt)
    const targetFov = 58 + (d.cameraEnergy ** 2 * 10 + d.kick * 4) * reduction
    const fov = camera.fov + (targetFov - camera.fov) * (1 - Math.exp(-dt / 0.35))
    if (Math.abs(camera.fov - fov) > 0.001) { camera.fov = fov; camera.updateProjectionMatrix() }
    camera.rotateZ(Math.sin(world.motion.phase * 0.6) * d.cameraEnergy ** 2 * 0.022 * state.blend * reduction)
  })
  return null
}
