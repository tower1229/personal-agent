import { z } from "zod";
import { saveMemory } from "../../db/memories.js";
import { memoryTypes } from "../../db/schema.js";
import { type AgentTool } from "../types.js";

const saveMemoryInputSchema = z.object({
  type: z.enum(memoryTypes).describe("The memory category."),
  content: z.string().min(1).describe("The memory content to store."),
  confidence: z
    .number()
    .int()
    .min(0)
    .max(100)
    .default(80)
    .describe("Confidence score from 0 to 100."),
  importance: z
    .number()
    .int()
    .min(0)
    .max(100)
    .default(50)
    .describe("Importance score from 0 to 100."),
  source: z
    .string()
    .min(1)
    .nullable()
    .optional()
    .describe("Optional source label, such as telegram."),
  reason: z
    .string()
    .min(1)
    .nullable()
    .optional()
    .describe("Why this memory is being saved.")
});

export const saveMemoryTool: AgentTool<typeof saveMemoryInputSchema> = {
  name: "save_memory",
  description:
    "Save an explicit long-term memory for the current user. Use only when the user clearly asks to remember or save something.",
  inputSchema: saveMemoryInputSchema,
  riskLevel: "write_low",
  async execute(args, context) {
    const memory = await saveMemory({
      userId: context.userId,
      type: args.type,
      content: args.content,
      confidence: args.confidence,
      importance: args.importance,
      source: args.source ?? "telegram",
      sourceRunId: context.runId ?? null,
      reason: args.reason ?? null
    });

    return {
      memory
    };
  }
};
