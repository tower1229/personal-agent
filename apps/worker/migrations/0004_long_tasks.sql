CREATE TABLE IF NOT EXISTS long_tasks (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  owner_tg_user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  original_input TEXT NOT NULL,
  status TEXT NOT NULL,
  complexity_score REAL NOT NULL,
  planner_reason TEXT NOT NULL,
  current_step_id TEXT,
  output_text TEXT,
  error TEXT,
  replan_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs(id)
);

CREATE INDEX IF NOT EXISTS idx_long_tasks_owner_updated_at
  ON long_tasks (owner_tg_user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_long_tasks_run_id
  ON long_tasks (run_id);

CREATE INDEX IF NOT EXISTS idx_long_tasks_status_updated_at
  ON long_tasks (status, updated_at ASC);

CREATE TABLE IF NOT EXISTS long_task_steps (
  id TEXT PRIMARY KEY,
  long_task_id TEXT NOT NULL,
  owner_tg_user_id INTEGER NOT NULL,
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL,
  tool_policy TEXT NOT NULL,
  success_criteria TEXT NOT NULL,
  input_json TEXT NOT NULL,
  output_json TEXT,
  error TEXT,
  started_at INTEGER,
  completed_at INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (long_task_id) REFERENCES long_tasks(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_long_task_steps_task_position
  ON long_task_steps (long_task_id, position);

CREATE INDEX IF NOT EXISTS idx_long_task_steps_task_status
  ON long_task_steps (long_task_id, status, position);

CREATE TABLE IF NOT EXISTS long_task_events (
  id TEXT PRIMARY KEY,
  long_task_id TEXT NOT NULL,
  owner_tg_user_id INTEGER NOT NULL,
  step_id TEXT,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (long_task_id) REFERENCES long_tasks(id),
  FOREIGN KEY (step_id) REFERENCES long_task_steps(id)
);

CREATE INDEX IF NOT EXISTS idx_long_task_events_task_created_at
  ON long_task_events (long_task_id, created_at ASC);
