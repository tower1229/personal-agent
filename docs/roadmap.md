# Roadmap

## Near Term

- Improve Admin visual polish after real-world use.
- Add richer run search and filtering.
- Add deployment smoke automation for workers.dev.

## Agent Capability

- Better LLM routing and structured tool planning.
- Search result citation improvements.
- More robust fetch extraction and summarization.
- Optional progress messages for long-running Telegram interactions.
- Improve long-task planning quality and Admin step trace after production use.

## Knowledge And RAG

- Add document ingestion using Cloudflare-native storage.
- Store large artifacts outside D1.
- Add vector search when document ingestion is ready.
- Expose document and retrieval traces in Admin.

## Reliability

- Add D1 backup/export runbook.
- Add alerting around failed scheduled executions and long-task failures.
- Add rate-limit and timeout diagnostics per external provider.
