#!/usr/bin/env node
/**
 * generate-skins-manifest.mjs
 *
 * Scans public/assets/skins/ for image files and maps them to the canonical
 * theme keys declared in src/data/skinRegistry.json. Writes the result to
 * public/assets/skins/skins.json (pretty-printed).
 *
 * Usage:
 *   node ./scripts/generate-skins-manifest.mjs
 *
 * Run this locally after adding or renaming skin image files, then optionally
 * commit the generated skins.json alongside your changes.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKINS_DIR = path.resolve(__dirname, '..', 'public', 'assets', 'skins');
const REGISTRY_PATH = path.resolve(__dirname, '..', 'src', 'data', 'skinRegistry.json');
const MANIFEST_PATH = path.join(SKINS_DIR, 'skins.json');

/** Supported image extensions. */
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif']);

function isImageFile(filename) {
  return IMAGE_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

function readRegistry() {
  const raw = fs.readFileSync(REGISTRY_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`[generate-skins-manifest] registry is not an object: ${REGISTRY_PATH}`);
  }
  return /** @type {Record<string, { canonicalFile?: string; aliases?: string[] }>} */ (parsed);
}

// ── Main ──────────────────────────────────────────────────────────────────────

let skinsStats;
try {
  skinsStats = fs.statSync(SKINS_DIR);
} catch (err) {
  console.error(`[generate-skins-manifest] ERROR: unable to access skins path: ${SKINS_DIR}`);
  console.error(`  ${String(err)}`);
  process.exit(1);
}

if (!skinsStats.isDirectory()) {
  console.error(`[generate-skins-manifest] ERROR: skins path is not a directory: ${SKINS_DIR}`);
  console.error('  Ensure public/assets/skins is a directory, not a file.');
  process.exit(1);
}

let registry;
try {
  registry = readRegistry();
} catch (err) {
  console.error(`[generate-skins-manifest] ERROR: unable to read registry: ${REGISTRY_PATH}`);
  console.error(`  ${String(err)}`);
  process.exit(1);
}

const themeKeys = Object.keys(registry);
const allFiles = fs.readdirSync(SKINS_DIR).filter((f) => isImageFile(f));
const fileSet = new Set(allFiles);
const manifest = {};
const usedFiles = new Set();

if (allFiles.length === 0) {
  console.warn('[generate-skins-manifest] WARNING: no image files found in', SKINS_DIR);
  console.warn('  The manifest will be empty. Run scripts/fetch-skins.sh to download assets.');
}

for (const key of themeKeys) {
  const entry = registry[key] ?? {};
  const candidates = [entry.canonicalFile, ...(entry.aliases ?? [])].filter(Boolean);
  const hit = candidates.find((file) => fileSet.has(file));

  if (!hit) {
    console.warn(`[generate-skins-manifest] WARNING: no file found for ${key}; candidates: ${candidates.join(', ')}`);
    continue;
  }

  manifest[key] = hit;
  usedFiles.add(hit);
  console.log(`  [map]  ${hit}  → ${key}`);

  for (const candidate of candidates) {
    if (candidate !== hit && fileSet.has(candidate) && !usedFiles.has(candidate)) {
      console.log(`  [alt]  ${candidate}  → ${key} (available but not canonical)`);
    }
  }
}

// Report any image files that are not used by the registry.
for (const file of allFiles) {
  if (!usedFiles.has(file)) {
    console.log(`  [skip] ${file}  (not referenced by skinRegistry.json)`);
  }
}

const unmapped = themeKeys.filter((k) => !manifest[k]);
if (unmapped.length > 0) {
  console.warn('\n[generate-skins-manifest] WARNING: no file found for keys:', unmapped.join(', '));
  console.warn('  These keys will fall back to bundled asset resolution at runtime.');
}

fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`\n[generate-skins-manifest] Wrote ${MANIFEST_PATH}`);
