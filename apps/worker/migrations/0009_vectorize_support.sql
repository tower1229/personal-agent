ALTER TABLE source_chunks ADD COLUMN vector_id TEXT;
ALTER TABLE source_chunks ADD COLUMN indexed_at INTEGER;
ALTER TABLE source_chunks ADD COLUMN index_status TEXT DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_source_chunks_vector_status ON source_chunks (index_status);
