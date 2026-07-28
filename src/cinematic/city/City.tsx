import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  Color,
  InstancedMesh,
  Object3D,
  StaticDrawUsage,
} from 'three';
import { CINEMATIC_CONFIG } from '../config/cinematicConfig';
import type { CinematicQuality } from '../config/cinematicQuality';
import type { TimelineState } from '../timeline/timeline';
import { CITY_LAYOUT, type BoxInstance } from './cityLayout';
import { Storefronts, UmbrellaPedestrians } from './StreetLife';

const RETAIL_PODIUMS: readonly BoxInstance[] = CITY_LAYOUT.buildings
  .filter((building) => Math.abs(building.position[0]) < 35)
  .map((building, index) => ({
    position: [building.position[0], 4.15, building.position[2]],
    scale: [building.scale[0] + 0.34, 8.3, building.scale[2] + 0.34],
    color: index % 2 === 0 ? '#3a464b' : '#323e44',
  }));
type CityProps = {
  frame: number;
  state: TimelineState;
  quality: CinematicQuality;
};

type InstancedBoxesProps = {
  instances: readonly BoxInstance[];
  material: 'building' | 'distant' | 'roof' | 'mark' | 'reflection';
  opacity?: number;
  emissiveIntensity?: number;
};

const InstancedBoxes = ({ instances, material, opacity = 1, emissiveIntensity = 0 }: InstancedBoxesProps) => {
  const meshRef = useRef<InstancedMesh>(null);
  const helper = useMemo(() => new Object3D(), []);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    instances.forEach((instance, index) => {
      helper.position.set(...instance.position);
      helper.scale.set(...instance.scale);
      helper.updateMatrix();
      mesh.setMatrixAt(index, helper.matrix);
      mesh.setColorAt(index, new Color(instance.color));
    });
    mesh.instanceMatrix.setUsage(StaticDrawUsage);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [helper, instances]);

  const transparent = opacity < 1;
  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, instances.length]}>
      <boxGeometry args={[1, 1, 1]} />
      {material === 'building' && (
        <meshPhysicalMaterial vertexColors color="#ffffff" roughness={0.36} metalness={0.62} clearcoat={0.22} />
      )}
      {material === 'distant' && (
        <meshStandardMaterial vertexColors color="#ffffff" roughness={0.74} metalness={0.26} />
      )}
      {material === 'roof' && (
        <meshStandardMaterial vertexColors color="#ffffff" roughness={0.48} metalness={0.68} />
      )}
      {material === 'mark' && (
        <meshBasicMaterial vertexColors color="#ffffff" transparent opacity={opacity} toneMapped={false} />
      )}
      {material === 'reflection' && (
        <meshBasicMaterial
          vertexColors
          color="#ffffff"
          transparent={transparent}
          opacity={opacity}
          blending={2}
          depthWrite={false}
          toneMapped={false}
        />
      )}
      {emissiveIntensity > 0 && material === 'roof' && (
        <meshStandardMaterial emissive="#5de7ff" emissiveIntensity={emissiveIntensity} />
      )}
    </instancedMesh>
  );
};

const BuildingWindows = ({ frame, intensity, quality }: { frame: number; intensity: number; quality: CinematicQuality }) => {
  const meshRef = useRef<InstancedMesh>(null);
  const helper = useMemo(() => new Object3D(), []);
  const colorHelper = useMemo(() => new Color(), []);
  const highlightColor = useMemo(() => new Color('#fffef5'), []);
  const apartmentWindows = useMemo(
    () => CITY_LAYOUT.windows.filter((window) => !(Math.abs(window.position[0]) < 35 && window.position[1] < 9.2)),
    [],
  );
  const sampledFrame = quality === 'high' ? frame : Math.floor(frame / 2) * 2;
  const warmPalette = useMemo(() => [
    new Color('#fffdf1'),
    new Color('#fff4c7'),
    new Color('#ffe4a3'),
    new Color('#ffd47f'),
  ], []);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    apartmentWindows.forEach((window, index) => {
      const slowWave = 0.5 + Math.sin(sampledFrame * (0.009 + (index % 7) * 0.0011) + index * 1.71) * 0.5;
      const flickerPeriod = 10 + ((index * 7) % 31);
      const flickerStep = Math.floor((sampledFrame + (index % flickerPeriod)) / flickerPeriod);
      const randomSample = Math.sin((flickerStep + 1) * (index + 11) * 12.9898) * 43758.5453;
      const flickerValue = randomSample - Math.floor(randomSample);
      const isReactiveWindow = index % 4 === 0;
      const rareDip = isReactiveWindow && flickerValue < 0.16 ? 0.14 : 1;
      const daylightVisibility = intensity < 0.7 && window.litBias < 0.3 ? 0.03 : 1;
      const flickerVisibility = rareDip < 1 ? 0.16 : 1;
      const brightness = isReactiveWindow
        ? 0.76 + flickerValue * 0.3
        : 0.88 + slowWave * 0.08;
      const outputLevel = Math.min(1.28, 0.22 + intensity * 0.38);
      const paletteIndex = (index + Math.floor(flickerStep / 4)) % warmPalette.length;
      const baseColor = warmPalette[paletteIndex] ?? warmPalette[0];

      helper.position.set(...window.position);
      helper.scale.set(
        window.scale[0],
        window.scale[1] * daylightVisibility * flickerVisibility,
        window.scale[2],
      );
      helper.updateMatrix();
      mesh.setMatrixAt(index, helper.matrix);

      colorHelper.copy(baseColor ?? highlightColor);
      colorHelper.lerp(highlightColor, flickerValue * 0.14);
      colorHelper.multiplyScalar(brightness * outputLevel);
      mesh.setColorAt(index, colorHelper);
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [apartmentWindows, colorHelper, helper, highlightColor, intensity, sampledFrame, warmPalette]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, apartmentWindows.length]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial
        color={new Color('#ffd47f')
          .lerp(new Color('#fffdf1'), 0.42 + Math.sin(frame * 0.027) * 0.12)}
        transparent
        opacity={Math.min(1, intensity * 0.52)}
        blending={AdditiveBlending}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-2}
        toneMapped={false}
      />
    </instancedMesh>
  );
};

const StreetFurniture = ({ state }: { state: TimelineState }) => {
  const poleInstances = useMemo<BoxInstance[]>(
    () => CITY_LAYOUT.streetLights.map(([x, , z]) => ({
      position: [x, 2.8, z],
      scale: [0.22, 5.6, 0.22],
      color: '#1d2428',
    })),
    [],
  );
  const baseInstances = useMemo<BoxInstance[]>(
    () => CITY_LAYOUT.streetLights.map(([x, , z]) => ({
      position: [x, 0.42, z],
      scale: [0.58, 0.84, 0.58],
      color: '#20282c',
    })),
    [],
  );
  const armInstances = useMemo<BoxInstance[]>(
    () => CITY_LAYOUT.streetLights.map(([x, y, z]) => {
      const side = Math.sign(x) || 1;
      return {
        position: [x - side * 0.5, y + 0.02, z],
        scale: [1.08, 0.13, 0.18],
        color: '#1d2428',
      };
    }),
    [],
  );
  const capInstances = useMemo<BoxInstance[]>(
    () => CITY_LAYOUT.streetLights.map(([x, y, z]) => {
      const side = Math.sign(x) || 1;
      return {
        position: [x - side * 0.95, y + 0.32, z],
        scale: [0.78, 0.16, 0.78],
        color: '#252e32',
      };
    }),
    [],
  );

  return (
    <>
      <InstancedBoxes instances={poleInstances} material="roof" />
      <InstancedBoxes instances={baseInstances} material="roof" />
      <InstancedBoxes instances={armInstances} material="roof" />
      <InstancedBoxes instances={capInstances} material="roof" />
      {CITY_LAYOUT.streetLights.map(([x, y, z]) => {
        const side = Math.sign(x) || 1;
        const lampX = x - side * 0.95;
        return (
          <group key={x + ':' + z} position={[lampX, y - 0.24, z]}>
            <mesh>
              <boxGeometry args={[0.68, 0.92, 0.68]} />
              <meshStandardMaterial color="#252e32" metalness={0.72} roughness={0.38} />
            </mesh>
            <mesh position={[0, -0.03, 0]}>
              <boxGeometry args={[0.42, 0.6, 0.42]} />
              <meshStandardMaterial
                color="#ffe0aa"
                emissive="#ffc36f"
                emissiveIntensity={state.streetLightIntensity * 0.78}
                toneMapped={false}
              />
            </mesh>
          </group>
        );
      })}
      {CITY_LAYOUT.intersections.map((z, index) => (
        <group key={z} position={[index % 2 === 0 ? -10.2 : 10.2, 0, z]}>
          <mesh position={[0, 2.8, 0]}>
            <boxGeometry args={[0.22, 5.6, 0.22]} />
            <meshStandardMaterial color="#1d2a42" metalness={0.8} roughness={0.35} />
          </mesh>
          <mesh position={[0, 5.35, 0]}>
            <boxGeometry args={[0.7, 1.45, 0.55]} />
            <meshStandardMaterial color="#101827" metalness={0.7} roughness={0.42} />
          </mesh>
          <mesh position={[0, 5.62, 0.29]}>
            <circleGeometry args={[0.16, 10]} />
            <meshStandardMaterial emissive="#ff526f" emissiveIntensity={state.streetLightIntensity * 0.7} color="#ff526f" toneMapped={false} />
          </mesh>
          <mesh position={[0, 5.08, 0.29]}>
            <circleGeometry args={[0.16, 10]} />
            <meshStandardMaterial emissive="#58f0da" emissiveIntensity={state.streetLightIntensity} color="#58f0da" toneMapped={false} />
          </mesh>
        </group>
      ))}
    </>
  );
};

const VehicleTraffic = ({ frame, state }: { frame: number; state: TimelineState }) => {
  const roadLength = CINEMATIC_CONFIG.city.nearZ - CINEMATIC_CONFIG.city.farZ;
  const visibility = Math.min(1, state.vehicleLightIntensity);

  if (visibility <= 0.001) return null;

  return (
    <group>
      {CITY_LAYOUT.vehicles.map((vehicle, index) => {
        const travelled = (frame * vehicle.speed + vehicle.offset) % roadLength;
        const z = vehicle.direction > 0
          ? CINEMATIC_CONFIG.city.farZ + travelled
          : CINEMATIC_CONFIG.city.nearZ - travelled;
        const isTruck = vehicle.kind === 'truck';
        const width = isTruck ? 2.25 : 1.72;
        const height = isTruck ? 1.65 : 0.92;
        const length = isTruck ? 6.6 : 3.45;
        const lampZ = length / 2 + 0.1;
        const lightColor = vehicle.color;
        const reflectionColor = vehicle.direction > 0 ? '#e4f8ff' : '#ff5368';

        return (
          <group key={index} position={[vehicle.laneX, 0, z]}>
            <mesh position={[0, 0.72 + height / 2, 0]}>
              <boxGeometry args={[width, height, length]} />
              <meshStandardMaterial
                color={vehicle.bodyColor}
                roughness={0.3 + state.wetness * 0.12}
                metalness={0.72}
              />
            </mesh>
            {isTruck ? (
              <mesh position={[0, 1.08, lampZ - 1.15]}>
                <boxGeometry args={[width * 0.94, 1.5, 1.65]} />
                <meshStandardMaterial color="#243346" roughness={0.38} metalness={0.58} />
              </mesh>
            ) : (
              <mesh position={[0, 1.56, 0.05]}>
                <boxGeometry args={[width * 0.78, 0.54, length * 0.48]} />
                <meshPhysicalMaterial
                  color="#182b3d"
                  roughness={0.2}
                  metalness={0.68}
                  clearcoat={0.62}
                />
              </mesh>
            )}

            {[-1, 1].map((side) => (
              <mesh key={side} position={[side * width * 0.29, 1.02, lampZ]}>
                <sphereGeometry args={[isTruck ? 0.16 : 0.13, 10, 8]} />
                <meshBasicMaterial
                  color={lightColor}
                  transparent
                  opacity={visibility}
                  toneMapped={false}
                />
              </mesh>
            ))}

            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.09, lampZ + 1.6]}>
              <planeGeometry args={[width * 1.5, isTruck ? 8.5 : 6]} />
              <meshBasicMaterial
                color={reflectionColor}
                transparent
                opacity={state.wetness * visibility * (vehicle.direction > 0 ? 0.13 : 0.09)}
                blending={AdditiveBlending}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>

            {vehicle.direction > 0 && (
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.16, lampZ + 3.3]}>
                <planeGeometry args={[width * 2.1, 7.5]} />
                <meshBasicMaterial
                  color="#eaf9ff"
                  transparent
                  opacity={visibility * 0.055}
                  blending={AdditiveBlending}
                  depthWrite={false}
                  toneMapped={false}
                />
              </mesh>
            )}

            {index % 4 === 0 && (
              <pointLight
                position={[0, 1.1, lampZ + 0.65]}
                color={lightColor}
                intensity={visibility * (vehicle.direction > 0 ? 0.72 : 0.34)}
                distance={18}
              />
            )}
          </group>
        );
      })}
    </group>
  );
};
const Roads = ({ state }: { state: TimelineState }) => {
  const roadLength = CINEMATIC_CONFIG.city.nearZ - CINEMATIC_CONFIG.city.farZ;
  const roadMidpoint = (CINEMATIC_CONFIG.city.nearZ + CINEMATIC_CONFIG.city.farZ) / 2;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, roadMidpoint]}>
        <planeGeometry args={[CINEMATIC_CONFIG.city.roadWidth, roadLength]} />
        <meshPhysicalMaterial
          color={CINEMATIC_CONFIG.palette.asphalt}
          roughness={0.88 - state.wetness * 0.62}
          metalness={0.08 + state.wetness * 0.48}
          clearcoat={state.wetness * 0.9}
          clearcoatRoughness={0.1}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, roadMidpoint]}>
        <planeGeometry args={[CINEMATIC_CONFIG.city.roadWidth, roadLength]} />
        <meshBasicMaterial color="#6d8db3" transparent opacity={state.wetness * 0.2} depthWrite={false} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 11, 0.22, roadMidpoint]}>
          <boxGeometry args={[CINEMATIC_CONFIG.city.sidewalkWidth, 0.42, roadLength]} />
          <meshPhysicalMaterial color="#161e2c" roughness={0.7 - state.wetness * 0.36} metalness={0.24 + state.wetness * 0.32} clearcoat={state.wetness * 0.7} />
        </mesh>
      ))}
      {CITY_LAYOUT.intersections.map((z) => (÷¾ú¶‰ËkºwµçI½ÁÌ…ÌìÉ•‘¥ÑÌüèÉÉ…äñì¥èÍÑÉ¥¹œôøôğÕ¹‘•™¥¹•ì4(€€€€€•áÁ•Ğ¡¥¹ÁÕÑAÉ½ÁÌü¹É•‘¥ÑÌü¹lÁtü¹¥¤¹Ñ½	” ÉÕ¹Ñ¥µ”µÁÉ½‘Õ•Èœ¤ì4(€€€ô¤ì4(4(€€€•áÁ•Ğ¡ÍÉ••¸¹•Ñ	å1…‰•±Q•áĞ ]•‰0É•‘¥ÑÌ¥¹•µ…Ñ¥Œœ¤¤¹Ñ½!…Ù•ÑÑÉ¥‰ÕÑ” 4(€€€€€€‘…Ñ„µ½¹Ñ•¹ĞµÍ½ÕÉ”œ°4(€€€€€€ÉÕ¹Ñ¥µ”œ°4(€€€€¤ì4(€ô¤ì4(4(€¥Ğ •á¥ÑÌİ¡•¸Í…Á”¥ÌÁÉ•ÍÍ•œ°€ ¤€ôøì4(€€€Ù¤¹ÕÍ•…­•Q¥µ•ÉÌ ¤ì4(€€€É•¹‘•ÉÉ•‘¥ÑÌ ¤ì4(4(€€€…Ğ  ¤€ôøì4(€€€€€™¥É•Ù•¹Ğ¹­•å½İ¸¡İ¥¹‘½Ü°ì­•äè€Í…Á”œô¤ì4(€€€€€Ù¤¹…‘Ù…¹•Q¥µ•ÉÍ	åQ¥µ”¡a%Q}}5L¤ì4(€€€ô¤ì4(4(€€€•áÁ•Ğ¡Á±…å•É5½¬¹Á…ÕÍ”¤¹Ñ½!…Ù•	••¹…±±• ¤ì4(€€€•áÁ•Ğ¡ÍÉ••¸¹•Ñ	åQ•áĞ !½µ”ÍÉ••¸œ¤¤¹Ñ½	•%¹Q¡•½Õµ•¹Ğ ¤ì4(€ô¤ì4(4(€¥Ğ É•ÑÕÉ¹Ì¡½µ”…™Ñ•ÈÑ¡”]•‰0½µÁ½Í¥Ñ¥½¸™¥¹¥Í¡•Ìœ°€ ¤€ôøì4(€€€Ù¤¹ÕÍ•…­•Q¥µ•ÉÌ ¤ì4(€€€É•¹‘•ÉÉ•‘¥ÑÌ ¤ì4(4(€€€…Ğ  ¤€ôøì4(€€€€€Á±…å•É5½¬¹•µ¥Ñ¹‘• ¤ì4(€€€ô¤ì4(4(€€€•áÁ•Ğ¡Á±…å•É5½¬¹Á…ÕÍ”¤¹Ñ½!…Ù•	••¹…±±• ¤ì4(€€€•áÁ•Ğ¡ÍÉ••¸¹•Ñ	åQ•ÍÑ% É•‘¥ÑÌµ•¹µÕ…Éœ¤¤¹Ñ½!…Ù•±…ÍÌ ¥ÌµÙ¥Í¥‰±”œ°€¥Ìµ¥¹ÍÑ…¹Ğœ¤ì4(4(€€€…Ğ  ¤€ôøì4(€€€€€Ù¤¹…‘Ù…¹•Q¥µ•ÉÍ	åQ¥µ”¡a%Q}}5L¤ì4(€€€ô¤ì4(4(€€€•áÁ•Ğ¡ÍÉ••¸¹•Ñ	åQ•áĞ !½µ”ÍÉ••¸œ¤¤¹Ñ½	•%¹Q¡•½Õµ•¹Ğ ¤ì4(€ô¤ì4)ô¤ì4(