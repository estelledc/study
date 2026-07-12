# Study Agent 推进契约

本文件只规定 `study` 的推进方式，不定义长期内容目标。`study` 是公开学习产品，不是按笔记数量运行的生产队列。所谓“持续推进”，是一个持续 supervisor 负责只读观察，由外部定时器或事件反复唤醒；每次需要写入时进入一个有界 epoch。supervisor 不因单个切片完成而宣告项目结束，但 writer 绝不运行成无预算死循环。

## 开始前

1. 把本目录视为独立 Git 仓库。先检查当前分支、`git status --short --branch` 和现有 diff；既有改动属于用户，不覆盖、不清理、不自动 rebase。
2. 阅读 `docs/operations-index.md`、`docs/operations-policy.md`、`data/operations-policy.json` 和 `SESSION-HANDOFF.md`。
3. 用实时命令重新取状态，不相信 handoff、状态页或历史计划中的数量快照。
4. 写入前在当前计划中声明一份 supervisor / epoch contract：
   - `status`：`running / WAIT_HEALTHY / PARKED_HUMAN / PARKED_NO_DELTA`；
   - `objective`：本轮只解决什么可观察问题；
   - `scope`：允许修改的目录或组件；
   - `activated_by`：定时检查、外部状态变化、明确 backlog 或用户指令；
   - `review_after`：本执行窗口最晚复核时间；
   - `acceptance_checks`：独立验收命令与预期结果；
   - `budget`：切片数、墙钟时间和并发上限；
   - `external_outcome`：本轮要形成的可审查结果；未授权外部动作时，默认只是本地 review-ready change set，D 轴不提升；
   - `stop_conditions`：何时结束 writer epoch 并进入等待或人工暂停；
   - `superseded_by`：被新 contract 取代时指向新入口，否则为 `none`。

调用方没有给预算时，每个 epoch 默认最多 3 个切片、120 分钟、同时 1 个可写切片；一个自动执行窗口最多 6 个串行 epoch 或 480 分钟。可以并行做只读调查，但不得让多个 agent 同时编辑同一工作树。持续运行需要宿主调度器或事件源；仓库内不 busy-poll，不用长 sleep 假装常驻。

## Supervisor 状态机

```text
BOOT -> OBSERVE -> CLASSIFY -> PREPARE_EPOCH -> RUN_ONE_SLICE
                                  ^                    |
                                  |                    v
WAIT_HEALTHY <- RECORD <- VERIFY <-+              PARKED_HUMAN
       |
       +-- scheduled/event wake --> OBSERVE
```

- `OBSERVE` 只运行政策列出的只读巡检；绿色巡检不创建 writer、不调用 agent 发明任务。
- `CLASSIFY` 只接受新 detector fingerprint、明确 backlog 或可核验的外部状态变化。
- epoch 内切片通过且仍有证据时自动继续；epoch 结束后，在同一执行窗口内可以自动开启下一 epoch。
- 没有可执行证据时进入 `WAIT_HEALTHY`，只更新 gitignored supervisor runtime 后把等待交给宿主调度器；绿色巡检不修改 tracked handoff。这表示 supervisor 仍处于 armed 状态，不表示 writer 继续占用资源。
- 连续 3 个 agent 批次没有 external delta 时进入 `PARKED_NO_DELTA`。新 epoch、重启、local diff、测试通过或 handoff 更新都不能清零；只有真实外部变化或用户重新授权可以唤醒写入。

## 选题顺序

每个切片都必须有当前证据，按以下顺序取第一项合适工作：

1. 调用方明确指定且仍在 run contract 内的问题；
2. 当前 CI、测试、审计或运行态报告中的失败；
3. 能用前后对比证明的工具链、站点质量或操作安全缺口；
4. 已明确记录且有独立验收的下一项。

没有证据支持下一项时进入 `WAIT_HEALTHY`，不为维持循环而发明工作。内容总数、commit 数、页面数和 agent 数都不是成功指标。

## 单切片循环

1. 记录受影响范围的最小基线，并区分原有失败。
2. 把目标收窄为一个可独立验收的切片；只允许一个可写切片处于进行中。
3. 做最小修改，不顺手扩展到内容生产、历史正文改写或其他组件。
4. 先跑定向测试和 `git diff --check`；跨层修改再跑 `npm run verify:ci`。
5. 对照基线写清 measurable delta、测试结果和未覆盖风险。
6. 当前切片通过、工作树可解释、预算未耗尽且下一项仍在同一 epoch contract 内时，直接进入下一切片，不需要逐片重新确认。

## 自动巡检与自动检修

supervisor 每次唤醒先运行 `data/operations-policy.json` 的 `automatic_inspection.commands`。只有同时满足“确定性 detector fingerprint、在 epoch scope 内、可逆本地修改、前后快照、定向验收、不改变外部状态”时，才允许自动检修；同一 fingerprint 最多尝试 2 次。

默认自动检修 allowlist：瞬时只读检查重试、当前 scope 内的格式/空白、已有目标的操作文档链接、确定性派生输出漂移、由本轮真实验证结果驱动的 handoff 刷新。任何一项缺少证据都转 `PARKED_HUMAN`。

以下永不自动修：学习笔记正文、候选/重写/audit 队列、历史失败、review receipt、政策/阈值/基线、删测或跳过门禁、依赖/lockfile、工具链安装、worktree 拓扑、Git 历史、远端状态、凭证或敏感信息。

## 权限边界

- 本地 workflow 文档、测试、审计、工具链和站点质量修复，可以在 launch scope 内连续推进。
- 新增或批量生产内容、改写既有笔记正文、修改候选队列、真实 dispatch/merge round，都需要单独授权；dry-run 不授权 apply。
- commit、push、创建 PR、merge 和 deploy 是不同外部动作，分别授权。默认不修改远端，不直接写入 `main`。
- 不通过放宽门禁、删除历史失败、重置 worktree 或改 tracked policy 标志来制造“通过”。
- 旧 `/auto-push`、数量目标和 legacy handoff 不是活动入口。
- `scripts/exit-conditions.mjs` 是永远 fail-closed 的退役兼容入口，不得作为 supervisor 决策器。
- ignored supervisor state、lease 和事件日志只记录运行态，永远不是授权凭证。

## 等待、硬暂停与交接

预算或执行窗口耗尽时，writer 结束并交接，supervisor 回到定时/事件驱动的观察状态，不自动刷新预算。意外工作树重叠、round lock 活跃、政策冲突、规范工具链不可用、敏感信息风险、同 fingerprint 修复次数耗尽、新权限需求、基线不可复现或只能放宽门禁继续时，立即进入 `PARKED_HUMAN`。

每个 writer epoch 完成或进入 `PARKED_*` 等实质状态变化时更新 `SESSION-HANDOFF.md`，只记录 supervisor 状态、scope、起始 ref、detector fingerprint、external delta 计数、已完成切片、验证结果、剩余 blocker、下一次 wake 条件和下一条可执行命令。重复绿色巡检只更新 gitignored runtime，不为了记录“没变化”制造 tracked diff。不得复制队列数量、ETA 或其他可由命令重新获得的易过期快照。
