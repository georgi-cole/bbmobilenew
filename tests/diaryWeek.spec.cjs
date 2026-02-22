'use strict';

/**
 * Integration tests for the Diary Week API routes.
 *
 * Uses Node.js built-in test runner (node:test) — no extra dependencies.
 * Run:  NODE_PATH=./server/node_modules node --test tests/diaryWeek.spec.cjs
 * (from the repository root)
 *
 * The tests spin up a minimal Express app that mounts only the diaryWeeks
 * router (not the full server) so they run in isolation without needing an
 * OpenAI key or the FEATURE_DIARY_WEEK env flag.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

// ─── Bootstrap a test server ─────────────────────────────────────────────────

const express = require('express');

// Set up a known ADMIN_API_KEY before requiring the router
const TEST_ADMIN_KEY = 'test-secret-key-123';
process.env.ADMIN_API_KEY = TEST_ADMIN_KEY;

const diaryWeeksRouter = require('../server/routes/diaryWeeks');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', diaryWeeksRouter);
  return app;
}

/** Wraps http.request in a Promise; resolves with { status, body }. */
function request(app, { method, path, headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const opts = {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
      };
      const req = http.request(opts, (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          server.close();
          try {
            resolve({ status: res.statusCode, body: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode, body: raw });
          }
        });
      });
      req.on('error', (err) => {
        server.close();
        reject(err);
      });
      if (body !== undefined) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  });
}

// ─── Helper headers ───────────────────────────────────────────────────────────

const ADMIN_HEADERS = { 'x-admin-key': TEST_ADMIN_KEY };
const GUEST_HEADERS = {};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Diary Week API', () => {
  let app;

  beforeEach(() => {
    // Fresh app + cleared store for each test group
    app = buildApp();
    diaryWeeksRouter._store.clear();
  });

  // ── Create ────────────────────────────────────────────────────────────────

  describe('POST /api/seasons/:seasonId/weeks (create)', () => {
    test('admin can create a new week', async () => {
      const res = await request(app, {
        method: 'POST',
        path: '/api/seasons/s1/weeks',
        headers: ADMIN_HEADERS,
        body: {
          weekNumber: 1,
          hohWinner: 'Alice',
          povWinner: 'Bob',
          nominees: ['Charlie', 'Dave'],
          evictionVotes: [
            { voter: 'Alice', votedFor: 'Charlie' },
            { voter: 'Bob',   votedFor: 'Charlie' },
            { voter: 'Eve',   votedFor: 'Dave' },
          ],
          socialEvents: ['Pool party'],
          published: false,
        },
      });

      assert.equal(res.status, 201, 'Expected 201 Created');
      const week = res.body.data;
      assert.ok(week.id, 'Should have an id');
      assert.equal(week.seasonId, 's1');
      assert.equal(week.weekNumber, 1);
      assert.equal(week.hohWinner, 'Alice');
      assert.equal(week.published, false, 'Should default to draft');
      assert.equal(week.evictionVotes.length, 3);
    });

    test('non-admin gets 403', async () => {
      const res = await request(app, {
        method: 'POST',
        path: '/api/seasons/s1/weeks',
        headers: GUEST_HEADERS,
        body: { weekNumber: 1 },
      });
      assert.equal(res.status, 403, 'Expected 403 Forbidden');
    });

    test('rejects missing weekNumber', async () => {
      const res = await request(app, {
        method: 'POST',
        path: '/api/seasons/s1/weeks',
        headers: ADMIN_HEADERS,
        body: { hohWinner: 'Alice' },
      });
      assert.equal(res.status, 400, 'Expected 400 Bad Request');
      assert.ok(Array.isArray(res.body.errors));
    });

    test('prevents duplicate weekNumber within same season', async () => {
      // First create
      await request(app, {
        method: 'POST',
        path: '/api/seasons/s1/weeks',
        headers: ADMIN_HEADERS,
        body: { weekNumber: 1 },
      });
      // Duplicate
      const res = await request(app, {
        method: 'POST',
        path: '/api/seasons/s1/weeks',
        headers: ADMIN_HEADERS,
        body: { weekNumber: 1 },
      });
      assert.equal(res.status, 409, 'Expected 409 Conflict');
    });
  });

  // ── Fetch ─────────────────────────────────────────────────────────────────

  describe('GET /api/seasons/:seasonId/weeks/:weekNumber', () => {
    test('admin can fetch an unpublished week', async () => {
      // Create
      await request(app, {
        method: 'POST',
        path: '/api/seasons/s2/weeks',
        headers: ADMIN_HEADERS,
        body: { weekNumber: 3, hohWinner: 'Zara', published: false },
      });

      const res = await request(app, {
        method: 'GET',
        path: '/api/seasons/s2/weeks/3',
        headers: ADMIN_HEADERS,
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.hohWinner, 'Zara');
    });

    test('guest cannot fetch an unpublished week (403)', async () => {
      await request(app, {
        method: 'POST',
        path: '/api/seasons/s2/weeks',
        headers: ADMIN_HEADERS,
        body: { weekNumber: 4, published: false },
      });

      const res = await request(app, {
        method: 'GET',
        path: '/api/seasons/s2/weeks/4',
        headers: GUEST_HEADERS,
      });
      assert.equal(res.status, 403);
    });

    test('returns 404 for non-existent week', async () => {
      const res = await request(app, {
        method: 'GET',
        path: '/api/seasons/s2/weeks/999',
        headers: ADMIN_HEADERS,
      });
      assert.equal(res.status, 404);
    });
  });

  // ── Update ────────────────────────────────────────────────────────────────

  describe('PATCH /api/seasons/:seasonId/weeks/:weekNumber', () => {
    test('admin can patch a week', async () => {
      // Create
      await request(app, {
        method: 'POST',
        path: '/api/seasons/s3/weeks',
        headers: ADMIN_HEADERS,
        body: { weekNumber: 1, hohWinner: 'Before', published: false },
      });

      const res = await request(app, {
        method: 'PATCH',
        path: '/api/seasons/s3/weeks/1',
        headers: ADMIN_HEADERS,
        body: { hohWinner: 'After', published: true },
      });
      assert.equal(res.status, 200);
      const updated = res.body.data;
      assert.equal(updated.hohWinner, 'After');
      assert.equal(updated.published, true);
      // Immutable fields unchanged
      assert.equal(updated.weekNumber, 1);
      assert.equal(updated.seasonId, 's3');
    });

    test('non-admin gets 403 on patch', async () => {
      await request(app, {
        method: 'POST',
        path: '/api/seasons/s3/weeks',
        headers: ADMIN_HEADERS,
        body: { weekNumber: 2 },
      });

      const res = await request(app, {
        method: 'PATCH',
        path: '/api/seasons/s3/weeks/2',
        headers: GUEST_HEADERS,
        body: { hohWinner: 'Hacker' },
      });
      assert.equal(res.status, 403);
    });
  });

  // ── Export ────────────────────────────────────────────────────────────────

  describe('GET /api/weeks/:id/export', () => {
    test('exports a published week as JSON', async () => {
      const createRes = await request(app, {
        method: 'POST',
        path: '/api/seasons/s4/weeks',
        headers: ADMIN_HEADERS,
        body: {
          weekNumber: 1,
          hohWinner: 'Finn',
          nominees: ['Gina', 'Hank'],
          evictionVotes: [{ voter: 'Iris', votedFor: 'Gina' }],
          published: true,
        },
      });
      assert.equal(createRes.status, 201);
      const { id } = createRes.body.data;

      const exportRes = await request(app, {
        method: 'GET',
        path: `/api/weeks/${id}/export?format=json`,
        headers: GUEST_HEADERS,
      });
      assert.equal(exportRes.status, 200);
      const payload = exportRes.body;
      assert.equal(payload.id, id);
      assert.equal(payload.hohWinner, 'Finn');
      assert.equal(payload.nominees.length, 2);
    });

    test('admin can export an unpublished week', async () => {
      const createRes = await request(app, {
        method: 'POST',
        path: '/api/seasons/s4/weeks',
        headers: ADMIN_HEADERS,
        body: { weekNumber: 2, hohWinner: 'JJ', published: false },
      });
      const { id } = createRes.body.data;

      const exportRes = await request(app, {
        method: 'GET',
        path: `/api/weeks/${id}/export?format=json`,
        headers: ADMIN_HEADERS,
      });
      assert.equal(exportRes.status, 200);
      assert.equal(exportRes.body.hohWinner, 'JJ');
    });

    test('guest cannot export an unpublished week (403)', async () => {
      const createRes = await request(app, {
        method: 'POST',
        path: '/api/seasons/s4/weeks',
        headers: ADMIN_HEADERS,
        body: { weekNumber: 3, published: false },
      });
      const { id } = createRes.body.data;

      const exportRes = await request(app, {
        method: 'GET',
        path: `/api/weeks/${id}/export?format=json`,
        headers: GUEST_HEADERS,
      });
      assert.equal(exportRes.status, 403);
    });

    test('rejects unsupported export format', async () => {
      const createRes = await request(app, {
        method: 'POST',
        path: '/api/seasons/s4/weeks',
        headers: ADMIN_HEADERS,
        body: { weekNumber: 4, published: true },
      });
      const { id } = createRes.body.data;

      const res = await request(app, {
        method: 'GET',
        path: `/api/weeks/${id}/export?format=csv`,
        headers: ADMIN_HEADERS,
      });
      assert.equal(res.status, 400);
    });
  });

  // ── List ──────────────────────────────────────────────────────────────────

  describe('GET /api/seasons/:seasonId/weeks (list)', () => {
    test('returns only published weeks for guests when publishedOnly=true', async () => {
      await request(app, {
        method: 'POST',
        path: '/api/seasons/s5/weeks',
        headers: ADMIN_HEADERS,
        body: { weekNumber: 1, published: true },
      });
      await request(app, {
        method: 'POST',
        path: '/api/seasons/s5/weeks',
        headers: ADMIN_HEADERS,
        body: { weekNumber: 2, published: false },
      });

      const res = await request(app, {
        method: 'GET',
        path: '/api/seasons/s5/weeks?publishedOnly=true',
        headers: GUEST_HEADERS,
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.length, 1);
      assert.equal(res.body.data[0].weekNumber, 1);
    });

    test('admin sees all weeks regardless of publishedOnly param', async () => {
      await request(app, {
        method: 'POST',
        path: '/api/seasons/s6/weeks',
        headers: ADMIN_HEADERS,
        body: { weekNumber: 1, published: true },
      });
      await request(app, {
        method: 'POST',
        path: '/api/seasons/s6/weeks',
        headers: ADMIN_HEADERS,
        body: { weekNumber: 2, published: false },
      });

      const res = await request(app, {
        method: 'GET',
        path: '/api/seasons/s6/weeks?publishedOnly=true',
        headers: ADMIN_HEADERS,
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.length, 2);
    });
  });
});
