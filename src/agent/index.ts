import OpenAI from "openai";
import {
  type ChatCompletionMessageParam,
  type ChatCompletionToolMessageParam
} from "openai/resources/chat/completions";
import { env } from "../config/env.js";
import { listImportantMemories } from "../db/memories.js";
import { executeRegisteredTool, getOpenAITools } from "../tools/registry.js";

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
  baseURL: env.OPENAI_BASE_URL
});

const timeoutMs = 30_000;
const maxToolRounds = 8;

export interface GenerateReplyInput {
  input: string;
  userId: string;
  chatId: string;
  runId: number;
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
  runId
}: GenerateReplyInput): Promise<string> {
  const memoryContext = await buildMemoryContext(userId);
  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: [
        "You are a concise personal Agent assistant.",
        "Reply in the user's language and keep answers practical.",
        "Do not use Markdown formatting in Telegram replies.",
        "For actions that require approval, clearly tell the user what will be done and ask them to reply 确认 or 取消.",
        "Do not claim that a high-risk action was executed unless the approval has already been executed.",
        "Use todo tools when the user asks to create, list, or complete todos.",
        "Use save_memory when the user clearly says to remember something, asks you to remember it later, or asks to save a preference.",
        "Use search_memory when the user asks what you remember, what they previously said, or asks about saved preferences or facts.",
        "For memory questions, always call search_memory before answering, even if relevant memories are already present in the injected context.",
        "For memory deletion, do not simulate confirmation in natural language. Destructive deletion must call delete_memory so the tool runtime can create an approval_request.",
        "When the user asks to delete a saved memory, search_memory first unless the user provides an exact numeric memory id. The injected memory context is not sufficient for deletion matching.",
        "If the user provides an exact numeric memory id to delete, call delete_memory with that id so the runtime creates an approval_request, even if the id may not exist.",
        "If exactly one memory matches the delete request, call delete_memory with that id and wait for the tool result before asking the user to reply 确认 or 取消.",
        "If multiple memories match, ask the user to choose the specific id. Do not delete multiple memories by default.",
        "If the user explicitly asks to delete all related memories, call delete_memory with the matching ids so a destructive approval_request is created before asking for confirmation.",
        "After a tool result says an approval_request was created, stop calling tools and reply to the user with what will be done and that they should reply 确认 or 取消.",
        "Use add_document when the user asks to save a document, record materials, import knowledge, or store a provided text as knowledge.",
        "Use search_documents when the user asks you to answer based on saved documents, materials, or the knowledge base.",
        "If search_documents returns no relevant chunks, clearly say you did not find relevant information in saved documents.",
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
    const completion = await openai.chat.completions.create({
      model: env.OPENAI_MODEL,
      messages,
      tools: getOpenAITools(),
      tool_choice: "auto",
      stream: false
    }, {
      timeout: timeoutMs
    });

    const message = completion.choices[0]?.message;

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

      try {
        const result = await executeRegisteredTool({
          toolName: toolCall.function.name,
          argsJson: toolCall.function.arguments,
          context: {
            userId,
            chatId,
            runId
          }
        });

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result)
        } satisfies ChatCompletionToolMessageParam);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({
            error: errorMessage
          })
        } satisfies ChatCompletionToolMessageParam);
      }
    }
  }

  throw new Error("Agent exceeded maximum tool call rounds");
}
