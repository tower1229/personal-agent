CREATE TABLE skill_intents (
  id TEXT PRIMARY KEY,
  owner_tg_user_id INTEGER NOT NULL,
  skill_name TEXT NOT NULL,
  intent_text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_skill_intents_owner ON skill_intents(owner_tg_user_id);
CREATE INDEX idx_skill_intents_skill_name ON skill_intents(skill_name);
