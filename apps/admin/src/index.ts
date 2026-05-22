import { skillManifestSchema } from "@personal-agent/shared";

export const adminAppPlaceholder = {
  app: "personal-agent-admin",
  validatesSkillManifests: true
} as const;

export function validateAdminSkillDraft(input: unknown) {
  return skillManifestSchema.safeParse(input);
}
