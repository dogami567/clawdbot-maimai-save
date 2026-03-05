# Ops Notes

## Quick test

```bash
python3 skills/exa-search-router/scripts/search_router.py "gold price today" --providers exa,brave
```

## Add more keys

Add comma-separated keys in gateway config env vars:

- `EXA_API_KEYS="k1,k2,k3"`
- `BRAVE_API_KEYS="b1,b2"`
- `PERPLEXITY_API_KEYS="p1,p2"`

## Failure handling

- `HTTP 401/403`: key invalid/quota/permission issue
- `HTTP 429`: rate limit; keep multiple keys
- provider down: fallback to next provider in `--providers`

## Exa query tuning cheat sheet

Prefer API-side filtering first (less noise, fewer wasted tokens downstream):

- Recency: `startPublishedDate` / `endPublishedDate` (or crawl-date variants)
- Source control: `includeDomains` / `excludeDomains`
- Content intent: `includeText` / `excludeText`
- Vertical: `category` (`news`, `research paper`, `company`, `people`, ...)
- Depth/speed: `type` (`instant` fastest, `deep*` strongest)
- Freshness: `contents.livecrawl` + `maxAgeHours`
- Output cost: `contents.highlights` < `contents.text` (token usage)

Recommended presets:
- Fast monitor: `type=instant`, `numResults=5-10`, `highlights`
- Balanced brief: `type=auto`, `numResults=10-20`, `highlights` + date/domain filters
- Deep research: `type=deep-reasoning`, `numResults=25+`, `text`/`summary`

Official refs:
- `https://docs.exa.ai/reference/search`
- `https://docs.exa.ai/reference/contents-retrieval-with-exa-api`
- `https://docs.exa.ai/reference/answer`
