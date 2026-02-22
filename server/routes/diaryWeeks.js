'use strict';

/**
 * diaryWeeks router
 *
 * Mounts under the main Express app.  All state is held in an in-memory Map
 * (keyed by week ID) so no database is required for local dev.
 *
 * Endpoints:
 *   GET    /api/seasons/:seasonId/weeks               list weeks (publishedOnly query)
 *   GET    /api/seasons/:seasonId/weeks/:weekNumber   get single week
 *   POST   /api/seasons/:seasonId/weeks               create week  (admin only)
 *   PATCH  /api/seasons/:seasonId/weeks/:weekNumber   update week  (admin only)
 *   GET    /api/weeks/:id/export                      export JSON  (format=json)
 */

const express = require('express');
const { adminAuth, requireAdmin } = require('../middleware/adminAuth');

const router = express.Router();

// ─── In-memory store ──────────────────────────────────────────────────────────
// Map<id, DiaryWeek>
const store = new Map();

// ─── ID generator ─────────────────────────────────────────────────────────────
let _idCounter = 0;
function nextId() {
  _idCounter += 1;
  return `dw_${Date.now()}_${_idCounter}`;
}

// ─── Sanitise helpers ────────────────────────────────────────────────────────

function sanitiseString(val) {
  return typeof val === 'string' ? val.trim().slice(0, 500) : undefined;
}

function sanitiseStringArray(val) {
  if (!Array.isArray(val)) return undefined;
  return val.map((v) => (typeof v === 'string' ? v.trim().slice(0, 200) : '')).filter(Boolean);
}

/**
 * Validate and sanitise a DiaryWeek body coming from the client.
 * Returns { errors, data } — errors is null when input is valid.
 */
function parseWeekBody(body, { requireSeasonId = false, requireWeekNumber = false } = {}) {
  const errors = [];
  const data = {};

  if (requireSeasonId) {
    if (!body.seasonId || typeof body.seasonId !== 'string') {
      errors.push('seasonId is required and must be a string.');
    }
  }
  if (body.seasonId !== undefined) data.seasonId = sanitiseString(body.seasonId);

  if (requireWeekNumber) {
    if (body.weekNumber === undefined || !Number.isInteger(Number(body.weekNumber)) || Number(body.weekNumber) < 1) {
      errors.push('weekNumber is required and must be a positive integer.');
    }
  }
  if (body.weekNumber !== undefined) data.weekNumber = parseInt(body.weekNumber, 10);

  const optStrings = ['hohWinner', 'povWinner', 'replacementNominee', 'notes'];
  for (const key of optStrings) {
    if (body[key] !== undefined) data[key] = sanitiseString(body[key]) ?? null;
  }

  const optArrays = ['nominees', 'socialEvents', 'misc'];
  for (const key of optArrays) {
    if (body[key] !== undefined) data[key] = sanitiseStringArray(body[key]) ?? [];
  }

  // evictionVotes: array of { voter, votedFor }
  if (body.evictionVotes !== undefined) {
    if (!Array.isArray(body.evictionVotes)) {
      errors.push('evictionVotes must be an array.');
    } else {
      data.evictionVotes = body.evictionVotes.map((v) => ({
        voter: sanitiseString(String(v?.voter ?? '')),
        votedFor: sanitiseString(String(v?.votedFor ?? '')),
      })).filter((v) => v.voter || v.votedFor);
    }
  }

  // Date fields
  for (const key of ['startAt', 'endAt']) {
    if (body[key] !== undefined) {
      const d = new Date(body[key]);
      if (isNaN(d.getTime())) {
        errors.push(`${key} must be a valid ISO date string.`);
      } else {
        data[key] = d.toISOString();
      }
    }
  }

  // published flag — defaults to false (feature-flag draft behaviour)
  if (body.published !== undefined) {
    data.published = Boolean(body.published);
  }

  return { errors: errors.length ? errors : null, data };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// Apply auth context to all routes (sets req.user; never blocks by itself)
router.use(adminAuth);

/**
 * GET /api/seasons/:seasonId/weeks
 * Returns all weeks for a season.
 * Query: publishedOnly=true  — only return published weeks (for public consumers).
 * Admins see all weeks regardless of publishedOnly.
 */
router.get('/seasons/:seasonId/weeks', (req, res) => {
  const { seasonId } = req.params;
  const publishedOnly = req.query.publishedOnly === 'true' && req.user?.role !== 'admin';

  const weeks = [...store.values()]
    .filter((w) => w.seasonId === seasonId)
    .filter((w) => !publishedOnly || w.published)
    .sort((a, b) => a.weekNumber - b.weekNumber);

  return res.json({ data: weeks });
});

/**
 * GET /api/seasons/:seasonId/weeks/:weekNumber
 * Returns a single week.
 * Guests can only see published weeks.
 */
router.get('/seasons/:seasonId/weeks/:weekNumber', (req, res) => {
  const { seasonId } = req.params;
  const weekNumber = parseInt(req.params.weekNumber, 10);

  if (isNaN(weekNumber)) {
    return res.status(400).json({ error: 'weekNumber must be an integer.' });
  }

  const week = [...store.values()].find(
    (w) => w.seasonId === seasonId && w.weekNumber === weekNumber,
  );

  if (!week) return res.status(404).json({ error: 'Week not found.' });
  if (!week.published && req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'This week is not yet published.' });
  }

  return res.json({ data: week });
});

/**
 * POST /api/seasons/:seasonId/weeks   (admin only)
 * Creates a new diary week.
 */
router.post('/seasons/:seasonId/weeks', requireAdmin, (req, res) => {
  const { seasonId } = req.params;
  const body = { ...req.body, seasonId };

  const { errors, data } = parseWeekBody(body, {
    requireSeasonId: true,
    requireWeekNumber: true,
  });

  if (errors) return res.status(400).json({ errors });

  // Prevent duplicate weekNumber within a season
  const exists = [...store.values()].some(
    (w) => w.seasonId === data.seasonId && w.weekNumber === data.weekNumber,
  );
  if (exists) {
    return res.status(409).json({ error: `Week ${data.weekNumber} already exists for season ${data.seasonId}.` });
  }

  const now = new Date().toISOString();
  const week = {
    id: nextId(),
    seasonId: data.seasonId,
    weekNumber: data.weekNumber,
    startAt: data.startAt ?? null,
    endAt: data.endAt ?? null,
    hohWinner: data.hohWinner ?? null,
    povWinner: data.povWinner ?? null,
    nominees: data.nominees ?? [],
    replacementNominee: data.replacementNominee ?? null,
    evictionVotes: data.evictionVotes ?? [],
    socialEvents: data.socialEvents ?? [],
    misc: data.misc ?? [],
    notes: data.notes ?? null,
    published: data.published ?? false,
    createdBy: req.user.role,
    createdAt: now,
    updatedBy: req.user.role,
    updatedAt: now,
  };

  store.set(week.id, week);
  return res.status(201).json({ data: week });
});

/**
 * PATCH /api/seasons/:seasonId/weeks/:weekNumber   (admin only)
 * Partial-updates an existing diary week.
 */
router.patch('/seasons/:seasonId/weeks/:weekNumber', requireAdmin, (req, res) => {
  const { seasonId } = req.params;
  const weekNumber = parseInt(req.params.weekNumber, 10);

  if (isNaN(weekNumber)) {
    return res.status(400).json({ error: 'weekNumber must be an integer.' });
  }

  const existing = [...store.values()].find(
    (w) => w.seasonId === seasonId && w.weekNumber === weekNumber,
  );
  if (!existing) return res.status(404).json({ error: 'Week not found.' });

  const { errors, data } = parseWeekBody(req.body);
  if (errors) return res.status(400).json({ errors });

  const updated = {
    ...existing,
    ...data,
    // Never allow changing immutable fields via PATCH
    id: existing.id,
    seasonId: existing.seasonId,
    weekNumber: existing.weekNumber,
    createdBy: existing.createdBy,
    createdAt: existing.createdAt,
    updatedBy: req.user.role,
    updatedAt: new Date().toISOString(),
  };

  store.set(existing.id, updated);
  return res.json({ data: updated });
});

/**
 * GET /api/weeks/:id/export?format=json
 * Returns the full week payload as JSON (default) — other formats reserved.
 */
router.get('/weeks/:id/export', (req, res) => {
  const week = store.get(req.params.id);
  if (!week) return res.status(404).json({ error: 'Week not found.' });
  if (!week.published && req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'This week is not yet published.' });
  }

  const format = req.query.format ?? 'json';
  if (format !== 'json') {
    return res.status(400).json({ error: `Unsupported export format: ${format}. Only 'json' is supported.` });
  }

  res.setHeader('Content-Disposition', `attachment; filename="diary-week-${week.weekNumber}.json"`);
  res.setHeader('Content-Type', 'application/json');
  return res.json(week);
});

// ─── Expose store for tests ───────────────────────────────────────────────────
router._store = store;

module.exports = router;
