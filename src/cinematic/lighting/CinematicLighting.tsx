import { AdditiveBlending, Color } from 'three';
import {
  CELESTIAL_DISC_RADIUS,
  getCelestialBreath,
  getCelestialEyePosition,
} from '../celestial/celestialGeometry';
import type { CinematicQuality } from '../config/cinematicQuality';
import type { TimelineState } from '../timeline/timeline';
import { clamp01, lerp, smootherstep } from '../utils/math';

const mixColor = (from: string, to: string, amount: number): string =>
  `#${new Color(from).lerp(new Color(to), amount).getHexString()}`;

const CELESTIAL_VERTEX = `
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const HALO_VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const HALO_FRAGMENT = `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv - vec2(0.5);
    float radius = length(p) * 2.0;
    float angle = atan(p.y, p.x);
    float bloom = pow(1.0 - smoothstep(0.12, 1.0, radius), 2.1);
    float inner = pow(1.0 - smoothstep(0.0, 0.58, radius), 1.35);
    float corona = 0.94 + cos(angle * 9.0 + uTime * 0.018) * 0.06;
    vec3 color = uColor * (1.02 + inner * 0.72);
    gl_FragColor = vec4(color, (bloom * corona + inner * 0.28) * uOpacity);
  }
`;
const APERTURE_FRAGMENT = `
  uniform float uClosure;
  uniform float uOpacity;
  varying vec2 vUv;

  void main() {
    vec2 p = vUv - vec2(0.5);
    float radius = length(p);
    float angle = atan(p.y, p.x);
    float bladePhase = angle * 6.0 + uClosure * 1.35;
    float bladeShape = 0.91 + cos(bladePhase) * 0.065;
    float opening = mix(0.54, 0.018, smoothstep(0.0, 1.0, uClosure)) * bladeShape;
    float outerMask = 1.0 - smoothstep(0.485, 0.505, radius);
    float cover = smoothstep(opening - 0.012, opening + 0.012, radius) * outerMask;

    float segment = fract((angle + 3.14159265) / 6.2831853 * 6.0 + uClosure * 0.22);
    float seam = 1.0 - smoothstep(0.0, 0.035, min(segment, 1.0 - segment));
    float metallicSweep = 0.5 + 0.5 * cos(angle - 0.7);
    float panelLight = 0.5 + 0.5 * cos(bladePhase + 0.65);
    vec3 bladeColor = mix(vec3(0.018, 0.021, 0.024), vec3(0.19, 0.225, 0.235), metallicSweep * 0.72);
    bladeColor += vec3(0.035, 0.05, 0.055) * panelLight * cover;
    bladeColor += seam * vec3(0.42, 0.72, 0.74) * cover * 0.62;

    gl_FragColor = vec4(bladeColor, cover * uOpacity);
  }
`;
const CELESTIAL_FRAGMENT = `
  uniform float uSunMorph;
  uniform float uSunset;
  uniform float uTime;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vNormal;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float crater(vec2 centre, float radius) {
    float distanceToCentre = distance(vUv, centre);
    float bowl = 1.0 - smoothstep(radius * 0.38, radius, distanceToCentre);
    float rim = smoothstep(radius * 0.68, radius * 0.82, distanceToCentre)
      * (1.0 - smoothstep(radius * 0.82, radius, distanceToCentre));
    return bowl * 0.72 - rim * 0.34;
  }

  void main() {
    float grain = sin(vUv.x * 83.0 + sin(vUv.y * 57.0)) * 0.5 + 0.5;
    float fineGrain = sin((vUv.x + vUv.y) * 137.0 + sin(vUv.x * 41.0)) * 0.5 + 0.5;
    float broad = sin(vUv.x * 31.0 + sin(vUv.y * 17.0)) * 0.035;
    float craters = crater(vec2(0.34, 0.68), 0.085)
      + crater(vec2(0.66, 0.72), 0.052)
      + crater(vec2(0.43, 0.36), 0.067)
      + crater(vec2(0.71, 0.41), 0.043);
    vec3 lightDirection = normalize(vec3(-0.52, 0.62, 0.95));
    float lunarLight = 0.34 + max(0.0, dot(normalize(vNormal), lightDirection)) * 0.66;
    float lunarRim = pow(1.0 - abs(vNormal.z), 3.2);
    vec3 moonBase = mix(vec3(0.42, 0.48, 0.56), vec3(0.68, 0.73, 0.79), lunarLight);
    vec3 moon = moonBase * (0.93 + (grain - 0.5) * 0.055 + (fineGrain - 0.5) * 0.025 + broad - craters * 0.16);
    moon += vec3(0.18, 0.28, 0.42) * lunarRim * 0.28;

    float solarCellA = sin(vUv.x * 47.0 + uTime * 0.012)
      * sin(vUv.y * 39.0 - uTime * 0.009);
    float solarCellB = sin((vUv.x + vUv.y) * 91.0 - uTime * 0.006)
      * sin((vUv.x - vUv.y) * 63.0 + uTime * 0.008);
    float driftingCells = sin(vUv.x * 24.0 - uTime * 0.004 + sin(vUv.y * 29.0)) * 0.5 + 0.5;
    float solarLimb = clamp(max(0.0, vNormal.z), 0.0, 1.0);
    float coreHeat = pow(solarLimb, 0.38);
    float limbDepth = smoothstep(0.02, 0.92, solarLimb);
    vec3 sunEdge = mix(vec3(0.88, 0.095, 0.016), vec3(0.58, 0.018, 0.012), uSunset);
    vec3 sunMid = mix(vec3(1.0, 0.43, 0.08), vec3(0.98, 0.15, 0.025), uSunset * 0.82);
    vec3 sunCore = mix(vec3(1.0, 0.94, 0.62), vec3(1.0, 0.52, 0.16), uSunset * 0.78);
    vec3 sun = mix(sunEdge, sunMid, sqrt(coreHeat));
    sun = mix(sun, sunCore, pow(coreHeat, 2.15));
    sun *= 0.94 + solarCellA * 0.065 + solarCellB * 0.034 + driftingCells * 0.075;
    sun += vec3(1.0, 0.62, 0.18) * pow(solarLimb, 2.7) * 0.2;
    sun *= mix(0.76, 1.08, limbDepth);
    gl_FragColor = vec4(mix(moon, sun, uSunMorph), uOpacity);
  }
`;
const CelestialAperture = ({ closure, quality }: { closure: number; quality: CinematicQuality }) => {
  if (closure <= 0.001) return null;

  return (
    <group position={[0, 0, 2.25]}>
      <mesh>
        <planeGeometry args={[CELESTIAL_DISC_RADIUS * 2.02, CELESTIAL_DISC_RADIUS * 2.02]} />
        <shaderMaterial
          vertexShader={HALO_VERTEX}
          fragmentShader={APERTURE_FRAGMENT}
          uniforms={{
            uClosure: { value: closure },
            uOpacity: { value: Math.min(1, closure * 4.5) },
          }}
          transparent
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, 0, 0.08]}>
        <ringGeometry args={[CELESTIAL_DISC_RADIUS - 0.28, CELESTIAL_DISC_RADIUS + 0.28, quality === 'high' ? 72 : 48]} />
        <meshBasicMaterial
          color="#d8fff7"
          transparent
          opacity={closure * 0.42}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
};
const CelestialBody = ({ state, sunX, quality }: { state: TimelineState; sunX: number; quality: CinematicQuality }) => {
  const sunsetOcclusion = 1 - smootherstep(clamp01((state.sunsetProgress - 0.72) / 0.28));
  const sunMorph = state.sunMorph;
  const lunarStrength = 1 - sunMorph;
  const moonVisibility = state.moonIntensity * lunarStrength;
  // The disc is allowed to appear before its environmental lighting, so the
  // iris visibly becomes the sun before any reflection reaches the buildings.
  const sunDiscVisibility = sunMorph * state.sunRevealProgress;
  const celestialVisibility = Math.min(1, moonVisibility + sunDiscVisibility) * sunsetOcclusion;
  const x = lerp(0, sunX, state.sunHorizonProgress);
  const [eyeY, eyeZ] = getCelestialEyePosition(state);
  const y = lerp(eyeY, 7.5, state.sunHorizonProgress) - state.sunsetProgress * 34;
  const breathe = getCelestialBreath(state.frame);
  const z = lerp(eyeZ, -1135, state.sunHorizonProgress);
  const bodyScale = breathe;
  // Compensate only for the increased camera distance. The apparent disc size
  // stays stable instead of visibly growing while crossing the waterline.
  const sunVisualScale = lerp(1, 1.5, state.sunHorizonProgress);
  const haloScale = lerp(1, 1.42, state.sunHorizonProgress);
  const glowColor = mixColor(
    mixColor('#afc9e3', '#ffc25f', sunMorph),
    '#ff5b24',
    state.sunsetProgress * 0.82,
  );
  const coronaPulse = 0.92 + Math.sin(state.frame * 0.048) * 0.045;

  return (
    <group position={[x, y, z]} scale={[bodyScale, bodyScale, bodyScale]}>
      <mesh position={[0, 0, -2]} scale={[haloScale, haloScale, haloScale]}>
        <planeGeometry args={[62, 62]} />
        <shaderMaterial
          vertexShader={HALO_VERTEX}
          fragmentShader={HALO_FRAGMENT}
          uniforms={{
            uColor: { value: new Color(glowColor) },
            uOpacity: {
              value: celestialVisibility
                * (lunarStrength * 0.18 + sunMorph * state.sunRevealProgress * 0.44)
                * coronaPulse,
            },
          }}
          transparent
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh scale={[sunVisualScale, sunVisualScale, sunVisualScale]}>
        <sphereGeometry args={[CELESTIAL_DISC_RADIUS, quality === 'high' ? 48 : 36, quality === 'high' ? 34 : 24]} />
        <shaderMaterial
          vertexShader={CELESTIAL_VERTEX}
          fragmentShader={CELESTIAL_FRAGMENT}
          uniforms={{
            uSunMorph: { value: sunMorph },
            uSunset: { value: state.sunsetProgress },
            uTime: { value: state.frame },
            uOpacity: { value: celestialVisibility },
          }}
          transparent
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <pointLight
        color={glowColor}
        intensity={(moonVisibility * 0.62 + state.sunIntensity * 1.3) * sunsetOcclusion}
        distance={390}
      />
      <CelestialAperture closure={state.apertureClosure} quality={quality} />
    </group>
  );
};

export const CinematicLighting = ({ state, quality }: { state: TimelineState; quality: CinematicQuality }) => {
  const sunX = 22;
  const sunY = 15;
  const moonY = lerp(-42, 138, state.moonProgress);
  const sunColor = mixColor('#d8efff', '#ff8a48', state.sunWarmth);
  const ambientColor = mixColor('#8ea3d4', '#9b6670', state.sunsetProgress * 0.72);
  const hemisphereSky = mixColor('#8ba6e4', '#513b55', state.sunsetProgress * 0.78);
  const hemisphereGround = mixColor('#080b15', '#1b0d14', state.sunsetProgress * 0.75);

  return (
    <>
      <ambientLight color={ambientColor} intensity={state.ambientIntensity} />
      <hemisphereLight args={[hemisphereSky, hemisphereGround, 0.26 + state.lightning * 0.35]} />
      <directionalLight
        color={sunColor}
        intensity={state.sunIntensity * 1.45}
        position={[sunX, sunY, 100]}
      />
      <directionalLight
        color="#91b7ff"
        intensity={state.moonIntensity * 0.36}
        position={[-120, moonY, -310]}
      />
      <CelestialBody state={state} sunX={sunX} quality={quality} />
    </>
  );
};
