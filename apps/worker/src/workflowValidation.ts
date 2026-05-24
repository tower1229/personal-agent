import { type SkillManifest } from "@personal-agent/shared";

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
