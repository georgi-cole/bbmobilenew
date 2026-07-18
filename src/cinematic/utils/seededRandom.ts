export type SeededRandom = () => number;

export const createSeededRandom = (seed: number): SeededRandom => {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

export const randomBetween = (random: SeededRandom, min: number, max: number): number =>
  min + (max - min) * random();

export const randomInt = (random: SeededRandom, min: number, max: number): number =>
  Math.floor(randomBetween(random, min, max + 1));
