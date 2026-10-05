import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { Raycaster, Vector2 } from 'three'

export default function usePlanetClick(mesh, onClick) {
  const { camera, gl } = useThree()
  useEffect(() => {
    const canvas = gl.domElement
    const ray = new Raycaster()
    const point = new Vector2()
    const pointers = new Set()
    let gesture = null
    const hitsPlanet = event => {
      if (!mesh.current) return false
      const rect = canvas.getBoundingClientRect()
      point.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1)
      ray.setFromCamera(point, camera)
      return ray.intersectObject(mesh.current, false).length > 0
    }
    const down = event => {
      pointers.add(event.pointerId)
      if (pointers.size > 1) { gesture = null; return }
      if (event.button !== 0 || !hitsPlanet(event)) return
      gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now(), dragged: false }
    }
    const move = event => {
      if (gesture?.id === event.pointerId && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 6) gesture.dragged = true
    }
    const up = event => {
      move(event)
      if (gesture?.id === event.pointerId && !gesture.dragged && performance.now() - gesture.time < 650 && hitsPlanet(event)) onClick()
      pointers.delete(event.pointerId)
      gesture = null
    }
    const cancel = () => { pointers.clear(); gesture = null }
    canvas.addEventListener('pointerdown', down, true)
    window.addEventListener('pointermove', move, true)
    window.addEventListener('pointerup', up, true)
    window.addEventListener('pointercancel', cancel, true)
    window.addEventListener('blur', cancel)
    return () => {
      canvas.removeEventListener('pointerdown', down, true)
      window.removeEventListener('pointermove', move, true)
      window.removeEventListener('pointerup', up, true)
      window.removeEventListener('pointercancel', cancel, true)
      window.removeEventListener('blur', cancel)
    }
  }, [camera, gl, mesh, onClick])
}
