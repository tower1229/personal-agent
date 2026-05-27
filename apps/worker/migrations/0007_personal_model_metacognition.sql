-- metacognition_logs
CREATE TABLE personal_model_metacognition_logs (
    id TEXT PRIMARY KEY,
    owner_tg_user_id INTEGER NOT NULL,
    related_claim_id TEXT, -- nullable
    related_gap_id TEXT, -- nullable
    reflection_type TEXT NOT NULL, -- 'correction', 'observation', 'conflict_resolution'
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE INDEX idx_personal_model_metacognition_owner ON personal_model_metacognition_logs(owner_tg_user_id);
CREATE INDEX idx_personal_model_metacognition_claim ON personal_model_metacognition_logs(related_claim_id);

-- understanding_gaps
CREATE TABLE personal_model_understanding_gaps (
    id TEXT PRIMARY KEY,
    owner_tg_user_id INTEGER NOT NULL,
    scenario TEXT NOT NULL,
    gap_description TEXT NOT NULL,
    status TEXT NOT NULL, -- 'open', 'resolved', 'ignored'
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX idx_personal_model_understanding_gaps_owner ON personal_model_understanding_gaps(owner_tg_user_id);
