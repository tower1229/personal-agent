import { eq } from "drizzle-orm";
import { db } from "./client.js";
import {
  evalResults,
  evalRuns,
  type EvalRun,
  type NewEvalResult
} from "./schema.js";

export async function createEvalRun(input: {
  total: number;
}): Promise<EvalRun> {
  const created = await db
    .insert(evalRuns)
    .values({
      startedAt: new Date(),
      finishedAt: null,
      total: input.total,
      passed: 0,
      failed: 0,
      passRate: 0
    })
    .returning();

  const evalRun = created[0];

  if (!evalRun) {
    throw new Error("Failed to create eval run");
  }

  return evalRun;
}

export async function finishEvalRun(input: {
  id: number;
  total: number;
  passed: number;
  failed: number;
}): Promise<void> {
  const passRate =
    input.total === 0 ? 0 : Math.round((input.passed / input.total) * 100);

  await db
    .update(evalRuns)
    .set({
      finishedAt: new Date(),
      total: input.total,
      passed: input.passed,
      failed: input.failed,
      passRate
    })
    .where(eq(evalRuns.id, input.id));
}

export async function createEvalResult(result: NewEvalResult): Promise<void> {
  await db.insert(evalResults).values(result);
}
