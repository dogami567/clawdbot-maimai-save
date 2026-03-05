---
name: github-actions-release-troubleshooter
description: 诊断与修复 GitHub Actions 基于 tag 的 Release 流水线（gh release create/upload、Node/pkg 跨平台打包、Windows pwsh/PowerShell 脚本、YAML 解析错误、附件缺失）。当 push tag 后 workflow 失败、需要强推 tag 重新触发、或希望用 GitHub API/脚本快速定位失败 step（不盯 UI）时使用。
---

# GitHub Actions Release Troubleshooter

## Overview

用一套固定的排查顺序，把“tag 触发 Release workflow 失败”快速收敛到具体 job/step，并给出可复用的修复手法（拆分步骤、修 YAML、修 gh、修 Windows 脚本运行环境），最后验证 Release 附件完整。

## 快速开始（不看 UI）

脚本位置：
- 通用：`$CODEX_HOME/skills/github-actions-release-troubleshooter/scripts/gh_actions.py`
- 本机示例：`F:\xiangmu\speckit\.codex\skills\github-actions-release-troubleshooter\scripts\gh_actions.py`

常用命令：
- 列出最近 10 次 runs：`python <gh_actions.py> runs --repo owner/repo`
- 查看某次 run 的 job/step 结果：`python <gh_actions.py> jobs --repo owner/repo --run-id 123`
- 看某个 tag 的 Release 附件是否齐全：`python <gh_actions.py> release-assets --repo owner/repo --tag v0.3.6`

## 故障排查流程（推荐顺序）

1. 先定位失败 step（不要猜）
   - 用 `scripts/gh_actions.py` 把失败收敛到 “哪个 job 的哪个 step”。
   - 如果只能看到 `failure`，就先把 workflow 的大 step 拆小（见第 2 点），再跑一次。

2. 拆分“复合命令”，把失败点显式化
   - 把 `npm run release:*` 这种串联命令拆成多个 step（例如 `Build` / `Package` / `Upload`），让 Actions 直接告诉你坏在哪一步。
   - Windows 上尤其重要：`pkg` 失败和 `PowerShell 打包脚本` 失败是两类问题，处理方式完全不同。

3. 处理 YAML/语法类失败（Workflow 甚至起不来）
   - 避免在 `run: |` 里写容易把 YAML 搞坏的 heredoc（尤其是嵌套引号/缩进不稳定的 `<<EOF`）。
   - 用 `printf '%s\n' ... > file` 或逐行 `echo` 生成脚本文件，减少 YAML 解析风险。
   - 有条件就本地跑 `actionlint` 先拦截语法问题（跑不了也没关系，优先把 step 拆小便于线上定位）。

4. 处理 `gh release` 类失败（Release 创建/上传）
   - 在 workflow step 里显式设置：
     - `GH_TOKEN: ${{ github.token }}`
     - `GH_REPO: ${{ github.repository }}`
   - 在创建 Release 前先 `gh release view "$TAG"`，已存在就跳过；上传附件用 `--clobber` 便于覆盖重跑产物。

5. 处理 Windows 脚本/壳差异（pwsh vs powershell）
   - 不要假设 `npm run` 里写的 `powershell ...` 一定按你期望的版本执行；在 Actions 里建议直接：
     - `shell: pwsh`
     - `run: pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/xxx.ps1`
   - 如果失败发生在“打包 zip/拷贝文件”而不是 `pkg`，优先检查路径、编码、以及压缩命令（`Compress-Archive`）。

6. 需要“快速重跑”时，移动 tag 重新触发
   - 推送修复 commit 后，用强推 tag 触发同名 tag 的 workflow：
     - `git tag -f vX.Y.Z <new-sha>`
     - `git push -f origin vX.Y.Z`
   - 如果 Release 已存在，确保 workflow 的创建步骤是“幂等”的（见第 4 点）。

7. 收尾检查
   - 用 `scripts/gh_actions.py release-assets` 确认 Windows/macOS 产物都在（zip/dmg 等），大小看起来合理。
   - 删掉临时调试用 workflow（例如 `echo.yml`），避免污染仓库和误触发。

## 本次踩坑案例（可加载）

- 参考：`references/x-get2put-v0.3.6.md`（位于本 skill 的 `references/` 目录）

## Resources

### scripts/
- `scripts/gh_actions.py`：用 GitHub API 列出 runs / jobs / steps / release assets（支持不登录的公共仓库；如有 `GITHUB_TOKEN` 会自动走鉴权）

### references/
- `references/x-get2put-v0.3.6.md`：一次真实从 red → green 的排障记录（问题 → 定位方式 → 修复点 → 验证方式）
