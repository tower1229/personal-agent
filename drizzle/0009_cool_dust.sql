CREATE TABLE `document_chunk_embeddings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`document_chunk_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`embedding_json` text NOT NULL,
	`dimensions` integer NOT NULL,
	`created_at` integer NOT NULL
);
