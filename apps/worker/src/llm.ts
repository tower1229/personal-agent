export interface LlmMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: LlmToolCall[];
}

export interface LlmToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: unknown;
  };
}

export interface LlmToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface LlmChatCompletionInput {
  messages: LlmMessage[];
  tools?: LlmToolDefinition[];
  thinkingTier?: "none" | "high" | "max";
}

export interface LlmChatCompletionOutput {
  content: string;
  toolCalls: LlmToolCall[];
}

export interface LlmClient {
  createChatCompletion(
    input: LlmChatCompletionInput
  ): Promise<LlmChatCompletionOutput>;
}

export function normalizeLlmBaseUrl(value: string | undefined): string | null {
  const normalized = value?.trim().replace(/\/+$/, "") ?? "";
  return normalized ? normalized : null;
}

export function parseMaxToolRounds(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "3", 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 8) : 3;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: LlmToolCall[];
    };
  }>;
}

export function createOpenAiCompatibleClient(input: {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  fetcher?: typeof fetch;
}): LlmClient {
  const fetcher = input.fetcher ?? fetch;
  const normalizedBaseUrl = normalizeLlmBaseUrl(input.apiBaseUrl);
  if (!normalizedBaseUrl) {
    throw new Error("LLM_API_BASE_URL is required");
  }
  const endpoint = `${normalizedBaseUrl}/v1/chat/completions`;

  return {
    async createChatCompletion(request) {
      const payload: Record<string, unknown> = {
        model: input.model,
        messages: request.messages,
        tools: request.tools,
        tool_choice: request.tools?.length ? "auto" : undefined,
        stream: false
      };

      if (request.thinkingTier === "none") {
        payload.thinking = { type: "disabled" };
      } else if (request.thinkingTier === "high") {
        payload.thinking = { type: "enabled" };
        payload.reasoning_effort = "high";
      } else if (request.thinkingTier === "max") {
        payload.thinking = { type: "enabled" };
        payload.reasoning_effort = "max";
      }

      const response = await fetcher(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${input.apiKey}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`LLM chat completion returned ${response.status}`);
      }

      const body = (await response.json()) as ChatCompletionResponse;
      const message = body.choices?.[0]?.message;
      if (!message) {
        throw new Error("LLM chat completion returned no message");
      }

      return {
        content: message.content ?? "",
        toolCalls: message.tool_calls ?? []
      };
    }
  };
}
