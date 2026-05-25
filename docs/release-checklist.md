# Release Checklist

## Local Gates

- [ ] `npm run typecheck`
- [ ] `npm run build`
- [ ] `npm test`
- [ ] Confirm Admin SPA routes lazy-load correctly.
- [ ] Confirm Worker tests cover auth, Telegram webhook, skills, schedules, workflows, LLM/search, and run detail.

## Cloudflare

- [ ] D1 migrations applied remotely.
- [ ] Worker secrets present and rotated when needed.
- [ ] `wrangler.toml` points to the intended D1 database and Worker name.
- [ ] Workflow binding and Cron Trigger are enabled.
- [ ] Deploy completed with `npm run deploy:worker`.

## Telegram

- [ ] Webhook points to `/telegram/webhook` on the deployed origin.
- [ ] Webhook secret matches the Worker secret.
- [ ] Telegram Login domain matches the Admin origin.
- [ ] Owner numeric user id is correct.

## Smoke

- [ ] `/api/admin/health` returns ok.
- [ ] `/admin/login` displays Telegram Login.
- [ ] Owner can log in and open overview.
- [ ] Telegram owner message creates a run.
- [ ] Run detail shows tool calls and linked traces.
- [ ] Skill create, draft save, publish, enable/disable, test run, and delete flows work.
- [ ] Schedule create, update, run now, enable/disable, and delete flows work.
- [ ] Settings LLM/search tests show clear results.

## Rollback

Cloudflare deployments can be rolled back from the dashboard or Wrangler deployment history. Keep D1 migrations backward-compatible within a release where possible.
