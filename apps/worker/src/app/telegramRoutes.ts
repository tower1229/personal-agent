import { telegramWebhookResponseSchema } from "@personal-agent/shared";
import { type Hono } from "hono";
import { evaluateRun } from "../agentEvaluator.js";
import { handleOwnerUpdate } from "../bot.js";
import { extractDailyMemories } from "../memoryExtractor.js";
import { getTelegramUpdateUserId, parseTelegramUpdate } from "../telegram.js";
import { type WorkerEnv } from "../types.js";
import { ownerId } from "./helpers.js";

import { type WorkerRouteContext } from "./routeContext.js";

export function registerTelegramRoutes(
  app: Hono<{ Bindings: WorkerEnv }>,
  context: WorkerRouteContext
) {
  const { runtime } = context;

  app.post("/telegram/webhook", async (c) => {
    const webhookSecret = c.env.TELEGRAM_WEBHOOK_SECRET;

    if (
      !webhookSecret ||
      c.req.header("X-Telegram-Bot-Api-Secret-Token") !== webhookSecret
    ) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = await c.req.json().catch(() => null);
    const update = parseTelegramUpdate(body);

    if (!update) {
      console.error("WEBHOOK PARSE FAILED", body);
      return c.json({ error: "Invalid Telegram update" }, 400);
    }
    console.error("WEBHOOK PARSED", update);

    const userId = getTelegramUpdateUserId(update);

    if (userId !== ownerId(c.env)) {
      return c.json(
        telegramWebhookResponseSchema.parse({
          ok: true,
          ignored: true
        })
      );
    }

    const botRuntime = runtime(c.env);
    const result = await handleOwnerUpdate({
      update,
      ownerTgUserId: userId,
      runtime: botRuntime
    });

    // Auto-evaluate the Run in the background
    const backgroundTask = (async () => {
      try {
        const run = await botRuntime.repositories.getRun({
          ownerTgUserId: userId,
          id: result.runId
        });
        if (run) {
          await evaluateRun(run, botRuntime);
        }
      } catch (error) {
        console.error("evaluateRun background task failed", error);
      }

      try {
        await extractDailyMemories(botRuntime, userId);
      } catch (error) {
        console.error("extractDailyMemories background task failed", error);
      }
    })();

    try {
      c.executionCtx.waitUntil(backgroundTask);
    } catch {
      // In testing environments where executionCtx is not available, we still want to catch errors
      backgroundTask.catch(() => {});
    }

    return c.json(
      telegramWebhookResponseSchema.parse({
        ok: true,
        accepted: true,
        runId: result.runId
      })
    );
  });

}
