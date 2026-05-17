import { z } from "zod";
import { deleteMemory } from "../../db/memories.js";
import { type AgentTool } from "../types.js";

const deleteMemoryInputSchema = z.object({
  id: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("The single memory id to delete."),
  ids: z
    .array(z.number().int().min(1))
    .min(1)
    .optional()
    .describe("Multiple memory ids to delete only when the user explicitly asks to delete all related memories."),
  reason: z
    .string()
    .min(1)
    .nullable()
    .optional()
    .describe("Why this memory is being deleted.")
}).refine((value) => Boolean(value.id) !== Boolean(value.ids?.length), {
  message: "Provide exactly one of id or ids."
});

export const deleteMemoryTool: AgentTool<typeof deleteMemoryInputSchema> = {
  name: "delete_memory",
  description:
    "Delete long-term memories for the current user. Use one id for normal deletion. Use ids only when the user explicitly asks to delete all related matching memories. If multiple memories match a vague request, ask the user to choose a specific id instead of deleting them all.",
  inputSchema: deleteMemoryInputSchema,
  riskLevel: "destructive",
  async execute(args, context) {
    const ids = args.ids ?? [args.id];
    const deletedMemories = [];

    for (const id of ids) {
      if (!id) {
        continue;
      }

      const memory = await deleteMemory({
        userId: context.userId,
        id,
        sourceRunId: context.runId ?? null,
        reason: args.reason ?? null
      });

      deletedMemories.push(memory);
    }

    return {
      deletedMemories,
      deletedCount: deletedMemories.length
    };
  }
};
