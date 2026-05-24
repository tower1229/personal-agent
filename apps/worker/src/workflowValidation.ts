import {
  type BuiltInToolName,
  type SkillManifest
} from "@personal-agent/shared";

const supportedWorkflowStepTypes = new Set([
  "tool",
  "wait",
  "send_telegram",
  "llm",
  "web_search",
  "fetch_url"
]);

export function unsupportedWorkflowStepTypes(
  manifest: SkillManifest
): string[] {
  return manifest.workflowTemplate
    .map((item) => item.type)
    .filter((type) => !supportedWorkflowStepTypes.has(type));
}

function requiredToolForStep(type: string): BuiltInToolName | null {
  if (type === "web_search" || type === "fetch_url") {
    return type;
  }

  return null;
}

export function unauthorizedWorkflowStepTools(
  manifest: SkillManifest
): BuiltInToolName[] {
  const allowedTools = new Set(manifest.allowedTools);
  return Array.from(
    new Set(
      manifest.workflowTemplate
        .map((item) => requiredToolForStep(item.type))
        .filter((tool): tool is BuiltInToolName => tool !== null)
        .filter((tool) => !allowedTools.has(tool))
    )
  );
}
