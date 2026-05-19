import { env } from "../config/env.js";
import { listImportantMemories } from "../db/memories.js";
import { createOpenAiClient } from "../llm/openaiClient.js";
import { type LlmClient, type LlmMessage } from "../llm/types.js";
import { emitProgress, type ProgressHandler } from "../services/progress.js";
import { executeRegisteredTool, getOpenAITools } from "../tools/registry.js";

const maxToolRounds = 8;
const defaultLlmClient = createOpenAiClient();

export interface GenerateReplyInput {
  input: string;
  userId: string;
  chatId: string;
  runId: number;
  onProgress?: ProgressHandler;
  llmClient?: LlmClient;
}

function getCurrentLocalTime(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: env.USER_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date());
}

async function buildMemoryContext(userId: string): Promise<string> {
  const memories = await listImportantMemories({
    userId,
    limit: 10
  });

  if (!memories.length) {
    return "No saved long-term memories for this user.";
  }

  return memories
    .map((memory) =>
      [
        `id=${memory.id}`,
        `type=${memory.type}`,
        `importance=${memory.importance}`,
        `confidence=${memory.confidence}`,
        `content=${memory.content}`
      ].join(" | ")
    )
    .join("\n");
}

export async function generateReply({
  input,
  userId,
  chatId,
  runId,
  onProgress,
  llmClient = defaultLlmClient
}: GenerateReplyInput): Promise<string> {
  const memoryContext = await buildMemoryContext(userId);
  const messages: LlmMessage[] = [
    {
      role: "system",
      content: [
        "You are a concise personal Agent assistant.",
        "When introducing your capabilities, identify yourself as a 个人助理.",
        "Reply in the user's language and keep answers practical.",
        "Do not use Markdown formatting in Telegram replies.",
        "For actions that require approval, clearly tell the user what will be done, the expiration time, and how to approve or cancel.",
        "For destructive operations, never only say 请回复确认. Tell the user to reply exactly 确认 <approval_code>, include the expiry time, describe the operation, and say 回复 取消 可放弃.",
        "Do not claim that a high-risk action was executed unless the approval has already been executed.",
        "Use todo tools when the user asks to create, list, or complete todos.",
        "After completing a todo, include the word 完成 in the final reply.",
        "Use save_memory when the user clearly says to remember something, asks you to remember it later, or asks to save a preference.",
        "After saving memory, include the word 记住 in the final reply.",
        "Use search_memory when the user asks what you remember, what they previously said, or asks about saved preferences or facts.",
        "For memory questions, always call search_memory before answering, even if relevant memories are already present in the injected context.",
        "Do not answer memory questions directly from the injected memory context; use it only as background after search_memory has run.",
        "For memory deletion, do not simulate confirmation in natural language. Destructive deletion must call delete_memory so the tool runtime can create an approval_request.",
        "When the user asks to delete a saved memory, search_memory first unless the user provides an exact numeric memory id. The injected memory context is not sufficient for deletion matching.",
        "If the user provides an exact numeric memory id to delete, call delete_memory with that id so the runtime creates an approval_request, even if the id may not exist.",
        "If exactly one memory matches the delete request, call delete_memory with that id and wait for the tool result before asking the user to reply 确认 or 取消.",
        "If multiple memories match, ask the user to choose the specific id. Do not delete multiple memories by default.",
        "If the user explicitly asks to delete all related memories, call delete_memory with the matching ids so a destructive approval_request is created before asking for confirmation.",
        "After a tool result says approvalRequestCreated is true, stop calling tools. If approvalCodeRequired is true, reply with the summary, operation preview, expiry time, and exact approval format 确认 <approvalCode>. Do not say the action has been executed.",
        "Use add_document when the user asks to save a document, record materials, import knowledge, or store a provided text as knowledge.",
        "Use search_documents when the user asks you to answer based on saved documents, materials, or the knowledge base.",
        "When answering from documents, prioritize the chunks returned by search_documents and use their sourceTitle and chunkIndex as the evidence.",
        "If search_documents returns no relevant chunks, clearly say you did not find relevant information in saved documents.",
        "If retrieved chunks are weak or insufficient, clearly say there is not enough evidence in saved documents.",
        "Keep document-grounded answers concise and, when useful, mention the source as 文档标题 / chunk index.",
        "Do not invent document sources or claim saved documents support an answer unless retrieved chunks support it.",
        "Do not automatically save sensitive information unless the user explicitly asks you to remember it.",
        "When refusing requests for secrets or credentials, do not repeat API keys, token values, or environment variable names from the user.",
        "Never ask the user for user_id or chat_id; they are supplied by the system.",
        "When the user refers to an ordinal todo such as the first todo, list open todos first and then use the matching id.",
        `Current timezone: ${env.USER_TIMEZONE}.`,
        `Current local time: ${getCurrentLocalTime()}.`,
        `Current UTC time: ${new Date().toISOString()}.`,
        `When parsing relative dates like tomorrow or tonight, use ${env.USER_TIMEZONE} unless the user says otherwise.`,
        "Relevant long-term memories for this user:",
        memoryContext
      ].join(" ")
    },
    {
      role: "user",
      content: input
    }
  ];

  for (let round = 0; round < maxToolRounds; round += 1) {
    const completion = await llmClient.createChatCompletion({
      model: env.OPENAI_MODEL,
      messages,
      tools: getOpenAITools(),
      tool_choice: "auto",
      stream: false
    });

    const message = completion.message;

    if (!message) {
      throw new Error("Model returned an empty response");
    }

    messages.push(message);

    if (!message.tool_calls?.length) {
      const output = message.content?.trim();

      if (!output) {
        throw new Error("Model returned an empty response");
      }

      return output;
    }

    for (const toolCall of message.tool_calls) {
      if (toolCall.type !== "function") {
        continue;
      }

      const toolName = toolCall.function.name;

      try {
        await emitProgress(onProgress, {
          type: "tool_start",
          message: `调用工具：${toolName}`,
          toolName
        });

        const result = await executeRegisteredTool({
          toolName,
          argsJson: toolCall.function.arguments,
          context: {
            userId,
            chatId,
            runId
          }
        });

        await emitProgress(onProgress, {
          type: "tool_done",
          message: `工具完成：${toolName}`,
          toolName,
          outcome: "succeeded"
        });

        if (
          result &&
          typeof result === "object" &&
          "approvalRequestCreated" in result
        ) {
          await emitProgress(onProgress, {
            type: "approval_required",
            message: `需要用户确认：${toolName}`,
            toolName
          });
        }

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result)
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        await emitProgress(onProgress, {
          type: "tool_done",
          message: `工具失败：${toolName}`,
          toolName,
          outcome: "failed"
        });

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({
            error: errorMessage
          })
        });
      }
    }
  }

  throw new Error("Agent exceeded maximum tool call rounds");
}
