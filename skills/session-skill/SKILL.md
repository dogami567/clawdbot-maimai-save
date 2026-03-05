---
name: session-skill
description: Build and maintain cross-group/session memory from chat transcripts into date-rolled Markdown logs plus a lightweight index. Use when the user asks for cross-group memory, historical recall across sessions/groups, daily conversation rollups, or searchable chat archives containing session key, group id/name, and user id/name.
---

# Session Memory Rollup

Maintain cross-session memory without writing channel plugins.

## Do This Workflow

1. Get sessions with `sessions_list`.
2. Select target sessions (usually `channel=onebot`, `kind=group|other`).
3. Pull message history with `sessions_history(includeTools=false)`.
4. Keep only conversational turns:
   - Include `role=user` and `role=assistant` text.
   - Skip tool calls, thinking, and empty text.
   - Skip assistant text exactly equal to `NO_REPLY`.
5. Parse metadata:
   - From session key: channel/group/session scope.
   - From user text suffix like `[from: name (id)]` when present.
   - Preserve source `sessionKey` for traceability.
6. Write daily logs under `memory/chatlog/YYYY-MM-DD/...` using the schema in `references/log-schema.md`.
7. Append a flat index line into `memory/chatlog/index.jsonl` for fast recall.

## File Layout

- Daily logs and index must follow `references/log-schema.md`.
- Keep one file per conversation surface (`group` or `dm`) per day.
- Use safe file names (replace `/\\:*?"<>|` with `_`).

## Recall Strategy

When the user asks “other groups how did you handle X”, search in this order:
1. `memory/chatlog/index.jsonl` (fast filter by keyword/group/user/date)
2. Matching daily md files for final context

Prefer quoting concise snippets from archived logs, then summarize.

## Maintenance

If user wants automatic rollup, create a cron job that triggers an isolated agent turn every 30-60 minutes with a prompt like:
- “Run session-skill rollup for today and update `memory/chatlog`.”

Keep rollup idempotent:
- Deduplicate by `sessionKey + messageId + role + timestamp`.
- Do not rewrite old lines unless correcting malformed metadata.

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
- then apply this skill for recall/rollup

## References

- Log format and folder naming: `references/log-schema.md`
- Suggested operational playbook: `references/sync-playbook.md`
