import { db } from "./client.js";
import { type NewToolCall, type ToolCall, toolCalls } from "./schema.js";

export async function createToolCall(toolCall: NewToolCall): Promise<ToolCall> {
  const created = await db.insert(toolCalls).values(toolCall).returning();
  const row = created[0];

  if (!row) {
    throw new Error("Failed to create tool call");
  }

  return row;
}
