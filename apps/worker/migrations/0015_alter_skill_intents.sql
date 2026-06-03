ALTER TABLE skill_intents ADD COLUMN skill_id TEXT;
ALTER TABLE skill_intents ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
CREATE INDEX idx_skill_intents_skill_id ON skill_intents(skill_id);
