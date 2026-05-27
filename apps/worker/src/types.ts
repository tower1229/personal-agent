export interface WorkerEnv {
  ASSETS?: Fetcher;
  DB: D1Database;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_BOT_USERNAME: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  OWNER_TG_USER_ID: string;
  ADMIN_SESSION_SECRET: string;
  LLM_API_BASE_URL?: string;
  LLM_API_KEY?: string;
  LLM_MODEL?: string;
  LLM_MAX_TOOL_ROUNDS?: string;
  BRAVE_SEARCH_API_KEY?: string;
  FETCH_URL_MAX_BYTES?: string;
}

export interface AdminSessionUser {
  id: number;
  username?: string;
  firstName?: string;
  photoUrl?: string;
}
