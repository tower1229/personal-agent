ALTER TABLE todos ADD COLUMN due_at DATETIME;
ALTER TABLE todos ADD COLUMN reminded_at DATETIME;

CREATE INDEX IF NOT EXISTS idx_todos_due_at ON todos(due_at) WHERE status = 'open' AND reminded_at IS NULL;
