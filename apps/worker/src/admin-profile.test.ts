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
});
