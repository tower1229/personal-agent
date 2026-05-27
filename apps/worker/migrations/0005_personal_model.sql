CREATE TABLE IF NOT EXISTS personal_model_claims (
  id TEXT PRIMARY KEY,
  owner_tg_user_id INTEGER NOT NULL,
  claim TEXT NOT NULL,
  layer TEXT NOT NULL,
  scenario TEXT NOT NULL,
  confidence TEXT NOT NULL,
  status TEXT NOT NULL,
  usage_policy TEXT NOT NULL,
  sensitivity TEXT NOT NULL,
  valid_from INTEGER,
  valid_until INTEGER,
  last_confirmed_at INTEGER,
  metadata_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_personal_model_claims_owner_updated
  ON personal_model_claims (owner_tg_user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_personal_model_claims_owner_status
  ON personal_model_claims (owner_tg_user_id, status);

CREATE INDEX IF NOT EXISTS idx_personal_model_claims_owner_scenario
  ON personal_model_claims (owner_tg_user_id, scenario, status);

CREATE TABLE IF NOT EXISTS personal_model_events (
  id TEXT PRIMARY KEY,
  claim_id TEXT,
  owner_tg_user_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_personal_model_events_claim_created
  ON personal_model_events (claim_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_personal_model_events_owner_created
  ON personal_model_events (owner_tg_user_id, created_at DESC);
