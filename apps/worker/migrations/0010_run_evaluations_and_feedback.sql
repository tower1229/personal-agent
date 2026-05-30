-- Alter runs table to store context trace
ALTER TABLE runs ADD COLUMN context_trace_json TEXT;

-- Create run_feedbacks table
CREATE TABLE run_feedbacks (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  owner_tg_user_id INTEGER NOT NULL,
  feedback_type TEXT NOT NULL,
  comment TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_run_feedbacks_run_id ON run_feedbacks(run_id);
CREATE INDEX idx_run_feedbacks_owner ON run_feedbacks(owner_tg_user_id);

-- Create run_evaluations table
CREATE TABLE run_evaluations (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  owner_tg_user_id INTEGER NOT NULL,
  groundedness_score INTEGER NOT NULL,
  old_data_misuse_score INTEGER NOT NULL,
  advice_fit_score INTEGER NOT NULL,
  emotional_calibration_score INTEGER NOT NULL,
  reasoning TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_run_evaluations_run_id ON run_evaluations(run_id);
CREATE INDEX idx_run_evaluations_owner ON run_evaluations(owner_tg_user_id);
