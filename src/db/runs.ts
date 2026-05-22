import { eq } from "drizzle-orm";
import { db } from "./client.js";
import { type Run, runs } from "./schema.js";

export async function createRunningRun(input: {
  userId: string;
  chatId: string;
  model: string;
  input: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}): Promise<Run> {
  const created = await db
    .insert(runs)
    .values({
      userId: input.userId,
      chatId: input.chatId,
      model: input.model,
      input: input.input,
      output: null,
      status: "running",
      latencyMs: 0,
      error: null,
      metadataJson: JSON.stringify(input.metadata),
      createdAt: input.createdAt
    })
    .returning();

  const run = created[0];

  if (!run) {
    throw new Error("Failed to create running run");
  }

  return run;
}

export async function getRun(id: number): Promise<Run | null> {
  const rows = await db.select().from(runs).where(eq(runs.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function markRunSucceeded(input: {
  id: number;
  output: string;
  latencyMs: number;
  metadata?: Record<string, unknown>;
}): Promise<Run> {
  const updated = await db
    .update(runs)
    .set({
      output: input.output,
      status: "succeeded",
      latencyMs: input.latencyMs,
      error: null,
      ...(input.metadata === undefined
        ? {}
        : { metadataJson: JSON.stringify(input.metadata) })
    })
    .where(eq(runs.id, input.id))
    .returning();

  const run = updated[0];

  if (!run) {
    throw new Error(`Run ${input.id} was not found`);
  }

  return run;
}

export async function markRunFailed(input: {
  id: number;
  error: string;
  latencyMs: number;
  output: string | null;
  metadata?: Record<string, unknown>;
}): Promise<Run> {
  const updated = await db
    .update(runs)
    .set({
      output: input.output,
      status: "failed",
      latencyMs: input.latencyMs,
      error: input.error,
      ...(input.metadata === undefined
        ? {}
        : { metadataJson: JSON.stringify(input.metadata) })
    })
    .where(eq(runs.id, input.id))
    .returning();

  const run = updated[0];

  if (!run) {
    throw new Error(`Run ${input.id} was not found`);
  }

  return run;
}
