# Study 操作交接入口

> 状态：当前接班入口。旧的批量生产 session 快照已失效，不得用于恢复自动循环；持续运行使用只读 supervisor + 有界 writer epoch。

## 当前接班点

- supervisor 状态：`PARKED_HUMAN`；supervisor 已 fail-closed 观察到 `scale-budget-exceeded`，writer 不可继续新增内容。
- scope：launch scope 内的本地 workflow 文档、测试、审计、工具链和站点非内容代码质量维护。
- 起始 ref：`fc24c0563313e08947134f5d6af9c0b5307e75d5`；本轮以普通 merge 合入最新 `origin/main`，不得 rebase 或改写历史。
- detector fingerprint：`node scripts/benchmark-site.mjs --compare data/performance-baseline.json` 失败，`repository.tracked_files=4745 exceeds baseline=2733, threshold=3007`。增长来源经 Git 路径分布核验：当前 HEAD 有 1975 个 tracked files 位于 `data/audit-reviews/`，baseline source commit 中该目录为 0；不得自动删除证据、刷新 baseline 或放宽阈值。
- external delta 计数：已形成远端 feature branch 与 PR #24；远端 CI 状态以 `gh pr checks 24 --repo estelledc/study` 为准。
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
- 12. 修复 `status:supervisor` 漏掉规模 detector 的问题：automatic inspection 加入 `benchmark-site --compare`；`status:supervisor` 现在暴露 `scale-budget-exceeded`、冻结新增内容，并保持 audit evidence、performance budget 与 baseline 不变。
- 验证结果：定向 `node --test scripts/supervisor-status.test.mjs scripts/lib/supervisor-policy.test.mjs scripts/audit-operation-entrypoints.test.mjs scripts/benchmark-site.test.mjs` 21/21 通过；`npm run verify:scripts` 通过；`npm run verify:ci` 本地通过；远端 PR #24 的 `verify:ci` 已在修复提交上通过。工具链 Node 22.23.1 / npm 11.17.0 正确。
- 剩余 blocker：`scale-budget-exceeded`。若结论是 baseline 陈旧，只能另行提交迁移方案与证据；本轮不授权更新 baseline、阈值、队列或删除 `data/audit-reviews/`。
- 下一次 wake 条件：PR #24 出现新的 CI/HEAD/review 状态变化，或操作者明确授权 baseline 迁移 / audit evidence 存放策略调整。没有外部变化时保持 `PARKED_HUMAN`，不启动内容生产。
- 下一条命令：`source "$HOME/.nvm/nvm.sh" && nvm use 22.23.1 >/dev/null && npm run status:supervisor` 复核 `scale-budget-exceeded`；PR 状态用 `gh pr view 24 --repo estelledc/study --json isDraft,headRefOid,mergeStateStatus,statusCheckRollup,reviews,comments`。
- 下一位独立 agent 必须先读 `AGENTS.md`，建立 supervisor / epoch contract；不得自动恢复旧数量循环。

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
