import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, DynamicDrawUsage } from 'three'
import { surfaceVertex, surfaceFragment, haloVertex, haloFragment, wireFragment } from './planetShaders.js'
import usePlanetClick from './usePlanetClick.js'

export default function AudioPlanet({ audioValues, dynamics, onCycleMode, radius = 2 }) {
  const planet = useRef(), surface = useRef(), shell = useRef(), material = useRef()
  const shellMaterial = useRef(), haloMaterial = useRef()
  const halo = useRef(), hitMesh = useRef(), basePositions = useRef(), phase = useRef(0)
  const uniforms = useMemo(() => ({ intensity: { value: 0.55 }, energy: { value: 0 } }), [])
  const wireUniforms = useMemo(() => ({ intensity: { value: 0.6 }, energy: { value: 0 } }), [])
  const haloUniforms = useMemo(() => ({ intensity: { value: 0.13 } }), [])
  usePlanetClick(hitMesh, onCycleMode)

  useLayoutEffect(() => {
    basePositions.current = surface.current.attributes.position.array.slice()
    for (const geometry of [surface.current, shell.current]) {
      geometry.attributes.position.setUsage(DynamicDrawUsage)
      geometry.computeBoundingSphere()
      geometry.boundingSphere.radius = radius * 1.32
    }
  }, [radius])

  useFrame(({ camera }, delta) => {
    const step = Math.min(delta, 0.1)
    const { mid, energy } = audioValues
    const { drive, pulse: flash } = dynamics
    phase.current += step * (0.32 + mid * 0.5 + drive * 0.35)
    planet.current.rotation.y += step * 0.075
    planet.current.rotation.x += step * 0.015
    const scale = 1 + drive * 0.25 + flash * 0.035
    planet.current.scale.setScalar(scale)
    material.current.uniforms.intensity.value = 0.6 + energy * 0.45 + drive * 0.4 + flash * 0.3
    material.current.uniforms.energy.value = energy
    shellMaterial.current.uniforms.intensity.value = 0.55 + drive * 0.6 + energy * 0.4 + flash * 0.5
    shellMaterial.current.uniforms.energy.value = energy
    halo.current.quaternion.copy(camera.quaternion)
    halo.current.scale.setScalar(scale)
    haloMaterial.current.uniforms.intensity.value = 0.13 + energy * 0.16 + drive * 0.16 + flash * 0.12

    const base = basePositions.current
    const outer = surface.current.attributes.position
    const inner = shell.current.attributes.position
    const time = phase.current
    for (let i = 0; i < base.length; i += 3) {
      const x = base[i] / radius, y = base[i + 1] / radius, z = base[i + 2] / radius
      const broad = Math.sin(y * 2.8 + time) * Math.cos(x * 2.3 - z * 1.8 - time * 0.5)
      const detail = Math.sin(x * 6.2 - y * 3.3 + z * 2.9 - time * 1.1)
      const displacement = 1 + (0.008 + drive * 0.20 + flash * 0.035) * broad + mid * 0.065 * detail
      for (let axis = 0; axis < 3; axis++) {
        outer.array[i + axis] = base[i + axis] * displacement
        inner.array[i + axis] = outer.array[i + axis] * 0.995
      }
    }
    outer.needsUpdate = true
    inner.needsUpdate = true
  })

  return (
    <>
      <mesh ref={halo} name="planet-halo" renderOrder={-2}>
        <planeGeometry args={[7, 7]} />
        <shaderMaterial ref={haloMaterial} uniforms={haloUniforms} vertexShader={haloVertex} fragmentShader={haloFragment} transparent blending={AdditiveBlending} depthWrite={false} />
      </mesh>
      <group ref={planet} name="audio-planet" rotation={[0.2, 0, 0.15]}>
        <mesh>
          <icosahedronGeometry ref={shell} args={[radius, 10]} />
          <shaderMaterial ref={shellMaterial} uniforms={uniforms} vertexShader={surfaceVertex} fragmentShader={surfaceFragment} transparent blending={AdditiveBlending} depthWrite={false} />
        </mesh>
        <mesh ref={hitMesh} name="planet-surface">
          <icosahedronGeometry ref={surface} args={[radius, 10]} />
          <shaderMaterial ref={material} uniforms={wireUniforms} vertexShader={surfaceVertex} fragmentShader={wireFragment} wireframe transparent blending={AdditiveBlending} depthWrite={false} />
        </mesh>
      </group>
    </>
  )
}
