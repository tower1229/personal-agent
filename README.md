# Personal Agent

Cloudflare-only personal Telegram agent. The runtime is a Cloudflare Worker with D1 persistence, one Cron Trigger for dynamic schedules, and a React Admin SPA served by Workers Static Assets.

## Current Architecture

- Telegram entrypoint: webhook handled by the Worker.
- Admin: React + Vite + Tailwind + shadcn UI at `/admin`.
- Auth: Telegram Login widget, signed HttpOnly owner session cookie.
- Data: Cloudflare D1 migrations under `apps/worker/migrations`.
- Schedules: one minute Cron Trigger polls D1 schedules.
- LLM/Search: OpenAI-compatible chat completions and Brave Search through `fetch` clients.
- Long tasks: complex Telegram requests are classified before the LLM fallback, planned into persisted D1 steps, resumed by Cron, and visible in Admin.

## Repository Layout

```
apps/admin      React Admin SPA
apps/worker     Cloudflare Worker API, Telegram webhook, scheduled handler
packages/shared Shared DTO schemas, constants, and types
docs            Cloudflare-only architecture, deployment, runbooks, and roadmap
```

## Local Development

Install dependencies:

```bash
npm install
```

Create local Worker secrets in `apps/worker/.dev.vars`:

```dotenv
TELEGRAM_BOT_TOKEN=...
TELEGRAM_BOT_USERNAME=...
TELEGRAM_WEBHOOK_SECRET=...
OWNER_TG_USER_ID=...
ADMIN_SESSION_SECRET=...
LLM_API_BASE_URL=https://api.deepseek.com
LLM_API_KEY=...
LLM_MODEL=deepseek-chat
BRAVE_SEARCH_API_KEY=...
```

Run migrations locally:

```bash
npm run d1:migrate:worker:local
```

Start local Worker and Admin assets:

```bash
npm run dev
```

Useful checks:

```bash
npm run typecheck
npm run build
npm test
```

## Deploy

1. Create the D1 database in Cloudflare and set the real id in `apps/worker/wrangler.toml`.
2. Configure Worker secrets with `wrangler secret put` for all sensitive values.
3. Apply remote migrations: `npm run d1:migrate:worker:remote`.
4. Deploy: `npm run deploy:worker`.
5. Configure Telegram webhook and Telegram Login domain to the workers.dev origin.

## Admin

Open `https://<worker-name>.<account>.workers.dev/admin`. Only the configured Telegram owner id can create a valid session. The Admin includes overview, runs trace, skills, schedules, data inspection, approvals, and diagnostics.

## Notes

This repository no longer keeps a supported legacy server path. New development should target Cloudflare Worker, D1, shared schemas, and the React Admin SPA.
