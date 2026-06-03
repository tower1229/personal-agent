import { z } from "zod";
import { type AdminLlmCapability } from "../adminLlmAssist.js";
import { skillRoutingExampleDraftSchema } from "@personal-agent/shared";

export const skillRoutingExamplesGenerateCapability: AdminLlmCapability<
  z.ZodType<any>,
  typeof skillRoutingExampleDraftSchema
> = {
  name: "skill_routing_examples.generate",
  targetType: "skill",
  inputSchema: z.object({
    instruction: z.string().optional(),
    language: z.enum(["zh_conversational", "en", "mixed"]).default("zh_conversational"),
    count: z.number().int().min(1).default(5)
  }),
  draftSchema: skillRoutingExampleDraftSchema,
  assemblePrompt: async (ctx, targetId, input) => {
    const { repositories, ownerTgUserId } = ctx;
    
    // Fetch target skill
    const skill = await repositories.getSkill({ ownerTgUserId, id: targetId });
    if (!skill) throw new Error(`Skill ${targetId} not found`);

    // Fetch existing intents
    const intents = await repositories.listSkillIntents(ownerTgUserId);
    const targetIntents = intents.filter(i => i.skillName === skill.name);

    // Fetch recent route decisions to find conflict context (near-misses)
    const routes = await repositories.listSkillRouteDecisions(ownerTgUserId, 50);
    const conflicts = routes.filter(r => r.matchedSkillId !== targetId && r.candidatesJson.includes(skill.name));
    
    // Assemble context summary for audit
    const contextSummary = `Skill: ${skill.name}\nActive Intents: ${targetIntents.length}\nConflicts evaluated: ${conflicts.length}\nRequested count: ${input.count}, Language: ${input.language}`;

    const systemPrompt = `You are a skill routing examples generation assistant for an AI agent platform.
Your task is to generate natural language routing examples (intents) that users might say to trigger the specified skill.
Output MUST be valid JSON adhering strictly to the provided schema format. Do NOT wrap the JSON in Markdown code blocks.

Schema requirements:
{
  "clusters": [{
    "label": "Group label for these examples",
    "goal": "The user's underlying goal",
    "suggestedExamples": [{
      "exampleText": "The actual text the user says",
      "language": "zh" | "en" | "mixed",
      "source": "skill_description" | "skill_routing_profile" | "route_history" | "user_instruction",
      "confidence": 0.0 - 1.0,
      "rationale": "Why this is a good example",
      "conflictSkillId": "Optional, if it might conflict",
      "conflictSkillName": "Optional"
    }]
  }],
  "rejectedCandidates": [],
  "coverageNotes": ["Note 1", "Note 2"],
  "warnings": []
}

Rules:
- Generate examples based on the skill description.
- Keep them conversational and natural.
- Language preference: ${input.language}.
- Target number of examples: ${input.count}.`;

    const userPrompt = `Generate routing examples for the following skill.
Skill Name: ${skill.name}
Description: ${skill.description}

Existing Examples:
${targetIntents.map(i => "- " + i.intentText).join("\n") || "None"}

${input.instruction ? `Additional Instructions: ${input.instruction}` : ""}

Please output the JSON draft.`;

    return { systemPrompt, userPrompt, contextSummary };
  }
};
