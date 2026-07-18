import { Line } from '@react-three/drei';
import { useMemo } from 'react';
import {
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  LinearFilter,
  SRGBColorSpace,
  Texture,
  Vector3,
} from 'three';
import type { TimelineState } from '../timeline/timeline';
import { clamp01 } from '../utils/math';

const SEA_VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SEA_FRAGMENT = `
  uniform float uTime;
  uniform float uOpacity;
  uniform float uGoldenHour;
  uniform float uSunset;
  varying vec2 vUv;

  void main() {
    float waveA = sin(vUv.y * 155.0 + uTime * 0.052 + sin(vUv.x * 31.0)) * 0.5 + 0.5;
    float waveB = sin(vUv.y * 91.0 - uTime * 0.037 + vUv.x * 47.0) * 0.5 + 0.5;
    float glint = smoothstep(0.945, 1.0, waveA * 0.66 + waveB * 0.34);
    float horizon = smoothstep(0.0, 1.0, vUv.y);
    vec3 dayDeep = vec3(0.035, 0.16, 0.22);
    vec3 dayHorizon = vec3(0.28, 0.52, 0.61);
    vec3 afternoonDeep = vec3(0.075, 0.18, 0.22);
    vec3 afternoonHorizon = vec3(0.54, 0.43, 0.35);
    vec3 eveningDeep = vec3(0.025, 0.055, 0.105);
    vec3 eveningHorizon = vec3(0.22, 0.13, 0.19);
    vec3 dayColor = mix(dayDeep, dayHorizon, horizon * 0.78);
    vec3 afternoonColor = mix(afternoonDeep, afternoonHorizon, horizon * 0.84);
    vec3 eveningColor = mix(eveningDeep, eveningHorizon, horizon * 0.76);
    vec3 color = mix(dayColor, afternoonColor, uGoldenHour * 0.78);
    color = mix(color, eveningColor, uSunset * 0.94);
    color += glint * vec3(0.2, 0.4, 0.44) * (0.12 + horizon * 0.24);

    float reflectionCentre = 0.528
      + sin(vUv.y * 31.0 + uTime * 0.018) * 0.009
      + sin(vUv.y * 73.0 - uTime * 0.011) * 0.004;
    float reflectionTightness = mix(18.0, 72.0, horizon);
    float sunPath = exp(-abs(vUv.x - reflectionCentre) * reflectionTightness);
    float brokenLight = smoothstep(0.48, 0.92, waveA * 0.55 + waveB * 0.45);
    float reflectionFade = 1.0 - smoothstep(0.7, 1.0, uSunset);
    float spill = sunPath * (0.16 + brokenLight * 1.18)
      * (0.32 + horizon * 0.9) * reflectionFade;
    vec3 reflectionWarm = mix(vec3(1.0, 0.68, 0.26), vec3(1.0, 0.19, 0.045), uSunset * 0.86);
    color += reflectionWarm * spill;
    color += mix(vec3(1.0, 0.88, 0.54), vec3(1.0, 0.38, 0.11), uSunset)
      * sunPath * glint * horizon * reflectionFade * 0.72;
    gl_FragColor = vec4(color, uOpacity);
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
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;

  float puff(vec2 uv, vec2 centre, vec2 scale) {
    vec2 d = (uv - centre) / scale;
    return exp(-dot(d, d) * 2.8);
  }

  void main() {
    float shape = puff(vUv, vec2(0.2, 0.46), vec2(0.2, 0.25));
    shape += puff(vUv, vec2(0.37, 0.58), vec2(0.24, 0.34));
    shape += puff(vUv, vec2(0.55, 0.52), vec2(0.3, 0.28));
    shape += puff(vUv, vec2(0.74, 0.57), vec2(0.22, 0.31));
    shape += puff(vUv, vec2(0.9, 0.45), vec2(0.2, 0.24));
    float alpha = smoothstep(0.2, 0.82, shape) * (1.0 - smoothstep(0.46, 1.15, vUv.y));
    float warmBase = smoothstep(0.18, 0.72, vUv.y);
    vec3 color = mix(uColor * vec3(1.0, 0.72, 0.62), uColor, warmBase);
    gl_FragColor = vec4(color, alpha * uOpacity);
  }
`;

type ShorePoint = readonly [number, number];

const LEFT_EDGE: readonly ShorePoint[] = [
  [-48, -425],
  [-57, -472],
  [-74, -525],
  [-68, -580],
  [-96, -644],
  [-124, -710],
  [-158, -790],
  [-202, -895],
] as const;

const RIGHT_EDGE: readonly ShorePoint[] = [
  [50, -425],
  [64, -476],
  [60, -532],
  [88, -590],
  [104, -650],
  [132, -724],
  [162, -806],
  [212, -895],
] as const;

const BEACH_EDGE: readonly ShorePoint[] = [
  [-360, -522],
  [-220, -516],
  [-92, -528],
  [32, -520],
  [168, -532],
  [360, -523],
] as const;

const createBeachGeometry = (): BufferGeometry => {
  const positions: number[] = [];
  const nearZ = -324;
  for (let index = 0; index < BEACH_EDGE.length - 1; index += 1) {
    const current = BEACH_EDGE[index];
    const next = BEACH_EDGE[index + 1];
    if (!current || !next) continue;
    positions.push(
      current[0], 0.16, nearZ,
      current[0], 0.16, current[1],
      next[0], 0.16, nearZ,
      current[0], 0.16, current[1],
      next[0], 0.16, next[1],
      next[0], 0.16, nearZ,
    );
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
};
const createShoreGeometry = (edge: readonly ShorePoint[], side: -1 | 1): BufferGeometry => {
  const positions: number[] = [];
  const outerX = side * 370;
  for (let index = 0; index < edge.length - 1; index += 1) {
    const current = edge[index];
    const next = edge[index + 1];
    if (!current || !next) continue;
    positions.push(
      outerX, 0, current[1],
      current[0], 0.12, current[1],
      outerX, 0, next[1],
      current[0], 0.12, current[1],
      next[0], 0.12, next[1],
      outerX, 0, next[1],
    );
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
};

const CloudBank = ({ frame, opacity, state }: {
  frame: number;
  opacity: number;
  state: TimelineState;
}) => {
  const clouds = useMemo(() => [
    { x: -122, y: 96, z: -650, width: 145, height: 44, drift: 0.004 },
    { x: 106, y: 76, z: -620, width: 126, height: 37, drift: -0.003 },
    { x: -12, y: 132, z: -760, width: 188, height: 48, drift: 0.002 },
    { x: 164, y: 118, z: -820, width: 152, height: 41, drift: -0.0025 },
  ], []);

  if (opacity <= 0.001) return null;

  return (
    <group>
      {clouds.map((cloud, index) => {
        const cloudColor = new Color(index % 2 === 0 ? '#f2e6dc' : '#d7e5e7')
          .lerp(new Color('#efb092'), state.goldenHourProgress * 0.62)
          .lerp(new Color('#553446'), state.sunsetProgress * 0.86);
        return (
          <mesh
            key={`${cloud.x}-${cloud.z}`}
            position={[cloud.x + frame * cloud.drift, cloud.y, cloud.z]}
            scale={[cloud.width, cloud.height, 1]}
          >
            <planeGeometry args={[1, 1]} />
            <shaderMaterial
              vertexShader={CLOUD_VERTEX}
              fragmentShader={CLOUD_FRAGMENT}
              uniforms={{
                uColor: { value: cloudColor },
                uOpacity: { value: opacity * (index === 2 ? 0.34 : 0.48) },
              }}
              transparent
              depthWrite={false}
            />
          </mesh>
        );
      })}
    </group>
  );
};

const createSailGeometry = (side: -1 | 1): BufferGeometry => {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([
    0, 0, 0,
    0, 8.4, 0,
    side * 4.8, 0, 0,
  ], 3));
  geometry.setAttribute('uv', new Float32BufferAttribute([
    0.5, 0,
    0.5, 1,
    side > 0 ? 1 : 0, 0,
  ], 2));
  geometry.computeVertexNormals();
  return geometry;
};

const createSailLogoGeometry = (): BufferGeometry => {
  const geometry = new BufferGeometry();
  // A narrow band running parallel to the starboard sail's hypotenuse. The
  // texture reads from the mast-side top toward the lower outer corner.
  geometry.setAttribute('position', new Float32BufferAttribute([
    0.12, 6.0, 0,
    0.84, 6.44, 0,
    3.2, 1.03, 0,
    3.92, 1.47, 0,
  ], 3));
  geometry.setAttribute('uv', new Float32BufferAttribute([
    0, 0,
    0, 1,
    1, 0,
    1, 1,
  ], 2));
  geometry.setIndex([0, 2, 1, 1, 2, 3]);
  geometry.computeVertexNormals();
  return geometry;
};

const createKoleQuantLogoTexture = (): Texture => {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (context == null) {
    throw new Error('Unable to create the KoleQuant sail mark.');
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle = '#30465a';
  context.lineWidth = 10;
  for (const phase of [0, Math.PI]) {
    context.beginPath();
    for (let index = 0; index <= 48; index += 1) {
      const t = index / 48;
      const x = 72 + Math.sin(t * Math.PI * 3 + phase) * 30;
      const y = 31 + t * 194;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
  }
  context.strokeStyle = 'rgba(48, 70, 90, 0.72)';
  context.lineWidth = 5;
  for (let index = 0; index <= 9; index += 1) {
    const t = index / 9;
    const y = 37 + t * 182;
    const phase = t * Math.PI * 3;
    context.beginPath();
    context.moveTo(72 + Math.sin(phase) * 30, y);
    context.lineTo(72 + Math.sin(phase + Math.PI) * 30, y);
    context.stroke();
  }

  context.fillStyle = '#243b4d';
  context.font = '700 118px Montserrat, Arial, sans-serif';
  context.textBaseline = 'middle';
  context.fillText('KoleQuant', 142, 132);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
};

const createYachtHullGeometry = (): BufferGeometry => {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([
    0, 0.92, 5.35,
    -3.05, 0.82, 1.25,
    -2.55, 0.72, -4.05,
    2.55, 0.72, -4.05,
    3.05, 0.82, 1.25,
    0, -0.42, 4.35,
    -1.62, -0.52, 0.7,
    -1.82, -0.28, -3.55,
    1.82, -0.28, -3.55,
    1.62, -0.52, 0.7,
  ], 3));
  geometry.setIndex([
    0, 1, 5, 1, 6, 5,
    1, 2, 6, 2, 7, 6,
    2, 3, 7, 3, 8, 7,
    3, 4, 8, 4, 9, 8,
    4, 0, 9, 0, 5, 9,
    5, 6, 9, 6, 7, 8, 6, 8, 9,
    0, 4, 1, 1, 4, 2, 2, 4, 3,
  ]);
  geometry.computeVertexNormals();
  return geometry;
};

type YachtProps = {
  brand: 'eye' | 'kolequant';
  frame: number;
  logoTexture?: Texture;
  opacity: number;
  position: readonly [number, number, number];
  rotation: number;
  scale?: number;
};

const Yacht = ({ brand, frame, logoTexture, opacity, position, rotation, scale = 1 }: YachtProps) => {
  const rightSail = useMemo(() => createSailGeometry(1), []);
  const leftSail = useMemo(() => createSailGeometry(-1), []);
  const sailLogoGeometry = useMemo(() => createSailLogoGeometry(), []);
  const hullGeometry = useMemo(() => createYachtHullGeometry(), []);
  const bob = Math.sin(frame * 0.035 + position[0] * 0.08) * 0.12;
  const roll = Math.sin(frame * 0.022 + position[2] * 0.03) * 0.012;
  const translucent = opacity < 0.999;

  return (
    <group
      position={[position[0], position[1] + bob, position[2]]}
      rotation={[0, rotation, roll]}
      scale={[scale, scale, scale]}
    >
      <mesh geometry={hullGeometry} position={[0, 0.58, 0]}>
        <meshPhysicalMaterial
          color="#e9f0ee"
          roughness={0.2}
          metalness={0.12}
          clearcoat={0.9}
          transparent={translucent}
          opacity={opacity}
          depthWrite={!translucent}
        />
      </mesh>
      <mesh position={[0, 1.32, -0.2]} scale={[2.48, 0.13, 3.85]}>
        <sphereGeometry args={[1, 22, 10]} />
        <meshStandardMaterial
          color="#18303b"
          roughness={0.42}
          metalness={0.36}
          transparent={translucent}
          opacity={opacity}
          depthWrite={!translucent}
        />
      </mesh>
      <mesh position={[0, 1.43, 0.56]} scale={[1.72, 0.32, 1.6]}>
        <sphereGeometry args={[1, 24, 12]} />
        <meshPhysicalMaterial
          color="#173642"
          roughness={0.14}
          metalness={0.5}
          clearcoat={0.88}
          transparent={translucent}
          opacity={opacity}
          depthWrite={!translucent}
        />
      </mesh>
      <mesh position={[0, 1.62, 1.25]} rotation={[-0.09, 0, 0]}>
        <boxGeometry args={[2.55, 0.48, 0.92]} />
        <meshPhysicalMaterial
          color="#76a9b5"
          roughness={0.08}
          metalness={0.58}
          clearcoat={1}
          transparent={translucent}
          opacity={opacity}
          depthWrite={!translucent}
        />
      </mesh>
      {[-1, 1].map((side) => (
        <Line
          key={`hull-accent-${side}`}
          points={[
            new Vector3(side * 2.48, 0.82, 3.25),
            new Vector3(side * 3.08, 0.66, 0.2),
            new Vector3(side * 2.25, 0.48, -3.75),
          ]}
          color={brand === 'kolequant' ? '#28bfd0' : '#8ecad5'}
          lineWidth={1.8}
          transparent
          opacity={opacity * 0.82}
          depthWrite={false}
        />
      ))}
      <mesh position={[0, 5.15, 0]}>
        <cylinderGeometry args={[0.075, 0.1, 9.2, 10]} />
        <meshStandardMaterial color="#c6d1ce" metalness={0.82} roughness={0.24} transparent={translucent} opacity={opacity} />
      </mesh>
      <mesh position={[1.65, 3.22, 0.08]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.05, 0.075, 3.3, 10]} />
        <meshStandardMaterial color="#bac8c7" metalness={0.78} roughness={0.2} transparent={translucent} opacity={opacity} />
      </mesh>
      <mesh geometry={rightSail} position={[0, 1.35, 0.04]}>
        <meshBasicMaterial color="#f5f0e8" side={DoubleSide} transparent={translucent} opacity={opacity} />
      </mesh>
      {brand === 'kolequant' && logoTexture && (
        <mesh geometry={sailLogoGeometry} position={[0, 1.35, 0.065]} renderOrder={9}>
          <meshBasicMaterial
            map={logoTexture}
            color="#ffffff"
            transparent
            opacity={opacity}
            side={DoubleSide}
            alphaTest={0.025}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      )}
      <mesh geometry={leftSail} position={[0, 1.35, 0.02]} scale={[0.72, 0.78, 1]}>
        <meshBasicMaterial color="#cfdfe0" side={DoubleSide} transparent={translucent} opacity={opacity} />
      </mesh>
      <Line
        points={[new Vector3(0, 9.68, 0.08), new Vector3(4.72, 1.42, 0.08)]}
        color="#d9e8e5"
        lineWidth={1.05}
        transparent
        opacity={opacity * 0.7}
        depthWrite={false}
      />
      <Line
        points={[new Vector3(0, 9.68, 0.06), new Vector3(-3.34, 1.42, 0.06)]}
        color="#d9e8e5"
        lineWidth={1.05}
        transparent
        opacity={opacity * 0.62}
        depthWrite={false}
      />
      {brand === 'eye' && (
        <group position={[1.52, 5.05, 0.12]} scale={[0.78, 0.78, 0.78]}>
          <Line
            points={[
              new Vector3(-1.65, 0, 0),
              new Vector3(0, 0.76, 0),
              new Vector3(1.65, 0, 0),
              new Vector3(0, -0.76, 0),
              new Vector3(-1.65, 0, 0),
            ]}
            color="#2ecde4"
            lineWidth={2.4}
            transparent
            opacity={opacity}
            depthWrite={false}
          />
          <mesh position={[0, 0, 0.02]}>
            <ringGeometry args={[0.48, 0.68, 32]} />
            <meshBasicMaterial color="#12333c" transparent opacity={opacity} depthWrite={false} />
          </mesh>
        </group>
      )}
      <Line
        points={[new Vector3(-2.15, 0.18, -4.2), new Vector3(-3.3, 0.12, -14.5)]}
        color="#d6f7f3"
        lineWidth={1.25}
        transparent
        opacity={opacity * 0.34}
        depthWrite={false}
      />
      <Line
        points={[new Vector3(2.15, 0.18, -4.2), new Vector3(3.3, 0.12, -14.5)]}
        color="#d6f7f3"
        lineWidth={1.25}
        transparent
        opacity={opacity * 0.34}
        depthWrite={false}
      />
    </group>
  );
};

const Yachts = ({ frame, opacity }: { frame: number; opacity: number }) => {
  // CanvasTexture is created synchronously, so the coast never suspends the
  // entire WebGL canvas while a late image asset is fetched on mobile.
  const logoTexture = useMemo(() => createKoleQuantLogoTexture(), []);

  return (
    <group>
      <Yacht brand="eye" frame={frame} opacity={opacity} position={[-39, 0.18, -548]} rotation={0.13} />
      <group position={[42, 0.08, -558]} rotation={[0, -0.11, 0]} scale={[1.12, 1.12, 1.12]}>
        <Yacht
          brand="kolequant"
          frame={frame}
          logoTexture={logoTexture}
          opacity={opacity}
          position={[0, 0, 0]}
          rotation={0}
        />
      </group>
    </group>
  );
};

const BirdFlock = ({ frame, opacity }: { frame: number; opacity: number }) => {
  const birds = useMemo(() => [
    [-62, 66, -710, 0.8],
    [-46, 74, -735, 1.15],
    [-28, 60, -760, 1.7],
    [-8, 70, -785, 2.25],
    [14, 58, -810, 2.8],
    [38, 68, -835, 3.4],
    [61, 56, -860, 3.9],
  ] as const, []);
  const drift = Math.max(0, frame - 1530) * 0.015;

  return (
    <group>
      {birds.map(([x, y, z, phase], index) => {
        const wing = 1.8 + (index % 3) * 0.28;
        const flap = 0.58 + Math.sin(frame * 0.16 + phase) * 0.24;
        return (
          <Line
            key={`${x}-${z}`}
            position={[x + drift, y + Math.sin(frame * 0.025 + phase) * 0.4, z]}
            points={[
              new Vector3(-wing, 0, 0),
              new Vector3(0, flap, 0),
              new Vector3(wing, 0, 0),
            ]}
            color="#22323a"
            lineWidth={2.6}
            transparent
            opacity={opacity * 0.88}
            depthWrite={false}
          />
        );
      })}
    </group>
  );
};
export const FinalCoast = ({ frame, state }: { frame: number; state: TimelineState }) => {
  const beachGeometry = useMemo(() => createBeachGeometry(), []);
  const beachSurf = useMemo(() => BEACH_EDGE.map(([x, z]) => new Vector3(x, 0.34, z)), []);
  const leftGeometry = useMemo(() => createShoreGeometry(LEFT_EDGE, -1), []);
  const rightGeometry = useMemo(() => createShoreGeometry(RIGHT_EDGE, 1), []);
  const leftSurf = useMemo(
    () => LEFT_EDGE.map(([x, z]) => new Vector3(x + 1.6, 0.38, z)),
    [],
  );
  const rightSurf = useMemo(
    () => RIGHT_EDGE.map(([x, z]) => new Vector3(x - 1.6, 0.38, z)),
    [],
  );
  const opacity = state.coastProgress;
  const detailOpacity = clamp01((opacity - 0.16) / 0.84);
  const sandColor = new Color('#c69a72')
    .lerp(new Color('#b66d50'), state.goldenHourProgress * 0.62)
    .lerp(new Color('#55303a'), state.sunsetProgress * 0.9);
  const leftShoreColor = new Color('#172722')
    .lerp(new Color('#2f2b26'), state.goldenHourProgress * 0.5)
    .lerp(new Color('#11151d'), state.sunsetProgress * 0.88);
  const rightShoreColor = new Color('#1d2b25')
    .lerp(new Color('#3a3028'), state.goldenHourProgress * 0.5)
    .lerp(new Color('#141721'), state.sunsetProgress * 0.88);

  // Mount only after the city has completed its exit. The landscape plate is
  // intentionally opaque so no building geometry can show through the sea.
  if (opacity <= 0.12) return null;

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.09, -730]}>
        <planeGeometry args={[780, 900, 1, 1]} />
        <shaderMaterial
          vertexShader={SEA_VERTEX}
          fragmentShader={SEA_FRAGMENT}
          uniforms={{
            uTime: { value: frame },
            uOpacity: { value: 1 },
            uGoldenHour: { value: state.goldenHourProgress },
            uSunset: { value: state.sunsetProgress },
          }}
          depthWrite
        />
      </mesh>

      <mesh geometry={beachGeometry} renderOrder={4}>
        <meshStandardMaterial
          color={sandColor}
          roughness={0.82}
          metalness={0.03}
          side={DoubleSide}
          depthTest
          depthWrite
        />
      </mesh>
      <Line
        points={beachSurf}
        color="#f1e2cf"
        lineWidth={2.3}
        transparent
        opacity={detailOpacity * 0.62}
        depthWrite={false}
      />
      {[leftGeometry, rightGeometry].map((geometry, index) => (
        <mesh key={index} geometry={geometry}>
          <meshStandardMaterial
            color={index === 0 ? leftShoreColor : rightShoreColor}
            roughness={0.84}
            metalness={0.04}
          />
        </mesh>
      ))}

      <Line points={leftSurf} color="#d8f5ef" lineWidth={2.1} transparent opacity={detailOpacity * 0.54} depthWrite={false} />
      <Line points={rightSurf} color="#d8f5ef" lineWidth={2.1} transparent opacity={detailOpacity * 0.54} depthWrite={false} />
      <CloudBank frame={frame} opacity={detailOpacity} state={state} />
      <Yachts frame={frame} opacity={detailOpacity} />
      <BirdFlock frame={frame} opacity={detailOpacity} />
    </group>
  );
};
