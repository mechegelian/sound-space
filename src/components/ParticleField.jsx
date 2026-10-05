import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'

export default function ParticleField({ audioValues, count = 900 }) {
  const particles = useRef()
  const material = useRef()
  const positions = useMemo(() => {
    const data = new Float32Array(count * 3)
    // A repeatable distribution avoids moving stars on remount in development.
    let seed = 42
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed / 4294967296
    }
    for (let i = 0; i < count; i++) {
      const azimuth = random() * Math.PI * 2
      const vertical = random() * 2 - 1
      const radius = 12 + random() * 24
      const ring = Math.sqrt(1 - vertical * vertical)
      data.set([
        Math.cos(azimuth) * ring * radius,
        vertical * radius,
        Math.sin(azimuth) * ring * radius,
      ], i * 3)
    }
    return data
  }, [count])

  useFrame((_, delta) => {
    const { high, energy } = audioValues
    particles.current.rotation.y += Math.min(delta, 0.1) * (0.002 + high * 0.045)
    particles.current.scale.setScalar(1 + high * 0.04)
    material.current.opacity = 0.55 + high * 0.18 + energy * 0.10
    material.current.size = 0.035 + high * 0.018
  })

  return (
    <points ref={particles}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial ref={material} color="#709cda" size={0.035} transparent opacity={0.55} depthWrite={false} />
    </points>
  )
}
