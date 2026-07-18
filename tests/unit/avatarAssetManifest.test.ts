import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AVATAR_ASSET_FILES,
  FORMAL_CUTOUT_FILES,
  INFORMAL_CUTOUT_FILES,
} from '../../src/data/avatarAssetManifest';

describe('avatar asset manifest', () => {
  it.each([
    ['skins', AVATAR_ASSET_FILES],
    ['formal_attires', FORMAL_CUTOUT_FILES],
    ['Informal_attires', INFORMAL_CUTOUT_FILES],
  ] as const)('only references files that ship in public/assets/%s', (folder, files) => {
    const missing = files.filter((file) => !existsSync(resolve('public', 'assets', folder, file)));
    expect(missing).toEqual([]);
  });
});
