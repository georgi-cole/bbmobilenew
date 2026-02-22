-- Migration: 20260222_add_diary_week_table
-- Adds the diary_weeks table and supporting tables for nominees, eviction votes,
-- and social events.  Designed for PostgreSQL; adapt identifiers for MySQL.
--
-- Run:    psql -d <db> -f 20260222_add_diary_week_table.sql
-- Revert: Manually run the DROP statements in the DOWN section at the bottom
--         of this file (psql -d <db> and copy-paste the DROP statements).
--
-- NOTE: This app currently uses an in-memory store (no persistent DB).
--       This file is a forward-looking schema stub for when a relational DB
--       is introduced.  The column definitions match the TypeScript interfaces
--       in src/types/diaryWeek.ts exactly.

-- ────────────────────────────────────────────────────────────────────────── UP

CREATE TABLE IF NOT EXISTS diary_weeks (
    id               TEXT        PRIMARY KEY,
    season_id        TEXT        NOT NULL,
    week_number      INTEGER     NOT NULL CHECK (week_number >= 1),
    start_at         TIMESTAMPTZ,
    end_at           TIMESTAMPTZ,
    hoh_winner       TEXT,
    pov_winner       TEXT,
    replacement_nominee TEXT,
    notes            TEXT,
    published        BOOLEAN     NOT NULL DEFAULT FALSE,
    created_by       TEXT        NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by       TEXT        NOT NULL,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (season_id, week_number)
);

CREATE TABLE IF NOT EXISTS diary_week_nominees (
    id               SERIAL      PRIMARY KEY,
    diary_week_id    TEXT        NOT NULL REFERENCES diary_weeks(id) ON DELETE CASCADE,
    nominee_name     TEXT        NOT NULL,
    sort_order       INTEGER     NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS diary_week_eviction_votes (
    id               SERIAL      PRIMARY KEY,
    diary_week_id    TEXT        NOT NULL REFERENCES diary_weeks(id) ON DELETE CASCADE,
    voter            TEXT        NOT NULL,
    voted_for        TEXT        NOT NULL
);

CREATE TABLE IF NOT EXISTS diary_week_social_events (
    id               SERIAL      PRIMARY KEY,
    diary_week_id    TEXT        NOT NULL REFERENCES diary_weeks(id) ON DELETE CASCADE,
    event_text       TEXT        NOT NULL,
    sort_order       INTEGER     NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS diary_week_misc (
    id               SERIAL      PRIMARY KEY,
    diary_week_id    TEXT        NOT NULL REFERENCES diary_weeks(id) ON DELETE CASCADE,
    note_text        TEXT        NOT NULL,
    sort_order       INTEGER     NOT NULL DEFAULT 0
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_diary_weeks_season_id    ON diary_weeks (season_id);
CREATE INDEX IF NOT EXISTS idx_diary_weeks_published    ON diary_weeks (season_id, published);


-- ──────────────────────────────────────────────────────────────────────── DOWN
-- To revert this migration, run the statements below:
--
-- DROP TABLE IF EXISTS diary_week_misc;
-- DROP TABLE IF EXISTS diary_week_social_events;
-- DROP TABLE IF EXISTS diary_week_eviction_votes;
-- DROP TABLE IF EXISTS diary_week_nominees;
-- DROP TABLE IF EXISTS diary_weeks;
