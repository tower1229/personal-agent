import { describe, expect, it } from "vitest";
import { createAdminApp } from "../src/admin/server.js";

describe("legacy admin entrypoint", () => {
  it("serves a public landing page at /admin", async () => {
    const response = await createAdminApp().request("/admin");
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("Cloudflare Admin SPA");
    expect(body).toContain("npm run dev:worker");
  });

  it("keeps legacy admin APIs protected", async () => {
    const response = await createAdminApp().request("/admin/health");

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });
});
