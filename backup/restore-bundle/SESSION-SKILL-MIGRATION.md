# Clawdbot Session-Skill / Chatlog Migration Guide

## 中文速览

这份文档讲的是 4 件事：

1. 这次怎么把 `session-skill` 从“靠提示词整理”改成“靠脚本确定性归档”
2. 历史聊天现在分别存在哪：
   - 原始会话：`.runtime/config/agents/main/sessions/`
   - 干净归档：`.runtime/workspace/memory/chatlog/`
3. 迁移到另一台机器时，最少要复制哪些文件
4. 另一个 AI 如果要继续改，应该从哪些文件下手

如果你想把“这台机器上的重要 session”一起迁走，最重要的是复制这几个目录：

```text
.runtime/config/agents/main/sessions/
.runtime/workspace/memory/
.runtime/workspace/skills/session-skill/
.runtime/workspace/scripts/session-chatlog-sync.mjs
```

迁移后建议立刻执行：

```sh
cd /home/node/clawd
node ./scripts/session-chatlog-sync.mjs --dry-run
node ./scripts/session-chatlog-sync.mjs
docker compose up -d --force-recreate clawdbot-gateway
```

核心原则只有一句：

- 原始 `.jsonl` 是真源
- `memory/chatlog` 是给模型回查用的干净副本
- `session-skill` 先查干净副本，不够再回原始日志
- 不要只靠 prompt 解决上下文压缩后的失忆问题

## Purpose

This guide explains how the current session-history fix was implemented in this private Clawdbot runtime, and how another AI should reproduce or modify it on another machine.

Scope:

- preserve important QQ / OneBot conversation history
- make history survive model compaction
- give the agent a clean, searchable recall surface
- keep raw session logs as source of truth
- keep the existing `session-skill` workflow, but make it deterministic

This guide is runtime-focused. The changes live under `.runtime/` and do not require upstream Clawdbot core changes.

## Problem This Solves

Before this change:

- active sessions were stored in raw `.jsonl` logs, but those are awkward for the model to reuse directly
- `session-skill` rollup relied too much on ad-hoc prompt behavior
- derived logs were noisy:
  - duplicate entries
  - `[[reply_to_current]]`
  - `NO_REPLY`
  - tool/thinking chatter
  - synthetic cron / exec system text mixed into user history
- after context compaction, the model often could not reliably see earlier useful chat content unless it explicitly re-opened raw history

After this change:

- raw logs remain the source of truth
- a deterministic sync script builds a clean archive under `memory/chatlog/`
- `session-skill` is instructed to use the clean archive first, then raw `.jsonl` only as audit / fallback
- the archive is searchable through existing `memory_search`

## High-Level Design

There are now 2 history layers:

1. Raw session layer

- real-time source of truth
- stored in `~/.clawdbot/agents/main/sessions/`
- includes all runtime events, including tool and thinking records

2. Derived clean archive layer

- stored in `memory/chatlog/`
- contains only `user` and `assistant` final text
- strips reply tags, tool chatter, thinking, and synthetic system noise
- optimized for model recall and search

The agent should treat them like this:

1. search `memory/chatlog` first
2. read the matched daily markdown file
3. use raw `.jsonl` only if the archive is missing or an audit is needed

## Files Added Or Changed

### Runtime workspace

- `scripts/session-chatlog-sync.mjs`
- `skills/session-skill/SKILL.md`
- `skills/session-skill/references/log-schema.md`
- `skills/session-skill/references/sync-playbook.md`
- `SESSION-SKILL-MIGRATION.md` (this guide)

### Runtime config

- `../config/cron/jobs.json`

### Backup / restore mirror

Mirror the same files into:

- `backup/restore-bundle/scripts/session-chatlog-sync.mjs`
- `backup/restore-bundle/skills/session-skill/SKILL.md`
- `backup/restore-bundle/skills/session-skill/references/log-schema.md`
- `backup/restore-bundle/skills/session-skill/references/sync-playbook.md`
- `backup/restore-bundle/SESSION-SKILL-MIGRATION.md`

## Current Docker Layout

This runtime is mounted like this:

```yaml
services:
  clawdbot-gateway:
    volumes:
      - D:/xiangmu/clawdbot/.runtime/home:/home/node
      - D:/xiangmu/clawdbot/.runtime/config:/home/node/.clawdbot
      - D:/xiangmu/clawdbot/.runtime/workspace:/home/node/clawd
```

Equivalent meaning on another machine:

- runtime config dir is mounted to `/home/node/.clawdbot`
- runtime workspace dir is mounted to `/home/node/clawd`

The sync script is meant to run from the workspace root:

```sh
cd /home/node/clawd
node ./scripts/session-chatlog-sync.mjs
```

## Raw Session Locations

Important files:

- session store:
  - `~/.clawdbot/agents/main/sessions/sessions.json`
- raw transcript files:
  - `~/.clawdbot/agents/main/sessions/<sessionId>.jsonl`

In this Docker setup these resolve to:

- `/home/node/.clawdbot/agents/main/sessions/sessions.json`
- `/home/node/.clawdbot/agents/main/sessions/<sessionId>.jsonl`

If you want to preserve the important existing session when moving to another machine, copy this entire directory:

```text
.runtime/config/agents/main/sessions/
```

That is the real historical source. If this directory is lost, the clean archive can help, but the raw fidelity is gone.

## Clean Archive Layout

Generated output:

```text
memory/chatlog/index.jsonl
memory/chatlog/YYYY-MM-DD/<channel>/*.md
```

Examples:

- `memory/chatlog/2026-03-06/onebot/dm-281894872-dogami.md`
- `memory/chatlog/2026-03-06/onebot/group-974862433-unknown.md`

The markdown files contain:

- date
- channel
- chatType
- group or user metadata
- `sessionKey`
- `sessionId`
- raw `sessionFile`
- ordered user / assistant text entries

## What The Sync Script Does

Script:

- `scripts/session-chatlog-sync.mjs`

Core behavior:

1. read `sessions.json`
2. resolve each session's raw `.jsonl`
3. include only conversation surfaces worth recalling:
   - group chats
   - DMs
   - main owner session `agent:main:main`
4. keep only `type=message` with:
   - `role=user`
   - `role=assistant`
5. extract only `content[].type === "text"`
6. clean the text:
   - remove `[[reply_to_current]]`
   - remove `[[reply_to:...]]`
   - skip `NO_REPLY`
   - skip tool/thinking blocks
   - skip synthetic system noise such as cron / exec completion text
   - normalize OneBot wrapper text to actual user utterance
7. dedupe near-duplicates
8. write deterministic markdown files and `index.jsonl`

## Important Script Details

### Config-root resolution

The script must work in 2 environments:

1. inside Docker runtime
2. from the Windows host workspace

So config root resolution is:

1. `CLAWDBOT_CONFIG_DIR` if set
2. local runtime config sibling (`../config`) if it contains the session store
3. fallback to `~/.clawdbot`

Reason:

- on host, the raw logs live in `.runtime/config`
- inside container, they live at `/home/node/.clawdbot`

### Transcript-path resolution

Some session records contain container-native paths like:

```text
/home/node/.clawdbot/agents/main/sessions/<id>.jsonl
```

Those do not exist on Windows host.

So the script resolves transcript path in this order:

1. `entry.sessionFile` if it exists
2. `sessionsDir + basename(entry.sessionFile)`
3. `sessionsDir/<sessionId>.jsonl`

This is required for host-side rebuilds.

### Channel resolution

Prefer channel metadata in this order:

1. `deliveryContext.channel`
2. `lastChannel`
3. `channel`

Reason:

- the main owner session may show `channel=whatsapp` historically
- but the latest actionable session may actually be `onebot`
- the clean archive should reflect the current delivery surface

### Chat-type normalization

Normalize these values to `dm`:

- `direct`
- `private`

Reason:

- some sessions use `direct` instead of `dm`
- the archive layout should stay stable

### Incremental archive by default

The script now preserves older archive files by default.

Routine runs should:

- rewrite files that are actively being synced
- keep older matching archive files in place
- update `index.jsonl`

Use `--prune` only for operator-approved cleanup.

Reason:

- if the session store rotates or only exposes a subset of sessions, a destructive rebuild would erase older useful history

## Current Session-Skill Behavior

`skills/session-skill/SKILL.md` was updated so the agent now prefers:

1. `memory/chatlog/index.jsonl`
2. `memory/chatlog/YYYY-MM-DD/<channel>/*.md`
3. raw `.jsonl` via `sessions_list` / `transcriptPath` only when needed

Key rules now documented there:

- clean archive is canonical derived recall surface
- raw `.jsonl` is source of truth
- use `sessions_history(includeTools=false)` only as a short-tail fallback
- startup should load:
  - `MEMORY.md`
  - `memory/YYYY-MM-DD.md`
  - `memory/chatlog/index.jsonl` when historical recall is likely

## Current Cron Setup

Relevant job:

- name: `session-skill-rollup`
- target: `isolated`
- interval: every 45 minutes

Prompt intent:

- run `node ./scripts/session-chatlog-sync.mjs`
- treat `memory/chatlog` as canonical archive
- treat raw `.jsonl` as source of truth
- only fall back to `sessions_history(includeTools=false)` if the script fails

Also present:

- daily memory merge
- daily memory seed creation
- weekly summary merge
- monthly summary merge

## Why Memory Search Already Works

This runtime already has `memorySearch.enabled = true` in `clawdbot.json`.

That means the model can search the workspace memory area, including:

- `MEMORY.md`
- `memory/**/*.md`

Because `memory/chatlog/*.md` lives under `memory/`, it is already searchable without any additional indexing feature.

## Migration Checklist For Another Machine

### Minimum required files

Copy these runtime files:

```text
.runtime/workspace/scripts/session-chatlog-sync.mjs
.runtime/workspace/skills/session-skill/
.runtime/config/cron/jobs.json
```

### If you want to preserve existing important history

Also copy:

```text
.runtime/config/agents/main/sessions/
.runtime/workspace/memory/
.runtime/workspace/MEMORY.md
```

If the existing session matters a lot, do not skip the raw sessions directory.

### If you use Docker

Make sure the new machine mounts equivalent paths:

- config -> `/home/node/.clawdbot`
- workspace -> `/home/node/clawd`

### If you use a fresh config on the new machine

Do not blindly copy secrets from the old `clawdbot.json`.

Instead:

1. keep or recreate the new machine's own API keys
2. merge only the needed runtime behavior:
   - `agents.defaults.memorySearch.enabled = true`
   - the relevant `channels.onebot` settings
   - the cron job definitions

## Recommended Migration Procedure

### Option A: preserve current history and session state

1. stop the gateway container on the target machine
2. copy these directories from the source machine:

```text
.runtime/config/agents/main/sessions/
.runtime/workspace/memory/
.runtime/workspace/skills/session-skill/
.runtime/workspace/scripts/session-chatlog-sync.mjs
```

3. merge or replace the target machine's cron job config:

```text
.runtime/config/cron/jobs.json
```

4. verify the target machine's `clawdbot.json` still has valid local secrets
5. run:

```sh
cd /home/node/clawd
node ./scripts/session-chatlog-sync.mjs --dry-run
node ./scripts/session-chatlog-sync.mjs
```

6. restart gateway

```sh
docker compose up -d --force-recreate clawdbot-gateway
```

### Option B: migrate behavior only, without old history

1. copy the script + skill + cron config
2. keep the target machine's own fresh session store
3. run the sync script once
4. let future history accumulate normally

## Validation Steps

After migration, verify all of the following:

1. the script resolves the right raw session root

Expected dry-run output should include something like:

```json
{
  "ok": true,
  "outputRoot": "memory/chatlog",
  "rawSessionsRoot": "../.clawdbot/agents/main/sessions"
}
```

2. the archive exists:

```sh
find /home/node/clawd/memory/chatlog -maxdepth 3 -type f | sort
```

3. noisy content is gone:

```sh
rg -n "\[\[reply_to_current\]\]|NO_REPLY|Exec completed|Recent group context|System:" /home/node/clawd/memory/chatlog
```

4. container-side dry-run works:

```sh
docker compose exec clawdbot-gateway sh -lc "cd /home/node/clawd && node ./scripts/session-chatlog-sync.mjs --dry-run"
```

## Machine-Specific Assumptions To Review

Another AI should inspect these before reusing unchanged:

1. Agent id

- current default is `main`

2. Main owner session

- current special-case main session key is `agent:main:main`

3. OneBot user / DM naming heuristics

The script has fallback heuristics for:

- main owner DM user id
- main owner DM display name

If the new machine has a different owner account or different naming conventions, review:

- `inferDmUserId(...)`
- `inferDmUserName(...)`

If these are left unchanged and the metadata cannot be inferred from session state, the archive may still work, but DM filenames may become `dm-<id>-unknown.md`.

4. Chat UI session separation

In the current setup, the gateway control UI chat is effectively using the main owner session (`agent:main:main`), so those messages are archived into the same owner DM archive.

If you want the control UI to have a separate history file on the new machine, create a distinct session key and route it separately.

## Recommended Future Improvements

If another AI wants to improve this further, the safest next steps are:

1. add near-real-time append for owner DM instead of 45-minute batch only
2. separate control-UI chat from the main owner DM session
3. generalize owner-name inference to avoid machine-specific hardcoding
4. add a retrieval helper that explicitly reopens relevant chatlog files when the user says:
   - "继续刚才那个"
   - "还记得之前 QQ 里说的吗"

## Quick Command Reference

Host:

```powershell
cd D:\xiangmu\clawdbot\.runtime\workspace
node .\scripts\session-chatlog-sync.mjs --dry-run
node .\scripts\session-chatlog-sync.mjs
```

Container:

```sh
cd /home/node/clawd
node ./scripts/session-chatlog-sync.mjs --dry-run
node ./scripts/session-chatlog-sync.mjs
```

Restart gateway:

```powershell
docker compose up -d --force-recreate clawdbot-gateway
```

## Summary For Another AI

If you are another AI modifying this Clawdbot runtime, the important rule is:

- do not try to solve compaction-only history loss with prompting alone
- preserve raw `.jsonl` session transcripts
- build a deterministic clean archive under `memory/chatlog`
- teach `session-skill` to search the clean archive first
- use raw transcripts only as source-of-truth fallback
- keep archive sync incremental by default
