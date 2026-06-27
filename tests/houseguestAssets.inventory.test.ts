import { readdirSync } from 'node:fs';
import { join, basename } from 'node:path';

import { describe, expect, it } from 'vitest';

import { getAll } from '../src/data/houseguests';
import { resolveFormalCutout, resolveInformalCutout } from '../src/utils/avatar';

const repoRoot = process.cwd();
const canonicalHouseguestIds = getAll().map((houseguest) => houseguest.id);
const assetOnlyPoolIds = ['lia', 'noa', 'pax', 'rey'] as const;
const poolIds = [...canonicalHouseguestIds, ...assetOnlyPoolIds];

function readAssetBasenames(relativeDir: string): string[] {
  return readdirSync(join(repoRoot, relativeDir), { withFileTypes: false }).map((entry) =>
    basename(entry),
  );
}

function normalizeAssetStem(name: string): string {
  return basename(name)
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/_avatar$/, '')
    .replace(/_informal\d*$/, '')
    .replace(/_formal.*$/, '')
    .replace(/_tabloid\d*$/, '');
}

function stemsInDir(relativeDir: string): Set<string> {
  return new Set(readAssetBasenames(relativeDir).map(normalizeAssetStem));
}

describe('houseguest asset inventory', () => {
  it('has avatar, casual, formal, and paparazzi coverage for the current pool', () => {
    const avatarStems = stemsInDir('public/assets/skins');
    const casualStems = stemsInDir('public/assets/Informal_attires');
    const formalStems = stemsInDir('public/assets/formal_attires');
    const paparazziStems = stemsInDir('public/assets/tabloid_photos');

    const missingAvatars = poolIds.filter((id) => !avatarStems.has(id));
    const missingCasual = poolIds.filter((id) => !casualStems.has(id));
    const missingFormal = poolIds.filter((id) => !formalStems.has(id));
    const missingPaparazzi = poolIds.filter((id) => !paparazziStems.has(id));

    expect(missingAvatars).toEqual([]);
    expect(missingCasual).toEqual([]);
    expect(missingFormal).toEqual([]);
    expect(missingPaparazzi).toEqual([]);
  });

  it('resolves the visible full-body cutouts for the current pool', () => {
    for (const id of poolIds) {
      const player = { id, name: id.charAt(0).toUpperCase() + id.slice(1), avatar: '🧑' };
      expect(resolveInformalCutout(player), `${id} should have a casual cutout`).not.toBeNull();
      expect(resolveFormalCutout(player), `${id} should have a formal cutout`).not.toBeNull();
    }
  });
});
