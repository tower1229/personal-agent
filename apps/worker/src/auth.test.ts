import { describe, expect, it } from "vitest";
import { hmacSha256, sha256, toHex } from "./crypto.js";
import {
  signSession,
  verifySession,
  verifyTelegramLogin
} from "./auth.js";

async function buildTelegramLoginQuery(input: {
  botToken: string;
  id?: number;
  username?: string;
  authDate?: number;
}) {
  const params = new URLSearchParams({
    id: String(input.id ?? 1229),
    first_name: "Shixiong",
    username: input.username ?? "shixiong",
    auth_date: String(input.authDate ?? 1800000000)
  });
  const dataCheckString = Array.from(params.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const hash = toHex(
    await hmacSha256({
      key: await sha256(input.botToken),
      data: dataCheckString
    })
  );
  params.set("hash", hash);

  return params;
}

describe("worker auth", () => {
  it("verifies Telegram login hashes", async () => {
    const query = await buildTelegramLoginQuery({
      botToken: "bot-token"
    });

    await expect(
      verifyTelegramLogin({
        query,
        botToken: "bot-token",
        now: 1800000010
      })
    ).resolves.toMatchObject({
      id: 1229,
      username: "shixiong",
      firstName: "Shixiong"
    });

    query.set("username", "attacker");

    await expect(
      verifyTelegramLogin({
        query,
        botToken: "bot-token",
        now: 1800000010
      })
    ).resolves.toBeNull();
  });

  it("rejects stale Telegram login payloads", async () => {
    const query = await buildTelegramLoginQuery({
      botToken: "bot-token",
      authDate: 1800000000
    });

    await expect(
      verifyTelegramLogin({
        query,
        botToken: "bot-token",
        now: 1800000601
      })
    ).resolves.toBeNull();
  });

  it("rejects tampered session cookies", async () => {
    const signed = await signSession({
      user: {
        id: 1229,
        username: "shixiong"
      },
      secret: "session-secret",
      now: 100
    });

    await expect(
      verifySession({
        cookieValue: signed,
        secret: "session-secret",
        now: 101
      })
    ).resolves.toMatchObject({
      id: 1229,
      username: "shixiong"
    });

    await expect(
      verifySession({
        cookieValue: `${signed.slice(0, -1)}x`,
        secret: "session-secret",
        now: 101
      })
    ).resolves.toBeNull();
  });
});
