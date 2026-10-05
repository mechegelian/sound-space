import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { AdditiveBlending, DynamicDrawUsage } from 'three'
import AdaptiveSensitivity from '../visuals/AdaptiveSensitivity.js'
import AudioEventInterpreter from '../audio/AudioEventInterpreter.js'
import StardustWorldDynamics from '../visuals/StardustWorldDynamics.js'
import { stardustVertexShader, stardustFragmentShader } from './stardustShaders.js'
import JourneyCamera from './JourneyCamera.jsx'
import MicroBursts from './MicroBursts.jsx'

export default function StardustWorld({ analyzer, sensitivity, motion = 'full' }) {
  const [mapping] = useState(() => new AdaptiveSensitivity())
  const [interpreter] = useState(() => new AudioEventInterpreter())
  const [world] = useState(() => new StardustWorldDynamics(8000))
  const compact = useThree(state => Math.min(state.size.width, state.size.height) < 650)
  const count = compact ? 5000 : 8000
  const mesh = useRef(), material = useRef()
  const uniforms = useMemo(() => ({ pixelRatio: { value: 1 }, viewportHeight: { value: 900 }, time: { value: 0 },
    bass: { value: 0 }, mid: { value: 0 }, high: { value: 0 }, energy: { value: 0 }, worldMode: { value: 1 }, exposure: { value: 0.14 },
    intensity: { value: 0 }, zonePositions: { value: world.events.zonePositions }, zoneWeights: { value: world.events.zoneWeights } }), [world])
  useEffect(() => { mapping.setSensitivity(sensitivity) }, [mapping, sensitivity])
  useEffect(() => { world.reducedMotion = motion === 'reduced' }, [world, motion])
  useEffect(() => { world.activeCount = count; mesh.current.geometry.setDrawRange(0, count) }, [world, count])
  const p = world.particles
  useFrame(({ gl, size, camera }, delta) => {
    mapping.update(analyzer, delta)
    interpreter.update(mapping, analyzer.engine, delta)
    world.update(interpreter, delta, camera.position)
    const attributes = mesh.current.geometry.attributes
    attributes.position.needsUpdate = true; attributes.aMemory.needsUpdate = true; attributes.aActivity.needsUpdate = true
    const u = material.current.uniforms, f = interpreter.features
    u.pixelRatio.value = gl.getPixelRatio(); u.viewportHeight.value = size.height
    u.time.value = world.time; u.bass.value = f.low; u.mid.value = f.mid
    u.high.value = f.high; u.energy.value = f.energy; u.exposure.value = f.exposure
    u.intensity.value = interpreter.direction.intensity
  }, -1)
  return <>
    <points ref={mesh} name="stardust-world" frustumCulled={false} userData={{ world, mapping, interpreter }}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[p.positions, 3]} usage={DynamicDrawUsage} />
        <bufferAttribute attach="attributes-aMemory" args={[p.memory, 3]} usage={DynamicDrawUsage} />
        <bufferAttribute attach="attributes-aActivity" args={[p.activity, 1]} usage={DynamicDrawUsage} />
        <bufferAttribute attach="attributes-aSize" args={[p.sizes, 1]} />
        <bufferAttribute attach="attributes-aTint" args={[p.tints, 1]} />
        <bufferAttribute attach="attributes-aSeed" args={[p.seeds, 1]} />
        <bufferAttribute attach="attributes-aAffinity" args={[p.affinities, 3]} />
        <bufferAttribute attach="attributes-aBrightness" args={[p.brightness, 1]} />
      </bufferGeometry>
      <shaderMaterial ref={material} uniforms={uniforms} vertexShader={stardustVertexShader} fragmentShader={stardustFragmentShader} transparent blending={AdditiveBlending} depthWrite={false} />
    </points>
    <MicroBursts events={world.events} />
    <JourneyCamera world={world} interpreter={interpreter} />
  </>
}
