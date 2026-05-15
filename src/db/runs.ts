import { db } from "./client.js";
import { type NewRun, runs } from "./schema.js";

export async function createRun(run: NewRun): Promise<void> {
  await db.insert(runs).values(run);
}
