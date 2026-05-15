import "dotenv/config";
import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

const databaseUrl = process.env.DATABASE_URL ?? "data/personal-agent.sqlite";

if (databaseUrl !== ":memory:" && !databaseUrl.startsWith("file:")) {
  const databasePath = isAbsolute(databaseUrl)
    ? databaseUrl
    : resolve(process.cwd(), databaseUrl);

  mkdirSync(dirname(databasePath), { recursive: true });
}
