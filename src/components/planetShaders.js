export const surfaceVertex = `
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vPosition;
  void main() {
    vec4 view = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normalize(position));
    vView = -view.xyz;
    vPosition = position;
    gl_Position = projectionMatrix * view;
  }
`

export const surfaceFragment = `
  uniform float intensity;
  uniform float energy;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vPosition;
  void main() {
    float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.2);
    float gradient = smoothstep(-1.5, 1.5, vPosition.y + vPosition.x * 0.6);
    vec3 cyan = vec3(0.02, 0.72, 1.0);
    vec3 violet = mix(vec3(0.22, 0.025, 0.8), vec3(0.85, 0.025, 0.55), energy * 0.65);
    vec3 color = mix(violet, cyan, gradient);
    gl_FragColor = vec4(color * (0.8 + intensity), (0.015 + rim * 0.46) * intensity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export const haloVertex = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

export const wireFragment = `
  uniform float intensity;
  uniform float energy;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vPosition;
  void main() {
    float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 1.3);
    float gradient = smoothstep(-1.5, 1.5, vPosition.y + vPosition.x * 0.6);
    vec3 color = mix(vec3(0.42 + energy * 0.25, 0.06, 1.0), vec3(0.02, 0.9, 1.0), gradient);
    gl_FragColor = vec4(color, (0.025 + rim * 0.32) * intensity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export const haloFragment = `
  uniform float intensity;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv - 0.5;
    float r = length(p);
    float halo = exp(-pow((r - 0.30) / 0.085, 2.0)) * (1.0 - smoothstep(0.35, 0.5, r));
    vec3 color = mix(vec3(0.38, 0.015, 0.8), vec3(0.01, 0.5, 0.9), vUv.y);
    gl_FragColor = vec4(color, halo * intensity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`
