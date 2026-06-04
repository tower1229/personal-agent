import {
  type PersonalModelLayer,
  type PersonalModelScenario,
  personalModelLayers,
  personalModelScenarios
} from "@personal-agent/shared";
import { type LlmClient } from "./llm.js";
import { type PersonalModelClaimRecord } from "./repositories.js";

export interface ProposedClaimProposal {
  claim: string;
  layer: PersonalModelLayer;
  scenario: PersonalModelScenario;
  reason: string;
}

export function cleanAndParseJson(text: string): any {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, "");
    cleaned = cleaned.replace(/\n?```$/, "");
    cleaned = cleaned.trim();
  }
  return JSON.parse(cleaned);
}

export async function reflectAndProposeClaims(input: {
  llmClient: LlmClient;
  inputText: string;
  responseText: string;
  existingClaims: PersonalModelClaimRecord[];
}): Promise<ProposedClaimProposal[]> {
  const existingClaimsText = input.existingClaims.length > 0
    ? input.existingClaims.map(c => `- [${c.status}] [layer: ${c.layer}, scenario: ${c.scenario}] ${c.claim}`).join("\n")
    : "No existing claims.";

  const systemPrompt = `You are a metacognitive reflection module for a personal agent.
Analyze the latest user message and the agent's response to determine if the user has explicitly or implicitly expressed a personal characteristic, preference, fact, habit, or boundary that should be proposed for the agent's long-term "Personal Model".

Specifically, look for statements indicating:
1. Writing preferences/habits (e.g. preferred phrasing, style constraints, original vs external).
2. Explicit user preferences (e.g. "I prefer shorter answers", "I like using X").
3. Explicit corrections of the agent's understanding (e.g. "No, actually I am self-employed", "Don't assume I know React").
4. Commands to remember (e.g. "remember this", "from now on, please...").

Do not propose any claim that is identical or highly similar to the existing claims listed below. In particular, NEVER propose a claim that was rejected in the past (represented by 'deleted' or 'deprecated' status in the list below).

Existing claims:
${existingClaimsText}

If a relevant characteristic is found, formulate the proposed claim from the agent's perspective about the user (e.g. "用户在晚上写作时容易分心", "用户偏好直接且不带修饰的回复风格").

Your output MUST be a valid JSON object conforming exactly to this schema:
{
  "proposals": [
    {
      "claim": string, // The proposed claim about the user. Max 100 characters.
      "layer": "fact" | "preference" | "pattern" | "value" | "interpretation_framework" | "boundary" | "positive_resource" | "negative_pattern" | "current_state",
      "scenario": "global" | "writing" | "health" | "relationship" | "self_knowledge" | "emotional_support" | "work_decision" | "technical_writing" | "technical_collaboration" | "life_decision",
      "reason": string // Detailed reason why this is proposed based on the interaction.
    }
  ]
}

If no new claims should be proposed, return:
{
  "proposals": []
}

Output ONLY the JSON object. Do not include markdown code block syntax (like \`\`\`json) unless requested, but be prepared that your output must be parseable. No other conversational text.`;

  const userPrompt = `User message: "${input.inputText}"\nAgent response: "${input.responseText}"`;

  try {
    const completion = await input.llmClient.createChatCompletion({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      thinkingTier: "max"
    });

    if (!completion.content) {
      return [];
    }

    const data = cleanAndParseJson(completion.content);
    if (!data || !Array.isArray(data.proposals)) {
      return [];
    }

    const proposals: ProposedClaimProposal[] = [];
    for (const raw of data.proposals) {
      if (typeof raw.claim !== "string" || !raw.claim.trim()) {
        continue;
      }

      // Validate layer
      let layer: PersonalModelLayer = "preference";
      if (raw.layer && personalModelLayers.includes(raw.layer as PersonalModelLayer)) {
        layer = raw.layer as PersonalModelLayer;
      }

      // Validate scenario
      let scenario: PersonalModelScenario = "global";
      if (raw.scenario && personalModelScenarios.includes(raw.scenario as PersonalModelScenario)) {
        scenario = raw.scenario as PersonalModelScenario;
      }

      proposals.push({
        claim: raw.claim.trim(),
        layer,
        scenario,
        reason: typeof raw.reason === "string" ? raw.reason.trim() : "Conversation observation."
      });
    }

    return proposals;
  } catch (error) {
    console.error("Failed to run metacognitive reflection:", error);
    return [];
  }
}
