import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

// One analysis pass, before both scene components; no React frame-by-frame state.
export default function AudioAnalysisFrame({ analyzer, dynamics, debugReadout }) {
  const debugTime = useRef(0)
  useFrame((_, delta) => {
    const values = analyzer.update(delta)
    dynamics.update(analyzer, delta)
    if (import.meta.env.DEV && debugReadout.current) {
      debugTime.current += delta
      if (debugTime.current >= 0.125) {
        debugTime.current = 0
        debugReadout.current.textContent = `Bass: ${values.bass.toFixed(2)}\nMid: ${values.mid.toFixed(2)}\nHigh: ${values.high.toFixed(2)}\nEnergy: ${values.energy.toFixed(2)}`
      }
    }
  }, -2)
  return null
}
