# Demo Script

## 1. Admin Login

Open the workers.dev Admin URL at `/admin`. Use Telegram Login with the owner account. Verify the overview cards and system status.

## 2. Telegram Core Bot

Send these messages from the owner account:

- `/start`
- `?????????`
- `??????`
- `????????? Cloudflare D1`
- `???? Cloudflare`

Open Admin runs and confirm run trace plus tool calls are recorded.

## 3. Skills

Create a chat skill in Admin, add a trigger phrase, publish it, enable it, then trigger it from Telegram. Verify skill route decision, skill run, and tool calls in run detail.

Create a workflow skill with supported steps, publish it, then trigger it with `/skill <id> input`. Verify workflow run and step timeline.

## 4. Schedules

Create a daily schedule with a built-in command text. Run it manually with Run now, then check schedule executions and the generated run.

## 5. Diagnostics

Open Settings and run the LLM and search test actions. Confirm success and failure messages are visible without exposing secrets.
