// Short projected motion memory stays within each point sprite: one draw call,
// no screen-sized accumulation buffer and no afterimage post-processing.
export const stardustVertexShader = `
  attribute float aSize;
  attribute float aTint;
  attribute float aSeed;
  attribute float aBrightness;
  attribute vec3 aAffinity;
  attribute vec3 aMemory;
  attribute float aActivity;
  uniform float pixelRatio;
  uniform float viewportHeight;
  uniform float time;
  uniform float bass;
  uniform float mid;
  uniform float high;
  uniform float energy;
  uniform float worldMode;
  uniform float exposure;
  uniform float intensity;
  uniform vec4 zonePositions[4];
  uniform vec3 zoneWeights[4];
  varying vec3 particleColor;
  varying vec2 trailDirection;
  varying float trailLength;
  varying float opacity;
  varying float sharpness;
  void main() {
    vec4 view = modelViewMatrix * vec4(position, 1.0);
    vec4 clip = projectionMatrix * view;
    vec4 oldClip = projectionMatrix * modelViewMatrix * vec4(aMemory, 1.0);
    gl_Position = clip;
    float depth = max(0.025, -view.z);
    float baseSize = clamp(aSize * pixelRatio * 15.0 / max(0.7, depth), 1.0, 14.0 * pixelRatio);
    vec2 travel = (clip.xy / max(0.025, clip.w) - oldClip.xy / max(0.025, oldClip.w));
    // NDC x is corrected for aspect to measure the projected velocity in pixels.
    travel.x *= projectionMatrix[1][1] / projectionMatrix[0][0];
    travel *= viewportHeight * pixelRatio * 0.5;
    float speed = length(travel);
    trailDirection = speed > 0.001 ? travel / speed : vec2(1.0, 0.0);
    trailLength = min(2.4, speed / max(2.0, baseSize)) * smoothstep(0.08, 0.7, energy);
    gl_PointSize = min(30.0 * pixelRatio, baseSize * (1.0 + trailLength * 0.6));
    if (worldMode > 0.5) gl_PointSize = min(24.0 * pixelRatio, gl_PointSize * 1.4);
    // A two-pixel sprite has no sample at its exact center. Broaden only those
    // tiny cores so distant dust survives rasterization instead of vanishing.
    sharpness = mix(2.5, 11.0, smoothstep(2.0, 8.0, baseSize / pixelRatio));

    float low = bass * aAffinity.x;
    float middle = mid * aAffinity.y;
    float upper = high * aAffinity.z;
    vec3 blue = vec3(0.018, 0.065, 0.42);
    vec3 cyan = vec3(0.025, 0.55, 0.72);
    vec3 violet = vec3(0.34, 0.045, 0.65);
    vec3 base = mix(blue, cyan, smoothstep(0.1, 0.85, aTint));
    base = mix(base, violet, aAffinity.x * 0.45 + low * 0.35);
    base = mix(base, mix(violet, cyan, aTint), middle * 0.55);
    base = mix(base, vec3(0.58, 0.89, 0.96), upper * 0.7);
    vec3 accent = mix(vec3(0.70, 0.29, 0.86), vec3(0.57, 0.94, 1.0), aTint);
    particleColor = mix(base, accent, min(0.8, aActivity * 0.75));
    float shimmer = 1.0 + upper * 0.22 * sin(time * 3.0 + aSeed * 31.4);
    // Local stream bands become visible under sustained mid energy.
    float strand = 0.72 + 0.28 * sin(position.y * 5.0 + position.z * 3.0 + aSeed * 2.0);
    opacity = aBrightness * shimmer * (0.5 + energy * 0.36 + middle * strand * 0.18 + aActivity * 0.7);
    opacity *= smoothstep(0.045, 0.22, depth); // Particles pass softly around the lens.
    opacity *= mix(1.0, 0.62, smoothstep(5.0, 24.0, depth));
    if (worldMode > 0.5) {
      vec3 zone = vec3(0.0);
      for (int i = 0; i < 4; i++) {
        float radius = max(0.1, zonePositions[i].w);
        float d = length(position - zonePositions[i].xyz) / radius;
        zone += zoneWeights[i] * (1.0 - smoothstep(0.25, 1.0, d));
      }
      zone = clamp(zone, 0.0, 1.0);
      vec3 heat = mix(vec3(0.45, 0.005, 0.12), vec3(0.9, 0.015, 0.03), aTint);
      vec3 peak = mix(vec3(1.0, 0.10, 0.012), vec3(1.0, 0.68, 0.10), aSeed);
      // Keep the warm region chromatic rather than washing crimson into pale
      // blue at its center. The smooth spatial edge still blends gradually.
      float warmWeight = smoothstep(0.08, 0.62, zone.x);
      particleColor = mix(particleColor, heat, warmWeight * 0.96);
      particleColor = mix(particleColor, peak, zone.y * (0.25 + aActivity * 0.65));
      particleColor = mix(particleColor, vec3(0.60, 0.88, 1.0), zone.z * (1.0 - zone.x) * 0.6);
      vec3 relative = (modelMatrix * vec4(position, 1.0)).xyz - cameraPosition;
      vec3 edge = vec3(18.0, 12.0, 24.0) - abs(relative);
      float boundary = smoothstep(0.0, 3.0, min(edge.x, min(edge.y, edge.z)));
      float distanceFade = exp(-dot(relative, relative) * 0.004);
      // Mostly darkness; a wave/cluster illuminates only its own neighborhood.
      opacity *= (exposure * 2.7 + intensity * intensity * 0.7 + aActivity * 2.5) * boundary * distanceFade;
    }
  }
`

export const stardustFragmentShader = `
  varying vec3 particleColor;
  varying vec2 trailDirection;
  varying float trailLength;
  varying float opacity;
  varying float sharpness;
  void main() {
    vec2 point = (gl_PointCoord - 0.5) * 2.0;
    // Point-coordinate y is down, unlike projected velocity.
    point.y = -point.y;
    float along = dot(point, trailDirection);
    float across = dot(point, vec2(-trailDirection.y, trailDirection.x));
    float width = 1.0 + trailLength * 0.7;
    float radius = length(vec2(along, across * width));
    float core = exp(-radius * radius * sharpness);
    float soft = exp(-radius * radius * 2.8) * 0.12;
    float edge = 1.0 - smoothstep(0.72, 1.0, radius);
    float tail = 1.0 - max(0.0, -along) * min(0.6, trailLength * 0.3);
    gl_FragColor = vec4(particleColor, (core + soft) * edge * tail * opacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`
