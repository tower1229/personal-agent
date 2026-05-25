import { describe, expect, it } from "vitest";
import { isCreateRoutePath } from "../apps/admin/src/lib/admin-routes";

describe("admin route helpers", () => {
  it("detects create routes for skill and schedule forms", () => {
    expect(isCreateRoutePath("/admin/skills/new")).toBe(true);
    expect(isCreateRoutePath("/admin/schedules/new")).toBe(true);
  });

  it("does not treat list or detail routes as create routes", () => {
    expect(isCreateRoutePath("/admin/skills")).toBe(false);
    expect(isCreateRoutePath("/admin/skills/my-skill")).toBe(false);
    expect(isCreateRoutePath("/admin/schedules")).toBe(false);
    expect(isCreateRoutePath("/admin/schedules/morning")).toBe(false);
  });
});
