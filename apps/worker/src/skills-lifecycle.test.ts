import { describe, expect, it } from "vitest";
import {
  createTestApp,
  env,
  ownerCookie,
  skillPackageFiles
} from "./test-helpers/fakeRepositories.js";

describe("skills lifecycle", () => {
  it("requires an admin session for skill routing example endpoints", async () => {
    const { app, repositories } = createTestApp();

    const list = await app.request("/api/admin/skill-intents", {}, env);
    const create = await app.request(
      "/api/admin/skill-intents",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          skillName: "coach",
          intentText: "帮我复盘"
        })
      },
      env
    );
    const remove = await app.request(
      "/api/admin/skill-intents/intent-1",
      {
        method: "DELETE"
      },
      env
    );
    const generate = await app.request(
      "/api/admin/skills/skill-1/routing-examples/generate",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          instruction: "生成中文路由样例"
        })
      },
      env
    );
    const apply = await app.request(
      "/api/admin/skills/skill-1/routing-examples",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          items: [{ exampleText: "帮我复盘这件事" }]
        })
      },
      env
    );

    expect([
      list.status,
      create.status,
      remove.status,
      generate.status,
      apply.status
    ]).toEqual([401, 401, 401, 401, 401]);
    await expect(repositories.listSkillIntents(1229)).resolves.toHaveLength(0);
    expect(repositories.adminAssistRuns).toHaveLength(0);
  });

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
