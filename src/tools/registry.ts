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
import { toErrorMessage } from "../utils/errors.js";
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

async function buildApprovalOperation(input: {
  tool: AgentTool;
  args: unknown;
  argsJson: string;
  context: ToolExecutionContext;
}) {
  const customSummary = input.tool.buildOperationSummary
    ? await input.tool.buildOperationSummary(input.args, input.context)
    : null;

  if (customSummary) {
    return customSummary;
  }

  return {
    summary: `即将执行高风险工具 ${input.tool.name}。参数：${input.argsJson}`,
    operationPreview: {
      operation: input.tool.name,
      args: input.args
    }
  };
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
  onToolCallCreated?: (toolCallId: number) => void;
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
      const operation = await buildApprovalOperation({
        tool,
        args,
        argsJson: normalizedArgsJson,
        context: input.context
      });
      const approval = await createApprovalRequest({
        userId: input.context.userId,
        chatId: input.context.chatId,
        runId: input.context.runId ?? null,
        toolName: input.toolName,
        toolArgsJson: normalizedArgsJson,
        summary: operation.summary,
        riskLevel: tool.riskLevel,
        operationSummaryJson: JSON.stringify({
          summary: operation.summary,
          operationPreview: operation.operationPreview
        })
      });

      return {
        approvalRequestId: approval.id,
        riskLevel: approval.riskLevel,
        expiresAt: approval.expiresAt?.toISOString() ?? null,
        approvalCodeRequired: Boolean(approval.approvalCode),
        approvalCode: approval.approvalCode,
        summary: approval.summary,
        operationPreview: operation.operationPreview,
        approvalRequestCreated: true,
        requiresUserReply: true,
        nextUserReplyOptions: approval.approvalCode
          ? [`确认 ${approval.approvalCode}`, "取消"]
          : ["确认", "取消"],
        message: approval.approvalCode
          ? "The approval_request has been created. Stop calling tools now. Tell the user this is a high-risk/destructive operation, what will be done, the expiration time, and the exact reply format: 确认 <approval_code>. Also say 回复 取消 可放弃. Do not say it has been executed."
          : "The approval_request has been created. Stop calling tools now. Tell the user what will be done and ask them to reply 确认 or 取消. Do not say it has been executed."
      };
    }

    const result = await tool.execute(args, input.context);
    const latencyMs = Date.now() - startedAt;

    const toolCall = await createToolCall({
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
    input.onToolCallCreated?.(toolCall.id);

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
