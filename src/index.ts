import { startAdminServer } from "./admin/server.js";
import { createTelegramBot } from "./bot/telegram.js";

async function main(): Promise<void> {
  const bot = createTelegramBot();
  const adminServer = startAdminServer();

  await bot.launch();
  console.log("Telegram bot is running.");

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`Received ${signal}, stopping Telegram bot...`);
    bot.stop(signal);
    adminServer.close();
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

main().catch((error) => {
  console.error("Failed to start application:", error);
  process.exit(1);
});
