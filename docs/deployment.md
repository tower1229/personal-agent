# Deployment

This is the production path for the Cloudflare Worker version.

## Prerequisites

- Cloudflare account with Workers, D1, and Workflows enabled.
- Telegram bot token and owner Telegram numeric user id.
- Telegram Login domain configured to the workers.dev origin.
- Optional LLM and Brave Search keys.

## D1

Create the database and update `apps/worker/wrangler.toml` with the real database id.

Apply migrations:

```bash
npm run d1:migrate:worker:remote
```

For local development:

```bash
npm run d1:migrate:worker:local
```

## Secrets

Set secrets from `apps/worker` using Wrangler:

```bash
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_WEBHOOK_SECRET
wrangler secret put OWNER_TG_USER_ID
wrangler secret put ADMIN_SESSION_SECRET
wrangler secret put LLM_API_KEY
wrangler secret put BRAVE_SEARCH_API_KEY
```

Non-secret config can stay in `wrangler.toml` or Cloudflare dashboard variables: `TELEGRAM_BOT_USERNAME`, `LLM_API_BASE_URL`, `LLM_MODEL`, `LLM_MAX_TOOL_ROUNDS`, `FETCH_URL_MAX_BYTES`.

## Build And Deploy

```bash
npm run typecheck
npm run build
npm test
npm run deploy:worker
```

## Telegram Setup

Set the webhook URL to:

```
https://<worker-name>.<account>.workers.dev/telegram/webhook
```

Use the configured webhook secret as Telegram's secret token. Set Telegram Login domain to the same workers.dev origin.

## Smoke Test

- `/api/admin/health` returns `{ ok: true }`.
- `/admin/login` shows the Telegram Login button.
- After login, `/admin` loads overview and navigation.
- A Telegram owner message creates a run visible in Admin.
- Skills, schedules, settings diagnostics, and run detail pages open without client errors.
