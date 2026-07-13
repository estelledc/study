# 操作安全政策

关联任务：STUDY-T019。

## 默认边界

- 批量内容生产关闭；内容数量不是退出条件或成功指标。
- policy 缺失或损坏时一律按关闭处理；tracked `APPROVED`、`approved_target` 或 supervisor state 都不能授权写入，只有未来绑定 operation/round、会过期且单次消费的批准收据才能改变批量入口判断。
- 远端发布默认关闭；不直接推送 `main`。
- 不批量改写既有笔记正文。
- 保留所有历史失败事件；恢复逻辑只能追加证据。
- 所有内容流水线写操作先通过当前 commit、路径范围、锁所有权和 dry-run 计划检查；普通本地维护按 run contract 的 baseline、scope 和 acceptance checks 执行。

## 持续 Supervisor 与有界 Writer

持续推进由“只读 supervisor + 有界 writer epoch”组成。supervisor 由宿主定时器或外部事件反复唤醒；仓库本身不 busy-poll。独立 agent 可以在一份显式 epoch contract 内连续完成多个本地维护切片，不必在每个切片后再次询问。contract 字段以 `data/operations-policy.json` 为准；没有显式预算时每个 epoch 使用最多 3 个切片、120 分钟和 1 个并行可写切片的默认值，一个执行窗口最多 6 个 epoch 或 480 分钟。

持续维护只覆盖 launch scope 内的 workflow 文档、测试、审计、工具链和站点质量修复。每个切片必须有最小基线、detector fingerprint、独立验收和 measurable delta。没有证据充分的下一项时进入 `WAIT_HEALTHY`，不为保持运行而制造任务；绿色巡检不 spawn writer。只读调查可以并行，写入始终串行。

这不是旧内容循环的重启，也不改变 `bulk_production.enabled=false`。新增内容、既有笔记正文改写、候选队列写入、真实 round、commit、push、PR、merge 和 deploy 仍按各自边界单独授权。未获外部动作授权时，`external_outcome` 默认只是本地 review-ready change set，并明确 D 轴未变化。

## 自动巡检与自动检修

巡检命令、repair allowlist、requirements、denylist 和 hard pause 均由机器政策固定。自动检修必须同时具备确定性 detector fingerprint、精确 epoch scope、可逆本地修改、前后快照、定向验收且不改变外部状态；同一 fingerprint 最多尝试 2 次，失败后 `PARKED_HUMAN`。

allowlist 只覆盖瞬时只读检查重试、scope 内格式/空白、已有目标的操作文档链接、确定性派生输出漂移和由真实验证结果驱动的 handoff 刷新。内容、队列、历史证据、政策/阈值、删测、依赖、工具链安装、worktree 拓扑、Git 历史、远端与凭证相关问题永不自动修。

规模 detector 是 automatic inspection 的一部分：`node scripts/benchmark-site.mjs --compare data/performance-baseline.json` 失败时必须冻结新增内容、保留 audit 证据、保持 performance budget / baseline 不变，并进入 `PARKED_HUMAN` 等待人工迁移或处置决策。绿色 `status:supervisor` 不能隐藏规模比较失败。

supervisor 运行态、lease 和事件日志必须位于 gitignored 路径；它们只用于并发、退避和 fingerprint 去重，不能授予权限。绿色巡检只更新这些运行态，不写 tracked handoff；只有 writer epoch 完成或 `PARKED_*` 等实质状态变化才更新 `SESSION-HANDOFF.md`。连续 3 个 agent 批次没有 external delta 时进入 `PARKED_NO_DELTA`；local diff、测试通过、handoff、重启或新 epoch 都不算 external delta，也不能重置计数。

## 文档生命周期

agent 推进合同从仓库根目录 `AGENTS.md` 获取；活动操作说明和安全政策只从 `operations-index.md`、本文件和 `data/operations-policy.json` 获取。带日期的 handoff、状态页与 archive 只提供历史背景；当它们与机器状态或当前政策冲突时，以当前政策和实时命令为准。

## 停止条件

预算或执行窗口耗尽时结束 writer 并交接，不由 supervisor 自行刷新预算。版本漂移、commit scope 超界、意外工作树重叠、round lock 活跃、队列事务未恢复、锁损坏/所有者不符、历史事件减少、规范工具链不可用、构建/审计失败、敏感信息风险、规模指标超限、新权限需求、同 fingerprint 修复次数耗尽、基线不可复现或只能放宽门禁时进入 `PARKED_HUMAN`。连续 3 个 agent 批次没有 external delta 时进入 `PARKED_NO_DELTA`，等真实外部变化或用户重新授权。

## 重新授权

一份 supervisor / epoch contract 可以授权其 scope 和 budget 内连续的本地维护，但不能推导出内容 round 或外部动作权限。恢复小轮次、commit、远端 push、PR、合并或生产部署必须按调用方给出的边界分别判断。tracked policy 与 ignored supervisor state 都不能充当可重放授权凭证；当前没有实现绑定 operation/round、带过期时间且单次消费的批准收据，因此所有非 dry-run 批量入口保持关闭。
