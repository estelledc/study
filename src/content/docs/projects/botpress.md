---
title: Botpress — 把对话画成流程图加 LLM 节点的开源 chatbot 平台
来源: botpress/botpress GitHub 仓库（MIT，legacy v12 维护中；新版 Cloud Studio 走 SaaS）
日期: 2026-05-31
分类: 对话式 AI
难度: 中级
---

## 是什么

Botpress 是一套**开源的对话式 AI 平台**，可以替代 Dialogflow / Microsoft Bot Framework 这类闭源产品。日常类比：像一张可视化的"对话剧本图"——你用拖拽把每一句话、每一次分支画在一张流程图上，机器人沿着图走，遇到看不懂的地方就交给一个站在旁边的"翻译员"（LLM 节点）兜底。

技术上 Botpress 用 Node.js + TypeScript 写后端，把 chatbot 设计抽象成一张 **flow（DAG）**：节点是说话 / 收集变量 / 跑代码 / 调 LLM，连线是状态转移条件。再把 WhatsApp / Telegram / Web Chat / Messenger 等多个外部渠道翻译进同一条消息总线，新增渠道只要新写一个 adapter。

## 为什么重要

不理解 Botpress 的设计，下面这些事都没法解释：

- 为什么一个 13k star 的 chatbot 平台**不需要让用户写代码**就能搭出能跑生产的对话流
- 为什么 2017 年还在自训练 NLU 模型，2023 年突然把"理解意图"这一整步**外包给 LLM**
- 为什么"加一个新聊天渠道"在 Botpress 里只要写一个 channel adapter，主流程一行不动
- 为什么 visual flow 这种"低代码"在 LLM 时代不仅没死、反而和 LLM 节点配合得更好

## 核心要点

Botpress 的工程价值可以拆成 **三招**：

1. **Flow 即 DAG**：可视化编辑器画出来的图不是直接解释跑，而是先编译成中间表示（IR），运行时按一台**有限状态机**沿节点游走。类比：JSX 不是浏览器直接读，而是先编译成 `createElement` 调用。

2. **LLM 节点做兜底**：传统 chatbot 走不到的输入会掉进 fallback 分支然后回"我不懂"。Botpress 把 LLM 包成图里的一种**普通节点**，不会被分类的输入直接交给它自由对答，意图识别的成本几乎压到零。

3. **Channel 反向归一**：不是定义"统一接口让所有渠道实现"，而是**每个渠道写一个 adapter**，把外部消息翻译进统一的内部消息格式再分发。类比：邮局收件处装一个翻译员，谁来都拆成同一种纸条。

## 实践案例

### 案例 1：一条访客消息怎么走完整条 flow

访客在网页聊天框打 "我要退货"，链路如下：

```
web widget → channel adapter → 内部 message → 进入当前 flow
           → NDU/LLM 节点判断意图：退货
           → 跳到 "退货流程" 子图
           → Capture 节点收订单号 → Execute 节点查 DB
           → Standard 节点回复 → 等待下一轮
```

关键在第 2 步：legacy v12 用自训练分类器，新版交给 LLM 直接判断；流程图本身**不用改**，只是把"判断意图"这个节点的实现换成调模型 API。

### 案例 2：LLM 节点的最小封装

```ts
// 伪代码：LLM 节点本质是一个签名固定的 async function
async function llmNode(ctx: BotContext, prompt: string) {
  const history = ctx.session.messages.slice(-10)
  const reply = await llmProvider.chat({
    system: prompt,
    messages: history,
    tools: ctx.bot.tools,
  })
  ctx.session.messages.push(reply)
  return reply.text
}
```

**逐部分解释**：

- `ctx.session.messages.slice(-10)` 只取最近 10 轮，不传全量历史——长对话 token 成本会爆
- `tools: ctx.bot.tools` 把 bot 注册的 function calling 工具直接挂上去，让模型可以触发"查订单 / 创工单"这类动作
- 节点外部看到的就是"输入文本 → 输出文本"，和 Standard 节点签名完全一致——这就是 visual flow 能容纳 LLM 的关键

### 案例 3：Channel adapter 怎么翻译消息

每个渠道写两个函数：incoming（外部 → 内部）和 outgoing（内部 → 外部）：

```ts
// WhatsApp adapter 草图
export const whatsapp = {
  async incoming(req) {
    return {
      type: 'text',
      text: req.body.messages[0].text.body,
      userId: req.body.contacts[0].wa_id,
      channel: 'whatsapp',
    }
  },
  async outgoing(msg, sendApi) {
    await sendApi.post('/messages', {
      to: msg.userId,
      type: 'text',
      text: { body: msg.text },
    })
  },
}
```

主流程永远只看内部格式，新增渠道（比如某个内部 IM）只要再写一份 incoming/outgoing。

## 踩过的坑

1. **legacy v12 训练数据搬不走**：v12 的 NLU 用自家分类器，标注是 yaml 文件；2023 年迁到新版 LLM 节点后，旧 bot 必须重画，没有自动迁移工具，团队的 chatbot 资产实际上要重做一遍。
2. **LLM 节点 token 成本随轮数线性涨**：长对话不主动截断 history，对话越久 prompt 越长，账单是 O(n²) 增长。Botpress 留了 `slice(-N)` 但**默认值不一定够**，要按业务调。
3. **Visual flow 嵌套 3 层后 UI 就崩**：if-else 套到第 4 层节点会重叠、连线交叉、编辑器卡顿。这个复杂度建议直接 Execute 节点写 TS，不要硬画图。
4. **自托管 v12 三件套启动慢**：PostgreSQL + Redis + Duckling（实体抽取的 Haskell 服务）docker compose 起步，Duckling 镜像在国内拉取经常超时，新人 90% 的环境问题都卡在这里。

## 适用 vs 不适用

**适用**：

- 客服 FAQ + 工单创建：意图明确、流程固定，visual flow 直接画完
- 营销 / 表单引导：Capture 节点收变量再写回 CRM，比写代码快
- WhatsApp / Telegram 多渠道分发：channel adapter 即装即用
- 快速验证 chatbot MVP：拖拽 + LLM 节点几小时能跑通

**不适用**：

- 复杂多 agent 协作 → 用 LangGraph / AutoGen，flow DAG 表达不动多 agent 状态
- 需要细粒度 prompt 工程和 tool call 编排 → 直接调 OpenAI / Anthropic SDK
- 极端低延迟 / 边缘部署 → Cloud 架构有 RTT，自托管 v12 又拖三组件
- 数据合规要求"代码 + 数据全在内网" → 只能用 legacy v12，新版 Studio 必须连 Cloud

## 历史小故事（可跳过）

- **2017 年**：加拿大魁北克的 Sylvain Perron 等几个人受不了 Dialogflow 的封闭，开始写一个"自己能装一遍的 chatbot 平台"，Node.js + TypeScript 单仓库 OSS。
- **2018-2020 年**：v10 / v11 / v12 演进，主打企业自托管，NLU 是自训练 intent 分类器，需要标几百条数据才能跑。
- **2023 年**：宣布新架构，把"理解意图"整步交给 LLM；legacy v12 进入维护模式，主线转向 Cloud Studio。
- **2024-2026 年**：稳定在 LLM-first 的设计，star 数稳定在 13k 区间，社区主要聊"怎么把 LLM 节点和原 flow 拼好"。

## 学到什么

- **visual flow 编译成 IR + 状态机** 是 low-code 工具的通用解：编辑器只画图，运行时跑编译后的状态机，两层解耦让"画图"和"跑得快"互不打架。
- **把 LLM 当节点而不是当框架**：Botpress 没有重写一个 agent framework，只是把"调模型"封成一种 Node 类型，让 LLM 和 Standard 节点在同一张图里平起平坐——这是 low-code + LLM 最便宜的接入方式。
- **Channel 反向归一比抽象基类便宜**：每个渠道写自己的 adapter，归一进内部消息表，比定义一个抽象 ChannelBase 让所有渠道继承更扛得住"渠道协议各自怪异"的现实。
- **NLU-first → LLM-first 的演进** 是整个 chatbot 行业的缩影：2017 年训分类器，2023 年写 prompt，本质上是把"能力"从"标数据"挪到了"调 API"，工具链跟着重做一遍。

## 延伸阅读

- 官方文档：[botpress.com/docs](https://botpress.com/docs)（Cloud Studio + legacy v12 都覆盖）
- 视频教程：YouTube 搜 "Botpress LLM Node Tutorial"（团队和社区视频较多，1-2 小时入门）
- 仓库地址：[github.com/botpress/botpress](https://github.com/botpress/botpress)（legacy v12 主干，issue 仍活跃）
- [[langchain]] —— 同样在做 LLM 工具链，但 LangChain 偏 SDK / Botpress 偏可视化
- [[chatwoot]] —— 客服平台维度的反向归一思路一致，可对照看 channel adapter 设计
- [[dify]] —— 同样是"可视化 + LLM"赛道的开源项目，节点抽象更接近 Botpress

## 关联

- [[langchain]] —— LangChain 是 LLM 工具链 SDK，Botpress 是可视化平台；前者灵活后者上手快
- [[dify]] —— 同样是 visual + LLM 的开源对话平台，Dify 更偏 prompt 工程 / Botpress 更偏 flow
- [[chatwoot]] —— 客服平台的多渠道集成靠 webhook + 统一 messages 表，Botpress 的 channel adapter 是同一套思路
- [[temporal]] —— flow DAG 编译成状态机，和 Temporal 的 workflow 编译思路同源
- [[langfuse]] —— 给 LLM 应用做 trace / 评测，Botpress 的 LLM 节点天然适合接 Langfuse 监控

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[botbuilder-js]] —— Bot Framework SDK JS — 微软多渠道 chatbot 的 Adapter + Middleware 抽象
- [[discord-py]] —— discord.py — 用 Python 写 Discord 机器人的事实标准
- [[rasa]] —— Rasa — 自己造一个能记住上下文的对话机器人
