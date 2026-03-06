-- Migration: add endurance challenge support to challenge_results
-- Requires PostgreSQL 9.6+ for IF NOT EXISTS support in ALTER TABLE ADD COLUMN.
-- For MySQL use: ALTER TABLE challenge_results ADD COLUMN IF NOT EXISTS ... (MySQL 8.0+)
-- For SQLite use: check sqlite_master and run conditionally in application code.
-- Forward-looking schema stub; apply when a relational DB is introduced.
-- Revert: ALTER TABLE challenge_results DROP COLUMN IF EXISTS challenge_type;
--         ALTER TABLE challenge_results DROP COLUMN IF EXISTS elapsed_seconds;

ALTER TABLE challenge_results
  ADD COLUMN IF NOT EXISTS challenge_type VARCHAR(32) DEFAULT 'score';

ALTER TABLE challenge_results
  ADD COLUMN IF NOT EXISTS elapsed_seconds INTEGER DEFAULT NULL;
