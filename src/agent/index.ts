import OpenAI from "openai";
import { env } from "../config/env.js";

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
  baseURL: env.OPENAI_BASE_URL
});

const timeoutMs = 30_000;

export interface GenerateReplyInput {
  input: string;
  userId: string;
  chatId: string;
}

export async function generateReply({
  input
}: GenerateReplyInput): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: env.OPENAI_MODEL,
    messages: [
      {
        role: "system",
        content:
          "You are a concise personal Agent assistant. Reply in the user's language and keep answers practical."
      },
      {
        role: "user",
        content: input
      }
    ],
    stream: false
  }, {
    timeout: timeoutMs
  });

  const output = completion.choices[0]?.message?.content?.trim();

  if (!output) {
    throw new Error("Model returned an empty response");
  }

  return output;
}
