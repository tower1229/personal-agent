CREATE TABLE IF NOT EXISTS workflow_runs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  owner_tg_user_id INTEGER NOT NULL,
  skill_id TEXT NOT NULL,
  skill_version_id TEXT NOT NULL,
  cloudflare_workflow_instance_id TEXT,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  input_text TEXT NOT NULL,
  output_text TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_owner_created_at
  ON workflow_runs (owner_tg_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_run_id
  ON workflow_runs (run_id);

CREATE TABLE IF NOT EXISTS workflow_steps (
  id TEXT PRIMARY KEY,
  workflow_run_id TEXT NOT NULL,
  owner_tg_user_id INTEGER NOT NULL,
  step_id TEXT NOT NULL,
  step_type TEXT NOT NULL,
  status TEXT NOT NULL,
  input_json TEXT NOT NULL,
  output_json TEXT,
  error TEXT,
  started_at INTEGER,
  completed_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workflow_steps_workflow_run_id
  ON workflow_steps (workflow_run_id, created_at ASC);

CREATE TABLE IF NOT EXISTS schedules (
  id TEXT PRIMARY KEY,
  owner_tg_user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  command_text TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  timezone TEXT NOT NULL,
  cadence TEXT NOT NULL,
  time_of_day TEXT NOT NULL,
  days_of_week_json TEXT NOT NULL,
  next_run_at INTEGER NOT NULL,
  last_run_at INTEGER,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_schedules_owner_updated_at
  ON schedules (owner_tg_user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_schedules_due
  ON schedules (enabled, deleted_at, next_run_at);

CREATE TABLE IF NOT EXISTS schedule_executions (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL,
  owner_tg_user_id INTEGER NOT NULL,
  run_id TEXT,
  scheduled_for INTEGER NOT NULL,
  status TEXT NOT NULL,
  output_text TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (schedule_id, scheduled_for)
);

CREATE INDEX IF NOT EXISTS idx_schedule_executions_schedule_created_at
  ON schedule_executions (schedule_id, created_at DESC);
