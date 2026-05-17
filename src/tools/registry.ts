import { zodToJsonSchema } from "zod-to-json-schema";
import { createApprovalRequest } from "../db/approvals.js";
import { createToolCall } from "../db/toolCalls.js";
import { addDocumentTool } from "./document/addDocument.js";
import { searchDocumentsTool } from "./document/searchDocuments.js";
import { deleteMemoryTool } from "./memory/deleteMemory.js";
import { saveMemoryTool } from "./memory/saveMemory.js";
import { searchMemoryTool } from "./memory/searchMemory.js";
import { completeTodoTool } from "./todo/completeTodo.js";
import { createTodoTool } from "./todo/createTodo.js";
import { listTodosTool } from "./todo/listTodos.js";
import {
  type AgentTool,
  type ToolExecutionContext,
  type ToolRiskLevel
} from "./types.js";

export const tools = [
  createTodoTool,
  listTodosTool,
  completeTodoTool,
  saveMemoryTool,
  searchMemoryTool,
  deleteMemoryTool,
  addDocumentTool,
  searchDocumentsTool
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

function requiresApproval(riskLevel: ToolRiskLevel): boolean {
  return (
    riskLevel === "write_high" ||
    riskLevel === "external_send" ||
    riskLevel === "destructive"
  );
}

function buildApprovalSummary(input: {
  tool: AgentTool;
  argsJson: string;
}): string {
  return `即将执行高风险工具 ${input.tool.name}。参数：${input.argsJson}`;
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
  allowHighRiskExecution?: boolean;
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
    const normalizedArgsJson = JSON.stringify(args);

    if (requiresApproval(tool.riskLevel) && !input.allowHighRiskExecution) {
      const summary = buildApprovalSummary({
        tool,
        argsJson: normalizedArgsJson
      });
      const approval = await createApprovalRequest({
        userId: input.context.userId,
        chatId: input.context.chatId,
        runId: input.context.runId ?? null,
        toolName: input.toolName,
        toolArgsJson: normalizedArgsJson,
        summary
      });

      return {
        approval: {
          id: approval.id,
          status: approval.status,
          tool_name: approval.toolName,
          summary: approval.summary
        },
        approval_request_created: true,
        requires_user_reply: true,
        next_user_reply_options: ["确认", "取消"],
        message:
          "The approval_request has been created. Stop calling tools now. Tell the user what will be done and ask them to reply 确认 or 取消. Do not say it has been executed."
      };
    }

    const result = await tool.execute(args, input.context);
    const latencyMs = Date.now() - startedAt;

    await createToolCall({
      runId: input.context.runId ?? null,
      userId: input.context.userId,
      chatId: input.context.chatId,
      toolName: input.toolName,
      argsJson: normalizedArgsJson,
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
