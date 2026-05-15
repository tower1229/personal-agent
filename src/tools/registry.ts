import { zodToJsonSchema } from "zod-to-json-schema";
import { createToolCall } from "../db/toolCalls.js";
import { completeTodoTool } from "./todo/completeTodo.js";
import { createTodoTool } from "./todo/createTodo.js";
import { listTodosTool } from "./todo/listTodos.js";
import { type AgentTool, type ToolExecutionContext } from "./types.js";

export const tools = [
  createTodoTool,
  listTodosTool,
  completeTodoTool
] satisfies AgentTool[];

const toolByName = new Map(tools.map((tool) => [tool.name, tool]));

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function parseToolArgs(argsJson: string): unknown {
  if (!argsJson.trim()) {
    return {};
  }

  return JSON.parse(argsJson);
}

export function getOpenAITools() {
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: `${tool.description} Risk level: ${tool.riskLevel}.`,
      parameters: zodToJsonSchema(tool.inputSchema, {
        target: "openAi"
      })
    }
  }));
}

export async function executeRegisteredTool(input: {
  toolName: string;
  argsJson: string;
  context: ToolExecutionContext;
}): Promise<unknown> {
  const startedAt = Date.now();
  const tool = toolByName.get(input.toolName);
  let parsedArgs: unknown = null;

  try {
    if (!tool) {
      throw new Error(`Unknown tool: ${input.toolName}`);
    }

    parsedArgs = parseToolArgs(input.argsJson);
    const args = tool.inputSchema.parse(parsedArgs);
    const result = await tool.execute(args, input.context);
    const latencyMs = Date.now() - startedAt;

    await createToolCall({
      runId: input.context.runId ?? null,
      userId: input.context.userId,
      chatId: input.context.chatId,
      toolName: input.toolName,
      argsJson: JSON.stringify(parsedArgs),
      resultJson: JSON.stringify(result),
      status: "succeeded",
      error: null,
      latencyMs,
      createdAt: new Date()
    });

    return result;
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const errorMessage = toErrorMessage(error);

    await createToolCall({
      runId: input.context.runId ?? null,
      userId: input.context.userId,
      chatId: input.context.chatId,
      toolName: input.toolName,
      argsJson:
        parsedArgs === null ? input.argsJson : JSON.stringify(parsedArgs),
      resultJson: null,
      status: "failed",
      error: errorMessage,
      latencyMs,
      createdAt: new Date()
    });

    throw error;
  }
}
