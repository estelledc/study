---
title: Inngest — 让 async 函数自动从断点恢复的工作流引擎
来源: 'https://github.com/inngest/inngest'
日期: 2026-05-30
分类: projects
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: system
  canonical_source: https://github.com/inngest/inngest
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: a54673a45b00ea10917620ab3e05a21d04579db7
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.44.0
---

## 是什么

Inngest 是一套 **durable execution** 平台：你在应用里写带 `step` 的函数，执行器通过 HTTPS（或 Connect）反复调用同一入口；已完成步骤的输出存在外部 state store，进程崩溃后从断点继续。日常类比：后厨记账本——每做完一道工序画勾，换班的人不用从切菜重来。

应用侧常用官方 TS SDK `inngest@4.18.1`。固定 SDK 的注册已经是两参数，触发器写进 options，不再是「options + event + handler」三参数：

```ts
inngest.createFunction(
  { id: "welcome-flow", triggers: { event: "user/signed_up" } },
  async ({ event, step }) => {
    await step.run("send-welcome", () => sendEmail(event.user))
    await step.sleep("wait-day", "24h")
    await step.run("send-tip", () => sendTip(event.user))
  },
)
```

平台仓库 `inngest/inngest` 提供 Event API、Runner、Queue、Executor、state store 和 Dev Server；语言 SDK 是独立仓。

## 为什么重要

不理解这套「SDK 吐 opcode、执行器存状态再回放」的分工，下面这些事会对不上：

- 为什么 Vercel / Lambda 这种短生命周期进程能跑「睡 24 小时再继续」
- 为什么改 `step.run` 的 id 会让进行中的 run 丢档
- 为什么旧笔记里的三参数 `createFunction` 在 4.18.1 会直接抛错
- 为什么自托管要面对 SSPL，而 SDK 是 Apache-2.0

## 核心架构与流程

固定 `v1.44.0` 的执行链可以拆成五步：

1. **事件进系统**：Event API 收 SDK 的 HTTP 事件，写入内部 event stream。Runner 按函数触发器创建 run，把初始状态写入 state store，再入队。

2. **执行器只跑一步**：Executor 调 driver（默认 HTTPS 打到你的 serve 端点）执行当前需要的步骤，把输出或错误写回 state。异步边（sleep、waitForEvent）会留下 pause，到期或匹配后再入队。

3. **SDK 用 opcode 说话**：TS SDK 把 `step.run` / `sleep` / `waitForEvent` / `waitForSignal` / `invoke` / `ai.infer` / `defer` 等编成 `GeneratorOpcode`。平台枚举从 `OpcodeNone` 到 `OpcodeDeferAbort` 共 17 个 iota 值；SDK `StepOpCode` 另有遗留 `Step` 和 `StepNotFound`。

4. **步骤身份证是 SHA-1**：用户写的 id 经 `sha1().update(id).digest("hex")` 变成 state key。重放时命中同一哈希就返回缓存，跳过函数体。改名等于换钥匙。

5. **硬边界写在 consts**：step 输入/输出各 4MB，单次 SDK 请求体 4MB，默认单函数最多 1000 step（执行器绝对上限 10000），sleep / waitForEvent 最长 366 天，默认重试 4 次（加首次共 5 次），函数/step 最长 2 小时。

## 实践示例

### 案例 1：注册后的延时邮件

```ts
inngest.createFunction(
  { id: "onboarding", triggers: { event: "user/signed_up" } },
  async ({ event, step }) => {
    await step.run("welcome", () => sendEmail(event.user, "welcome"))
    await step.sleep("wait-day", "24h")
    await step.run("tip", () => sendEmail(event.user, "tip"))
  },
)
```

`step.sleep` 发的是 `OpcodeSleep`，duration 在 opts 或遗留 `name` 字段；执行器解析后入延迟队列，不是在 Node 进程里 `setTimeout`。`triggers` 可以是单个对象或数组。

### 案例 2：看 memoization 是否生效

```ts
let attempts = 0
inngest.createFunction(
  { id: "demo-replay", triggers: { event: "toy/run" } },
  async ({ step }) => {
    await step.run("always-ok", () => { console.log("A"); return "A" })
    await step.run("flaky", () => {
      attempts++
      if (attempts === 1) throw new Error("transient")
      return "B"
    })
  },
)
```

第一次 `flaky` 失败会以 `OpcodeStepError` 回去并按重试策略再 invoke。成功后的 `always-ok` 在后续重放应走缓存。用进程内 `attempts` 计数只适合单进程玩具；多实例时必须靠 step 输出或外部去重。

### 案例 3：改 id 与本地 Dev Server

把 `"flaky"` 改成 `"flaky-v2"` 后，state 里旧哈希对不上，进行中的 run 会把已完成步骤当新步骤。本地用 `npx inngest-cli@latest dev`，README 写的仪表盘是 `http://localhost:8288`。生产可接 Inngest Platform 或自托管同一套组件。

## 踩过的坑

1. **继续写三参数 `createFunction`**：4.18.1 的第二参必须是 handler，否则抛错并提示把 triggers 放进第一参。
2. **`step.run` 无幂等**：HTTP 可能重试同一步。直接 `INSERT` 而不带去重，会写出重复副作用。
3. **改 step id 等于丢档**：哈希变了，旧输出对不上；重命名要灰度或接受重跑。
4. **把 4MB / 1000 step 当软提示**：超限是执行器拒绝，不是警告。大文件应只存 URL。
5. **把平台许可写成 MIT**：服务器与 CLI 是 SSPL + 延迟 Apache-2.0；SDK 才是 Apache-2.0。

## 适用 vs 不适用场景

**适用**：

- 跨小时、跨天的多步流程（注册、超时取消、审批）
- 部署在无状态 HTTP 环境，由平台回拨 serve 端点
- 需要按 step 查看输入输出，而不是自己维护 status 字段机

**不适用**：

- 每秒海量小任务、且不能接受「每步一次调度」的开销——应先实测，而不是套用未绑定的往返数字
- 必须把执行引擎留在进程内、不能把状态交给外部 store
- 自托管却不能接受 SSPL 的服务端条款
- 仍按三参数 SDK 文档改 4.18.1 代码

## 固定版本边界

- 本文绑定 `inngest/inngest@a54673a4...`，release tag `v1.44.0`。
- TS 示例对照 `inngest/inngest-js` 的 `inngest@4.18.1`（annotated tag 解引用 `bf41c415...`，与 npm `gitHead` 一致）。Python / Go / Kotlin SDK 未展开。
- 固定平台另有 Connect、durable endpoints、AI gateway、defer；本文只静态阅读，不声明这些路径已在目标环境跑通。
- 未安装依赖、未起 Dev Server / 自托管栈、未发事件，状态保持 `UNVERIFIED`。

## 学到什么

1. **可恢复性来自外部状态，不是更长的进程**——代码声明步骤，store 记住结果。
2. **用户可见的 step id 不是存储主键**——真正的钥匙是 SHA-1。
3. **SDK 与执行器靠 opcode 对齐**——枚举变了，旧「15 种 opcode」不能再当事实。
4. **许可分层和 API 形态都要绑 revision**——SSPL 与两参数 `createFunction` 都不是口耳相传能代替的。

## 应用型自测

1. 在 `inngest@4.18.1` 里写 `createFunction({ id }, { event }, handler)` 会怎样？
2. 把进行中 run 的 `"send-welcome"` 改成 `"send-welcome-v2"`，已发出的欢迎邮件还会被当成已完成步骤吗？
3. `step.sleep("wait", "400d")` 在固定执行器上一定成功吗？

检查点：

1. 会抛错。第二参必须是 handler，触发器放在 `triggers`。
2. 不会。新 id 的 SHA-1 对不上旧 state，这一步会重跑。
3. 不一定。sleep 上限是 366 天，超过会按 timeout-too-long 拒绝。

## 延伸阅读

- 文档：[inngest.com/docs](https://www.inngest.com/docs)
- 固定平台源码：[inngest/inngest](https://github.com/inngest/inngest) —— 本文绑定提交 `a54673a45b00ea10917620ab3e05a21d04579db7`
- 固定 TS SDK：[inngest/inngest-js](https://github.com/inngest/inngest-js) —— `inngest@4.18.1` / `bf41c415939804c8a947d1d14aec22b2c3ea16e8`
- [[temporal]] —— worker 长连路线的对照
- [[postgresql]] —— 自托管常见的历史/元数据存储

## 关联

- [[temporal]] —— 同样做 durable workflow，部署哲学不同
- [[kafka]] —— 用事件流重建状态的同源思路
- [[redis]] —— 固定执行器队列实现之一
- [[postgresql]] —— 系统库与历史记录常见落点
- [[langchain]] —— 多步 LLM 流程同样面对 checkpoint

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bullmq]] —— BullMQ — Node.js 上的 Redis 任务队列
- [[celery]] —— Celery — Python 把慢任务搬到后台干的工头
- [[encore]] —— Encore — 类型安全 Go/TS 后端框架，基础设施即代码
- [[pg-boss-readme]] —— pg-boss — 只用 Postgres 就能跑的任务队列
