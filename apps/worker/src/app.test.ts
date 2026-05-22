import { describe, expect, it } from "vitest";
import { createWorkerApp } from "./app.js";
import { type WorkerEnv } from "./types.js";

const env: WorkerEnv = {
  TELEGRAM_BOT_TOKEN: "bot-token",
  TELEGRAM_BOT_USERNAME: "personal_agent_bot",
  TELEGRAM_WEBHOOK_SECRET: "webhook-secret",
  OWNER_TG_USER_ID: "1229",
  ADMIN_SESSION_SECRET: "session-secret"
};

describe("worker app", () => {
  it("serves health and unauthenticated session state", async () => {
    const app = createWorkerApp();
    const health = await app.request("/api/admin/health", {}, env);
    const me = await app.request("/api/admin/me", {}, env);

    await expect(health.json()).resolves.toEqual({
      ok: true,
      service: "personal-agent-worker"
    });
    await expect(me.json()).resolves.toEqual({
      authenticated: false
    });
  });

  it("rejects webhook requests with invalid secret", async () => {
    const app = createWorkerApp();
    const response = await app.request(
      "/telegram/webhook",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Telegram-Bot-Api-Secret-Token": "wrong"
        },
        body: JSON.stringify({
          update_id: 1
        })
      },
      env
    );

    expect(response.status).toBe(401);
  });

  it("rejects webhook requests when secret is not configured", async () => {
    const app = createWorkerApp();
    const response = await app.request(
      "/telegram/webhook",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          update_id: 1
        })
      },
      {
        ...env,
        TELEGRAM_WEBHOOK_SECRET: ""
      }
    );

    expect(response.status).toBe(401);
  });

  it("ignores non-owner webhook updates and accepts owner updates", async () => {
    const app = createWorkerApp();
    const nonOwner = await app.request(
      "/telegram/webhook",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Telegram-Bot-Api-Secret-Token": "webhook-secret"
        },
        body: JSON.stringify({
          update_id: 1,
          message: {
            message_id: 1,
            from: {
              id: 999,
              first_name: "Other"
            },
            chat: {
              id: 999
            },
            text: "hello"
          }
        })
      },
      env
    );
    const owner = await app.request(
      "/telegram/webhook",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Telegram-Bot-Api-Secret-Token": "webhook-secret"
        },
        body: JSON.stringify({
          update_id: 2,
          message: {
            message_id: 2,
            from: {
              id: 1229,
              first_name: "Shixiong"
            },
            chat: {
              id: 1229
            },
            text: "hello"
          }
        })
      },
      env
    );

    await expect(nonOwner.json()).resolves.toEqual({
      ok: true,
      ignored: true
    });
    await expect(owner.json()).resolves.toEqual({
      ok: true,
      accepted: true
    });
  });
});
