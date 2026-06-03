CREATE TABLE admin_assist_runs (
  id TEXT PRIMARY KEY,
  capability TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  status TEXT NOT NULL,
  model TEXT NOT NULL,
  draft_json TEXT,
  warnings_json TEXT,
  prompt_version TEXT NOT NULL,
  context_summary TEXT,
  owner_tg_user_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE INDEX idx_admin_assist_runs_target ON admin_assist_runs(target_type, target_id);
CREATE INDEX idx_admin_assist_runs_owner ON admin_assist_runs(owner_tg_user_id);
