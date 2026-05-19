import OpenAI from "openai";
import {
  type ChatCompletion,
  type ChatCompletionCreateParamsNonStreaming
} from "openai/resources/chat/completions";
import { env } from "../config/env.js";
import {
  type LlmChatCompletionInput,
  type LlmChatCompletionResult,
  type LlmClient
} from "./types.js";

const timeoutMs = 30_000;
const maxModelRetries = 2;

function isRetryableModelError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("connection error") ||
    message.includes("econnreset") ||
    message.includes("premature close") ||
    message.includes("socket disconnected")
  );
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function createChatCompletionWithRetry(input: {
  openai: OpenAI;
  params: ChatCompletionCreateParamsNonStreaming;
}): Promise<ChatCompletion> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= maxModelRetries; attempt += 1) {
    try {
      return await input.openai.chat.completions.create(input.params, {
        timeout: timeoutMs
      });
    } catch (error) {
      lastError = error;

      if (attempt >= maxModelRetries || !isRetryableModelError(error)) {
        throw error;
      }

      await sleep(500 * (attempt + 1));
    }
  }

  throw lastError;
}

export function createOpenAiClient(): LlmClient {
  const openai = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    baseURL: env.OPENAI_BASE_URL
  });

  return {
    async createChatCompletion(
      input: LlmChatCompletionInput
    ): Promise<LlmChatCompletionResult> {
      const completion = await createChatCompletionWithRetry({
        openai,
        params: input as ChatCompletionCreateParamsNonStreaming
      });

      return {
        message: completion.choices[0]?.message ?? null
      };
    }
  };
}
