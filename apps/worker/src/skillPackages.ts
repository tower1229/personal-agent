import {
  builtInToolNames,
  skillPackageMetadataSchema,
  skillPackageNameSchema,
  type BuiltInToolName,
  type SkillPackageFileInventoryItem,
  type SkillPackageMetadata,
  type SkillValidationIssue,
  type SkillValidationResult
} from "@personal-agent/shared";
import { parse as parseYaml } from "yaml";

export interface ParsedSkillPackage {
  files: Record<string, string>;
  metadata: SkillPackageMetadata;
  body: string;
  fileInventory: SkillPackageFileInventoryItem[];
  validation: SkillValidationResult;
  contentHash: string;
}

interface FrontmatterParseResult {
  frontmatter: Record<string, unknown>;
  body: string;
  errors: SkillValidationIssue[];
}

function normalizePath(path: string): string {
  return path.trim().replace(/^\.\/+/, "").replace(/\\/g, "/");
}

function directoryForPath(path: string): SkillPackageFileInventoryItem["directory"] {
  if (!path.includes("/")) {
    return "root";
  }
  const directory = path.split("/")[0];
  return directory === "scripts" ||
    directory === "references" ||
    directory === "assets"
    ? directory
    : "other";
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function parseFrontmatterBlock(block: string): {
  frontmatter: Record<string, unknown>;
  errors: SkillValidationIssue[];
} {
  try {
    const parsed = parseYaml(block) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        frontmatter: {},
        errors: [
          {
            path: "SKILL.md",
            message: "SKILL.md frontmatter must be a YAML object"
          }
        ]
      };
    }
    return {
      frontmatter: parsed as Record<string, unknown>,
      errors: []
    };
  } catch (error) {
    return {
      frontmatter: {},
      errors: [
        {
          path: "SKILL.md",
          message:
            error instanceof Error
              ? `SKILL.md frontmatter YAML parse failed: ${error.message}`
              : "SKILL.md frontmatter YAML parse failed"
        }
      ]
    };
  }
}

function splitSkillMarkdown(value: string): FrontmatterParseResult {
  const normalized = value.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return {
      frontmatter: {},
      body: normalized,
      errors: [
        {
          path: "SKILL.md",
          message: "SKILL.md must start with YAML frontmatter"
        }
      ]
    };
  }

  const end = normalized.indexOf("\n---", 4);
  if (end < 0) {
    return {
      frontmatter: {},
      body: normalized,
      errors: [
        {
          path: "SKILL.md",
          message: "SKILL.md frontmatter must end with ---"
        }
      ]
    };
  }

  const parsedFrontmatter = parseFrontmatterBlock(normalized.slice(4, end));
  return {
    frontmatter: parsedFrontmatter.frontmatter,
    body: normalized.slice(end + 4).replace(/^\n/, ""),
    errors: parsedFrontmatter.errors
  };
}

function normalizedFiles(files: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [path, content] of Object.entries(files)) {
    const normalizedPath = normalizePath(path);
    if (normalizedPath) {
      normalized[normalizedPath] = String(content);
    }
  }
  return normalized;
}

function contentHash(files: Record<string, string>): string {
  const input = Object.entries(files)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, content]) => `${path}\0${content}`)
    .join("\0");
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function toolWarnings(rawTools: string[]): SkillValidationIssue[] {
  return rawTools
    .filter(
      (tool) =>
        !builtInToolNames.includes(tool as (typeof builtInToolNames)[number])
    )
    .map((tool) => ({
      path: "SKILL.md",
      message: `Unsupported allowed tool: ${tool}`
    }));
}

function validationErrorKey(issue: SkillValidationIssue): string {
  return `${issue.path}\0${issue.message}`;
}

function withAdditionalValidationErrors(
  parsed: ParsedSkillPackage,
  additionalErrors: SkillValidationIssue[]
): ParsedSkillPackage {
  if (additionalErrors.length === 0) {
    return parsed;
  }
  const seen = new Set(parsed.validation.errors.map(validationErrorKey));
  const errors = [...parsed.validation.errors];
  for (const error of additionalErrors) {
    if (!seen.has(validationErrorKey(error))) {
      errors.push(error);
      seen.add(validationErrorKey(error));
    }
  }
  return {
    ...parsed,
    validation: {
      ...parsed.validation,
      ok: false,
      errors
    }
  };
}

export function markSkillPackageNameConflict(
  parsed: ParsedSkillPackage
): ParsedSkillPackage {
  return withAdditionalValidationErrors(parsed, [
    {
      path: "SKILL.md:name",
      message: "Skill name conflicts with another active skill"
    }
  ]);
}

export function allowedBuiltInToolsForSkill(
  metadata: SkillPackageMetadata
): Set<BuiltInToolName> {
  return new Set(
    metadata.allowedTools.filter((tool): tool is BuiltInToolName =>
      builtInToolNames.includes(tool as BuiltInToolName)
    )
  );
}

export function parseSkillPackageFiles(
  inputFiles: Record<string, string>
): ParsedSkillPackage {
  const files = normalizedFiles(inputFiles);
  const errors: SkillValidationIssue[] = [];
  const warnings: SkillValidationIssue[] = [];
  const skillMarkdown = files["SKILL.md"];

  if (typeof skillMarkdown !== "string") {
    errors.push({ path: "SKILL.md", message: "SKILL.md is required" });
  }

  const split = splitSkillMarkdown(skillMarkdown ?? "");
  errors.push(...split.errors);

  const rawName = split.frontmatter.name;
  const rawDescription = split.frontmatter.description;
  const parsedName =
    typeof rawName === "string" ? skillPackageNameSchema.safeParse(rawName) : null;
  if (!parsedName?.success) {
    errors.push({
      path: "SKILL.md:name",
      message: "Skill name is required and must be lowercase kebab-case"
    });
  }
  if (typeof rawDescription !== "string" || rawDescription.trim().length === 0) {
    errors.push({
      path: "SKILL.md:description",
      message: "Skill description is required"
    });
  }

  const rawAllowedTools =
    split.frontmatter["allowed-tools"] ?? split.frontmatter.allowedTools ?? [];
  const allowedTools = Array.isArray(rawAllowedTools)
    ? rawAllowedTools.map(String).filter(Boolean)
    : [];
  warnings.push(...toolWarnings(allowedTools));

  const metadata = skillPackageMetadataSchema.parse({
    name: parsedName?.success ? parsedName.data : "invalid-skill",
    description:
      typeof rawDescription === "string" && rawDescription.trim()
        ? rawDescription.trim()
        : "Invalid skill package",
    allowedTools,
    raw: split.frontmatter
  });

  const fileInventory = Object.entries(files)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, content]) => ({
      path,
      directory: directoryForPath(path),
      sizeBytes: byteLength(content)
    }));

  return {
    files,
    metadata,
    body: split.body,
    fileInventory,
    validation: {
      ok: errors.length === 0,
      errors,
      warnings
    },
    contentHash: contentHash(files)
  };
}

export function legacyChatManifestToSkillFiles(manifest: {
  name?: string;
  description?: string;
  instructions?: string;
  allowedTools?: string[];
}): Record<string, string> {
  const rawName = String(manifest.name ?? "legacy-skill")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const name = skillPackageNameSchema.safeParse(rawName).success
    ? rawName
    : "legacy-skill";
  const description = String(
    manifest.description ?? `${name} migrated from legacy chat skill`
  ).trim();
  const allowedTools = (manifest.allowedTools ?? [])
    .map((tool) => `  - ${tool}`)
    .join("\n");

  return {
    "SKILL.md": [
      "---",
      `name: ${name}`,
      `description: ${JSON.stringify(description)}`,
      allowedTools ? "allowed-tools:" : "",
      allowedTools,
      "---",
      String(manifest.instructions ?? "").trim() || "用简洁中文回应。"
    ]
      .filter((line) => line !== "")
      .join("\n")
  };
}
