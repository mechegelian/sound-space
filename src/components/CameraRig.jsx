import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

export default function CameraRig({ dockRef, visualization = 'PLANET' }) {
  const { camera, gl, size } = useThree()
  const controls = useRef()
  const composition = useRef({ width: 0, height: 0, offset: 0, appliedOffset: NaN, mode: null })

  useEffect(() => {
    const orbit = new OrbitControls(camera, gl.domElement)
    orbit.enableDamping = true
    orbit.dampingFactor = 0.07
    orbit.rotateSpeed = 0.5
    orbit.enablePan = false
    orbit.enableZoom = false
    orbit.zoomSpeed = 0.9
    controls.current = orbit
    return () => {
      orbit.dispose()
      controls.current = null
    }
  }, [camera, gl])

  useEffect(() => {
    function compose() {
      if (!size.width || !size.height) return
      // Measure the actual dock, including wrapped errors and safe-area insets.
      const dockTop = dockRef.current?.getBoundingClientRect().top ?? size.height - 120
      const top = size.height < 500 ? 42 : 80
      const bottom = Math.max(top + 80, dockTop - 38)
      const usableHeight = bottom - top
      const usableWidth = Math.max(100, size.width - (size.width < 600 ? 32 : 96))
      const tangent = Math.tan(camera.fov * Math.PI / 360)
      const limit = Math.atan(tangent * Math.min(usableHeight, usableWidth) / size.height)
      const stardust = visualization === 'STARDUST'
      // Planet keeps its established deformation envelope. Stardust starts
      // closer so its loose mass fills the composition before exploration.
      const distance = (stardust ? 2.9 : 3.45) / Math.sin(limit)
      const frame = composition.current
      // Fit on entry. Resizing the Stardust viewport or loading a track must not
      // pull the visitor back out of the cloud after they have flown inside.
      if (!stardust || frame.mode !== visualization) {
        if (camera.position.lengthSq() < 0.0001) camera.position.set(0, 0, 1)
        camera.position.normalize().multiplyScalar(distance)
      }
      frame.mode = visualization
      frame.width = size.width
      frame.height = size.height
      frame.offset = size.height / 2 - (top + bottom) / 2
      frame.appliedOffset = NaN
      camera.near = stardust ? 0.02 : 0.1
      camera.updateProjectionMatrix()
      if (controls.current) {
        controls.current.enableZoom = stardust
        controls.current.minDistance = stardust ? 0.18 : 0
        controls.current.maxDistance = stardust ? Math.max(32, distance * 1.6) : Infinity
      }
      // The frame loop blends this offset toward zero when entering Stardust.
      camera.setViewOffset(size.width, size.height, 0, frame.offset, size.width, size.height)
      controls.current?.update()
    }
    compose()
    const observer = new ResizeObserver(compose)
    if (dockRef.current) observer.observe(dockRef.current)
    return () => observer.disconnect()
  }, [camera, dockRef, size.width, size.height, visualization])

  useFrame((_, delta) => {
    const orbit = controls.current
    if (!orbit) return
    orbit.update(delta)
    const frame = composition.current
    if (!frame.width || !frame.height) return
    const stardust = visualization === 'STARDUST'
    const distance = camera.position.distanceTo(orbit.target)
    const blend = Math.max(0, Math.min(1, (distance - 0.75) / 4.75))
    const framing = stardust ? blend * blend * (3 - 2 * blend) : 1
    orbit.rotateSpeed = stardust ? 0.28 + framing * 0.22 : 0.5
    const offset = frame.offset * framing
    if (!Number.isFinite(frame.appliedOffset) || Math.abs(offset - frame.appliedOffset) > 0.02) {
      camera.setViewOffset(frame.width, frame.height, 0, offset, frame.width, frame.height)
      frame.appliedOffset = offset
    }
  })
  return null
}
