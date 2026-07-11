---
title: Claude Agent SDK — 把 Claude Code 装进 npm 包
来源: https://docs.claude.com/en/api/agent-sdk
日期: 2026-05-31
分类: AI 工程
难度: 中级
---

## 是什么

Claude Agent SDK（TypeScript 版）是一个 npm 包，名字叫 `@anthropic-ai/claude-agent-sdk`。它把"Claude Code 这只小工蜂"——会读文件、会跑命令、会编辑代码、会调工具——**搬出 IDE，装进任何一个 Node 程序**。

日常类比：Claude Code 是装在 IDE 里的"瑞士军刀"，Agent SDK 是把同一把军刀的零件单独打成乐高，让你能在自己的房子里搭一个会自己干活的小机器人。

最小调用形态：

```ts
import { query } from "@anthropic-ai/claude-agent-sdk"

for await (const msg of query({
  prompt: "读一下 README.md 然后告诉我这个项目是干嘛的",
  options: { allowedTools: ["Read"], model: "sonnet" }
})) {
  console.log(msg)
}
```

一个 `query()` 函数，传 prompt 和 options，拿回一个**异步消息流**——agent 每说一句话、每调一次工具、每读一次文件，都会作为一条消息流出来。

## 为什么重要

不理解这个包，下面这些事你做不出来：

- **CI 里跑 Claude Code**：webhook 触发，自动读 PR diff，自动写 review 评论。IDE 里的 Claude 做不到，因为它需要人坐在电脑前。
- **多 agent 流水线**：一个 researcher 子 agent 收集资料、一个 writer 子 agent 起草、一个 reviewer 子 agent 挑刺。在 IDE 里这三角戏没法演，因为只有一个对话窗口。
- **长期任务**：晚上 11 点跑一个 agent，让它一次性把仓库里 50 个 markdown 都校对一遍，第二天看结果。

## 核心要点

### 三个关键能力（对应 ADR-1 三选一对照）

#### 1. memory —— 长期记忆怎么存

SDK 提供两条路：

- **settingSources**：在 options 里写 `settingSources: ["project"]`，SDK 会自动加载项目根的 `CLAUDE.md`、`.claude/settings.json`、`memory/` 这些文件，等于把"长期约定"塞进 system prompt。
- **memory tool**（Anthropic 官方的工具）：让 agent 自己往一个 `/memories` 文件夹里写小纸条，下次启动再读回来。适合"agent 自己学到的事实"，不是人写的。

类比：settingSources 是冰箱上贴的家规（人写好），memory tool 是 agent 自己的小本本（agent 自己记）。

#### 2. subagent —— 怎么开分身

options 里有个 `agents` 字段，能命名注册多个子 agent：

```ts
query({
  prompt: "研究并总结 HM 类型推导",
  options: {
    agents: {
      researcher: {
        description: "深度调研一个主题",
        prompt: "你是研究员，先列大纲再填",
        tools: ["WebSearch", "Read"],
        model: "sonnet"
      },
      writer: {
        description: "把研究结果写成 markdown",
        prompt: "你是写作者，结论先行 + 列表 > 段落",
        tools: ["Write"],
        model: "sonnet"
      }
    },
    allowedTools: ["Task", "Read", "Write"]
  }
})
```

父 agent 用内置的 `Task` 工具调子 agent。每个子 agent 有**独立 context 窗口**——这是关键，主 agent 不会被子 agent 的 token 撑爆。

类比：父 agent 是项目经理，子 agent 是专家顾问。经理不必把每份合同读完，听摘要就够。

#### 3. cache —— 一个钱袋的优化

prompt caching 默认就开。流程是：

- 你的 system prompt + 工具定义 + 大文档（>1024 token 的部分）→ 自动打 cache 标记
- 5 分钟内同样的前缀再调，**走 cache，价格按 1/10 计**，延迟也降 85%
- 也可以手动设 `cache_control: { type: "ephemeral" }` 控制具体断点

适合多轮对话 / 多次调同一个 system prompt 的场景。一次 agent 跑下来，省的钱可能比开发省时间还多。

类比：cache 就是茶水间的保温壶——每次重新烧水太贵，烧好放保温壶里 5 分钟内随取随有。

### 何时用 vs 不用

**用 SDK**：
- 想在 IDE 之外跑 Claude Code（CI、后端服务、定时任务、Slack bot）
- 需要多 agent 协作
- 想把 agent 嵌进现有 Node 服务

**不用 SDK**：
- 只是 chat → `@anthropic-ai/sdk`（轻量 100 倍）
- 不需要工具调用 → 同上
- 写 Python → `claude-agent-sdk-python`（不是这个 TS 包）

## 实践案例

### 案例 1：用 query() 跑一次单 agent

```ts
import { query } from "@anthropic-ai/claude-agent-sdk"

const it = query({
  prompt: "把 src/ 下所有 .ts 文件统计一下行数",
  options: {
    allowedTools: ["Bash", "Read"],
    model: "sonnet",
    permissionMode: "acceptEdits"
  }
})
for await (const m of it) {
  if (m.type === "text") console.log(m.content)
}
```

**逐部分**：`prompt` 是任务描述，`allowedTools` 限定它只能用 Bash 和 Read（不能 Write，安全），`permissionMode` 控制是否每次询问用户同意。

### 案例 2：父 + 子 agent 流水线

把上面 researcher / writer 例子真的跑起来——父 agent 会自动调 Task 工具触发 researcher，拿到大纲后再调 writer。整个过程**父 agent 的 context 只看到摘要**，不爆。

### 案例 3：从消息流里挑出最终结果

很多新手第一次用会把每条消息都当成"最终回答"。更稳的做法是：边消费流，边按类型分拣。

```ts
let finalText = ""
for await (const msg of query({ prompt: "修复 failing test" })) {
  if (msg.type === "assistant" && Array.isArray(msg.content)) {
    finalText += msg.content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("")
  }
}
console.log(finalText)
```

**逐部分**：`for await` 保证 agent 一边工作一边被消费；`msg.type` 先区分工具调用、系统事件和 assistant 文本；最后只拼文本块，避免把工具元数据误当成用户可读结果。

## 踩过的坑

1. **改名陷阱**：原名 Claude Code SDK，2025 年改成 Agent SDK。老教程里的 `@anthropic-ai/claude-code` 已废，import 路径要改 `@anthropic-ai/claude-agent-sdk`。
2. **settingSources 默认不加载**：不写就不读 CLAUDE.md，要显式 `settingSources: ["project"]` 才行。
3. **subagent 不会自动并行**：父 agent 是顺序调 Task 工具的，要并行得自己用 `Promise.all` 包多次 query。
4. **cache 命中率看前缀稳定性**：system prompt 里塞动态时间戳就废了 cache，要把动态部分放最后。

## 适用 vs 不适用场景

**适用**：CI agent / 多 agent 流水线 / 后端嵌入 / 长任务批跑
**不适用**：纯 chat、需要 Python、不需要工具调用

## 历史小故事（可跳过）

- **2024 年**：Claude Code 先以 CLI 产品形态让 agent 直接读写仓库，SDK 需求来自"想把同一套能力放进自动化脚本"。
- **2025 年**：旧名 Claude Code SDK 逐步改成 Agent SDK，包名和文档也切到 `@anthropic-ai/claude-agent-sdk`。
- **2026 年**：多 agent、hooks、settingSources 这些能力稳定后，它更像"把 Claude Code runtime 当库调用"，而不是普通聊天 API。

## 学到什么

1. **agent 是一个流**：query 返回 AsyncIterable 不是 Promise——agent 一边干活一边吐消息，对应它的"思考过程"
2. **多 agent 的 context 隔离**靠的是 Task 工具拆 context 窗口，不是真的并行
3. **prompt cache 是默认开的**——不调它你也省钱，但调好它能多省一倍
4. **SDK 与 IDE 的 Claude Code 共享同一套底层**：写过 CLAUDE.md 和 skill 的人迁过来零成本

## 延伸阅读

- 官方文档：[Claude Agent SDK 概览](https://docs.claude.com/en/api/agent-sdk)
- GitHub：[anthropics/claude-agent-sdk-typescript](https://github.com/anthropics/claude-agent-sdk-typescript)
- npm 包：[@anthropic-ai/claude-agent-sdk](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)
- 迁移指南：Claude Code SDK → Claude Agent SDK（官方文档子页）

## 关联

- [[claude-code]] —— IDE 版的 Claude，本 SDK 是它的"出 IDE 版"
- [[anthropic-cookbook]] —— Anthropic 官方代码示例集
- [[mcp-ts-sdk]] —— MCP TypeScript SDK，agent 调外部工具的协议层

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
