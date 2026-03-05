---
name: gemini-skill
description: "Gemini CLI + Codex 协作前端 SOP：让 Gemini 自由产出 Next.js/React UI（动效/布局/组件），Codex 负责集成、修 bug、保证交互丝滑，并用 build/e2e 做质量闸门。适用于：用户要求“用 Gemini 写前端/动效/页面”，或你需要把 Gemini 生成的 UI 变成可运行、可部署、可回滚的实现。"
---

# Gemini Skill（前端协作模式）

## Overview

把“Gemini 负责创意实现”与“Codex 负责工程稳定性”固化成一个固定流程：先让 Gemini 生成改动草案，再由 Codex 做编译/类型/运行时/体验修复并上线。

## Quick start

- 确认 CLI 可用：`gemini --version`
-（可选但推荐）验证无头可用：`gemini -p "hi" --output-format text`
- 一次性收集需求：复制 `references/ui-brief.template.json` → 填好保存为 `out/gemini/ui-brief.json`
- 生成给 Gemini 的提示词：`node .codex/skills/gemini-skill/scripts/build_prompt.mjs --brief-file out/gemini/ui-brief.json --out-file out/gemini/prompt.md`
- 生成 Gemini 输出：`node .codex/skills/gemini-skill/scripts/run_gemini.mjs --prompt-file out/gemini/prompt.md --output-format text`
- Codex 落地与稳定化：按下方 Workflow 执行（至少 `pnpm build`；能跑再加 e2e）

## Workflow（你的交互模型沉淀）

### 0) Preflight（先保证能跑）

- `gemini --version` 必须可用（如果找不到命令，修 PATH：`npm prefix -g` 加到 PATH）
- 认证要可用（任选其一）：
  - OAuth：直接运行一次 `gemini`，按提示网页登录
  - API Key：设置 `GEMINI_API_KEY`
- 明确项目目录（例如本仓库里的 `pbb2/`）
- 明确质量闸门：最少要过 `pnpm build`；能跑的话再加 `pnpm test:e2e`

### 1) 收集 brief（用户一次说清，尽量不要来回问）

- 首选：让用户填 `references/ui-brief.template.json`，你只要问一次：
  - 项目目录（`projectDir`）
  - 页面/路由清单
  - 风格与动效等级
  - 核心交互规则（登录 gating、loading、错误提示、文件上传类型）
  - 约束（不要大改结构/不要加很多依赖/不要动支付鉴权）
- 如果缺信息：把所有问题一次性列出来，让用户一次答完，避免反复打断。

### 2) Gemini 产出草案（自由发挥但要可集成）

建议用模板 + brief 自动生成 `out/gemini/prompt.md`，然后跑脚本生成输出：

- 生成 prompt：`node .codex/skills/gemini-skill/scripts/build_prompt.mjs --brief-file out/gemini/ui-brief.json --out-file out/gemini/prompt.md`
- 生成 Gemini 输出：`node .codex/skills/gemini-skill/scripts/run_gemini.mjs --prompt-file out/gemini/prompt.md --output-format text`
- 提示词模板：见 `references/gemini.prompt.template.md`

**关键约定（减少 Gemini 写 bug 的概率）**

- 让 Gemini 输出“文件级改动”（逐文件给出最终代码），不要只给片段
- 让 Gemini 明确“新增/修改哪些文件”，避免隐式改动
- 让 Gemini 不要改支付/鉴权/数据库逻辑（除非你明确要求）

### 3) Codex 落地 + 修复（你负责丝滑）

- 把 Gemini 的输出转成真实文件改动（`apply_patch` 或手工落地）
- 立刻跑质量闸门并修到通过：
  - `pnpm build`（必须通过）
  - `pnpm test:e2e`（如果端口占用，改 `PBB_PORT`）
- 专门盯这些“丝滑点”：
  - loading / disabled / optimistic UI
  - 错误提示（toast 文案、状态码映射）
  - 动效不过载（prefers-reduced-motion、移动端性能）
  - 可访问性（tab/focus、按钮语义、对比度）

### 4) 上线节奏（测试版 → 正式版）

- 先推 GitHub `staging` 分支 + Vercel Preview 给你验收
- 验收通过再 `vercel --prod` 或合并到 `main` 触发正式发布

## Resources

### scripts/
- `scripts/build_prompt.mjs`：读取 `ui-brief.json` → 注入模板 → 生成 `out/gemini/prompt.md`
- `scripts/run_gemini.mjs`：读取 prompt 文件 → 调用 `gemini`（stdin）→ 输出落到 `out/gemini/`

### references/
- `references/ui-brief.template.json`：需求一次性收集模板
- `references/gemini.prompt.template.md`：给 Gemini 的提示词模板（让它自由但可集成）
