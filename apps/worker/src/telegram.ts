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
  return update.message?.chat.id ?? update.callback_query?.message?.chat.id ?? null;
}

export interface TelegramMessageResponse {
  messageId: number;
}

export interface TelegramClient {
  sendMessage(input: { chatId: number; text: string; replyMarkup?: unknown }): Promise<TelegramMessageResponse>;
  editMessageText(input: { chatId: number; messageId: number; text: string; replyMarkup?: unknown }): Promise<void>;
  deleteMessage(input: { chatId: number; messageId: number }): Promise<void>;
  sendChatAction(input: { chatId: number; action: string }): Promise<void>;
  answerCallbackQuery(input: { callbackQueryId: string; text?: string; showAlert?: boolean }): Promise<void>;
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
            text: message.text,
            ...(message.replyMarkup ? { reply_markup: message.replyMarkup } : {})
          })
        }
      );

      if (!response.ok) {
        throw new Error(`Telegram sendMessage returned ${response.status}`);
      }
      
      const data = await response.json() as { ok: boolean; result: { message_id: number } };
      if (!data.ok || !data.result?.message_id) {
        throw new Error(`Telegram sendMessage failed or no message_id returned: ${JSON.stringify(data)}`);
      }
      
      return { messageId: data.result.message_id };
    },
    async editMessageText(inputData) {
      const response = await fetch(
        `${apiBase}/bot${input.botToken}/editMessageText`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            chat_id: inputData.chatId,
            message_id: inputData.messageId,
            text: inputData.text,
            ...(inputData.replyMarkup ? { reply_markup: inputData.replyMarkup } : {})
          })
        }
      );

      if (!response.ok) {
        throw new Error(`Telegram editMessageText returned ${response.status}`);
      }
    },
    async deleteMessage(inputData) {
      const response = await fetch(
        `${apiBase}/bot${input.botToken}/deleteMessage`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            chat_id: inputData.chatId,
            message_id: inputData.messageId
          })
        }
      );

      if (!response.ok) {
        throw new Error(`Telegram deleteMessage returned ${response.status}`);
      }
    },
    async sendChatAction(inputData) {
      const response = await fetch(
        `${apiBase}/bot${input.botToken}/sendChatAction`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            chat_id: inputData.chatId,
            action: inputData.action
          })
        }
      );

      if (!response.ok) {
        throw new Error(`Telegram sendChatAction returned ${response.status}`);
      }
    },
    async answerCallbackQuery(inputData) {
      const response = await fetch(
        `${apiBase}/bot${input.botToken}/answerCallbackQuery`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            callback_query_id: inputData.callbackQueryId,
            ...(inputData.text ? { text: inputData.text } : {}),
            ...(inputData.showAlert ? { show_alert: inputData.showAlert } : {})
          })
        }
      );

      if (!response.ok) {
        throw new Error(`Telegram answerCallbackQuery returned ${response.status}`);
      }
    }
  };
}
