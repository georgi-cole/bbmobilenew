#!/usr/bin/env node
/**
 * generate-skins-manifest.mjs
 *
 * Scans public/assets/skins/ for image files and heuristically maps them to
 * the canonical theme keys used by backgroundTheme.ts.  Writes the result to
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
const MANIFEST_PATH = path.join(SKINS_DIR, 'skins.json');

/** Canonical theme keys (must match ThemeKey in backgroundTheme.ts). */
const THEME_KEYS = [
  'sunrise',
  'day',
  'sunset',
  'night',
  'rain',
  'snow',
  'snowday',
  'thunderstorm',
  'xmasDay',
  'xmasEve',
  'xmasNight',
];

/**
 * Substrings to look for in a filename (lower-cased) to identify each key.
 * Order matters: more-specific patterns are listed first.
 */
const KEY_HINTS = {
  sunrise:      ['sunrise'],
  day:          ['day', 'daily'], // matched after xmasDay / snowday to avoid conflicts
  sunset:       ['sunset'],
  night:        ['night'],      // matched after xmasNight to avoid conflicts
  rain:         ['rain'],
  snowday:      ['snowday'],    // must come before 'snow'
  snow:         ['snow', 'blizzard'],
  thunderstorm: ['thunder', 'storm'],
  xmasDay:      ['xmas-day', 'xmasday', 'santa-day', 'santaday', 'christmas-day'],
  xmasEve:      ['xmas-eve', 'xmaseve', 'christmas-eve'],
  xmasNight:    ['xmas-night', 'xmasnight', 'xmasy-night', 'christmas-night'],
};

/** Supported image extensions. */
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif']);

function isImageFile(filename) {
  return IMAGE_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

/**
 * Returns the first theme key whose hints appear in the lower-cased filename,
 * or null if no key matches.
 */
function detectKey(filename) {
  const lower = filename.toLowerCase();
  // Evaluate keys in a priority order that avoids partial-match ambiguity
  const priority = [
    'xmasDay', 'xmasEve', 'xmasNight',
    'snowday', 'thunderstorm',
    'sunrise', 'sunset',
    'rain', 'snow',
    'night', 'day',
  ];
  for (const key of priority) {
    const hints = KEY_HINTS[key] ?? [];
    if (hints.some((h) => lower.includes(h))) {
      return key;
    }
  }
  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────────

if (!fs.existsSync(SKINS_DIR)) {
  console.error(`[generate-skins-manifest] ERROR: skins directory not found: ${SKINS_DIR}`);
  console.error('  Create it with:  mkdir -p public/assets/skins');
  process.exit(1);
}

const files = fs.readdirSync(SKINS_DIR)
  .filter((f) => isImageFile(f))
  .sort((a, b) => {
    // Files with spaces or parentheses (e.g. "foo (2).png") are less preferred;
    // give them a higher sort key so canonical names sort first.
    const aComplex = /[\s()]/.test(a) ? 1 : 0;
    const bComplex = /[\s()]/.test(b) ? 1 : 0;
    if (aComplex !== bComplex) return aComplex - bComplex;
    return a.localeCompare(b);
  });

if (files.length === 0) {
  console.warn('[generate-skins-manifest] WARNING: no image files found in', SKINS_DIR);
  console.warn('  The manifest will be empty.  Run scripts/fetch-skins.sh to download assets.');
}

const manifest = {};

for (const file of files) {
  const key = detectKey(file);
  if (!key) {
    console.log(`  [skip] ${file}  (no matching theme key)`);
    continue;
  }
  if (manifest[key]) {
    // Keep the first match; log duplicates so maintainers can review
    console.log(`  [dup]  ${file}  → ${key} (already mapped to ${manifest[key]}; skipping)`);
    continue;
  }
  manifest[key] = file;
  console.log(`  [map]  ${file}  → ${key}`);
}

// Report any theme keys that received no mapping
const unmapped = THEME_KEYS.filter((k) => !manifest[k]);
if (unmapped.length > 0) {
  console.warn('\n[generate-skins-manifest] WARNING: no file found for keys:', unmapped.join(', '));
  console.warn('  These keys will fall back to candidate probing at runtime.');
}

fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log(`\n[generate-skins-manifest] Wrote ${MANIFEST_PATH}`);
