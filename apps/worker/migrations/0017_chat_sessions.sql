CREATE TABLE chat_sessions (
    id TEXT PRIMARY KEY,
    owner_tg_user_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    theme_summary TEXT,
    summarized_up_to_run_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX idx_chat_sessions_owner ON chat_sessions(owner_tg_user_id);
CREATE INDEX idx_chat_sessions_status ON chat_sessions(status);

ALTER TABLE runs ADD COLUMN session_id TEXT;
CREATE INDEX idx_runs_session_id ON runs(session_id);
