# Sync Playbook

## Goal

Roll recent session messages into daily chatlog files for cross-group recall.

## Manual Sync Loop

1. Run `node ./scripts/session-chatlog-sync.mjs`.
2. Read the JSON result and confirm `ok: true`.
3. Default mode is incremental archive sync; only add `--prune` during an explicit cleanup rebuild.
4. Use `memory/chatlog/index.jsonl` plus daily md files as the clean recall surface.
5. Only if the script cannot run, fall back to `sessions_list` + `sessions_history(includeTools=false)`.

## Metadata Parsing

- `sessionKey` patterns:
  - `agent:main:onebot:group:<groupId>`
  - `agent:main:main` (owner DM)
- `sessions_list` exposes `transcriptPath`; that is the original raw log.
- In Docker, the raw transcript usually lives under `/home/node/.clawdbot/agents/main/sessions/`.
- `userName/userId` fallback:
  - Parse from user text suffix `[from: <name> (<id>)]`
  - Else set `unknown`

## Dedup Keys

Preferred raw identity: transcript `eventId`

Conversation-level fallback:
- user: `sessionKey + messageId + role`
- assistant mirror dedupe: same role + same normalized text + near-identical timestamp

## Cron Suggestion

Run every 30-60 min with isolated `agentTurn` payload:

- Message: `Use exec to run node ./scripts/session-chatlog-sync.mjs. Verify memory/chatlog is updated.`
- Add `--prune` only for manual cleanup, not for routine cron sync.
- Session target: `isolated`

## Retrieval Pattern

When user asks historical question:
1. use `memory_search` on `memory/chatlog`
2. open referenced md file for context
3. use `sessions_list` -> `transcriptPath` only if you need the raw `.jsonl`
4. answer with concise summary + where it happened
