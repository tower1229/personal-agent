import { z } from "zod";
import { listOpenTodos } from "../../db/todos.js";
import { type AgentTool } from "../types.js";

const listTodosInputSchema = z.object({});

export const listTodosTool: AgentTool<typeof listTodosInputSchema> = {
  name: "list_todos",
  description: "List open todos for the current Telegram user.",
  inputSchema: listTodosInputSchema,
  riskLevel: "read",
  async execute(_args, context) {
    const todos = await listOpenTodos(context.userId);

    return {
      todos
    };
  }
};
