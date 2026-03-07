---
name: session-skill
description: Build and maintain cross-group/session memory from chat transcripts into date-rolled Markdown logs plus a lightweight index. Use when the user asks for cross-group memory, historical recall across sessions/groups, daily conversation rollups, or searchable chat archives containing session key, group id/name, and user id/name.
---

# Session Memory Rollup

Maintain cross-session memory without writing channel plugins.

## Do This Workflow

1. Prefer the deterministic sync script, not hand-written rollups:
   - `node ./scripts/session-chatlog-sync.mjs`
   - Use `--prune` only for an operator-approved cleanup rebuild.
2. Treat the script output as the canonical derived archive:
   - `memory/chatlog/index.jsonl`
   - `memory/chatlog/YYYY-MM-DD/<channel>/*.md`
3. Only fall back to `sessions_history(includeTools=false)` when:
   - the sync script is unavailable
   - or you need the newest unsynced tail right now
4. Keep only conversational turns:
   - Include `role=user` and `role=assistant` final text.
   - Skip tool calls, thinking, empty text, `NO_REPLY`, and synthetic system noise.
   - Strip reply directive tags like `[[reply_to_current]]`.
5. Preserve traceability:
   - Every derived file must keep `sessionKey`, `sessionId`, and the raw transcript path.
   - Raw session logs live under `~/.clawdbot/agents/<agentId>/sessions/`.
   - `sessions_list` exposes `transcriptPath`; use it when you need the original `.jsonl`.

## File Layout

- Daily logs and index must follow `references/log-schema.md`.
- Keep one file per conversation surface (`group` or `dm`) per day.
- Use safe file names (replace `/\\:*?"<>|` with `_`).

## Recall Strategy

When the user asks “other groups how did you handle X”, search in this order:
1. `memory_search` for `memory/chatlog/*.md`
2. `memory_get` or `read` on the matching daily md file
3. `sessions_list` to locate `transcriptPath` when the derived log is missing or needs audit
4. `sessions_history(includeTools=false)` only as a short-tail fallback

Prefer quoting concise snippets from archived logs, then summarize.

## Maintenance

If user wants automatic rollup, create a cron job that triggers an isolated agent turn every 30-60 minutes with a prompt like:
- “Run `node ./scripts/session-chatlog-sync.mjs` and verify `memory/chatlog`.”

Keep rollup idempotent:
- The sync script should rewrite files it is actively syncing, but preserve older archived files by default.
- Use `--prune` only when you explicitly want to delete unmatched derived files after confirming the raw `.jsonl` source still exists.
- Raw `.jsonl` transcripts are the source of truth.

## Daily Summary To Permanent Memory

## Recovery Backup SOP

When user asks for disaster recovery / revival backup:
1. Run `scripts/backup-restore-bundle.sh`.
2. Ensure backup bundle includes memory + skills + scripts + extensions.
3. Never upload raw secrets from env/config.
4. Prefer sanitized config output at `backup/restore-bundle/config/clawdbot.sanitized.json`.
5. Push to the configured backup remote after commit.


Create a second daily cron job (once per day, near end of day) that:
1. Reads today's `memory/chatlog/YYYY-MM-DD/*` and `memory/YYYY-MM-DD.md`.
2. Writes a concise “today summary” into `memory/YYYY-MM-DD.md`.
3. Merges lasting decisions/preferences/todos into `MEMORY.md` (rewrite+merge, not blind append).
4. Carries unresolved items into tomorrow's `memory/YYYY-MM-DD.md` seed section.

Rules:
- Keep only durable facts in `MEMORY.md`.
- Keep sensitive details minimal unless explicitly requested.
- Preserve existing long-term preferences and only update changed parts.

## Weekly And Monthly Consolidation

Add two cron jobs:
- Weekly (every Sunday): merge last 7 daily notes into `memory/weekly/YYYY-[W]WW.md`.
- Monthly (1st day): merge recent weekly notes into `memory/monthly/YYYY-MM.md`.

Consolidation rules:
- Keep weekly/monthly files concise and deduplicated.
- Carry only stable preferences/decisions/todos into `MEMORY.md`.
- Avoid copying full raw chat logs into weekly/monthly files.

## Startup Behavior

At session start, load:
- `MEMORY.md` (main session only)
- `memory/YYYY-MM-DD.md` and yesterday file
- `memory/chatlog/index.jsonl` when historical recall is likely
- then apply this skill for recall/rollup

## Raw Log Locations

- Raw session store: `~/.clawdbot/agents/main/sessions/sessions.json`
- Raw per-session transcript: `~/.clawdbot/agents/main/sessions/<sessionId>.jsonl`
- In Docker runtime these usually resolve to `/home/node/.clawdbot/agents/main/sessions/`
- Derived clean archive: `memory/chatlog/YYYY-MM-DD/<channel>/*.md`

If compaction happened and prior turns are no longer visible in the active model context:
1. search `memory/chatlog` first
2. if needed, use `sessions_list` to get `transcriptPath`
3. read the raw `.jsonl` only for audit or repair, not as the normal recall surface

## References

- Log format and folder naming: `references/log-schema.md`
- Suggested operational playbook: `references/sync-playbook.md`
