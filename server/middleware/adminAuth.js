'use strict';

/**
 * adminAuth — minimal admin-check middleware.
 *
 * Reads the `x-admin-key` request header and compares it to the
 * ADMIN_API_KEY environment variable.  If the values match the request
 * is treated as an admin and `req.user` is set to `{ role: 'admin' }`.
 * Otherwise `req.user` is set to `{ role: 'guest' }` (unauthenticated).
 *
 * Usage:
 *   router.post('/...', adminAuth, requireAdmin, handler);
 *
 * Environment variables:
 *   ADMIN_API_KEY  – secret key that grants admin access.
 *                    If unset, ALL requests are treated as guests.
 */

const ADMIN_API_KEY = process.env.ADMIN_API_KEY ?? '';

/**
 * Populate req.user based on the x-admin-key header.
 * Always calls next() — does not block; use requireAdmin for that.
 */
function adminAuth(req, _res, next) {
  const key = (req.headers['x-admin-key'] ?? '').trim();
  req.user =
    ADMIN_API_KEY && key === ADMIN_API_KEY
      ? { role: 'admin' }
      : { role: 'guest' };
  next();
}

/**
 * Guard middleware — returns 403 unless req.user.role === 'admin'.
 * Must be used after adminAuth.
 */
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: admin access required.' });
  }
  next();
}

module.exports = { adminAuth, requireAdmin };
