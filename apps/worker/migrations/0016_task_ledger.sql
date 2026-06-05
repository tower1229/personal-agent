DROP TABLE IF EXISTS long_task_events;
DROP TABLE IF EXISTS long_task_steps;
DROP TABLE IF EXISTS long_tasks;

CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    owner_tg_user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    title TEXT NOT NULL,
    command TEXT NOT NULL,
    context_json TEXT,
    result_json TEXT,
    error TEXT,
    run_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    completed_at INTEGER
);

CREATE INDEX idx_tasks_owner_created ON tasks(owner_tg_user_id, created_at DESC);
CREATE INDEX idx_tasks_status ON tasks(status);
