---
name: exa-search-router
description: Route web search through Exa first with multi-key failover, then fallback to Brave/Perplexity (each supports key pools). Use when user asks for cheaper/more reliable search than single API, wants rotating keys, provider fallback, or wants Codex/agent to search with explicit provider order.
---

# Exa Search Router

Use a local script for multi-provider + multi-key search routing.
It supports Exa `search` API and Exa research chat models (`exa-research`, `exa-research-pro`, `exa-research-fast`).

## Run

推荐入口（更短）：
`./scripts/search "<query>"`

底层脚本：
`python3 skills/exa-search-router/scripts/search_router.py "<query>" --providers exa,brave,perplexity --num-results 5`

## Key Pools

Set comma-separated keys in env vars:

- `EXA_API_KEYS` (or `EXA_API_KEY`)
- `BRAVE_API_KEYS` (or `BRAVE_API_KEY`)
- `PERPLEXITY_API_KEYS` (or `PERPLEXITY_API_KEY`)

Behavior:
- Provider order follows `--providers`.
- Within each provider, keys are shuffled and tried one by one.
- If provider fails, route to next provider.

## Output

Script returns one JSON object:
- success: `{ ok: true, provider, results[], attempts[] }`
- failure: `{ ok: false, attempts[] }`

## Exa Modes

- 默认模式：`--exa-mode auto`（先 `/search`，失败再 `/chat/completions`）
- 仅普通搜索：`--exa-mode search`
- 仅深度调研：`--exa-mode research`

默认内容提取：`highlights`（省 token）
- 可切 `--exa-content text` 获取连续全文

Set `EXA_RESEARCH_MODEL` if you want a specific research model:
- `exa-research`
- `exa-research-pro`
- `exa-research-fast`

## Exa Advanced Knobs (docs)

When precision matters, prefer Exa-native filters instead of local post-filtering.

Useful request options from Exa docs:
- `type`: `instant` / `fast` / `auto` / `deep` / `deep-reasoning` / `deep-max`
- `includeDomains`, `excludeDomains` (支持子域名通配和路径过滤)
- `startPublishedDate`, `endPublishedDate`
- `startCrawlDate`, `endCrawlDate`
- `includeText`, `excludeText`
- `category` (如 `news`, `research paper`, `company`, `people`)
- `contents.text` / `contents.highlights` / `contents.summary`
- `contents.livecrawl` + `maxAgeHours`（控制新鲜度）
- `userLocation`（地理偏置）

Notes:
- `company`/`people` 类别下部分过滤器受限，传不支持参数会 400。
- 详情以官方文档为准：`https://docs.exa.ai/reference/search`

## Suggested Default

For balanced relevance/cost/speed:
- `--providers exa,brave,perplexity`
- Exa uses `type=auto` + text extraction first, then research model fallback.

## Interaction Rule (high-frequency search)

Before running search, briefly tell user what search scene(s) are available, then run the chosen scene.

Suggested scene menu:
- Fast fact check (quick answer, low latency)
- News/market monitor (recent updates with time filters)
- Deep research (broader recall + richer context)
- Source-constrained lookup (only specific domains)

Default behavior if user does not choose:
- Use the most likely scene from context and say which one is used in 1 short sentence.

## Intent-First Recommendation (new default)

When user asks to “just search” and has not picked mode/model:
- First output one recommended mode based on intent in one short line.
- Then list other available modes with very short “best for ...” descriptions.
- Ask for confirmation or allow switching mode before execution.

Recommended compact pattern:
- 推荐：`<mode>`（一句原因）
- 其他可选：`<modeA>`（适合...）、`<modeB>`（适合...）、`<modeC>`（适合...）
- 追问：`按推荐直接搜，还是切换到别的模式？`

Model handling:
- Do not force manual model selection by default.
- Auto-map mode to model tier: `fast / balanced / quality`.
- Only ask model-level follow-up when user explicitly requests model control.

## Notes

- This is independent of built-in `web_search` tool provider config.
- Keep real keys in env/config, not hardcoded in files.
