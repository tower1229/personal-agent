CREATE TABLE IF NOT EXISTS planner_route_decisions (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  owner_tg_user_id INTEGER NOT NULL,
  policy_version TEXT NOT NULL,
  input_text_redacted TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  mode TEXT NOT NULL,
  confidence REAL NOT NULL,
  reason TEXT NOT NULL,
  candidate_tools_json TEXT NOT NULL,
  tool_action_risk TEXT NOT NULL,
  freshness_risk TEXT NOT NULL,
  privacy_risk TEXT NOT NULL,
  confirmation_required INTEGER NOT NULL,
  search_policy_json TEXT NOT NULL,
  fetch_policy_json TEXT NOT NULL,
  signals_json TEXT NOT NULL,
  classifier_used INTEGER NOT NULL,
  question TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_planner_route_decisions_owner_created_at
  ON planner_route_decisions(owner_tg_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_planner_route_decisions_run
  ON planner_route_decisions(run_id);

CREATE TABLE IF NOT EXISTS pending_planner_route_clarifications (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  owner_tg_user_id INTEGER NOT NULL,
  question TEXT NOT NULL,
  options_json TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pending_planner_route_clarifications_owner_expires
  ON pending_planner_route_clarifications(owner_tg_user_id, expires_at DESC);
