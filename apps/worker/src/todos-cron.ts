import { type BotRuntime } from "./bot.js";

const ADVANCE_THRESHOLD = 15 * 60 * 1000; // 15 minutes

export async function checkDueTodos(input: {
  runtime: BotRuntime;
  now: number;
}) {
  const { runtime, now } = input;
  const todos = await runtime.repositories.pollDueTodos(now, ADVANCE_THRESHOLD);

  for (const todo of todos) {
    if (todo.dueAt) {
      const minutesRemaining = Math.max(0, Math.round((todo.dueAt - now) / 60000));
      const text = `提醒 ⏰：待办「${todo.title}」将在约 ${minutesRemaining} 分钟后到期！`;
      try {
        await runtime.telegramClient.sendMessage({
          chatId: todo.ownerTgUserId,
          text
        });
        await runtime.repositories.markTodoReminded(todo.id, now);
      } catch (error) {
        console.error(`Failed to send due todo reminder for todo ${todo.id}`, error);
      }
    }
  }

  return {
    dueTodosChecked: todos.length
  };
}
