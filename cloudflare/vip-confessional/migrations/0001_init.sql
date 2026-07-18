CREATE TABLE IF NOT EXISTS vip_entitlements (
  subject_id TEXT PRIMARY KEY,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'subscriber')),
  expires_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS vip_season_usage (
  subject_id TEXT NOT NULL,
  season_id TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (subject_id, season_id)
);

CREATE TABLE IF NOT EXISTS vip_daily_usage (
  subject_id TEXT NOT NULL,
  usage_date TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (subject_id, usage_date)
);

CREATE TABLE IF NOT EXISTS vip_reservations (
  request_id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL,
  season_id TEXT NOT NULL,
  usage_key TEXT NOT NULL,
  quota_bucket TEXT NOT NULL CHECK (quota_bucket IN ('free_season', 'subscriber_daily')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'refunded')),
  response_text TEXT,
  remaining INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vip_reservations_subject_status
  ON vip_reservations(subject_id, status, created_at);
