---
name: arboris-novel-quality
description: "Project-specific onboarding + diagnostic workflow for the Arboris novel-writing system in f:\\xiangmu\\小说补全\\arboris-novel: prompt/context injection (OutlineGraph/ChapterGraph), style preset/anchors/fingerprint injection, and analyzing why outlines/chapters read low-quality or inconsistent. Use when discussing or improving novel generation quality, context-window strategy (full dump vs sliding/RAG), prompt templates, style injection, or model selection/tuning for this repo."
---

# Arboris Novel Quality

## Overview

Use this skill to quickly re-load how the repo’s “AI 写小说” pipeline injects prompts/context/style, then run a structured triage on “大纲/细纲/正文质量不行” without guessing.

## Project Snapshot (as of 2026-02-27)

- Repo root: `f:\xiangmu\小说补全`
- Main app: `f:\xiangmu\小说补全\arboris-novel`
- Backend: Python/FastAPI + OpenAI-compatible SDK (`openai==2.3.0`)
- Prompts live as DB records (preloaded on startup) with source templates under `arboris-novel/backend/prompts/`
- User goal (current): build a scalable “滑动/可扩展上下文” system that can handle hundreds/thousands of chapters, but current generation quality (outline + chapter) feels low vs “把更多原文直接塞进上下文”.

## Model Landscape (as of 2026-03-02; volatile)

Keep this section **terse**. Prices/limits change; re-check provider docs when making decisions.

- OpenAI `gpt-5.2`: long-context; supports `reasoning.effort` + `text.verbosity` (Responses API).
- Google `gemini-2.5-pro`: 1M+ context class; often good for “full dump” experiments.
- Anthropic `claude` (Opus/Sonnet lines): strong long-context writing in practice; check current limits/pricing.
- xAI `grok`: very large context tiers exist; verify exact SKU before benchmarking.
- DeepSeek `deepseek-chat` (V3.x): cheap 128k-class option for A/B (outline + prose).

### GPT-5.2 API knobs (OpenAI Responses API)

- `reasoning.effort`: `none|low|medium|high|xhigh` (default `none`).
- **Compatibility gotcha**: `temperature/top_p/logprobs` are supported only when `reasoning.effort="none"`.
- `text.verbosity`: `low|medium|high` (useful when you want “more words” without loosening plot constraints).
- `max_output_tokens`: hard cap output length.

## Investigation Log (keep terse)

- 2026-02-28: **大纲阶段实际注入被“预算模式”截断**。OutlineGraph `_node_context` 默认 `raw_text_window_token_limit=12000` + `total_context_token_limit=20000`（比 writer 预览接口默认 60000 小很多），导致在 `project_id=d8148e25-8768-44aa-8126-740467a0c37e`、`chapter=121` 的同款预算预览里，最终只剩 `上一章末尾前文 + 工具列表 + 章节大纲摘要(截断至12000) + 文风(被截断)`；`时间线/结构模板/项目上下文/骨架导航` 均未进入 prompt（0 chars）。这会直接造成“生成大纲缺布局锚/阶段约束/因果链弱”。复现：`GET /api/writer/novels/{project_id}/chapters/{ch}/context-preview?include_debug=true&raw_text_window_token_limit=12000&total_context_token_limit=20000`。
- 2026-02-28: 结论：不是“不要预算上限”，而是**大纲阶段的上限必须≥能放下布局锚**（至少让 `结构模板 + 时间线 + 项目上下文` 稳定进 prompt）。在当前实现里，20k 预算会被 `上一章末尾 + 大纲摘要 + 文风` 吃满；把 `total_context_token_limit` 提到 60k/80k 往往就能避免核心约束被挤掉（再谈其它质量问题才有意义）。
- 2026-02-28: 细节：OutlineGraph `_node_context` 会把 `extra_context_char_limit` 固定夹到 `<=80000`（`max(20000, min(80000, total_context_token_limit))`），所以单纯把 `total_context_token_limit` 拉到 150k 时，“额外模块区”（时间线/结构/项目上下文/文风/大纲摘要等）最多也就吃到约 80k 字符；除非同时把 `raw_text_window_token_limit` 拉大，否则会出现“总预算很大但实际注入不增长”的错觉。
- 2026-02-28: 已临时移除该 80k 上限：`arboris-novel/backend/app/graphs/outline_graph.py` 将 `extra_context_char_limit` 改为随 `total_context_token_limit` 扩展（不再 `min(80000, ...)`）。提交：`arboris-novel` 仓库 `a343e1e`.
- 2026-03-01: **时间线压薄**：新增 `ContextOverrides.timeline_render_mode=thin`，用更紧凑的 bullet 格式渲染 `【时间线】`（减少 kind/title/提示语的 token 占用），避免在 `timeline.max_chars=12000` 下被早截断。代码提交：`arboris-novel` 仓库 `45fb26d`。推荐实验参数（大纲阶段）：`timeline_render_mode=thin` + `timeline_note_max_chars=80~160` + `timeline_recent_limit=200`（再用 context-preview 看 `timeline.truncated=false` 是否达成）。证据样例：`arboris-novel/_evidence/timeline_thin_outline_20260301_182717/`（含 CH61 注入对比 + 61-70 大纲 before/after）。

## AI Injection Map (where quality is decided)

### Prompt loading

- Preload prompts at startup: `arboris-novel/backend/app/main.py:72` → `PromptService.preload()`
- Prompt fetch: `arboris-novel/backend/app/services/prompt_service.py:68` → `get_prompt(name)`

### Outline generation (章节大纲)

- Graph: `arboris-novel/backend/app/graphs/outline_graph.py` (`load → context → plan → draft → validate → persist`)
- Core prompt: `backend/prompts/outline.md` (plus batch prompts like `outline_batch_plan.md`, `outline_batch_coherence_review.md`)
- Messages layout:
  - system: `outline*` prompts + `generation_system_prompt_addon`
  - assistant (memory layer): `context_text` (context pack)
  - user: JSON payload for generation + optional author notes

### Chapter generation (章节正文)

- Graph: `arboris-novel/backend/app/graphs/chapter_graph.py` (`load → context → plan_beats → write_versions → self_check → persist`)
- Writing system prompt (core): `backend/prompts/writing.md` + `backend/prompts/writing_voice_guide.md` + `generation_system_prompt_addon` + word-range hint + `tools_hint_common`
- Messages layout (write stage):
  - system: writing prompt + voice guide + anchors/tool guidance addon + word-range + tools hint
  - assistant (memory layer): `【上下文底座】` = (tool outputs + web research + `context_text`)
  - user: `[当前章节目标]` + optional “字数纠偏” + `【节拍规划】`
- Self-check prompt: `backend/prompts/chapter_self_check.md` (then optional rewrite loop)

### Context packing (what gets injected as “assistant memory”)

- Builder: `arboris-novel/backend/app/services/generation_context_service.py:310` → `build_budgeted_chapter_context()`
- Sections (typical): previous chapter tail, world bible index, outline summaries, timeline, project blueprint context, style profile, structure template, skeleton nav, tool list
- Key concept: **quality tracks with “high-value token ratio”**:
  - High-value for prose: *high-quality original prose anchors / recent raw text window / scene-specific evidence*
  - Lower-value for prose: *tool list, long rule cards, giant directories without the actual entry text*

## World Bible + Search-first (目录→按需召回)

User preference (current): **prefer a visible “搜索过程”** over “把世界书全塞进 prompt”；即：先给可检索索引（键名/摘要/ID），需要时再按需取全文。

Current implementation has **multiple world-bible paths** (important for diagnosing “为什么看起来世界书很长/为什么模型不查就编”):

- **Index injection (预算上下文模块)**:
  - `GenerationContextService.build_chapter_frame()` → `GenerationPagingService.world_bible_index_page()` → `render_world_bible_index()`
  - Injected as `BudgetSection(key="world_bible_index", max_chars=12000)`
  - **Dependency:** requires active `world_bible_groups` (effective groups); otherwise this section becomes 0 chars even if mounts exist.
- **Agent tools (目录分页 + 条目全文)**:
  - Tools: `world_bible_index_pages` + `get_world_bible_entry`
  - Implementation: `arboris-novel/backend/app/services/generation_tool_bundle.py` + `arboris-novel/backend/app/agent/tools/builtin_tools.py:get_world_bible_entry()`
  - Tool outputs are captured into `OutlineGraph/ChapterGraph` assistant-context under `【按需召回（工具输出）】`.
- **Auto-retrieval (不依赖工具调用的“搜索”兜底)**:
  - `WorldBibleService.retrieve_for_generation()` does vector-first (fallback keyword) topK retrieval and returns compact Markdown.
  - `OutlineGraph._node_draft()` already adds per-chapter `【世界书检索】` (`top_k=8`, `max_entry_chars=300`, then trimmed to ~3500 chars).
  - Note: `ChapterGraph` currently does not add the same auto world-bible retrieval block (it mainly relies on tools + index + project_context).
- **Project context mounts (小型兜底，不是索引工具链)**:
  - `ContextService._format_world_bible_mounts()` injects up to 3 bibles / 12 entries, each entry compacted (default 360 chars).
  - Appears under `【世界书（挂载）】` inside `project_context` (max_chars is later budgeted elsewhere).

Practical implication:
- If you want “搜索过程” but **don’t want quality to depend on tool discipline**, keep **index/tools** + also keep **auto-retrieval fallback** (OutlineGraph already does this; chapters may need parity later if required).
 - Retrieval quality depends on embeddings:
   - Endpoint: `POST /api/world_bibles/{world_bible_id}/embed?force=false` to batch-embed entries (vector search). Without embeddings, `retrieve_for_generation()` falls back to keyword scoring, which is usually weaker.
 - Optional anchor extraction:
   - Endpoint: `POST /api/projects/{project_id}/apply_world_bible/{world_bible_id}` writes a compact subset into blueprint `world_setting` (acts as a small L0 “hard facts” layer), while keeping the full bible for search/tools.

## Foreshadowing injection (伏笔)

- Per-chapter foreshadowing: stored in chapter outline (`foreshadowing`, `foreshadowing_to_resolve`) and injected via `ContextService._format_foreshadowing()` as `【伏笔信息】`.
- Whole-book foreshadowing library: table `foreshadowings`, injected via `ContextService._format_foreshadowing_library()` as `【全书伏笔库】` (grouped by status, max ~30 items).
- Alarm mechanism exists: `ForeshadowingService.check_alarms(project_id, chapter_number)` matches `target_chapters` for pending/active items (can be turned into a thin high-priority injection later).

## Style Injection Map (文风相关)

- Global “voice” prompts:
  - `backend/prompts/writing.md` (priority rules + “反 AI 味”)
  - `backend/prompts/writing_voice_guide.md` (general 真人感指南)
- Per-project style profile injected into context pack:
  - Builder: `arboris-novel/backend/app/services/context_pack_service.py:_build_style_profile_text()`
  - Source: Style preset (`StylePresetService`) → `style_card` + `anchors` + (optional) `StyleFingerprint`
  - Critical: **anchors are the only part that directly provides “可模仿的原文证据”**; pure rules/metrics rarely raise prose ceiling by themselves.
- Anchors selection: `arboris-novel/backend/app/services/style_preset_service.py:auto_select_default_anchors()`

## Bottleneck Hypotheses (use to guide discussion)

Use these as a checklist; do not assume which one is true until you inspect an example output.

- Model ceiling: smaller models often produce “safe, average prose” even with heavy prompting.
- Anchor quality: if injected “5章前文/样文锚点” are themselves low-quality (or AI-ish), the system stabilizes “low-quality consistency”.
- SNR dilution: too much meta (rules/目录/清单) and too little executable scene evidence → template-ish writing.
- Outline/beat vagueness: abstract summaries cause long chapters to “waterfill” (重复/空话) to hit word count.
- Context truncation: budget allocator includes sections but may truncate the one you *thought* was present (inspect `context_preview_*.json` artifacts when available).

## Triage Workflow (discussion-first, no code changes)

1) Ask for: model used, 1 “bad” chapter excerpt (800–1200 chars), its outline title+summary, writing notes, and (if available) the `context_preview_chapter.json` for that run.
2) Classify failure mode:
   - event-chain: not covering summary/beats, repeating “已发生事实”, replacing mainline
   - prose: rhythm/imagery/dialogue flat, template connectors, generic metaphors
   - consistency: names/relations/time/rules drift
3) Map to injection layer:
   - If prose is flat: check anchors + raw_text_window density, not just rule cards.
   - If plot drifts: check beats plan + self_check guidance and whether context had the necessary “hard facts”.
4) Propose 1–2 minimal experiments to validate the hypothesis (swap model, swap anchor pack, reduce meta noise, tighten outline checks) before rewriting the system.

### World Bible: lightweight impact tests (no framework changes)

World bible rarely improves “文笔上限” directly; it mainly improves **hard-facts correctness + world-specific specificity**. Test it like a retrieval system first, not like a style system.

**1) Injection check (fastest, zero generation):**
- Use `context-preview?include_debug=true` on a target chapter/outline run and confirm:
  - `【世界书索引】` chars > 0 (requires an active `world_bible_group`).
  - `【世界书（挂载）】` contains the “must-not-hallucinate” facts (small L0).
  - If there is `【世界书检索】` / `【按需召回（工具输出）】`, check relevance + truncation.

**2) Retrieval sanity check (no novel writing yet):**
- Run 5–10 “needle queries” (entity names / rules / organizations) and verify top-k returns contain the expected entry.
- If retrieval is weak: embeddings missing → keyword fallback; or entries are too long/too similar; or query text lacks discriminative terms.

**3) Output A/B micro-benchmark (30–60 min):**
- Pick 1 scene that depends on 3–5 world facts (not generic drama).
- Duplicate the project and run 2–3 conditions (same model + low temperature; ideally 2–3 repeats per condition):
  - A: disable world bible (no active group + no mounts) → baseline hallucination rate.
  - B: index only (group on, mounts off) → tests “agent/tool discipline” dependence.
  - C: index + 5–12 mounted hard-facts (small L0) → tests “search-first but grounded” setup.
- Score with a tiny rubric (10 mins):
  - hard-facts violations count (contradictions / invented rules / wrong names).
  - world-specific details count (proper nouns + unique mechanics that match bible).
  - continuity with last chapter (who/where/what just happened).

## Where to Inspect Real Outputs (repo artifacts)

- AB artifacts (generated text + context previews):
  - `issues/artifacts/repo-reading-multimodel-ab/**/generated_chapters.json`
  - `issues/artifacts/repo-reading-multimodel-ab/**/context_preview_chapter.json`
- Backend storage DBs (large):
  - `arboris-novel/backend/storage/arboris.db`
- Prompt templates:
  - `arboris-novel/backend/prompts/prompt_flow_index.md` (human index for prompt sequence)

## Safety / Hygiene

- Do not store secrets (API keys, tokens, passwords) in this skill.
- Prefer quoting file paths + function names over pasting large code blocks into chat.
