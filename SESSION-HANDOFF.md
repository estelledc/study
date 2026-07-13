# Study 操作交接入口

> 状态：当前接班入口。旧的批量生产 session 快照已失效，不得用于恢复自动循环；持续运行使用只读 supervisor + 有界 writer epoch。

## 当前接班点

- supervisor 状态：`WAIT_HEALTHY`；`scale-budget-exceeded` 已通过批准的 legacy audit review 聚合迁移解除，当前无 hard blocker。
- scope：launch scope 内的本地 workflow 文档、测试、审计、工具链和站点非内容代码质量维护。
- 起始 ref：`c309d5d270e30ec7764c4a7d456a1dde4b489b49`（PR #24 merge commit）；本轮从最新 `origin/main` 新建本地分支 `codex/study-audit-evidence-migration`，未 push。
- detector fingerprint：原失败为 `node scripts/benchmark-site.mjs --compare data/performance-baseline.json` 报告 `repository.tracked_files=4745 exceeds baseline=2733, threshold=3007`。根因是 1975 条 legacy audit review 以逐文件 JSON 存放。已迁移为 `data/audit-reviews/legacy-audit-reviews.jsonl` + `manifest.json`，并保留每条原始 review 的路径、字节数与 SHA-256。
- external delta 计数：PR #24 已 merged；main build/deploy 已通过。当前迁移分支只有本地提交，D 轴在 push/PR 前不提升。
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
- 验证结果：`npm run audit:legacy-reviews` 通过，验证 1975 records；`node scripts/benchmark-site.mjs --compare data/performance-baseline.json` 通过；`npm run status:supervisor` 返回 `WAIT_HEALTHY`、`blockers=[]`；`npm run verify:ci` 全部通过（含 tests、strict build 2062 页、23 个 Playwright a11y 测试、Pages artifact、Atlas/site benchmark）。
- 剩余 blocker：无。Publication 仍按政策需要单次授权；本轮迁移不授权内容 round。
- 下一次 wake 条件：用户授权 push / Draft PR，远端 CI/review/head 变化，content-health issue，或新的研究/维护指令。无外部变化时进入普通健康检查。
- 下一条命令：`source "$HOME/.nvm/nvm.sh" && nvm use 22.23.1 >/dev/null && npm run status:supervisor`；若授权远端动作，再先执行 `git status --short --branch && git log --oneline -3`，随后精确 push 当前分支。
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
