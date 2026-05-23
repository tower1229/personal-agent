import {
  telegramWebhookUpdateSchema,
  type TelegramWebhookUpdate
} from "@personal-agent/shared";

export function parseTelegramUpdate(input: unknown): TelegramWebhookUpdate | null {
  const parsed = telegramWebhookUpdateSchema.safeParse(input);

  return parsed.success ? parsed.data : null;
}

export function getTelegramUpdateUserId(
  update: TelegramWebhookUpdate
): number | null {
  return (
    update.message?.from?.id ??
    update.callback_query?.from.id ??
    null
  );
}

export function getTelegramMessageText(
  update: TelegramWebhookUpdate
): string | null {
  return update.message?.text ?? update.callback_query?.data ?? null;
}

export function getTelegramChatId(
  update: TelegramWebhookUpdate
): number | null {
  return update.message?.chat.id ?? null;
}

export interface TelegramClient {
  sendMessage(input: { chatId: number; text: string }): Promise<void>;
}

export function createTelegramClient(input: {
  botToken: string;
  apiBase?: string;
}): TelegramClient {
  const apiBase = input.apiBase ?? "https://api.telegram.org";

  return {
    async sendMessage(message) {
      const response = await fetch(
        `${apiBase}/bot${input.botToken}/sendMessage`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            chat_id: message.chatId,
            text: message.text
          })
        }
      );

      if (!response.ok) {
        throw new Error(`Telegram sendMessage returned ${response.status}`);
      }
    }
  };
}
