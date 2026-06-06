---
title: Bot Framework SDK JS — 微软多渠道 chatbot 的 Adapter + Middleware 抽象
来源: microsoft/botbuilder-js GitHub 仓库（MIT，最后版本 v4.23.3 2025-09，2026-01 archived）
日期: 2026-05-31
子分类: 实时通信
分类: 通信
难度: 中级
provenance: pipeline-v3
---

## 是什么

Bot Framework SDK JS 是**微软的多渠道 chatbot SDK**，让你用一份 TypeScript / JavaScript 代码同时跑在 Teams、Skype、Slack、Web Chat、Direct Line 这些聊天渠道里。日常类比：像一个**多语种翻译总机**——每个渠道说不同方言（Teams 的消息长这样、Slack 的消息长那样），SDK 在你和渠道之间放一个翻译员，把所有方言都翻成同一种"标准消息"（叫 Activity），你只需要对这一种格式写逻辑。

技术上 SDK 由约 10 个子包组成：`botbuilder-core` 是抽象层，`botframework-connector` 是底层 REST 协议封装，`botbuilder-dialogs` 提供多轮对话状态机，`botbuilder-ai` 接 LUIS / QnA Maker。每个子包都遵守同一套核心抽象：**Activity / TurnContext / Adapter / Middleware**。

注：仓库已于 2026-01-05 archived，微软推荐迁移到 Microsoft 365 Agents SDK，但这套设计在新 SDK 里完全保留。

## 为什么重要

不理解这套 SDK 的设计，下面这些事都没法解释：

- 为什么"加一个新聊天渠道"在 Bot Framework 里只要写一个 channel adapter，主流程**一行不动**
- 为什么 .NET / Python / Java / JS 四套 SDK 抽象一模一样——共享 Activity schema 是关键
- 为什么 middleware 写得**像洋葱**（进入和出站都经过），而不是 Express 那种单向链
- 为什么一个 700 多 star 的项目能成为微软对话式 AI 十年的事实标准协议

## 核心要点

SDK 的工程价值可以拆成 **三招**：

1. **Activity 作为统一消息格式**：不管底下是 Teams 的 webhook、Slack 的 RTM、还是 Web Chat 的 WebSocket，进 SDK 之前都被翻成同一个 `Activity` 对象。类比：海关把不同国家的货物都贴上同一种条码再分发。

2. **Adapter 处理 channel 边界**：`BotAdapter` 是 channel 和你的 bot 逻辑之间的胶水。它做四件事——验 HTTP 鉴权、反序列化成 Activity、创建 TurnContext、跑 middleware 链最后回调你的 turn handler。

3. **Middleware 是洋葱不是流水线**：每个中间件实现 `onTurn(ctx, next)`，调 `next()` 之前是入站阶段、之后是出站阶段。类比：进电梯按楼层是入站，出电梯之前镜子里整理头发是出站，**进出共用一段代码**。

## 实践案例

### 案例 1：一条 Teams 消息怎么走完整条管线

用户在 Teams 打 "我要请假"，链路如下：

```
Teams 客户端 → Bot Connector Service (微软云)
            → HTTPS POST 到你的 bot endpoint
            → Adapter.processActivity 验证 token
            → 反序列化 JSON 成 Activity 对象
            → 创建 TurnContext(activity)
            → middleware 链入站：日志 / 翻译 / 状态加载
            → bot.run(ctx) 你的业务逻辑
            → ctx.sendActivity('好的，请假到哪天？')
            → middleware 链出站：脱敏 / 状态保存
            → HTTPS POST 回 Bot Connector → 推回 Teams
```

关键在第 4 步和第 5 步：你的 `bot.run` **看不到** Teams 还是 Slack，只看到一个标准 Activity。换渠道只换 adapter，业务代码不动。

### 案例 2：一个最小 Echo bot

```ts
import { ActivityHandler, BotFrameworkAdapter } from 'botbuilder'
import * as restify from 'restify'

class EchoBot extends ActivityHandler {
  constructor() {
    super()
    this.onMessage(async (ctx, next) => {
      await ctx.sendActivity(`你说的是：${ctx.activity.text}`)
      await next()
    })
  }
}

const adapter = new BotFrameworkAdapter({
  appId: process.env.MicrosoftAppId,
  appPassword: process.env.MicrosoftAppPassword,
})
const bot = new EchoBot()
const server = restify.createServer()
server.post('/api/messages', (req, res) =>
  adapter.processActivity(req, res, ctx => bot.run(ctx)),
)
server.listen(3978)
```

20 行写完一个能在 Teams 跑的 bot。`ActivityHandler` 是事件式封装，`onMessage` / `onMembersAdded` 这些钩子对应不同 Activity 类型。

### 案例 3：Middleware 的洋葱结构

```ts
class TimingMiddleware implements Middleware {
  async onTurn(ctx: TurnContext, next: () => Promise<void>) {
    const t0 = Date.now()
    console.log('入站:', ctx.activity.type)
    await next()                       // 这里递归进入下一层
    console.log('出站:', Date.now() - t0, 'ms')
  }
}
adapter.use(new TimingMiddleware())
```

`next()` 之前的代码在 bot 处理之前跑，之后的代码在 bot 处理之后跑。多个 middleware 叠起来形成嵌套：M1 入 → M2 入 → bot → M2 出 → M1 出。这套模式后来被 Koa.js、ASP.NET Core 等框架反复借用。

### 案例 4：多轮对话用 Dialogs

要收集"请假起止日期 + 事由"这种**多轮槽位填充**场景，单纯靠 `onMessage` 写状态机会很乱。SDK 提供 `WaterfallDialog`：

```ts
const dialog = new WaterfallDialog('leaveRequest', [
  async (step) => step.prompt('datePrompt', '请假从哪天开始？'),
  async (step) => { step.values.start = step.result; return step.prompt('datePrompt', '到哪天？') },
  async (step) => { step.values.end = step.result; return step.prompt('textPrompt', '事由？') },
  async (step) => { /* 提交审批 */ return step.endDialog() },
])
```

每一格是一个 step，框架替你管"现在走到第几步"，状态自动存在 `BotState`。

## 踩过的坑

1. **15 秒超时是硬约束**：channel 等不到 200 OK 就报 504。如果业务要查长接口，先 `sendActivity` 一句"处理中"占住连接，再用 proactive message 异步回结果。

2. **TurnContext 不能跨 turn 持有**：它在 turn 结束后会被 dispose。想在下一轮用上一轮的数据，必须存进 `BotState`，不能用闭包变量塞着。

3. **`await sendActivity` 不能省**：sendActivity 是异步的，主线程不 await 就会先 dispose 掉 ctx，回调里再用就报 "context was disposed"。

4. **LUIS 和 QnA Maker 已退役**：LUIS 2025-10-01、QnA Maker 2025-03-31 关停。`botbuilder-ai` 子包还能编译，但运行时调不通。新项目用 Azure AI Language CLU 替代。

5. **botbuilder-js 自身已 archive**：2026-01-05 仓库 read-only，2025-12-31 之后无更新无支持。生产环境继续跑没问题（v4.23.3 是稳定版），但不要在新项目里选它，用 Microsoft 365 Agents SDK。

## 适用 vs 不适用场景

**适用**：
- 已有 Bot Framework v4 项目维护——抽象稳定，迁移成本可控
- 学习"多渠道适配 + middleware 管线"工程模式——这套抽象被 Agents SDK 完全继承
- 企业 Teams 内部机器人——配合 Azure Bot Service 部署最顺

**不适用**：
- 新项目从零起步——直接上 Microsoft 365 Agents SDK 或 Teams AI Library
- 纯 LLM 对话场景——Bot Framework 重点在 channel 适配和槽位填充，LLM 编排弱
- 不需要多渠道——只发 Web，Vercel AI SDK / LangChain.js 更轻

## 历史小故事（可跳过）

- **2016**：微软在 Build 大会发 Bot Framework v3，配合 Skype Bot 推出
- **2018**：v4 重构，引入 Activity / Adapter / Middleware 三件套，跨语言 SDK 对齐
- **2023**：LLM 浪潮起来，Bot Framework 加 OpenAI 集成但被 LangChain 抢走心智
- **2025-12-31**：官方支持终止
- **2026-01-05**：仓库 archived，重心转 Agents SDK + Copilot Studio

## 学到什么

1. **统一消息 schema 是多渠道适配的基石**——把"channel 差异"全部塞进 adapter 这一层
2. **Adapter + Middleware 抽象生命力极强**——从 2018 到 2026 没大改，新 SDK 完全继承
3. **洋葱式中间件比单向链更通用**——同一个组件管入站和出站，少写一半样板
4. **过期协议也值得读源码**——这套设计是十年事实标准，新项目不用但工程师该看懂

## 延伸阅读

- 仓库：[microsoft/botbuilder-js](https://github.com/microsoft/botbuilder-js)（archived 但代码完整可读）
- 概念文档：[Bot Framework SDK basics](https://learn.microsoft.com/en-us/azure/bot-service/bot-builder-basics)
- 迁移指南：[Bot Framework SDK to Agents SDK migration](https://aka.ms/bfmigrationguidance)
- [[botpress]] —— 开源 chatbot 平台，flow + LLM 节点路线
- [[errbot]] —— Python 多渠道 bot，更轻量但抽象不如 Bot Framework 系统

## 关联

- [[botpress]] —— 同样多渠道、同样 channel adapter 模式，但 Botpress 把对话画成 DAG，Bot Framework 走代码 + Dialog 状态机
- [[errbot]] —— Python 老牌 bot 框架，无 middleware 抽象
- [[matrix-js-sdk]] —— Matrix 协议的 JS 客户端，单协议而非多渠道适配
- [[claude-agent-sdk]] —— LLM 时代的 agent SDK，重 tool use 和编排，与 Bot Framework 关注点不同
