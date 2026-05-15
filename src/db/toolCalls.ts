import { db } from "./client.js";
import { type NewToolCall, toolCalls } from "./schema.js";

export async function createToolCall(toolCall: NewToolCall): Promise<void> {
  await db.insert(toolCalls).values(toolCall);
}
