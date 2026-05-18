import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  TELEGRAM_BOT_TOKEN: z.string().min(1, "TELEGRAM_BOT_TOKEN is required"),
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  OPENAI_BASE_URL: z.string().url().optional(),
  OPENAI_MODEL: z.string().min(1).default("deepseek-v4-pro"),
  EMBEDDING_PROVIDER: z.string().min(1).default("openai-compatible"),
  EMBEDDING_MODEL: z.string().min(1).default("text-embedding-3-small"),
  USER_TIMEZONE: z.string().min(1).default("Asia/Shanghai"),
  DATABASE_URL: z.string().min(1).default("data/personal-agent.sqlite"),
  ADMIN_TOKEN: z.string().min(1, "ADMIN_TOKEN is required"),
  ADMIN_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  ADMIN_HOST: z.string().min(1).default("127.0.0.1")
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("Invalid environment variables:");
  console.error(parsedEnv.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsedEnv.data;
