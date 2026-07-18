import { CINEMATIC_CONFIG } from '../config/cinematicConfig';
import { createSeededRandom, randomBetween, randomInt } from '../utils/seededRandom';

export type VectorTuple = readonly [number, number, number];

export type BoxInstance = {
  position: VectorTuple;
  scale: VectorTuple;
  color: string;
};

export type WindowInstance = BoxInstance & {
  litBias: number;
};

export type VehicleSpec = {
  laneX: number;
  offset: number;
  speed: number;
  color: string;
  bodyColor: string;
  direction: -1 | 1;
  kind: 'car' | 'truck';
};

export type CityLayout = {
  buildings: readonly BoxInstance[];
  distantBuildings: readonly BoxInstance[];
  roofDetails: readonly BoxInstance[];
  windows: readonly WindowInstance[];
  roadMarks: readonly BoxInstance[];
  reflectionStreaks: readonly BoxInstance[];
  streetLights: readonly VectorTuple[];
  vehicles: readonly VehicleSpec[];
  intersections: readonly number[];
};

const buildingColors = ['#121d34', '#172543', '#1b294a', '#10192d', '#20264a'];
const windowColors = ['#fffdf1', '#fff3c4', '#ffe3a0', '#ffd27a'];
const reflectionColors = ['#4ddfff', '#9e7cff', '#ffd19a'];
const intersections = [108, 30, -48, -126, -204, -282, -360, -438] as const;

const isIntersection = (z: number): boolean =>
  intersections.some((intersection) => Math.abs(intersection - z) < 13);

export const createCityLayout = (): CityLayout => {
  const random = createSeededRandom(CINEMATIC_CONFIG.seed);
  const buildings: BoxInstance[] = [];
  const distantBuildings: BoxInstance[] = [];
  const roofDetails: BoxInstance[] = [];
  const windows: WindowInstance[] = [];
  const roadMarks: BoxInstance[] = [];
  const reflectionStreaks: BoxInstance[] = [];
  const streetLights: VectorTuple[] = [];
  const vehicles: VehicleSpec[] = [];

  for (const side of [-1, 1] as const) {
    for (let lane = 0; lane < 3; lane += 1) {
      let index = 0;
      for (let z = CINEMATIC_CONFIG.city.farZ + 15; z <= CINEMATIC_CONFIG.city.nearZ; z += CINEMATIC_CONFIG.city.blockStep) {
        index += 1;
        if (isIntersection(z)) continue;
        const width = randomBetween(random, 11, 17);
        const depth = randomBetween(random, 17, 25);
        const laneHeightBias = lane === 0 ? 1.12 : lane === 1 ? 0.94 : 0.72;
        const height = randomBetween(random, 24, 94) * laneHeightBias * (index % 7 === 0 ? 1.34 : 1);
        const x = side * (16 + lane * 20 + width / 2 + randomBetween(random, -1.5, 1.5));
        const buildingColor = buildingColors[randomInt(random, 0, buildingColors.length - 1)] ?? buildingColors[0];
        buildings.push({
          position: [x, height / 2, z],
          scale: [width, height, depth],
          color: buildingColor,
        });

        const roofHeight = randomBetween(random, 2.5, 8);
        roofDetails.push({
          position: [x + randomBetween(random, -width * 0.18, width * 0.18), height + roofHeight / 2, z],
          scale: [width * randomBetween(random, 0.2, 0.48), roofHeight, depth * randomBetween(random, 0.2, 0.52)],
          color: lane === 0 ? '#26365a' : '#18233e',
        });
        if (random() > 0.62) {
          roofDetails.push({
            position: [x, height + roofHeight + randomBetween(random, 4, 11), z],
            scale: [0.22, randomBetween(random, 8, 20), 0.22],
            color: '#4b6385',
          });
        }

        if (lane < 2) {
          const rows = Math.min(18, Math.max(4, Math.floor(height / 5.4)));
          const columns = Math.min(5, Math.max(2, Math.floor(depth / 4.2)));
          const facadeX = x - side * (width / 2 + 0.08);
          for (let row = 0; row < rows; row += 1) {
            for (let column = 0; column < columns; column += 1) {
              if ((row + column + index) % 5 === 0) continue;
              const y = 3.2 + row * ((height - 5) / rows);
              const windowZ = z - depth * 0.38 + column * ((depth * 0.76) / Math.max(1, columns - 1));
              const color = windowColors[randomInt(random, 0, windowColors.length - 1)] ?? windowColors[0];
              windows.push({
                position: [facadeX, y, windowZ],
                scale: [0.18, 1.45, 1.8],
                color,
                litBias: random(),
              });
            }
          }
        }
      }
    }
  }

  for (let index = 0; index < 88; index += 1) {
    const side = index % 2 === 0 ? -1 : 1;
    const width = randomBetween(random, 10, 24);
    const height = randomBetween(random, 18, 76);
    distantBuildings.push({
      position: [side * randomBetween(random, 72, 154), height / 2 - 1, randomBetween(random, -490, 165)],
      scale: [width, height, randomBetween(random, 12, 28)],
      color: index % 3 === 0 ? '#111a31' : '#0b1429',
    });
  }

  for (let z = CINEMATIC_CONFIG.city.farZ; z < CINEMATIC_CONFIG.city.nearZ; z += 15) {
    roadMarks.push({ position: [-3.1, 0.045, z], scale: [0.18, 0.045, 5.2], color: '#9bb4c5' });
    roadMarks.push({ position: [3.1, 0.045, z + 7.5], scale: [0.18, 0.045, 5.2], color: '#9bb4c5' });
  }

  for (let z = CINEMATIC_CONFIG.city.farZ + 8; z < CINEMATIC_CONFIG.city.nearZ; z += 21) {
    streetLights.push([-11.4, 5.6, z], [11.4, 5.6, z + 10]);
  }

  for (let index = 0; index < 68; index += 1) {
    reflectionStreaks.push({
      position: [randomBetween(random, -8.2, 8.2), 0.075, randomBetween(random, CINEMATIC_CONFIG.city.farZ, CINEMATIC_CONFIG.city.nearZ)],
      scale: [randomBetween(random, 0.08, 0.34), 0.03, randomBetween(random, 3.5, 15)],
      color: reflectionColors[randomInt(random, 0, reflectionColors.length - 1)] ?? reflectionColors[0],
    });
  }

  const vehicleBodyColors = ['#15243b', '#26344b', '#3a252b', '#1d2931', '#403b38'];
  for (let index = 0; index < 16; index += 1) {
    const towardCamera = index % 2 === 0;
    const kind = index % 5 === 0 ? 'truck' : 'car';
    vehicles.push({
      laneX: towardCamera ? randomBetween(random, 2.35, 7.1) : randomBetween(random, -7.1, -2.35),
      offset: randomBetween(random, 0, CINEMATIC_CONFIG.city.nearZ - CINEMATIC_CONFIG.city.farZ),
      speed: randomBetween(random, kind === 'truck' ? 0.2 : 0.3, kind === 'truck' ? 0.38 : 0.54),
      color: towardCamera ? '#f3fbff' : '#ff5d6f',
      bodyColor: vehicleBodyColors[index % vehicleBodyColors.length] ?? '#1d2931',
      direction: towardCamera ? 1 : -1,
      kind,
    });
  }

  return {
    buildings,
    distantBuildings,
    roofDetails,
    windows,
    roadMarks,
    reflectionStreaks,
    streetLights,
    vehicles,
    intersections,
  };
};

export const CITY_LAYOUT = createCityLayout();
