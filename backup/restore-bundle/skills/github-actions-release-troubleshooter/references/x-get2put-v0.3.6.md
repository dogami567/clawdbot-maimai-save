# X-get2put v0.3.6：Release 流水线排障记录（案例）

目的：把一次真实的“从红到绿”的排障过程沉淀下来，后续遇到类似问题按同样方法收敛定位。

## 关键目标

- tag（`v0.3.6`）触发 GitHub Actions
- 自动创建 GitHub Release（若已存在则跳过）
- Windows 产物：`pkg` 生成 `exe` → 打包 zip → `gh release upload`
- macOS 产物：`pkg` 生成 arm64/x64 → zip + dmg → `gh release upload`
- 不让人一直盯 Actions UI：用 GitHub API 拿到失败 step

## 主要问题与解决方式

### 1) Workflow YAML 解析失败（起不来）

现象：
- workflow 直接失败，无法进入 job/step 执行。

处理：
- 避免在 `run: |` 里使用 heredoc（`<<EOF`）等高风险写法。
- 改用 `printf '%s\n' ... > file` 生成脚本文件。
- 用 `actionlint` 本地校验（可选，但非常省时间）。

结论：
- YAML/缩进类问题先“离线校验 + 简化 shell 写法”，不要在线猜。

### 2) `gh release create` 失败（Release 创建/查询异常）

现象：
- `gh release create/view` 在 Runner 中报错，无法确定目标仓库或权限异常。

处理：
- 在 step 环境变量中显式设置：
  - `GH_TOKEN: ${{ github.token }}`
  - `GH_REPO: ${{ github.repository }}`
- 创建前先 `gh release view "$TAG"`；已存在就跳过创建，保证幂等。
- 上传附件使用 `--clobber`，支持重跑覆盖。

结论：
- `gh` 在 Actions 里尽量“显式给足上下文”，不要依赖默认推断。

### 3) Windows job 失败，但看不到日志（只知道 Step failure）

现象：
- 无鉴权场景下，通过 GitHub API 只能拿到 job/step 的结论，无法下载日志（403）。

处理：
- 用 GitHub API 的 jobs 端点拿到失败 step 名称，先靠 step 粒度定位：
  - `/actions/runs/{run_id}/jobs?per_page=100`
- 把大 step 拆小（尤其是 `npm run release:exe` 拆成 `Build EXE` 与 `Package ZIP`），让 API 返回更精确。
- 使用 `scripts/gh_actions.py` 快速查看：
  - `runs` 看 run_id
  - `jobs` 看具体失败 step

结论：
- 看不到日志时，唯一有效策略是“缩小 step 粒度”，让系统告诉你坏在哪一步。

### 4) Windows `Package ZIP` 失败（Build 已成功）

现象：
- `Build EXE` 成功
- `Package ZIP` 失败（1 秒内失败，明显是脚本/运行环境问题而不是 pkg）

处理：
- 不再通过 `npm run package:exe` 间接调用 `powershell ...`，而是在 workflow 里直接：
  - `shell: pwsh`
  - `run: pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/package-exe.ps1`

结论：
- Windows Runner 上要避免 `powershell`/`pwsh` 版本差异导致的“同脚本不同结果”。
- 关键脚本建议在 workflow 中显式用 `pwsh` 执行。

## 验证方式（最终 green 的标准）

- Actions：`create-release` / `build-windows` / `build-macos` 都是 `success`
- Release 资产齐全且大小合理（示例）：
  - `X-get2put-<tag>-win-x64.zip`
  - `X-get2put-<tag>-macos-arm64.zip` / `.dmg`
  - `X-get2put-<tag>-macos-x64.zip` / `.dmg`
- 可用命令：
  - `python scripts/gh_actions.py release-assets --repo dogami567/X-retweet-bot --tag v0.3.6`

## 收尾

- 删除调试用 workflow（如 `echo.yml`），保持仓库干净。

