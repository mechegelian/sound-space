import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, DynamicDrawUsage } from 'three'

const vertexShader = `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  uniform float pixelRatio;
  varying vec3 tint;
  varying float opacity;
  void main() {
    vec4 view = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * view;
    float depth = max(0.1, -view.z);
    gl_PointSize = clamp(aSize * pixelRatio * 19.0 / depth, 1.0, 15.0 * pixelRatio);
    tint = aColor;
    opacity = aAlpha * smoothstep(0.3, 1.1, depth) * exp(-depth * 0.035);
  }
`
const fragmentShader = `
  varying vec3 tint;
  varying float opacity;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float shape = exp(-r * r * 10.0) + exp(-r * r * 3.0) * 0.15;
    gl_FragColor = vec4(tint, shape * (1.0 - smoothstep(0.7, 1.0, r)) * opacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export default function MicroBursts({ events }) {
  const mesh = useRef(), material = useRef()
  const uniforms = useMemo(() => ({ pixelRatio: { value: 1 } }), [])
  const { positions, sizes, colors, alphas } = events.fragments
  useFrame(({ gl }) => {
    const attributes = mesh.current.geometry.attributes
    attributes.position.needsUpdate = true; attributes.aSize.needsUpdate = true
    attributes.aColor.needsUpdate = true; attributes.aAlpha.needsUpdate = true
    material.current.uniforms.pixelRatio.value = gl.getPixelRatio()
  })
  return <points ref={mesh} name="journey-microbursts" frustumCulled={false}>
    <bufferGeometry>
      <bufferAttribute attach="attributes-position" args={[positions, 3]} usage={DynamicDrawUsage} />
      <bufferAttribute attach="attributes-aSize" args={[sizes, 1]} usage={DynamicDrawUsage} />
      <bufferAttribute attach="attributes-aColor" args={[colors, 3]} usage={DynamicDrawUsage} />
      <bufferAttribute attach="attributes-aAlpha" args={[alphas, 1]} usage={DynamicDrawUsage} />
    </bufferGeometry>
    <shaderMaterial ref={material} uniforms={uniforms} vertexShader={vertexShader} fragmentShader={fragmentShader} transparent depthWrite={false} blending={AdditiveBlending} />
  </points>
}
