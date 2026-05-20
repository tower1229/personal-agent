import { afterAll, beforeEach } from "vitest";
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const databasePath = join(tmpdir(), `personal-agent-vitest-${process.pid}.sqlite`);

process.env.NODE_ENV = "test";
process.env.TELEGRAM_BOT_TOKEN = "test-telegram-token";
process.env.OPENAI_API_KEY = "test-openai-key";
process.env.OPENAI_MODEL = "test-model";
process.env.EMBEDDING_PROVIDER = "test";
process.env.EMBEDDING_MODEL = "test-embedding";
process.env.USER_TIMEZONE = "Asia/Shanghai";
process.env.DATABASE_URL = databasePath;
process.env.ADMIN_TOKEN = "test-admin-token";
process.env.DISABLE_EMBEDDINGS = "1";

const { sqlite } = await import("../src/db/client.js");

const migrationDir = resolve(process.cwd(), "drizzle");
const migrations = readdirSync(migrationDir)
  .filter((file) => file.endsWith(".sql"))
  .sort();

for (const migration of migrations) {
  sqlite.exec(readFileSync(join(migrationDir, migration), "utf8"));
}

beforeEach(() => {
  sqlite.exec(`
    DELETE FROM eval_results;
    DELETE FROM eval_runs;
    DELETE FROM workflow_steps;
    DELETE FROM workflows;
    DELETE FROM document_chunk_embeddings;
    DELETE FROM document_chunks;
    DELETE FROM documents;
    DELETE FROM approval_requests;
    DELETE FROM memory_embeddings;
    DELETE FROM memory_events;
    DELETE FROM memories;
    DELETE FROM tool_calls;
    DELETE FROM todos;
    DELETE FROM runs;
  `);
});

afterAll(() => {
  sqlite.close();
  rmSync(databasePath, { force: true });
});
