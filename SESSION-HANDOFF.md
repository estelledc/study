# Study 操作交接入口

> 状态：当前接班入口。旧的批量生产 session 快照已失效，不得用于恢复自动循环；持续运行使用只读 supervisor + 有界 writer epoch。

## 2026-07-14 新增 4 篇论文与部署 Epoch Contract

- status：`running`
- objective：在当前用户明确授权下，新研究并发布 4 篇公开 arXiv 论文笔记：`OSWorld`、`ToolBench-X`、`MemGym`、`SWE-Bench-CL`，补齐 agent 环境、工具可靠性、长程记忆与 SWE 持续学习四条主线。
- scope：允许新增 `src/content/docs/papers/*.md`、`data/review-receipts/papers/*.json`，以及由 atlas / note-index / 公开计数文案 / handoff / 部署门禁确定性更新的文件；不改候选队列，不改 policy/threshold，不改旧论文正文语义。
- activated_by：`explicit-user-request-2026-07-14-new-4-papers-full-deploy`
- review_after：`2026-07-14`
- acceptance_checks：
  - `source "$HOME/.nvm/nvm.sh" && nvm use 22.23.1 >/dev/null && npm run status:supervisor`
  - `source "$HOME/.nvm/nvm.sh" && nvm use 22.23.1 >/dev/null && node scripts/quality-gate.mjs src/content/docs/papers/{osworld,toolbench-x,memgym,swe-bench-cl}.md`
  - `source "$HOME/.nvm/nvm.sh" && nvm use 22.23.1 >/dev/null && npm run audit:content-contract`
  - `source "$HOME/.nvm/nvm.sh" && nvm use 22.23.1 >/dev/null && STUDY_CHANGED_FROM=f487efbcd135faf1e1de9fcd2ccf043437a244fe npm run verify:ci`
  - `git diff --check`
  - GitHub PR / merge / Pages deploy checks for the final pushed branch.
- budget：1 个内容小批次、4 篇新增 paper、1 个可写切片、1 个本地 writer、1 次部署窗口。
- external_outcome：4 篇新增论文笔记进入公开 study 站点，并通过 GitHub Pages 线上部署验收；验证状态保持 `UNVERIFIED`，不声明实际运行论文 benchmark。
- stop_conditions：规范 Node/npm 不可用；内容契约或红线审计失败且无法在本 scope 内修复；需要修改 policy/threshold、候选队列或隐私敏感内容；远端 CI/Pages 连续失败且需要新权限；用户停止。
- superseded_by：`none`

## 上一轮接班背景（保留历史）

- supervisor 状态：`WAIT_HEALTHY`；`scale-budget-exceeded` 已通过批准的 legacy audit review 聚合迁移解除，当前无 hard blocker。
- scope：launch scope 内的本地 workflow 文档、测试、审计、工具链和站点非内容代码质量维护。
- 起始 ref：`c309d5d270e30ec7764c4a7d456a1dde4b489b49`（PR #24 merge commit）；本轮从最新 `origin/main` 新建分支 `codex/study-audit-evidence-migration`，已 push 到远端并打开 PR #25。
- detector fingerprint：原失败为 `node scripts/benchmark-site.mjs --compare data/performance-baseline.json` 报告 `repository.tracked_files=4745 exceeds baseline=2733, threshold=3007`。根因是 1975 条 legacy audit review 以逐文件 JSON 存放。已迁移为 `data/audit-reviews/legacy-audit-reviews.jsonl` + `manifest.json`，并保留每条原始 review 的路径、字节数与 SHA-256。
- external delta 计数：PR #24 与 PR #25 均已 merged；main build/deploy 已通过。PR #26 已打开为 Draft，用于修正 `openai-agents-sdk` 的 v0.18.2 API / 版本漂移；本地 `npm run verify:ci` 已通过，远端状态以 PR #26 最新 head checks 为准。
- 已完成切片：
  1. 建立 recurring supervisor + bounded epoch 状态机（supervisor-policy、supervisor-status）；
  2. 加入自动巡检/自动检修 allowlist 与 denylist，包含六项 repair requirements；
  3. 把旧数量仪表盘（loop-status）收口为只读状态入口；
  4. 把旧 `exit-conditions.mjs` 退役为永远 fail-closed；
  5. 扩展 audit-operation-entrypoints 增加政策安全校验；
  6. 本机安装规范 Node 22.23.1 / npm 11.17.0（用户目录 nvm，不修改 shell profile）；
  7. 收口全部 21 个 progression-contract 文件为三个本地原子提交（e8da6035, e966686b, 4c738432）；
  8. 独立验证 epoch：重跑全量验收，verify:ci 23 步全部通过（含 strict build 2062 页、23 个 Playwright a11y 浏览器测试、350 个单元测试、所有审计），父仓 harness-check 0 error 0 warning。
  9. 修复 `status:supervisor` 对 gitignored `data/supervisor-state.json` 中 `no_delta_batches` 的读取：达到阈值时进入 `PARKED_NO_DELTA`，runtime 损坏时 fail-closed 为 `PARKED_HUMAN`；本地提交 `96860c75`。
  10. 修复 `PARKED_NO_DELTA` 的 `next_action`：明确等待真实 external delta 或 operator reauthorization，避免被误解为普通 scheduled wake；本地提交 `796efb9b`。
  11. 修复 `data/supervisor-state.json` 可解析但 schema 非法时静默清零 `no_delta_batches` 的风险：缺失字段、字符串、负数或数组均 fail-closed；本地提交 `ef31c30b`。
- 12. 修复 `status:supervisor` 漏掉规模 detector 的问题：automatic inspection 加入 `benchmark-site --compare`；`status:supervisor` 暴露 `scale-budget-exceeded`、冻结新增内容，并保持 audit evidence、performance budget 与 baseline 不变。
  13. 完成批准的 audit evidence migration：本地提交 `2acd44cef` 聚合 1975 条 legacy review，新增 `npm run audit:legacy-reviews`，删除旧 `data/audit-reviews/papers/*.json` 与 `projects/*.json` 逐文件布局。
  14. 更新 performance baseline 与操作文档：本地提交 `e68eaf52b` 记录 `repository.tracked_files=2775` 与 `legacy_audit_review_items=1975`，未提高 threshold。
  15. 发起 `openai-agents-sdk` 小型 Publication：将单篇笔记升级为 `study-v2`，锁定 OpenAI Agents SDK v0.18.2 tag commit，修正 `run_input_guardrails_first` 为 `@input_guardrail(run_in_parallel=False)`，并补静态 review receipt。
- 验证结果：`npm run audit:legacy-reviews` 通过，验证 1975 records；`node scripts/benchmark-site.mjs --compare data/performance-baseline.json` 通过；`npm run status:supervisor` 返回 `WAIT_HEALTHY`、`blockers=[]`；`npm run verify:ci` 全部通过（含 tests、strict build 2062 页、23 个 Playwright a11y 测试、Pages artifact、Atlas/site benchmark）。
- 剩余 blocker：无。Publication 仍按政策需要单次授权；本轮迁移不授权内容 round。
- 下一次 wake 条件：PR #26 出现新的 CI/review/head 状态变化，content-health issue，或新的研究/维护指令。无外部变化时进入普通健康检查。
- 下一条命令：`source "$HOME/.nvm/nvm.sh" && nvm use 22.23.1 >/dev/null && npm run status:supervisor`；PR 状态用 GitHub API 或浏览器查看 `https://github.com/estelledc/study/pull/26`。
- 下一位独立 agent 必须先读 `AGENTS.md`，建立 supervisor / epoch contract；不得自动恢复旧数量循环。

## 当前接班点：2026-07-14 4 篇论文本地执行状态

- 起始 ref：`f487efbcd135faf1e1de9fcd2ccf043437a244fe`（origin/main，PR #29 merge commit）。
- 当前分支：`study/papers-20260714-four-more`。
- dry-run 结果：`npm run round:dispatch -- --rewrite 0 --new 4 --dry-run` 因 `papers-new short: got 0, need 2` 被阻止；本轮未修改候选队列，改走显式授权的手工 Publication 路径。
- 已完成切片：
  1. 规范工具链下 `status:supervisor` 从 Node 版本 blocker 恢复到 `WAIT_HEALTHY`；
  2. 新增 4 篇 `study-v2` paper note，均为 `STATIC_ANALYSIS` / `UNVERIFIED`；
  3. 新增 4 个 `study-review-receipt-v1` 静态 review receipt，receipt digest 已通过 `verifyReceiptAgainstNote` 校验；
  4. `npm run atlas` 刷新 `data/note-index.json`、`papers-atlas.md` 与 agent 主题 atlas chunk；
  5. 同步公开规模文案：论文 1023、项目 961、总数 1984。
- 本地已通过：
  - `node scripts/quality-gate.mjs` 针对 `osworld`、`toolbench-x`、`memgym`、`swe-bench-cl` 四篇；
  - `npm run audit:counts`；
  - `npm run audit:content-contract`；
  - `git ls-files -co --exclude-standard -z | node scripts/audit-public-redlines.mjs --stdin0`；
  - `npm run build:strict -- --log /tmp/study-build-check.log`；
  - `git diff --check`。
- 剩余动作：提交当前变更，提交后重跑 `STUDY_CHANGED_FROM=f487efbcd135faf1e1de9fcd2ccf043437a244fe npm run verify:ci`，随后推送分支、创建 PR、合并并等待 Pages deploy。

## 当前政策

- 不以内容总数作为本轮目标。
- `/auto-push` 已停用；不自动派发、提交或推送 `main`。
- launch scope 内的本地维护可以按 `AGENTS.md` 由 supervisor 持续观察并进入有界 epoch；内容 round 仍只允许显式授权、有限数量、先 dry-run 后确认。
- 既有笔记正文不可批量重写；历史 failure events 不得删除。
- 发布、队列和 worktree 的实时状态必须由命令重新读取，不在 handoff 中复制易过期数字或 ETA。

## 重新获取事实

```bash
npm run status:supervisor
npm run status:pipeline
node scripts/audit-runtime-state.mjs --json
node scripts/loop-status.mjs --json
```

操作顺序、停止条件和外部权限边界见：

- `AGENTS.md`
- `docs/operations-index.md`
- `docs/operations-policy.md`
- `data/operations-policy.json`
