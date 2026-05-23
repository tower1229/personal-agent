CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  owner_tg_user_id INTEGER NOT NULL,
  draft_manifest_json TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  deleted_at INTEGER,
  published_version_id TEXT,
  published_version INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_skills_owner_updated_at
  ON skills (owner_tg_user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_skills_owner_enabled
  ON skills (owner_tg_user_id, enabled, deleted_at);

CREATE TABLE IF NOT EXISTS skill_versions (
  id TEXT PRIMARY KEY,
  skill_id TEXT NOT NULL,
  owner_tg_user_id INTEGER NOT NULL,
  version INTEGER NOT NULL,
  manifest_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (skill_id, version)
);

CREATE INDEX IF NOT EXISTS idx_skill_versions_skill_version
  ON skill_versions (skill_id, version DESC);

CREATE INDEX IF NOT EXISTS idx_skill_versions_owner_created_at
  ON skill_versions (owner_tg_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS skill_route_decisions (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  owner_tg_user_id INTEGER NOT NULL,
  input_text TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  matched_skill_id TEXT,
  matched_skill_version_id TEXT,
  confidence REAL,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_skill_route_decisions_run_id
  ON skill_route_decisions (run_id);

CREATE INDEX IF NOT EXISTS idx_skill_route_decisions_owner_created_at
  ON skill_route_decisions (owner_tg_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS skill_runs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  owner_tg_user_id INTEGER NOT NULL,
  skill_id TEXT NOT NULL,
  skill_version_id TEXT NOT NULL,
  status TEXT NOT NULL,
  input_text TEXT NOT NULL,
  output_text TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_skill_runs_run_id
  ON skill_runs (run_id);

CREATE INDEX IF NOT EXISTS idx_skill_runs_owner_created_at
  ON skill_runs (owner_tg_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_skill_runs_skill_id
  ON skill_runs (skill_id, created_at DESC);
