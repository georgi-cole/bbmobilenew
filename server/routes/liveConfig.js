'use strict';

/**
 * liveConfig.js — GET /api/live-config
 *
 * Returns the live-config JSON document.  The source file path is resolved in
 * the following order:
 *
 *   1. LIVE_CONFIG_PATH env var (absolute or relative to the server directory)
 *   2. <server-dir>/live-config.json  (create this file to customise the config)
 *   3. <server-dir>/live-config.example.json  (read-only template)
 *
 * If none of the above exist, returns an empty object {} (safe defaults).
 *
 * SECURITY NOTE: This endpoint only reads and returns a static JSON file.
 * It never executes remote code.  The client validates all field types before
 * use (see remoteConfigService.ts).
 */

const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

/** Resolve the config file path following the priority order above. */
function resolveConfigPath() {
  const serverDir = __dirname;

  if (process.env.LIVE_CONFIG_PATH) {
    const customPath = path.isAbsolute(process.env.LIVE_CONFIG_PATH)
      ? process.env.LIVE_CONFIG_PATH
      : path.join(serverDir, process.env.LIVE_CONFIG_PATH);
    if (fs.existsSync(customPath)) return customPath;
  }

  const liveConfigPath = path.join(serverDir, '..', 'live-config.json');
  if (fs.existsSync(liveConfigPath)) return liveConfigPath;

  const examplePath = path.join(serverDir, '..', 'live-config.example.json');
  if (fs.existsSync(examplePath)) return examplePath;

  return null;
}

/**
 * GET /api/live-config
 *
 * Returns the live-config JSON.  Responds with {} if no config file exists.
 * Sets Cache-Control so clients can cache briefly without hammering the server.
 */
router.get('/live-config', (_req, res) => {
  const configPath = resolveConfigPath();

  if (!configPath) {
    // No config file — return empty object so the app uses built-in defaults.
    res.set('Cache-Control', 'public, max-age=300');
    return res.json({});
  }

  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    res.set('Cache-Control', 'public, max-age=300');
    return res.json(parsed);
  } catch (err) {
    console.error('[liveConfig] Failed to read or parse config file:', err);
    // Return empty object on parse error so the app uses built-in defaults.
    res.set('Cache-Control', 'no-store');
    return res.json({});
  }
});

module.exports = router;
