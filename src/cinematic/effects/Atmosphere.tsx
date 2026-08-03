import { Line } from '@react-three/drei';
import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  BackSide,
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  Object3D,
  Vector3,
} from 'three';
import { CINEMATIC_CONFIG } from '../config/cinematicConfig';
import type { CinematicQuality } from '../config/cinematicQuality';
import type { TimelineState } from '../timeline/timeline';
import {
  CELESTIAL_EYE_SCALE,
  CELESTIAL_PUPIL_RADIUS,
  getCelestialBreath,
  getCelestialHandoffPosition,
} from '../celestial/celestialGeometry';
import { easedRange } from '../utils/math';
import { createSeededRandom, randomBetween } from '../utils/seededRandom';

type AtmosphereProps = {
  frame: number;
  state: TimelineState;
  quality: CinematicQuality;
};

const SKY_VERTEX = `
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAGMENT = `
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform float uLightning;
  varying vec3 vWorldPosition;
  void main() {
    float heightMix = smoothstep(-70.0, 285.0, vWorldPosition.y);
    vec3 color = mix(uHorizon, uTop, heightMix);
    color += vec3(0.58, 0.72, 0.96) * uLightning;
    gl_FragColor = vec4(color, 1.0);
  }
`;

const CLOUD_VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const CLOUD_FRAGMENT = `
  uniform float uOpacity;
  uniform float uOffset;
  uniform float uDarkness;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  void main() {
    vec2 uv = vUv * vec2(24.0, 24.0) + vec2(uOffset, uOffset * 0.27);
    float n = 0.5;
    n += sin(uv.x * 0.82 + sin(uv.y * 0.31)) * 0.18;
    n += sin(uv.y * 1.08 + cos(uv.x * 0.29)) * 0.15;
    n += sin((uv.x + uv.y) * 1.72) * 0.07;
    float alpha = smoothstep(0.56, 0.76, n) * uOpacity * 0.68;
    vec3 bright = vec3(0.34, 0.42, 0.56);
    vec3 dark = vec3(0.045, 0.055, 0.11);
    gl_FragColor = vec4(mix(bright, dark, uDarkness), alpha);
  }
`;

const SkyDome = ({ state, quality }: { state: TimelineState; quality: CinematicQuality }) => {
  const uniforms = useMemo(() => ({
    uTop: { value: new Color(state.skyTop) },
    uHorizon: { value: new Color(state.skyHorizon) },
    uLightning: { value: state.lightning },
  }), [state.lightning, state.skyHorizon, state.skyTop]);

  return (
    <mesh position={[0, 70, -150]} scale={[1, 0.72, 1]}>
      <sphereGeometry args={[720, quality === 'high' ? 32 : 24, quality === 'high' ? 20 : 14]} />
      <shaderMaterial
        side={BackSide}
        uniforms={uniforms}
        vertexShader={SKY_VERTEX}
        fragmentShader={SKY_FRAGMENT}
        depthWrite={false}
      />
    </mesh>
  );
};

const Stars = ({ opacity, frame, quality }: { opacity: number; frame: number; quality: CinematicQuality }) => {
  const { positions, colors } = useMemo(() => {
    const random = createSeededRandom(CINEMATIC_CONFIG.seed + 11);
    const count = quality === 'high' ? 2300 : 1350;
    const positionValues = new Float32Array(count * 3);
    const colorValues = new Float32Array(count * 3);
    const cool = new Color('#dff8ff');
    const warm = new Color('#fff0c7');

    for (let index = 0; index < count; index += 1) {
      positionValues[index * 3] = randomBetween(random, -460, 460);
      positionValues[index * 3 + 1] = randomBetween(random, 42, 430);
      positionValues[index * 3 + 2] = randomBetween(random, -680, 110);
      const color = cool.clone().lerp(warm, random() * 0.34);
      colorValues[index * 3] = color.r;
      colorValues[index * 3 + 1] = color.g;
      colorValues[index * 3 + 2] = color.b;
    }

    return { positions: positionValues, colors: colorValues };
  }, [quality]);

  if (opacity <= 0.001) return null;
  const twinkle = 0.9 + Math.sin(frame * 0.018) * 0.08;

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        vertexColors
        size={1.05}
        sizeAttenuation
        transparent
        opacity={opacity * twinkle}
        depthWrite={false}
        toneMapped={false}
      />
    </points>
  );
};

const CloudLayer = ({ frame, state, height, offset, scale, quality }: {
  frame: number;
  state: TimelineState;
  height: number;
  offset: number;
  scale: number;
  quality: CinematicQuality;
}) => {
  const uniforms = useMemo(() => ({
    uOpacity: { value: state.cloudOpacity },
    uOffset: { value: offset + frame * 0.00072 },
    uDarkness: { value: state.cloudDarkness },
  }), [frame, offset, state.cloudDarkness, state.cloudOpacity]);

  return (
    <mesh position={[0, height, -150]} scale={[scale, scale * 0.72, scale]}>
      <sphereGeometry args={[690, quality === 'high' ? 32 : 24, quality === 'high' ? 20 : 14]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={CLOUD_VERTEX}
        fragmentShader={CLOUD_FRAGMENT}
        transparent
        depthWrite={false}
        side={BackSide}
      />
    </mesh>
  );
};

type RainDrop = {
  x: number;
  yOffset: number;
  z: number;
  speed: number;
  length: number;
  thickness: number;
};

const Rain = ({ frame, intensity, quality }: { frame: number; intensity: number; quality: CinematicQuality }) => {
  const meshRef = useRef<InstancedMesh>(null);
  const helper = useMemo(() => new Object3D(), []);
  const lastDrawnFrame = useRef<number | null>(null);
  const sampledFrame = quality === 'balanced' ? Math.floor(frame / 2) * 2 : frame;
  const drops = useMemo<RainDrop[]>(() => {
    const random = createSeededRandom(CINEMATIC_CONFIG.seed + 91);
    return Array.from({ length: quality === 'high' ? 720 : 430 }, () => ({
      x: randomBetween(random, -78, 78),
      yOffset: randomBetween(random, 0, 118),
      z: randomBetween(random, CINEMATIC_CONFIG.city.farZ, CINEMATIC_CONFIG.city.nearZ),
      speed: randomBetween(random, 1.3, 2.65),
      length: randomBetween(random, 2.2, 6.4),
      thickness: randomBetween(random, 0.018, 0.048),
    }));
  }, [quality]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    // Keep the mesh and its shader warm from the first frame, but do not
    // spend time updating invisible rain before the weather beat begins.
    const drawFrame = intensity > 0.001 ? sampledFrame : 0;
    if (lastDrawnFrame.current === drawFrame) return;
    lastDrawnFrame.current = drawFrame;

    drops.forEach((drop, index) => {
      const travel = (drawFrame * drop.speed + drop.yOffset) % 118;
      helper.position.set(drop.x + travel * 0.08, 112 - travel, drop.z);
      helper.rotation.set(0, 0, -0.13);
      helper.scale.set(drop.thickness, drop.length, drop.thickness);
      helper.updateMatrix();
      mesh.setMatrixAt(index, helper.matrix);
    });
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.instanceMatrix.needsUpdate = true;
  }, [drops, helper, intensity, sampledFrame]);

  // Mount before the rain is visible so iOS compiles the instanced material
  // during the opening blackout instead of at the rain transition.
  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, drops.length]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial
        color="#bdd8e8"
        transparent
        opacity={intensity * 0.58}
        blending={AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
      />
    </instancedMesh>
  );
};

const LightningBolt = ({ frame, intensity }: { frame: number; intensity: number }) => {
  const main = useMemo(() => [
    new Vector3(0, 74, 0),
    new Vector3(-4, 58, 0),
    new Vector3(2, 48, 0),
    new Vector3(-8, 34, 0),
    new Vector3(-3, 23, 0),
    new Vector3(-12, 5, 0),
  ], []);
  const branchOne = useMemo(() => [
    new Vector3(-4, 58, 0),
    new Vector3(-18, 49, 0),
    new Vector3(-25, 35, 0),
  ], []);
  const branchTwo = useMemo(() => [
    new Vector3(-8, 34, 0),
    new Vector3(7, 27, 0),
    new Vector3(14, 16, 0),
  ], []);

  if (intensity <= 0.001) return null;
  const anchorX = frame < 520 ? 20 : frame < 650 ? -25 : 15;

  return (
    <group position={[anchorX, 86, -170]}>
      <Line
        points={main}
        color="#9bcfff"
        lineWidth={13}
        transparent
        opacity={intensity * 0.12}
        depthWrite={false}
      />
      <Line
        points={main}
        color="#f1fbff"
        lineWidth={2.4}
        transparent
        opacity={intensity * 0.96}
        depthWrite={false}
      />
      {[branchOne, branchTwo].map((branch, index) => (
        <Line
          key={index}
          points={branch}
          color="#d9f2ff"
          lineWidth={1.35}
          transparent
          opacity={intensity * 0.78}
          depthWrite={false}
        />
      ))}
      <pointLight
        position={[-9, 32, 18]}
        color="#a9d8ff"
        intensity={intensity * 7.5}
        distance={250}
      />
    </group>
  );
};

const createEyeOutline = (): Vector3[] => {
  const points: Vector3[] = [];
  for (let index = 0; index <= 40; index += 1) {
    const t = index / 40;
    points.push(new Vector3(-38 + t * 76, Math.pow(Math.sin(t * Math.PI), 0.78) * 14.8, 0));
  }
  for (let index = 40; index >= 0; index -= 1) {
    const t = index / 40;
    points.push(new Vector3(-38 + t * 76, -Math.pow(Math.sin(t * Math.PI), 0.78) * 14.8, 0));
  }
  points.push(points[0]?.clone() ?? new Vector3(-38, 0, 0));
  return points;
};

const CelestialEye = ({ opacity, frame, state }: {
  opacity: number;
  frame: number;
  state: TimelineState;
}) => {
  const outline = useMemo(() => createEyeOutline(), []);
  if (opacity <= 0.001) return null;

  const [x, y, z] = getCelestialHandoffPosition(state);
  const revealOpen = Math.min(1, opacity * 1.25);
  const narrativeEyeOpen = 1 - easedRange(frame, 1545, 1588);
  const open = revealOpen * narrativeEyeOpen;
  const breathe = getCelestialBreath(state.frame);
  const rotation = (frame - 990) * 0.0014;

  return (
    <group
      position={[x, y, z]}
      scale={[
        CELESTIAL_EYE_SCALE * breathe,
        CELESTIAL_EYE_SCALE * breathe * (0.035 + open * 0.965),
        CELESTIAL_EYE_SCALE,
      ]}
    >
      <Line
        points={outline}
        color="#86c8dc"
        lineWidth={14}
        transparent
        opacity={opacity * 0.13}
        depthWrite={false}
      />
      <Line
        points={outline}
        color="#d8f5fb"
        lineWidth={2.35}
        transparent
        opacity={opacity * 0.82}
        depthWrite={false}
      />
      <group scale={[0.895, 0.79, 1]}>
        <Line
          points={outline}
          color="#6fa8bc"
          lineWidth={1.25}
          transparent
          opacity={opacity * 0.34}
          depthWrite={false}
        />
      </group>
      <mesh position={[0, 0, -0.8]} rotation={[0, 0, rotation]}>
        <ringGeometry args={[CELESTIAL_PUPIL_RADIUS - 0.27, CELESTIAL_PUPIL_RADIUS + 0.27, 96]} />
        <meshBasicMaterial
          color="#9cd6e2"
          transparent
          opacity={opacity * 0.22}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, 0, -1]} rotation={[0, 0, -rotation * 0.6]}>
        <ringGeometry args={[14.8, 15.08, 96]} />
        <meshBasicMaterial
          color="#789bbd"
          transparent
          opacity={opacity * 0.13}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <pointLight
        color="#8ac8d7"
        intensity={opacity * 0.48}
        distance={145}
      />
    </group>
  );
};

export const Atmosphere = ({ frame, state, quality }: AtmosphereProps) => (
  <>
    <SkyDome state={state} quality={quality} />
    <Stars opacity={state.starsOpacity} frame={frame} quality={quality} />
    <CloudLayer frame={frame} state={state} height={82} offset={0.4} scale={1.04} quality={quality} />
    <CloudLayer frame={frame} state={state} height={103} offset={8.7} scale={1.22} quality={quality} />
    <Rain frame={frame} intensity={state.rainIntensity} quality={quality} />
    <LightningBolt frame={frame} intensity={state.lightningBolt} />
    <CelestialEye opacity={state.eyeOpacity} frame={frame} state={state} />
  </>
);
