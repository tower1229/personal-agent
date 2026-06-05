import {
  adminAgentConfigResponseSchema,
  adminAgentTestLlmRequestSchema,
  adminAgentTestLlmResponseSchema,
  adminAgentTestSearchRequestSchema,
  adminAgentTestSearchResponseSchema,
  adminApiSuccessSchema,
  adminAuthConfigResponseSchema,
  adminHealthResponseSchema,
  adminMeResponseSchema,
  userProfileSchema,
  userProfileUpdateRequestSchema
} from "@personal-agent/shared";
import { type Hono } from "hono";
import { executeLlmAgent } from "../agent.js";
import {
  buildExpiredSessionCookie,
  getCookieValue,
  getSessionCookieName,
  verifySession
} from "../auth.js";
import { normalizeLlmBaseUrl, parseMaxToolRounds } from "../llm.js";
import { type WorkerEnv } from "../types.js";
import { checkD1Readiness, telegramBotUsername } from "./helpers.js";

import { type WorkerRouteContext } from "./routeContext.js";

export function registerAdminSystemRoutes(
  app: Hono<{ Bindings: WorkerEnv }>,
  context: WorkerRouteContext
) {
  const { options, repositories, fetchUrlMaxBytes, runtime, adminOwnerId } =
    context;

  app.get("/api/admin/health", (c) =>
    c.json(
      adminHealthResponseSchema.parse({
        ok: true,
        service: "personal-agent-worker"
      })
    )
  );

  app.get("/api/admin/auth-config", (c) =>
    c.json(
      adminAuthConfigResponseSchema.parse({
        botUsername: telegramBotUsername(c.env.TELEGRAM_BOT_USERNAME),
        configured: telegramBotUsername(c.env.TELEGRAM_BOT_USERNAME) !== null
      })
    )
  );

  app.get("/api/admin/agent-config", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const baseUrl = normalizeLlmBaseUrl(c.env.LLM_API_BASE_URL);
    const model = c.env.LLM_MODEL?.trim() || null;

    return c.json(
      adminAgentConfigResponseSchema.parse({
        llmConfigured: Boolean(baseUrl && c.env.LLM_API_KEY?.trim() && model),
        llmBaseUrl: baseUrl,
        llmModel: model,
        maxToolRounds: parseMaxToolRounds(c.env.LLM_MAX_TOOL_ROUNDS),
        braveSearchConfigured: Boolean(c.env.BRAVE_SEARCH_API_KEY?.trim()),
        fetchUrlMaxBytes: fetchUrlMaxBytes(c.env)
      })
    );
  });

  app.get("/api/admin/diagnostics/d1", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    return c.json(
      await checkD1Readiness(c.env.DB, (options.now ?? Date.now)())
    );
  });

  app.post("/api/admin/agent-config/test-llm", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = adminAgentTestLlmRequestSchema.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!body.success) {
      return c.json({ error: "Invalid LLM test prompt" }, 400);
    }

    const rt = runtime(c.env);
    const now = rt.now();
    let activeSession = await rt.repositories.getActiveChatSession(authenticatedOwnerId);
    if (!activeSession) {
      activeSession = await rt.repositories.createChatSession({
        id: rt.generateId(),
        ownerTgUserId: authenticatedOwnerId,
        status: "active",
        themeSummary: null,
        summarizedUpToRunId: null,
        createdAt: now,
        updatedAt: now
      });
    }

    const run = await rt.repositories.createRun({
      id: rt.generateId(),
      sessionId: activeSession.id,
      ownerTgUserId: authenticatedOwnerId,
      chatId: authenticatedOwnerId,
      updateId: null,
      messageText: body.data.prompt,
      createdAt: now,
      updatedAt: now
    });

    try {
      const result = await executeLlmAgent({
        runId: run.id,
        sessionId: activeSession.id,
        ownerTgUserId: authenticatedOwnerId,
        inputText: body.data.prompt,
        runtime: rt,
        maxToolRounds: rt.maxToolRounds
      });
      await rt.repositories.updateRun(run.id, {
        status: "succeeded",
        responseText: result.responseText,
        error: null,
        updatedAt: rt.now()
      });
      return c.json(
        adminAgentTestLlmResponseSchema.parse({
          ok: true,
          output: result.responseText
        })
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "LLM test failed";
      await rt.repositories.updateRun(run.id, {
        status: "failed",
        responseText: null,
        error: message,
        updatedAt: rt.now()
      });
      return c.json({ error: message }, 500);
    }
  });

  app.post("/api/admin/agent-config/test-search", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = adminAgentTestSearchRequestSchema.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!body.success) {
      return c.json({ error: "Invalid search query" }, 400);
    }

    const rt = runtime(c.env);
    if (!rt.searchClient) {
      return c.json({ error: "Brave search is not configured" }, 500);
    }

    try {
      const results = await rt.searchClient.search({
        query: body.data.query,
        count: 5
      });
      return c.json(
        adminAgentTestSearchResponseSchema.parse({
          ok: true,
          results
        })
      );
    } catch (error) {
      return c.json(
        {
          error:
            error instanceof Error ? error.message : "Brave search test failed"
        },
        500
      );
    }
  });

  app.get("/api/admin/me", async (c) => {
    const session = await verifySession({
      cookieValue: getCookieValue(
        c.req.header("cookie") ?? null,
        getSessionCookieName()
      ),
      secret: c.env.ADMIN_SESSION_SECRET
    });

    if (!session) {
      return c.json(adminMeResponseSchema.parse({ authenticated: false }));
    }

    return c.json(
      adminMeResponseSchema.parse({
        authenticated: true,
        user: session
      })
    );
  });

  app.get("/api/admin/profile", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const profile = await repositories(c.env).getUserProfile(authenticatedOwnerId.toString());
    if (!profile) {
      return c.json(userProfileSchema.parse({
        id: authenticatedOwnerId.toString(),
        name: "",
        birthdayTimestamp: null,
        gender: null,
        interpretationFramework: null,
        preferences: null,
        agentSoul: null,
        coreMemory: null,
        createdAt: (options.now ?? Date.now)(),
        updatedAt: (options.now ?? Date.now)()
      }));
    }
    return c.json(userProfileSchema.parse(profile));
  });

  app.put("/api/admin/profile", async (c) => {
    const authenticatedOwnerId = await adminOwnerId(c);
    if (!authenticatedOwnerId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = userProfileUpdateRequestSchema.safeParse(
      await c.req.json().catch(() => null)
    );
    if (!body.success) {
      return c.json({ error: "Invalid request data" }, 400);
    }

    const existing = await repositories(c.env).getUserProfile(authenticatedOwnerId.toString());
    const now = (options.now ?? Date.now)();
    
    const input = {
      id: authenticatedOwnerId.toString(),
      name: body.data.name !== undefined ? body.data.name : (existing?.name ?? ""),
      birthdayTimestamp: body.data.birthdayTimestamp !== undefined ? body.data.birthdayTimestamp : (existing?.birthdayTimestamp ?? null),
      gender: body.data.gender !== undefined ? body.data.gender : (existing?.gender ?? null),
      interpretationFramework: body.data.interpretationFramework !== undefined ? body.data.interpretationFramework : (existing?.interpretationFramework ?? null),
      preferences: body.data.preferences !== undefined ? body.data.preferences : (existing?.preferences ?? null),
      agentSoul: body.data.agentSoul !== undefined ? body.data.agentSoul : (existing?.agentSoul ?? null),
      coreMemory: body.data.coreMemory !== undefined ? body.data.coreMemory : (existing?.coreMemory ?? null),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };

    const isNewProfile = !existing;
    const updated = await repositories(c.env).upsertUserProfile(input);

    if (isNewProfile) {
      const rt = runtime(c.env);
      const seedGaps = [
        {
          scenario: "global",
          gapDescription: "未知的核心价值观与原则"
        },
        {
          scenario: "global",
          gapDescription: "未知的沟通与交流偏好"
        },
        {
          scenario: "global",
          gapDescription: "未知的压力反应与安抚需求"
        },
        {
          scenario: "global",
          gapDescription: "未知的工作与生活边界设定"
        }
      ] as const;

      for (const gap of seedGaps) {
        await rt.repositories.createPersonalModelUnderstandingGap({
          id: rt.generateId(),
          ownerTgUserId: authenticatedOwnerId,
          scenario: gap.scenario,
          gapDescription: gap.gapDescription,
          status: "open",
          createdAt: now,
          updatedAt: now
        });
      }
    }

    return c.json(userProfileSchema.parse(updated));
  });

  app.post("/api/admin/logout", (c) => {
    c.header("Set-Cookie", buildExpiredSessionCookie());
    return c.json(adminApiSuccessSchema.parse({ ok: true }));
  });

}
