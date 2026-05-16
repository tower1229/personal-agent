import { z } from "zod";
import { deleteMemory } from "../../db/memories.js";
import { type AgentTool } from "../types.js";

const deleteMemoryInputSchema = z.object({
  id: z.number().int().min(1).describe("The memory id to delete."),
  reason: z
    .string()
    .min(1)
    .nullable()
    .optional()
    .describe("Why this memory is being deleted.")
});

export const deleteMemoryTool: AgentTool<typeof deleteMemoryInputSchema> = {
  name: "delete_memory",
  description:
    "Delete one long-term memory by id for the current user. If the user says delete this memory without an id, search memories first.",
  inputSchema: deleteMemoryInputSchema,
  riskLevel: "write_low",
  async execute(args, context) {
    const memory = await deleteMemory({
      userId: context.userId,
      id: args.id,
      sourceRunId: context.runId ?? null,
      reason: args.reason ?? null
    });

    return {
      deletedMemory: memory
    };
  }
};
