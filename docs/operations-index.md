# Study 操作索引

这是仓库唯一的活动操作入口。关联任务：STUDY-T019。

## 1. 持续 Supervisor + 有界 Epoch

未来独立 agent 先读取仓库根目录 `AGENTS.md`，并在写入前声明完整 supervisor / epoch contract。默认推进方式是：

```text
scheduled/event wake -> observe -> classify -> one bounded writer epoch
                       -> verify -> record -> next epoch or WAIT_HEALTHY
```

- 同时只允许 1 个可写切片；只读调查可以并行。
- 同一 epoch 内，切片通过且预算未耗尽时直接进入下一片；同一执行窗口内可自动开启下一 epoch，不需要逐片重新确认。
- 每个 epoch 默认 3 个切片或 120 分钟；每个执行窗口最多 6 个 epoch 或 480 分钟。
- 没有证据充分的下一项时进入 `WAIT_HEALTHY`，由宿主定时器或外部事件重新唤醒，不 busy-poll、不保持 writer 空转。
- 连续 3 个 agent 批次没有 external delta 时进入 `PARKED_NO_DELTA`；新 epoch、重启和本地变化不能绕过。

这份持续授权只覆盖 launch scope 内的本地观察和 allowlist 自动检修，不授权内容批量生产、队列写入或任何远端动作。宿主调度器负责“常驻”，仓库政策负责每次写入仍然有界。

## 2. 只读了解状态

```bash
npm run status:supervisor
npm run status:pipeline
node scripts/audit-runtime-state.mjs --json
node scripts/loop-status.mjs --json
node scripts/benchmark-site.mjs --compare data/performance-baseline.json
```

这些命令不授权内容生产或远端发布。

绿色巡检结果只进入 `WAIT_HEALTHY`，不能为了“持续”生成任务。detector 失败只有同时满足政策中的自动检修 requirements 与 allowlist 才能进入 writer epoch；denylist 或歧义一律 `PARKED_HUMAN`。

`round:preflight` 不是通用状态命令：它要求干净的 `main`，并且只服务另行授权的内容 round。

## 3. 小轮次计划

当前默认禁止 bulk production。只有操作者明确授权一个有限小轮次时，才先运行：

```bash
npm run round:dispatch -- --rewrite 0 --new 4 --dry-run
```

检查确定性 plan、任务范围和停止条件后，另行确认是否 apply。不得用旧 `/auto-push` skill 绕过确认。

`round:auto-prepare` 和 dry-run 都不 claim 队列，不能把未 claim 的计划直接派给 worker。真实 dispatch、worker merge 和 final gate 必须属于同一份有界授权与 provenance。

`scripts/exit-conditions.mjs` 已退役并永远返回退出；不得用 tracked `APPROVED` 或任何旧数量字段恢复循环。

## 4. 验证、交接与发布

- worker 合并必须通过单目标 commit scope 与质量门。
- `npm run verify:ci` 是 PR/Pages 的可移植门禁。
- `npm run verify:pipeline` 只用于具备本机 worktree/runtime 的桌面环境。
- 单切片优先跑受影响的定向测试和 `git diff --check`；跨层改动再跑 `verify:ci`。
- 每个 writer epoch 完成或进入 `PARKED_*` 等实质状态变化时按 `AGENTS.md` 更新 `SESSION-HANDOFF.md`；重复绿色 `WAIT_HEALTHY` 只更新 gitignored runtime，不制造 tracked diff，也不复制实时数量或 ETA。
- 默认不推远端；草稿 PR、合并和生产部署是不同授权步骤。

详细政策见 `operations-policy.md`；机器可读版本见 `../data/operations-policy.json`。
