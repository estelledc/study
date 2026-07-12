# 后续计划（已被取代）

> 原计划基于过期的队列与内容数量快照，并把无上限批量生产列为优先事项；自 2026-07-10 起不再作为执行依据。

当前工作只从以下入口读取：

1. `AGENTS.md`：独立 agent 的持续 supervisor + 有界 epoch 契约。
2. `docs/operations-index.md`：唯一操作索引。
3. `data/operations-policy.json`：可被脚本读取的安全政策。
4. `npm run status:pipeline` 与 `node scripts/audit-runtime-state.mjs --json`：实时状态。

恢复任何内容生产或生产部署都需要后续单独、明确的用户授权。本文件不授权写笔记、修改队列、推送 `main` 或部署。
