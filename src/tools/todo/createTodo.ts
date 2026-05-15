import { z } from "zod";
import { createTodo as insertTodo } from "../../db/todos.js";
import { type AgentTool } from "../types.js";

function parseDueAt(dueAt: string | null | undefined): Date | null {
  if (!dueAt) {
    return null;
  }

  const date = new Date(dueAt);

  if (Number.isNaN(date.getTime())) {
    throw new Error("due_at must be a valid ISO date string");
  }

  return date;
}

const createTodoInputSchema = z.object({
  title: z.string().min(1).describe("The concise todo title."),
  due_at: z
    .string()
    .datetime()
    .nullable()
    .optional()
    .describe("Optional due date as an ISO 8601 datetime string.")
});

export const createTodoTool: AgentTool<typeof createTodoInputSchema> = {
  name: "create_todo",
  description: "Create a todo for the current Telegram user.",
  inputSchema: createTodoInputSchema,
  riskLevel: "write_low",
  async execute(args, context) {
    const todo = await insertTodo({
      userId: context.userId,
      title: args.title,
      dueAt: parseDueAt(args.due_at)
    });

    return {
      todo
    };
  }
};
