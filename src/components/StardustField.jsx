import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { AdditiveBlending, DynamicDrawUsage } from 'three'
import AdaptiveSensitivity from '../visuals/AdaptiveSensitivity.js'
import StardustDynamics from '../visuals/StardustDynamics.js'
import { stardustVertexShader, stardustFragmentShader } from './stardustShaders.js'

export default function StardustField({ analyzer, sensitivity = 'auto' }) {
  const compact = useThree(state => Math.min(state.size.width, state.size.height) < 650)
  const [mapping] = useState(() => new AdaptiveSensitivity())
  const dynamics = useMemo(() => {
    const next = new StardustDynamics(compact ? 5000 : 10000)
    next.lastTransient = mapping.transient.id
    return next
  }, [compact, mapping])
  const points = useRef(), material = useRef()
  const uniforms = useMemo(() => ({ pixelRatio: { value: 1 }, viewportHeight: { value: 900 }, time: { value: 0 },
    bass: { value: 0 }, mid: { value: 0 }, high: { value: 0 }, energy: { value: 0 }, worldMode: { value: 0 }, exposure: { value: 1 } }), [])
  const { positions, seeds, sizes, tints, affinities, brightness, memory, activity } = dynamics.particles
  useEffect(() => { mapping.setSensitivity(sensitivity) }, [mapping, sensitivity])

  useFrame(({ gl, size }, delta) => {
    mapping.update(analyzer, delta)
    dynamics.update(mapping, delta)
    points.current.geometry.attributes.position.needsUpdate = true
    points.current.geometry.attributes.aMemory.needsUpdate = true
    points.current.geometry.attributes.aActivity.needsUpdate = true
    material.current.uniforms.pixelRatio.value = gl.getPixelRatio()
    material.current.uniforms.viewportHeight.value = size.height
    material.current.uniforms.time.value = dynamics.time
    material.current.uniforms.bass.value = mapping.values.bass
    material.current.uniforms.mid.value = mapping.values.mid
    material.current.uniforms.high.value = mapping.values.high
    material.current.uniforms.energy.value = mapping.values.energy
  })

  return (
    <points ref={points} name="stardust-field" frustumCulled={false} userData={{ mapping, dynamics }}>
      <bufferGeometry key={positions.length}>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} usage={DynamicDrawUsage} />
        <bufferAttribute attach="attributes-aSize" args={[sizes, 1]} />
        <bufferAttribute attach="attributes-aTint" args={[tints, 1]} />
        <bufferAttribute attach="attributes-aSeed" args={[seeds, 1]} />
        <bufferAttribute attach="attributes-aAffinity" args={[affinities, 3]} />
        <bufferAttribute attach="attributes-aBrightness" args={[brightness, 1]} />
        <bufferAttribute attach="attributes-aMemory" args={[memory, 3]} usage={DynamicDrawUsage} />
        <bufferAttribute attach="attributes-aActivity" args={[activity, 1]} usage={DynamicDrawUsage} />
      </bufferGeometry>
      <shaderMaterial ref={material} uniforms={uniforms} vertexShader={stardustVertexShader} fragmentShader={stardustFragmentShader}
        transparent blending={AdditiveBlending} depthWrite={false} />
    </points>
  )
}
