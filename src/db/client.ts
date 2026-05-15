import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { env } from "../config/env.js";
import * as schema from "./schema.js";

function ensureDatabaseDirectory(databaseUrl: string): void {
  if (databaseUrl === ":memory:" || databaseUrl.startsWith("file:")) {
    return;
  }

  const databasePath = isAbsolute(databaseUrl)
    ? databaseUrl
    : resolve(process.cwd(), databaseUrl);

  mkdirSync(dirname(databasePath), { recursive: true });
}

ensureDatabaseDirectory(env.DATABASE_URL);

export const sqlite = new Database(env.DATABASE_URL);
export const db = drizzle(sqlite, { schema });
