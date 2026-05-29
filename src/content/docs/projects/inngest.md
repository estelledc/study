---
title: Inngest — durable workflow 的事件溯源
来源: 'https://github.com/inngest/inngest'
日期: 2026-05-30
分类: projects
难度: 中级
---

## 是什么

Inngest 是一个 **durable workflow 框架**：你写的还是普通 async 函数，但它能在进程崩溃后**从断点继续**，而不是从头重跑。日常类比：像电子游戏的存档点——你打到第 7 关挂了，重开时不会从第 1 关开始，而是从最近的存档点恢复。

具体做法：把函数里每一段关键代码用 `step.run("名字", 函数)` 包起来，平台帮你把每一步的结果**记到外部存储**。下次再调用同一个函数时，已完成的 step 直接返回缓存结果，只跑没跑过的部分。

```ts
inngest.createFunction(
  { id: "welcome-flow" },
  { event: "user/signed_up" },
  async ({ event, step }) => {
    await step.run("send-welcome", () => sendEmail(event.user))
    await step.sleep("wait-day", "24h")
    await step.run("send-tip", () => sendTip(event.user))
  }
)
```

## 为什么重要

不理解 Inngest（以及它代表的 durable workflow 思路），下面这些事都没法解释：

- 为什么 Vercel / Lambda 这种"无状态函数"也能跑"睡 24 小时再继续"的任务
- 为什么 Temporal / Cadence 要求一个长连的 worker 进程，而 Inngest 不要
- 为什么 trigger.dev V3 在 2024 年大改 API，把 step.run 抄进了自己的 SDK
- 为什么后台任务的"状态字段 + try/catch"模式正在被淘汰

## 核心要点

Inngest 的执行模型可以拆成 **三步**：

1. **每个 step 都有名字**：`step.run("send-welcome", fn)` 里的字符串就是这一步的身份证。平台用它算出一个哈希，作为缓存的 key。类比：快递单号——同一个单号查到的就是同一个包裹。

2. **HTTP re-invoke 代替长连**：你的应用是普通 HTTP server。executor 通过 POST 调用一次你的函数，函数跑到第一个 step 就返回，executor 把结果存起来，过段时间再 POST 一次。类比：玩 RPG 时存档退出，下次进游戏自动加载——不需要你一直挂在那。

3. **opcode 是中间表示**：SDK 把 step.run / step.sleep 翻译成一条条 opcode 发给 executor。executor 看 opcode 决定下一步：sleep 就丢一个 24h 后到期的延迟任务，run 就立刻再调一次 SDK。类比：餐厅点单——服务员把"红烧肉"翻译成厨房的工单号，厨房按工单做菜。

## 实践案例

### 案例 1：注册后的三步邮件流

最经典的场景：用户注册后发欢迎邮件，24 小时后发使用建议，7 天后发问卷。

```ts
inngest.createFunction(
  { id: "onboarding" },
  { event: "user/signed_up" },
  async ({ event, step }) => {
    await step.run("welcome", () => sendEmail(event.user, "welcome"))
    await step.sleep("wait-day", "24h")
    await step.run("tip", () => sendEmail(event.user, "tip"))
    await step.sleep("wait-week", "7d")
    await step.run("survey", () => sendEmail(event.user, "survey"))
  }
)
```

逐部分解释：三个 `step.run` 是三个独立的"存档点"；两个 `step.sleep` 不是真的睡觉，而是告诉 executor "24 小时后再调我一次"。中间任意时刻进程重启都没关系，重启后函数从最近的存档点继续。

### 案例 2：故意失败再成功，验证 replay

为了亲眼看到缓存生效，写一个第一次必失败、第二次必成功的函数：

```ts
let attempts = 0
inngest.createFunction(
  { id: "demo-replay" },
  { event: "toy/run" },
  async ({ step }) => {
    await step.run("always-ok", () => { console.log("A"); return "A" })
    await step.run("flaky", () => {
      attempts++
      if (attempts === 1) throw new Error("transient")
      return "B"
    })
  }
)
```

触发一次事件，观察终端：A 只 print 一次（cache hit），flaky 重试时 attempts=2 才成功。注意"靠进程内变量计数"在多进程部署时会失效——这就是为什么文档强调 step.run 必须 idempotent。

### 案例 3：改 step id 让缓存失效

把案例 2 里 `"flaky"` 改成 `"flaky-v2"`，重新触发同一个事件。观察：A 也会重新 print 一次。原因是 step id 变了，哈希变了，整个 run 找不到任何缓存，从头跑——这是 "step id 是 cache key" 的实证。改 id 之前一定要想清楚。

## 踩过的坑

1. **step.run 不 idempotent**：HTTP 可能重投递同一个请求，如果 step 里直接 `INSERT INTO orders ...` 不带去重，会插两条。要么用唯一约束兜底，要么在 step 里先查再插。

2. **改 step id 等于丢档**：把 `"send-welcome"` 改成 `"send-welcome-v2"` 部署上线，所有跑到一半的 run 都会从头开始——已经发出去的邮件会再发一次。重命名 step 要走 feature flag 或灰度。

3. **step 输出超 4MB 直接报错**：state store 是 hot path，存大对象会拖垮 replay 性能。大文件走 S3 / OSS，step 里只存 URL 或 ID。

4. **dev server 不持久化**：本地 `inngest dev` 嵌的是 miniredis + sqlite，进程退出 state 全丢。生产部署要么买 Inngest Cloud，要么自己起 Redis + Postgres + executor 集群——这一步运维成本比单装 Redis 高一个数量级。

## 适用 vs 不适用场景

**适用**：
- 长任务跨小时 / 跨天（用户注册流、订单超时取消、定时报表）
- 部署在 Vercel / Lambda / Cloudflare Workers 这种无状态环境
- 需要可视化每一步执行状态（dev UI 自带 run 树 + step 详情）
- 跨服务、跨语言的事件驱动流程（TS / Python / Go SDK）

**不适用**：
- 高频小任务（每秒上千 step）——HTTP round-trip 50-200ms 是硬地板，会被网络往返打死，用普通 queue 更合适
- 金融级 deterministic 保证必须的场景（不能调 `Date.now()` 那种）—— Temporal 仍然是正解
- 没有"流"概念的纯 fire-and-forget（"发个邮件就完事"）—— BullMQ / 普通 queue 更轻
- 所有状态都在 PG 的纯数据库系统 —— DBOS 把 durable execution 下沉到 PG，更直接

## 历史小故事（可跳过）

- **2018 年**：AWS Step Functions 用 JSON DSL 描述工作流，平台锁定严重。
- **2019 年**：Temporal 从 Uber Cadence fork 出来，走 Go runtime + worker daemon 长连路线。
- **2022 年**：trigger.dev V1/V2 用 Node.js 实现，sleep 是 polling 数据库。
- **2023 年**：Inngest（YC W23）提出 event sourcing + step.run 函数式 API，无需长连 worker。
- **2024 年**：trigger.dev V3 重写成 V8 isolate runtime，但 step.run API 直接学了 Inngest。
- **2025 年**：Cloudflare Workflows 把这一思路做成平台原生 feature。

## 学到什么

1. **状态机不在代码里，在外部存储里**——代码本身只是声明转换关系，这个心智模型可以迁移到任何"长任务 + 可恢复"的系统设计
2. **idempotent 是 distributed system 的入场券**——任何会被自动重试的代码都要先问"被调两次会怎样"
3. **HTTP re-invoke 比长连 worker 更适合 serverless 时代**——平台 schedule 你，而不是你 keep-alive
4. **opcode 当 audit log 用**——天然就是"这个流程怎么从 A 走到 B"的证据链

## 延伸阅读

- 视频：[Inngest 官方 Hello World](https://www.inngest.com/docs/quick-start)（10 分钟跑通 dev server）
- 文档：[Inngest Patterns](https://www.inngest.com/docs/guides/patterns)（fan-out / saga / 幂等三大模式）
- 对比文：[Inngest vs Temporal vs trigger.dev](https://www.inngest.com/blog/inngest-vs-temporal)（一作视角，看就好）
- 源码：[inngest/inngest](https://github.com/inngest/inngest) 的 `pkg/execution/executor` 目录是心脏
- [[temporal]] —— durable workflow 的"重型"代表，对照看 deterministic 约束
- [[kafka]] —— event sourcing 的另一种实现，state 存在分布式 log 而非外部 KV

## 关联

- [[temporal]] —— 同样是 durable workflow，但走 worker daemon 长连路线，对比可以看清两种部署哲学
- [[kafka]] —— event sourcing 的同源思想：状态由事件流重建
- [[redis]] —— Inngest 的 queue 后端，partition / shard 分布式调度都建在 Redis 上
- [[postgresql]] —— state store 默认实现，存每个 step 的 input / output
- [[langchain]] —— 多步 LLM 应用也面对"长任务 + 可恢复"问题，checkpoint 思路相通
- [[effect]] —— TypeScript 副作用引擎，跟 step.run 一样把"会失败的操作"变成可组合的值

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

