CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  owner_tg_user_id INTEGER NOT NULL,
  chat_id INTEGER NOT NULL,
  update_id INTEGER,
  message_text TEXT,
  status TEXT NOT NULL,
  response_text TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_runs_owner_created_at
  ON runs (owner_tg_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_runs_owner_status
  ON runs (owner_tg_user_id, status);

CREATE TABLE IF NOT EXISTS tool_calls (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  owner_tg_user_id INTEGER NOT NULL,
  tool_name TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  status TEXT NOT NULL,
  input_json TEXT NOT NULL,
  output_json TEXT,
  error TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tool_calls_run_id
  ON tool_calls (run_id);

CREATE INDEX IF NOT EXISTS idx_tool_calls_owner_created_at
  ON tool_calls (owner_tg_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_tg_user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_todos_owner_status
  ON todos (owner_tg_user_id, status);

CREATE INDEX IF NOT EXISTS idx_todos_owner_created_at
  ON todos (owner_tg_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_tg_user_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  normalized_content TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_memories_owner_status
  ON memories (owner_tg_user_id, status);

CREATE INDEX IF NOT EXISTS idx_memories_owner_created_at
  ON memories (owner_tg_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_memories_owner_normalized
  ON memories (owner_tg_user_id, normalized_content);

CREATE TABLE IF NOT EXISTS memory_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  memory_id INTEGER NOT NULL,
  owner_tg_user_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_memory_events_memory_id
  ON memory_events (memory_id);

CREATE INDEX IF NOT EXISTS idx_memory_events_owner_created_at
  ON memory_events (owner_tg_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS approval_requests (
  id TEXT PRIMARY KEY,
  owner_tg_user_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  decided_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_approvals_owner_status
  ON approval_requests (owner_tg_user_id, status);

CREATE INDEX IF NOT EXISTS idx_approvals_code_status
  ON approval_requests (code, status);

CREATE INDEX IF NOT EXISTS idx_approvals_owner_created_at
  ON approval_requests (owner_tg_user_id, created_at DESC);
