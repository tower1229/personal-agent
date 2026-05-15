import { z } from "zod";
import { completeTodo as markTodoCompleted } from "../../db/todos.js";
import { type AgentTool } from "../types.js";

const completeTodoInputSchema = z.object({
  id: z.number().int().min(1).describe("The todo id to complete.")
});

export const completeTodoTool: AgentTool<typeof completeTodoInputSchema> = {
  name: "complete_todo",
  description: "Complete one open todo by id for the current Telegram user.",
  inputSchema: completeTodoInputSchema,
  riskLevel: "write_low",
  async execute(args, context) {
    const todo = await markTodoCompleted({
      userId: context.userId,
      id: args.id
    });

    return {
      todo
    };
  }
};
