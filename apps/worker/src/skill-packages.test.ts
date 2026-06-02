import { describe, expect, it } from "vitest";
import {
  allowedBuiltInToolsForSkill,
  parseSkillPackageFiles
} from "./skillPackages.js";

describe("skill package parser", () => {
  it("accepts a minimal standard SKILL.md package", () => {
    const parsed = parseSkillPackageFiles({
      "SKILL.md": [
        "---",
        "name: daily-brief",
        "description: Generate a concise daily brief.",
        "---",
        "用简洁中文生成简报。"
      ].join("\n")
    });

    expect(parsed.validation.ok).toBe(true);
    expect(parsed.metadata).toMatchObject({
      name: "daily-brief",
      description: "Generate a concise daily brief."
    });
    expect(parsed.body).toBe("用简洁中文生成简报。");
  });

  it("marks missing SKILL.md as invalid", () => {
    const parsed = parseSkillPackageFiles({
      "references/context.md": "context"
    });

    expect(parsed.validation.ok).toBe(false);
    expect(parsed.validation.errors).toEqual(
      expect.arrayContaining([
        {
          path: "SKILL.md",
          message: "SKILL.md is required"
        }
      ])
    );
  });

  it("indexes package directories and filters unknown allowed tools", () => {
    const parsed = parseSkillPackageFiles({
      "SKILL.md": [
        "---",
        "name: research-helper",
        "description: Help with research.",
        "allowed-tools:",
        "  - web_search",
        "  - unknown_tool",
        "---",
        "先搜索，再总结。"
      ].join("\n"),
      "scripts/run.ts": "export {};",
      "references/style.md": "style",
      "assets/logo.txt": "asset",
      "notes.md": "note"
    });

    expect(parsed.validation.ok).toBe(true);
    expect(parsed.validation.warnings).toEqual([
      {
        path: "SKILL.md",
        message: "Unsupported allowed tool: unknown_tool"
      }
    ]);
    expect(parsed.fileInventory.map((item) => item.directory)).toEqual(
      expect.arrayContaining(["root", "assets", "references", "scripts"])
    );
    expect([...allowedBuiltInToolsForSkill(parsed.metadata)]).toEqual([
      "web_search"
    ]);
  });

  it("parses standard YAML frontmatter features", () => {
    const parsed = parseSkillPackageFiles({
      "SKILL.md": [
        "---",
        "name: yaml-skill",
        "description: >",
        "  Help with YAML frontmatter",
        "  without a custom parser.",
        "allowed-tools: [web_search, fetch_url]",
        "metadata:",
        "  source: test",
        "---",
        "读取上下文并总结。"
      ].join("\n")
    });

    expect(parsed.validation.ok).toBe(true);
    expect(parsed.metadata.description).toBe(
      "Help with YAML frontmatter without a custom parser."
    );
    expect(parsed.metadata.allowedTools).toEqual(["web_search", "fetch_url"]);
    expect(parsed.metadata.raw).toMatchObject({
      metadata: {
        source: "test"
      }
    });
  });
});
