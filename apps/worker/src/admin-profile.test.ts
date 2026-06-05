import { describe, expect, it } from "vitest";
import {
  createTestApp,
  env,
  ownerCookie
} from "./test-helpers/fakeRepositories.js";

describe("admin profile", () => {
  it("updates profile JSON string fields", async () => {
    const { app, repositories } = createTestApp();
    const interpretationFramework = JSON.stringify({
      mbti: "INTJ",
      enneagram: "5w4",
      astrologySign: "Aquarius"
    });
    const preferences = JSON.stringify({
      soul: ""
    });
    const agentSoul = "# Agent SOUL\n保持中正、清明、温和。";

    const response = await app.request(
      "/api/admin/profile",
      {
        method: "PUT",
        headers: {
          Cookie: await ownerCookie(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: "Zang Tao",
          gender: "male",
          birthdayTimestamp: 602611200000,
          interpretationFramework,
          preferences,
          agentSoul
        })
      },
      env
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: "1229",
      name: "Zang Tao",
      gender: "male",
      birthdayTimestamp: 602611200000,
      interpretationFramework,
      preferences,
      agentSoul
    });
    expect(repositories.userProfiles).toHaveLength(1);
    expect(repositories.userProfiles[0]).toMatchObject({
      interpretationFramework,
      preferences,
      agentSoul
    });
  });

  it("preserves preferences and agent memory fields when profile update omits them", async () => {
    const { app, repositories } = createTestApp();
    const existingPreferences = JSON.stringify({
      lastMemoryExtractionDate: "2026-06-05"
    });

    await repositories.upsertUserProfile({
      id: "1229",
      name: "Original",
      birthdayTimestamp: null,
      gender: null,
      interpretationFramework: null,
      preferences: existingPreferences,
      agentSoul: "# Agent SOUL\n只在 Agent Memory System 编辑。",
      coreMemory: "# Core Memory\n也只在 Agent Memory System 编辑。",
      createdAt: 1000,
      updatedAt: 1000
    });

    const response = await app.request(
      "/api/admin/profile",
      {
        method: "PUT",
        headers: {
          Cookie: await ownerCookie(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: "Updated",
          interpretationFramework: JSON.stringify({ mbti: "INTJ" })
        })
      },
      env
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      name: "Updated",
      preferences: existingPreferences,
      agentSoul: "# Agent SOUL\n只在 Agent Memory System 编辑。",
      coreMemory: "# Core Memory\n也只在 Agent Memory System 编辑。"
    });
  });
});
