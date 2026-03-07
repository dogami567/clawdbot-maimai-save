# Clawdbot Exa Configuration / Migration Guide

## 中文速览

这份文档讲的是你这台 Clawdbot 里 Exa 现在到底怎么接上的，以及怎么迁到另一台机器。

先说结论：

1. 现在这台机器的 Clawdbot 已经原生支持 `web_search -> exa`
2. 当前默认搜索 provider 已经配置成 `exa`
3. 另外还额外装了一套 `exa-search-router` skill + `./scripts/search` 旁路脚本
4. 这两套不是一回事：
   - 原生 `web_search`：走 Clawdbot 内置 Exa provider
   - `./scripts/search`：走 Python 路由脚本，支持 Exa/Brave/Perplexity 多 provider fallback

如果你只是想在另一台机器上让 Clawdbot 的内置搜索默认走 Exa，最少需要：

```text
.runtime/config/clawdbot.json
```

并确认里面至少有：

- `tools.web.search.provider = "exa"`
- `env.vars.EXA_API_KEY` 或 `env.vars.EXA_API_KEYS`

如果你还想把本地多 key 路由脚本一起迁过去，再复制：

```text
.runtime/workspace/skills/exa-search-router/
.runtime/workspace/scripts/search
```

## Purpose

This guide explains the Exa-related setup currently used in this private Clawdbot runtime and how another AI should reproduce it on another machine.

Scope:

- native `web_search` provider configuration for Exa
- Exa API key placement and precedence
- optional `exa-search-router` skill and `scripts/search` helper
- migration steps and validation steps

## Current State On This Machine

### Native Clawdbot web search

Current runtime config:

- `tools.web.search.enabled = true`
- `tools.web.search.provider = "exa"`

Exa keys are currently stored in runtime config under:

- `env.vars.EXA_API_KEY`
- `env.vars.EXA_API_KEYS`

Current file:

- `.runtime/config/clawdbot.json`

### Optional Exa router skill

This machine also has a workspace-local Exa router skill:

- `skills/exa-search-router/SKILL.md`
- `skills/exa-search-router/scripts/search_router.py`
- `scripts/search`

This is an extra local workflow, not required for native `web_search`.

## Two Different Exa Paths

### Path A: native Clawdbot `web_search`

This is the built-in tool the model can call directly as `web_search`.

Implementation:

- `src/agents/tools/web-search.ts`

Config type support:

- `src/config/types.tools.ts`
- `src/config/zod-schema.agent-runtime.ts`
- `src/config/schema.ts`

Docs:

- `docs/tools/web.md`

### Path B: local `exa-search-router` skill

This is a workspace-local helper for explicit multi-provider routing.

Components:

- `skills/exa-search-router/SKILL.md`
- `skills/exa-search-router/scripts/search_router.py`
- `scripts/search`

It is useful when you want:

- Exa first
- Brave fallback
- Perplexity fallback
- explicit `--providers` ordering
- explicit Exa research mode

It is not required for native Exa support.

## Native Exa Support In Source Code

Native Exa support is already present in upstream code.

Important source files:

- `src/agents/tools/web-search.ts`
- `src/agents/tools/web-search.exa.test.ts`
- `src/agents/tools/web-search.test.ts`
- `src/config/types.tools.ts`
- `docs/tools/web.md`

Important behavior from source:

1. supported providers are:

- `brave`
- `perplexity`
- `exa`

2. Exa defaults are:

- `baseUrl = https://api.exa.ai`
- `searchType = auto`
- `contentMode = highlights`
- `maxCharacters = 4000`

3. Exa uses:

- `POST /search`
- header: `x-api-key`

4. key rotation happens automatically on:

- `401`
- `403`
- `429`
- any `5xx`

5. result mapping returns:

- `title`
- `url`
- `description`
- `published`
- `siteName`

## Current Runtime Config

Current relevant fields in `.runtime/config/clawdbot.json`:

```json5
{
  env: {
    vars: {
      EXA_API_KEY: "...",
      EXA_API_KEYS: "k1,k2"
    }
  },
  tools: {
    web: {
      search: {
        enabled: true,
        provider: "exa"
      }
    }
  }
}
```

Important note:

- current runtime does **not** define `tools.web.search.exa.baseUrl/searchType/contentMode/maxCharacters`
- so native Exa search is currently using code defaults

## Exa Key Resolution Order

For native `web_search`, the key resolution logic is:

1. `tools.web.search.exa.apiKeys`
2. `EXA_API_KEYS`
3. `tools.web.search.exa.apiKey`
4. `EXA_API_KEY`

This is confirmed by:

- `src/agents/tools/web-search.ts`
- `src/agents/tools/web-search.test.ts`

Implication:

- if you want a stable explicit pool in config, use `tools.web.search.exa.apiKeys`
- if you want simpler migration and keep secrets out the tool block, use `env.vars.EXA_API_KEYS`

## Why Native `web_search` Works Even When Shell `env` Looks Empty

This is an important detail.

Observed on this machine:

- `docker compose exec clawdbot-gateway sh -lc "env | grep ^EXA"` returns nothing
- but native Clawdbot config still contains `env.vars.EXA_API_KEY(S)`

Why:

- Clawdbot loads `config.env.vars` into `process.env` inside the Node application process
- this is done during config load
- this does **not** automatically export those keys into unrelated shell sessions inside the container

Relevant source:

- `src/config/io.ts`
- `src/config/config.env-vars.test.ts`

So:

- native `web_search` can use Exa because it runs inside the Clawdbot process
- `docker exec ... sh` or raw shell scripts will not automatically see those keys unless you export them at container / shell level

## Optional Router Skill Details

### Skill

- `skills/exa-search-router/SKILL.md`

### Python router

- `skills/exa-search-router/scripts/search_router.py`

What it does:

- Exa first by default
- then Brave
- then Perplexity
- key-pool shuffle + failover inside each provider
- Exa modes:
  - `auto`
  - `search`
  - `research`

### Wrapper script

- `scripts/search`

Default behavior:

- providers: `exa,brave,perplexity`
- Exa mode: `auto`
- Exa content: `highlights`

Wrapper command:

```sh
./scripts/search "your query"
```

## Important Difference: Native Tool Vs Router Script

### Native `web_search`

Pros:

- integrated with Clawdbot tools
- works with current config
- reads config/env inside the app process
- easiest migration path

Cons:

- single configured provider at a time
- no cross-provider fallback chain inside one call

### `scripts/search` router

Pros:

- Exa / Brave / Perplexity fallback chain
- multiple key pools
- explicit Exa research mode

Cons:

- requires Python 3
- requires shell-visible env vars (`EXA_API_KEY(S)` etc.)
- is not the same thing as the built-in tool

## Recommended Migration Modes

### Mode 1: migrate native Exa only

Use this if you only want Clawdbot's built-in `web_search` to default to Exa.

Copy / reproduce:

- `.runtime/config/clawdbot.json`

Make sure these exist:

```json5
{
  env: {
    vars: {
      EXA_API_KEY: "...",
      EXA_API_KEYS: "k1,k2"
    }
  },
  tools: {
    web: {
      search: {
        enabled: true,
        provider: "exa"
      }
    }
  }
}
```

Optional explicit Exa block:

```json5
{
  tools: {
    web: {
      search: {
        enabled: true,
        provider: "exa",
        exa: {
          baseUrl: "https://api.exa.ai",
          searchType: "auto",
          contentMode: "highlights",
          maxCharacters: 4000
        }
      }
    }
  }
}
```

This mode is the simplest and recommended default.

### Mode 2: migrate native Exa + local Exa router

Use this if you also want:

- `./scripts/search`
- Exa-first fallback workflow
- explicit research mode

Copy:

```text
.runtime/workspace/skills/exa-search-router/
.runtime/workspace/scripts/search
.runtime/config/clawdbot.json
```

Also ensure the target machine has:

- Python 3 available in the container / runtime

If you want `./scripts/search` to work from shell / exec directly, you must also expose env vars at shell level, for example through:

- Docker Compose `environment:`
- container startup env
- `~/.clawdbot/.env` if your setup loads it into the shell environment

Do not assume `env.vars` inside `clawdbot.json` is enough for raw shell scripts.

## Suggested Config On Another Machine

If you want a clean, explicit setup, use this:

```json5
{
  env: {
    vars: {
      EXA_API_KEYS: "exa-key-1,exa-key-2"
    }
  },
  tools: {
    web: {
      search: {
        enabled: true,
        provider: "exa",
        maxResults: 5,
        timeoutSeconds: 30,
        cacheTtlMinutes: 15,
        exa: {
          baseUrl: "https://api.exa.ai",
          searchType: "auto",
          contentMode: "highlights",
          maxCharacters: 4000
        }
      }
    }
  }
}
```

Why:

- explicit provider
- explicit Exa defaults
- key pool enabled
- migration is easier to inspect later

## Validation Checklist

### Validate native Exa config

Check config:

```powershell
Get-Content D:\path\to\.runtime\config\clawdbot.json
```

Confirm:

- `tools.web.search.provider` is `exa`
- `env.vars.EXA_API_KEY` or `env.vars.EXA_API_KEYS` exists

### Validate code support

Source references:

- `src/agents/tools/web-search.ts`
- `src/agents/tools/web-search.exa.test.ts`
- `docs/tools/web.md`

### Validate shell router

If migrating `scripts/search`, check:

```sh
cd /home/node/clawd
./scripts/search "OpenAI news"
```

If it says `No EXA_API_KEYS/EXA_API_KEY configured`, that means:

- the shell cannot see Exa env vars
- native `web_search` may still work
- but the router script is not yet wired to shell env

## Exact Files To Inspect Or Copy

### Required for native Exa

- `.runtime/config/clawdbot.json`

### Required for optional router

- `.runtime/workspace/skills/exa-search-router/SKILL.md`
- `.runtime/workspace/skills/exa-search-router/scripts/search_router.py`
- `.runtime/workspace/scripts/search`

### Helpful source references

- `src/agents/tools/web-search.ts`
- `src/agents/tools/web-search.exa.test.ts`
- `src/agents/tools/web-search.test.ts`
- `src/config/types.tools.ts`
- `docs/tools/web.md`

## Recommended Migration Procedure

### Native Exa only

1. copy or recreate the relevant Exa fields in `.runtime/config/clawdbot.json`
2. restart the gateway

```powershell
docker compose up -d --force-recreate clawdbot-gateway
```

3. test a normal agent search prompt that uses `web_search`

### Native Exa plus router

1. copy the Exa config
2. copy `skills/exa-search-router/`
3. copy `scripts/search`
4. ensure Python 3 exists in the runtime
5. ensure shell-visible `EXA_API_KEY(S)` exists if you want direct script execution
6. restart the gateway

## What Another AI Should Not Confuse

These are different and should not be conflated:

1. `tools.web.search.provider = "exa"`

- native built-in search tool

2. `env.vars.EXA_API_KEY(S)` in `clawdbot.json`

- application-process env injection

3. `docker exec ... sh` environment

- shell environment
- may not contain `EXA_*`

4. `scripts/search`

- optional helper
- not the built-in `web_search` tool

## Summary For Another AI

If you are another AI modifying this Clawdbot runtime, the safe interpretation is:

- Exa is already a native built-in `web_search` provider in this codebase
- the current runtime already defaults native `web_search` to Exa
- the Exa key pool is currently stored under `config.env.vars`
- the optional Exa router skill is an extra layer, not the core provider
- if you migrate only one thing, migrate the native Exa config first
- if you migrate the router script too, remember it needs shell-visible env vars or a wrapper change

