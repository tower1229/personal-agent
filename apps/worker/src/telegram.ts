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
