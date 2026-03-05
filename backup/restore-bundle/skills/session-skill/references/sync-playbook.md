# Sync Playbook

## Goal

Roll recent session messages into daily chatlog files for cross-group recall.

## Manual Sync Loop

1. Call `sessions_list(limit=100, messageLimit=1)`.
2. Pick active sessions you care about.
3. For each session, call `sessions_history(sessionKey, includeTools=false, limit=200)`.
4. Extract text turns and metadata.
5. Append formatted entries to daily md + `index.jsonl`.
6. Deduplicate against existing `messageId` (or fallback hash).

## Metadata Parsing

- `sessionKey` patterns:
  - `agent:main:onebot:group:<groupId>`
  - `agent:main:main` (owner DM)
- `userName/userId` fallback:
  - Parse from user text suffix `[from: <name> (<id>)]`
  - Else set `unknown`

## Dedup Keys

Preferred: `sessionKey + messageId + role`

Fallback (if no `messageId`):
`sessionKey + role + timestamp + sha1(text)`

## Cron Suggestion

Run every 30-60 min with isolated `agentTurn` payload:

- Message: `Run session-skill rollup for today. Update memory/chatlog and keep idempotent.`
- Session target: `isolated`

## Retrieval Pattern

When user asks historical question:
1. grep `index.jsonl` by keyword/group/user/date
2. open referenced md file for context
3. answer with concise summary + where it happened
