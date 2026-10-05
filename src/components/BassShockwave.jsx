import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, DoubleSide } from 'three'

export default function BassShockwave({ dynamics }) {
  const rings = useRef([])
  const slots = useMemo(() => [{ age: 2 }, { age: 2 }, { age: 2 }], [])
  const lastEvent = useRef(0)
  const next = useRef(0)
  useFrame(({ camera }, delta) => {
    if (lastEvent.current !== dynamics.event) {
      lastEvent.current = dynamics.event
      const index = next.current++ % slots.length
      slots[index].age = 0
      slots[index].strength = dynamics.flash
      rings.current[index].quaternion.copy(camera.quaternion)
    }
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i], ring = rings.current[i]
      slot.age += Math.min(delta, 0.1)
      const life = slot.age / 1.25
      ring.visible = life < 1
      if (!ring.visible) continue
      ring.scale.setScalar(2.05 + life * 2.4)
      ring.material.opacity = Math.sin(Math.min(1, life * 6) * Math.PI / 2) * (1 - life) ** 2 * slot.strength * 0.5
    }
  })
  return slots.map((_, index) => (
    <mesh key={index} ref={node => { rings.current[index] = node }} name={`bass-shockwave-${index}`} visible={false}>
      <ringGeometry args={[0.985, 1.015, 128]} />
      <meshBasicMaterial color={index % 2 ? '#a25aff' : '#39dfff'} transparent blending={AdditiveBlending} side={DoubleSide} depthWrite={false} toneMapped={false} />
    </mesh>
  ))
}
