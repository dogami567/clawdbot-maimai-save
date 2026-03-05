---
name: AImemory
description: "Persistent user-preference + SOP memory for Codex, shared across sessions via a global file. Use when the user says AImemory/记忆/偏好/复盘/总结，especially after a long conversation to UPDATE (rewrite+merge, not append), or at the start of a new task to LOAD and follow the user's habits. Two entrypoints: load/read and update."
---

# AImemory（跨会话偏好/流程记忆）

目标：把“你的使用习惯/偏好/我们达成的新范式/常见坑与修复”沉淀成一份**短、可执行、可合并**的记忆文件，供之后分散在不同会话/不同 Codex 实例里复用。

## 两个入口（只允许这两个）

1) **LOAD / READ**：在新任务开始时读取记忆并遵守（不改内容）
2) **UPDATE**：在长对话结束后更新记忆（必须“更新/合并/精简”，禁止无脑加长）

> 建议用户调用方式（任选其一）：`AImemory read` / `AImemory update`

## 记忆文件位置（全局共享）

- 目标路径：`$CODEX_HOME/memory/AImemory.json`
  - Windows 常见：`C:\Users\<you>\.codex\memory\AImemory.json`
  - 若没有 `CODEX_HOME`：默认使用 `~/.codex`

## Preflight（每次调用都做）

1) 运行初始化脚本（确保文件存在）：  
   - `node .codex/skills/AImemory/scripts/ensure_memory.mjs`
2) 如果要 read：  
   - `node .codex/skills/AImemory/scripts/print_memory.mjs`

## UPDATE 工作流（核心）

当用户在长对话后调用 `AImemory update` 时：

1) **从当前对话中提炼变化点**（只提炼“稳定、可复用”的结论）
   - 新范式/新默认值（1 句话）
   - 用户明确的偏好/禁忌（尽量 1 行 1 条）
   - 本轮出现的错误与修复（要合并为“同类项 + 1 句原因/修法”）

2) **读取现有记忆**：打开 `$CODEX_HOME/memory/AImemory.json`

3) **做“更新而非堆叠”**（强约束）
   - 去重：同义条目合并为 1 条
   - 合并：同类错误不同侧面合并为 1 条（保留最有效的修复提示）
   - 截断：总长度控制在 ~2KB（宁可删掉低价值信息）
   - 只写“可执行信息”，不要写长解释

4) **安全约束（必须遵守）**
   - 禁止写入：token、密钥、账号密码、webhook secret、个人隐私信息
   - 如需记“账号”：只记“账号类型/角色/是否管理员/生成方式”，不要记真实凭据

5) **写回文件**：用 `apply_patch` 直接改 `$CODEX_HOME/memory/AImemory.json`

6) **对用户输出一段极短变更摘要**
   - 新增/更新了哪些规则（最多 5 条）
   - 删除/合并了哪些重复项（最多 3 条）

## LOAD / READ 工作流（核心）

当用户在新任务开始时调用 `AImemory read`：

1) 读取并在脑中生效（不需要把全文贴给用户）
2) 如果用户要看，再用 `print_memory.mjs` 打印
3) 之后在该会话中按记忆默认值做事（例如：一次性收集信息、减少用户学习成本等）

## Resources

- `scripts/ensure_memory.mjs`：确保全局记忆文件存在（不存在则用模板创建）
- `scripts/print_memory.mjs`：打印当前记忆文件路径与内容
- `references/memory.template.json`：记忆文件模板（短、可合并）

