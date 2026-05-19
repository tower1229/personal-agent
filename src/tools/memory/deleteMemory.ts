import { z } from "zod";
import { deleteMemory, getMemoriesByIds } from "../../db/memories.js";
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
  async buildOperationSummary(args, context) {
    const ids = args.ids ?? (args.id ? [args.id] : []);
    const memories = await getMemoriesByIds({
      userId: context.userId,
      ids
    });
    const memoryById = new Map(memories.map((memory) => [memory.id, memory]));
    const missingIds = ids.filter((id) => !memoryById.has(id));
    const preview = ids.slice(0, 10).map((id) => {
      const memory = memoryById.get(id);

      return {
        id,
        exists: Boolean(memory),
        content: memory?.content ?? null,
        type: memory?.type ?? null
      };
    });

    if (ids.length === 1) {
      const id = ids[0] as number;
      const memory = memoryById.get(id);

      return {
        summary: memory
          ? `将删除 1 条记忆：id=${id}，content=${memory.content}`
          : `将尝试删除 1 条记忆：id=${id}，但当前目标可能不存在。`,
        operationPreview: {
          operation: "delete_memory",
          mode: "single",
          id,
          exists: Boolean(memory),
          content: memory?.content ?? null,
          reason: args.reason ?? null
        }
      };
    }

    return {
      summary: `将删除 ${ids.length} 条记忆。预览前 ${Math.min(
        ids.length,
        10
      )} 条；其中 ${missingIds.length} 条当前可能不存在。`,
      operationPreview: {
        operation: "delete_memory",
        mode: "batch",
        count: ids.length,
        preview,
        missingIds,
        reason: args.reason ?? null
      }
    };
  },
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
