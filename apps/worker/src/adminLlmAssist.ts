import { z } from "zod";
import { type WorkerEnv } from "./types.js";
import { type AgentRepositories } from "./repositories.js";
import { createOpenAiCompatibleClient, normalizeLlmBaseUrl } from "./llm.js";

export interface AdminLlmContext {
  env: WorkerEnv;
  repositories: AgentRepositories;
  ownerTgUserId: number;
}

export interface AdminLlmCapability<InputSchema extends z.ZodType, DraftSchema extends z.ZodType> {
  name: string;
  targetType: string;
  inputSchema: InputSchema;
  draftSchema: DraftSchema;
  assemblePrompt: (
    ctx: AdminLlmContext,
    targetId: string,
    input: z.infer<InputSchema>
  ) => Promise<{ systemPrompt: string; userPrompt: string; contextSummary: string }>;
}

export class AdminLlmAssistService {
  private capabilities = new Map<string, AdminLlmCapability<any, any>>();

  register(capability: AdminLlmCapability<any, any>) {
    this.capabilities.set(capability.name, capability);
  }

  async run(ctx: AdminLlmContext, capabilityName: string, targetId: string, input: any) {
    const capability = this.capabilities.get(capabilityName);
    if (!capability) {
      throw new Error(`Unknown capability: ${capabilityName}`);
    }

    const { env, repositories, ownerTgUserId } = ctx;
    
    // Check LLM config
    const apiBaseUrl = normalizeLlmBaseUrl(env.LLM_API_BASE_URL);
    const apiKey = env.LLM_API_KEY;
    const model = env.LLM_MODEL ?? "gpt-4o";
    
    if (!apiBaseUrl || !apiKey) {
      throw new Error("LLM is not configured");
    }

    const llm = createOpenAiCompatibleClient({ apiBaseUrl, apiKey, model });

    // Validate input
    const parsedInput = capability.inputSchema.parse(input);

    // Assemble prompt
    const { systemPrompt, userPrompt, contextSummary } = await capability.assemblePrompt(ctx, targetId, parsedInput);

    // Create run record
    const runId = crypto.randomUUID();
    const now = Date.now();
    await repositories.createAdminAssistRun({
      id: runId,
      capability: capability.name,
      targetType: capability.targetType,
      targetId,
      status: "running",
      model,
      draftJson: null,
      warningsJson: null,
      promptVersion: "1.0",
      contextSummary,
      ownerTgUserId,
      createdAt: now,
      completedAt: null
    });

    try {
      // Bounded retry for JSON parsing
      let attempt = 0;
      let lastError: Error | null = null;
      let parsedDraft: any = null;
      let rawContent = "";
      
      while (attempt < 3) {
        attempt++;
        const response = await llm.createChatCompletion({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt + (lastError ? `\n\nFix this JSON error: ${lastError.message}` : "") }
          ],
          thinkingTier: "max"
        });

        rawContent = response.content.replace(/^```json/, "").replace(/```$/, "").trim();
        
        try {
          const json = JSON.parse(rawContent);
          parsedDraft = capability.draftSchema.parse(json);
          break; // Success
        } catch (e) {
          lastError = e instanceof Error ? e : new Error(String(e));
        }
      }

      if (!parsedDraft) {
        const warnings = [lastError?.message ?? "Failed to parse LLM output as JSON"];
        await repositories.updateAdminAssistRun({
          id: runId,
          ownerTgUserId,
          status: "failed",
          warningsJson: JSON.stringify(warnings),
          completedAt: Date.now()
        });
        return { assistRunId: runId, draft: null, warnings };
      }

      // Record success
      await repositories.updateAdminAssistRun({
        id: runId,
        ownerTgUserId,
        status: "completed",
        draftJson: JSON.stringify(parsedDraft),
        completedAt: Date.now()
      });

      return { assistRunId: runId, draft: parsedDraft, warnings: [] };
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      await repositories.updateAdminAssistRun({
        id: runId,
        ownerTgUserId,
        status: "failed",
        warningsJson: JSON.stringify([errorMsg]),
        completedAt: Date.now()
      });
      return { assistRunId: runId, draft: null, warnings: [errorMsg] };
    }
  }
}
