import { describe, expect, it } from "vitest";
import { buildSessionCookie, signSession } from "./auth.js";
import { createWorkerApp, runScheduled } from "./app.js";
import { executeAgentTool } from "./agent.js";
import { createUrlFetcher, type SearchClient, type UrlFetcher } from "./externalTools.js";
import { type LlmChatCompletionOutput, type LlmClient, type LlmMessage } from "./llm.js";
import { type TelegramClient } from "./telegram.js";
import {
  skillPackageFiles,
  createFakeD1Database,
  createFakeLlmClient,
  createFakeRepositories,
  createFakeSearchClient,
  createFakeTelegramClient,
  createFakeUrlFetcher,
  createTestApp,
  env,
  ownerCookie,
  ownerUpdate,
  postWebhook
} from "./test-helpers/fakeRepositories.js";

describe("skills lifecycle", () => {
  it("saves skill package drafts with warnings for unknown allowed tools", async () => {
    const { app } = createTestApp();
    const cookie = await ownerCookie();
    const response = await app.request(
      "/api/admin/skills",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie
        },
        body: JSON.stringify({
          files: skillPackageFiles({
            name: "invalid-tools",
            allowedTools: ["list_todos", "unknown_tool"]
          }),
          enabled: true
        })
      },
      env
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      skill: {
        name: "invalid-tools",
        validation: {
          ok: true,
          warnings: [
            {
              path: "SKILL.md",
              message: "Unsupported allowed tool: unknown_tool"
            }
          ]
        }
      }
    });
  });

  it("saves duplicate-name drafts but blocks publishing them", async () => {
    const { app } = createTestApp();
    const cookie = await ownerCookie();
    const first = await app.request(
      "/api/admin/skills",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie
        },
        body: JSON.stringify({
          files: skillPackageFiles({ name: "coach" }),
          enabled: true
        })
      },
      env
    );
    const second = await app.request(
      "/api/admin/skills",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie
        },
        body: JSON.stringify({
          files: skillPackageFiles({ name: "coach" }),
          enabled: true
        })
      },
      env
    );

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const secondBody = (await second.json()) as { skill: { id: string } };
    expect(secondBody).toMatchObject({
      skill: {
        name: "coach",
        validation: {
          ok: false,
          errors: [
            {
              path: "SKILL.md:name",
              message: "Skill name conflicts with another active skill"
            }
          ]
        }
      }
    });

    const publish = await app.request(
      `/api/admin/skills/${secondBody.skill.id}/publish`,
      {
        method: "POST",
        headers: {
          Cookie: cookie
        }
      },
      env
    );
    expect(publish.status).toBe(400);
  });

  it("treats published version names as active even after draft rename", async () => {
    const { app, repositories } = createTestApp();
    const cookie = await ownerCookie();
    const first = await repositories.createSkill({
      ownerTgUserId: 1229,
      files: skillPackageFiles({ name: "coach" }),
      enabled: true,
      createdAt: 1000
    });
    await repositories.publishSkill({
      ownerTgUserId: 1229,
      id: first.id,
      versionId: "coach-v1",
      createdAt: 1001
    });
    await repositories.updateSkillDraft({
      ownerTgUserId: 1229,
      id: first.id,
      files: skillPackageFiles({ name: "mentor" }),
      enabled: true,
      updatedAt: 1002
    });

    const create = await app.request(
      "/api/admin/skills",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie
        },
        body: JSON.stringify({
          files: skillPackageFiles({ name: "coach" }),
          enabled: true
        })
      },
      env
    );

    expect(create.status).toBe(201);
    await expect(create.json()).resolves.toMatchObject({
      skill: {
        name: "coach",
        validation: {
          ok: false,
          errors: [
            {
              path: "SKILL.md:name",
              message: "Skill name conflicts with another active skill"
            }
          ]
        }
      }
    });
  });

});
