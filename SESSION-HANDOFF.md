# Study 操作交接入口

> 状态：当前接班入口。旧的批量生产 session 快照已失效，不得用于恢复自动循环；持续运行使用只读 supervisor + 有界 writer epoch。

## 当前接班点

- supervisor 状态：`WAIT_HEALTHY`；supervisor 已 armed，观察器运行只读巡检，writer 无待处理任务。
- scope：launch scope 内的本地 workflow 文档、测试、审计、工具链和站点非内容代码质量维护。
- 起始 ref：`e966686b356c428146b94af7098f673d24eb4fdd`（progression-contract 收口后的 HEAD）。
- detector fingerprint：排除动态 handoff 后工作树干净，无未提交的契约变更。
- external delta 计数：0；本地提交、测试通过、handoff 更新不计 external delta。
- 已完成切片：
  1. 建立 recurring supervisor + bounded epoch 状态机（supervisor-policy、supervisor-status）；
  2. 加入自动巡检/自动检修 allowlist 与 denylist，包含六项 repair requirements；
  3. 把旧数量仪表盘（loop-status）收口为只读状态入口；
  4. 把旧 `exit-conditions.mjs` 退役为永远 fail-closed；
  5. 扩展 audit-operation-entrypoints 增加政策安全校验；
  6. 本机安装规范 Node 22.23.1 / npm 11.17.0（用户目录 nvm，不修改 shell profile）；
  7. 收口全部 20 个 progression-contract 文件为两个本地原子提交。
- 验证结果：supervisor/退役入口/审计定向测试全部通过，`npm run verify:scripts` 350/350 通过，`audit:operations` 和 `audit:doc-lifecycle` 均 OK，父仓 `make harness-check` 0 error 0 warning，`git diff --check` 通过。工具链 Node 22.23.1 / npm 11.17.0 正确。`npm run verify:ci` 在提交前因工作树不干净在 `git diff --exit-code` 处停止（预期），提交后应通过。
- 剩余 blocker：无本地 blocker。未授权 push、PR、merge、deploy 或任何远端写操作；未授权内容生产或笔记正文修改。
- 下一次 wake 条件：scheduled-health-check 定时触发、外部 CI/HEAD/owner-review 状态变化、明确 backlog ticket、或用户新指令。
- 下一条命令：`npm run status:supervisor` 确认仍为 WAIT_HEALTHY，然后运行 `npm run verify:ci` 做完整门禁验证。
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
