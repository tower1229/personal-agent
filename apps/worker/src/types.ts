export interface WorkerEnv {
  ASSETS?: Fetcher;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_BOT_USERNAME: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  OWNER_TG_USER_ID: string;
  ADMIN_SESSION_SECRET: string;
}

export interface AdminSessionUser {
  id: number;
  username?: string;
  firstName?: string;
  photoUrl?: string;
}
