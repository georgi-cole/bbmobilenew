-- Migration: 20260304_add_comp_selection
-- Adds the comp_selection_settings table for persisting per-user competition
-- selection preferences.
--
-- Run:    psql -d <db> -f 20260304_add_comp_selection.sql
-- Revert: Run the DROP statements in the DOWN section at the bottom of this
--         file.
--
-- NOTE: This app currently uses an in-memory store (no persistent DB).
--       This file is a forward-looking schema stub for when a relational DB
--       is introduced.  The column definitions match the TypeScript interfaces
--       in src/components/CompSelection.tsx (CompSelectionPayload) exactly.

-- ────────────────────────────────────────────────────────────────────────── UP

-- Main settings row (one per user / season combination).
CREATE TABLE IF NOT EXISTS comp_selection_settings (
    id              SERIAL      PRIMARY KEY,
    user_id         TEXT        NOT NULL,
    season_id       TEXT        NOT NULL,
    -- Maximum comps drawn per week; NULL = no limit (all enabled comps are eligible).
    weekly_limit    INTEGER     CHECK (weekly_limit IS NULL OR weekly_limit >= 1),
    -- Stored category filter, or NULL for "all categories".
    filter_category TEXT        CHECK (
        filter_category IS NULL OR
        filter_category IN ('physical', 'mental', 'endurance', 'social', 'mixed')
    ),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, season_id)
);

-- Child table: the set of game IDs the user has enabled for this season.
CREATE TABLE IF NOT EXISTS comp_selection_enabled_games (
    id                          SERIAL  PRIMARY KEY,
    comp_selection_settings_id  INTEGER NOT NULL
        REFERENCES comp_selection_settings(id) ON DELETE CASCADE,
    game_id                     TEXT    NOT NULL,
    UNIQUE (comp_selection_settings_id, game_id)
);

-- Indexes for common read patterns.
CREATE INDEX IF NOT EXISTS idx_comp_selection_settings_user_season
    ON comp_selection_settings (user_id, season_id);

CREATE INDEX IF NOT EXISTS idx_comp_selection_enabled_games_settings_id
    ON comp_selection_enabled_games (comp_selection_settings_id);


-- ──────────────────────────────────────────────────────────────────────── DOWN
-- To revert this migration, run the statements below:
--
-- DROP TABLE IF EXISTS comp_selection_enabled_games;
-- DROP TABLE IF EXISTS comp_selection_settings;
