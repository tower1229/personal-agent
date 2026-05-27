CREATE TABLE IF NOT EXISTS source_documents (
  id TEXT PRIMARY KEY,
  owner_tg_user_id INTEGER NOT NULL,
  source_type TEXT NOT NULL,
  title TEXT NOT NULL,
  uri TEXT,
  content TEXT NOT NULL,
  normalized_content TEXT NOT NULL,
  status TEXT NOT NULL,
  usage_policy TEXT NOT NULL,
  sensitivity TEXT NOT NULL,
  source_created_at INTEGER,
  source_updated_at INTEGER,
  ingested_at INTEGER NOT NULL,
  metadata_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_source_documents_owner_ingested
  ON source_documents (owner_tg_user_id, ingested_at DESC);

CREATE INDEX IF NOT EXISTS idx_source_documents_owner_type
  ON source_documents (owner_tg_user_id, source_type, status);

CREATE INDEX IF NOT EXISTS idx_source_documents_owner_usage
  ON source_documents (owner_tg_user_id, usage_policy, status);

CREATE TABLE IF NOT EXISTS source_chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  owner_tg_user_id INTEGER NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  normalized_content TEXT NOT NULL,
  token_count INTEGER,
  metadata_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_source_chunks_document_index
  ON source_chunks (document_id, chunk_index);

CREATE INDEX IF NOT EXISTS idx_source_chunks_owner_normalized
  ON source_chunks (owner_tg_user_id, normalized_content);

CREATE TABLE IF NOT EXISTS personal_model_evidence (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL,
  owner_tg_user_id INTEGER NOT NULL,
  evidence_type TEXT NOT NULL,
  source_document_id TEXT,
  source_chunk_id TEXT,
  run_id TEXT,
  quote TEXT,
  weight TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_personal_model_evidence_claim_created
  ON personal_model_evidence (claim_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_personal_model_evidence_owner_created
  ON personal_model_evidence (owner_tg_user_id, created_at DESC);
