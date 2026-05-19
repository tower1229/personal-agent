export interface LlmToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface LlmMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: LlmToolCall[];
  tool_call_id?: string;
}

export interface LlmChatCompletionInput {
  model: string;
  messages: LlmMessage[];
  tools: unknown[];
  tool_choice: "auto";
  stream: false;
}

export interface LlmChatCompletionResult {
  message: LlmMessage | null;
}

export interface LlmClient {
  createChatCompletion(
    input: LlmChatCompletionInput
  ): Promise<LlmChatCompletionResult>;
}
