import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, Color, DoubleSide, DynamicDrawUsage } from 'three'
import { haloVertex } from './planetShaders.js'

const SAMPLES = 192
const BARS = 64
const coreFragment = `
  uniform float intensity;
  varying vec2 vUv;
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    float glow = exp(-r * r * 6.0) * (1.0 - smoothstep(0.6, 1.0, r));
    vec3 color = mix(vec3(0.32, 0.04, 0.85), vec3(0.07, 0.7, 0.95), glow);
    gl_FragColor = vec4(color, glow * intensity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

function indices(count, separate = false) {
  const data = new Uint16Array(count * 6)
  for (let i = 0; i < count; i++) {
    const n = i * (separate ? 4 : 2)
    data.set([n, n + 1, n + 2, n + 2, n + 1, n + 3], i * 6)
  }
  return data
}

function Geometry({ positions, index, colors }) {
  return (
    <bufferGeometry>
      <bufferAttribute attach="attributes-position" args={[positions, 3]} usage={DynamicDrawUsage} />
      <bufferAttribute attach="index" args={[index, 1]} />
      {colors && <bufferAttribute attach="attributes-color" args={[colors, 3]} />}
    </bufferGeometry>
  )
}

export default function InnerAudioDisplay({ analyzer, mode }) {
  const group = useRef(), wave = useRef(), glow = useRef(), spectrum = useRef()
  const echo = useRef(), spectrumGlow = useRef(), core = useRef(), phase = useRef(0)
  const coreUniforms = useMemo(() => ({ intensity: { value: 0.2 } }), [])
  const buffers = useMemo(() => {
    const colors = new Float32Array(BARS * 4 * 3)
    const cyan = new Color('#3ef7ff'), violet = new Color('#b256ff'), color = new Color()
    const waveColors = new Float32Array(SAMPLES * 2 * 3)
    const magenta = new Color('#f68ae4')
    for (let i = 0; i < SAMPLES; i++) {
      color.lerpColors(cyan, magenta, i / (SAMPLES - 1))
      color.toArray(waveColors, i * 6)
      color.toArray(waveColors, i * 6 + 3)
    }
    for (let i = 0; i < BARS; i++) {
      color.lerpColors(cyan, violet, (1 + Math.sin(i / BARS * Math.PI * 2)) / 2)
      for (let v = 0; v < 4; v++) color.toArray(colors, (i * 4 + v) * 3)
    }
    return {
      wave: new Float32Array(SAMPLES * 2 * 3), glow: new Float32Array(SAMPLES * 2 * 3),
      echo: new Float32Array(SAMPLES * 2 * 3), waveColors,
      spectrum: new Float32Array(BARS * 4 * 3), levels: new Float32Array(BARS),
      spectrumGlow: new Float32Array(BARS * 4 * 3),
      samples: new Float32Array(SAMPLES), waveIndex: indices(SAMPLES - 1),
      spectrumIndex: indices(BARS, true), colors,
    }
  }, [])

  useFrame(({ camera }, delta) => {
    group.current.quaternion.copy(camera.quaternion)
    if (mode === 'OFF') return
    const step = Math.min(delta, 0.1)
    phase.current += step
    const { engine, values, targets } = analyzer
    const playing = !engine.audio.paused && !engine.audio.seeking && targets.energy > 0
    if (mode === 'WAVEFORM') {
      const data = playing ? engine.getWaveformData() : null
      // Anchor to a rising zero crossing to reduce sideways waveform jitter.
      let start = 0
      if (data) {
        for (let i = 1; i < 512; i++) {
          if (data[i - 1] < 128 && data[i] >= 128) { start = i; break }
        }
      }
      const alpha = 1 - Math.exp(-step / (playing ? 0.045 : 0.22))
      for (let i = 0; i < SAMPLES; i++) {
        const value = data ? (data[start + Math.floor(i / (SAMPLES - 1) * 1024)] - 128) / 128 : 0
        const envelope = Math.sin(i / (SAMPLES - 1) * Math.PI) ** 0.4
        const target = Math.tanh(value * 2.4) * 0.72 * envelope
        buffers.samples[i] += (target - buffers.samples[i]) * alpha
        const x = (i / (SAMPLES - 1) - 0.5) * 3.25
        const arc = Math.sin(i / (SAMPLES - 1) * Math.PI)
        const depth = arc * (0.12 + values.energy * 0.18 * Math.sin(x * 1.8 + phase.current * 0.4))
        for (let side = 0; side < 2; side++) {
          const offset = (i * 2 + side) * 3, sign = side ? 1 : -1
          buffers.wave[offset] = buffers.glow[offset] = buffers.echo[offset] = x
          buffers.wave[offset + 1] = buffers.samples[i] + arc * 0.08 + sign * 0.012
          buffers.glow[offset + 1] = buffers.samples[i] + arc * 0.08 + sign * 0.07
          buffers.wave[offset + 2] = buffers.glow[offset + 2] = depth
          buffers.echo[offset + 1] = -buffers.samples[i] * 0.68 - arc * 0.15 + sign * 0.008
          buffers.echo[offset + 2] = depth - 0.32 * arc
        }
      }
      wave.current.geometry.attributes.position.needsUpdate = true
      glow.current.geometry.attributes.position.needsUpdate = true
      echo.current.geometry.attributes.position.needsUpdate = true
      wave.current.material.opacity = 0.55 + values.energy * 0.4
      glow.current.material.opacity = 0.09 + values.energy * 0.15
      echo.current.material.opacity = 0.18 + values.energy * 0.25
    } else {
      const data = playing ? engine.getFrequencyData() : null
      const hzPerBin = engine.context ? engine.context.sampleRate / engine.analyser.fftSize : 24
      for (let i = 0; i < BARS; i++) {
        const low = 40 * (12000 / 40) ** (i / BARS)
        const high = 40 * (12000 / 40) ** ((i + 1) / BARS)
        const first = Math.max(1, Math.floor(low / hzPerBin))
        const end = Math.min(data?.length || 1024, Math.max(first + 1, Math.ceil(high / hzPerBin)))
        let peak = 0
        if (data) for (let bin = first; bin < end; bin++) peak = Math.max(peak, data[bin] / 255)
        const target = peak ** 2
        buffers.levels[i] += (target - buffers.levels[i]) * (1 - Math.exp(-step / (target > buffers.levels[i] ? 0.07 : 0.24)))
        const angle = i / BARS * Math.PI * 2
        const dx = Math.cos(angle), dy = Math.sin(angle)
        for (let vertex = 0; vertex < 4; vertex++) {
          const radius = vertex < 2 ? 0.63 : 0.69 + buffers.levels[i] * 0.68 + buffers.levels[i] ** 3 * 0.20
          const width = (vertex % 2 ? 1 : -1) * 0.013
          const offset = (i * 4 + vertex) * 3
          buffers.spectrum[offset] = dx * radius - dy * width
          buffers.spectrum[offset + 1] = dy * radius + dx * width
          buffers.spectrum[offset + 2] = buffers.levels[i] * 0.16
          buffers.spectrumGlow[offset] = dx * radius - dy * width * 2.7
          buffers.spectrumGlow[offset + 1] = dy * radius + dx * width * 2.7
          buffers.spectrumGlow[offset + 2] = buffers.levels[i] * 0.16 - 0.06
        }
      }
      spectrum.current.geometry.attributes.position.needsUpdate = true
      spectrumGlow.current.geometry.attributes.position.needsUpdate = true
      spectrum.current.material.opacity = 0.45 + values.energy * 0.5
      spectrumGlow.current.material.opacity = 0.055 + values.energy * 0.10
      core.current.uniforms.intensity.value = 0.22 + values.energy * 0.28
    }
  })

  return (
    <group ref={group} name="inner-display" visible={mode !== 'OFF'}>
      <mesh rotation={[0, 0, 0.25]}>
        <torusGeometry args={[1.53, 0.003, 4, 128]} />
        <meshBasicMaterial color="#6357ff" transparent opacity={0.4} blending={AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh ref={wave} name="inner-waveform" visible={mode === 'WAVEFORM'} frustumCulled={false}>
        <Geometry positions={buffers.wave} index={buffers.waveIndex} colors={buffers.waveColors} />
        <meshBasicMaterial vertexColors transparent blending={AdditiveBlending} side={DoubleSide} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={glow} visible={mode === 'WAVEFORM'} frustumCulled={false}>
        <Geometry positions={buffers.glow} index={buffers.waveIndex} colors={buffers.waveColors} />
        <meshBasicMaterial vertexColors transparent opacity={0.15} blending={AdditiveBlending} side={DoubleSide} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={echo} name="inner-waveform-echo" visible={mode === 'WAVEFORM'} frustumCulled={false}>
        <Geometry positions={buffers.echo} index={buffers.waveIndex} />
        <meshBasicMaterial color="#a578ff" transparent opacity={0.2} blending={AdditiveBlending} side={DoubleSide} depthWrite={false} toneMapped={false} />
      </mesh>
      <group visible={mode === 'SPECTRUM'}>
        <mesh position={[0, 0, -0.2]}>
          <planeGeometry args={[1.2, 1.2]} />
          <shaderMaterial ref={core} uniforms={coreUniforms} vertexShader={haloVertex} fragmentShader={coreFragment} transparent blending={AdditiveBlending} depthWrite={false} />
        </mesh>
        <mesh position={[0, 0, -0.06]}>
          <torusGeometry args={[0.30, 0.006, 6, 96]} />
          <meshBasicMaterial color="#67ceec" transparent opacity={0.4} blending={AdditiveBlending} depthWrite={false} />
        </mesh>
      </group>
      <mesh ref={spectrumGlow} visible={mode === 'SPECTRUM'} frustumCulled={false}>
        <Geometry positions={buffers.spectrumGlow} index={buffers.spectrumIndex} colors={buffers.colors} />
        <meshBasicMaterial vertexColors transparent opacity={0.1} blending={AdditiveBlending} side={DoubleSide} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={spectrum} name="inner-spectrum" visible={mode === 'SPECTRUM'} frustumCulled={false}>
        <Geometry positions={buffers.spectrum} index={buffers.spectrumIndex} colors={buffers.colors} />
        <meshBasicMaterial vertexColors transparent blending={AdditiveBlending} side={DoubleSide} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
}
