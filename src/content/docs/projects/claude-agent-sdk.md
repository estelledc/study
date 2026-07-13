---
title: Claude Agent SDK — 把 Claude Code 装进 npm 包
来源: Claude Agent SDK 官方文档 https://docs.claude.com/en/docs/agent-sdk/overview
日期: 2026-05-31
分类: AI 工程
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/anthropics/claude-agent-sdk-typescript
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-13'
  immutable_revision: 79b6350e13cf24af94a8d2e696a0883fd8cc55fe
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-13'
  review_after: '2026-10-13'
  applicable_version: 0.3.207
---

## 是什么

Claude Agent SDK（TypeScript 版）是一个 npm 包，名字叫 `@anthropic-ai/claude-agent-sdk`。它把 Claude Code 背后的 agent loop、工具调用、权限、子 agent、MCP 和会话能力，**搬出 IDE，装进任何一个 Node 程序**。

日常类比：Claude Code 是装在 IDE 里的"瑞士军刀"，Agent SDK 是把同一把军刀的零件单独打成乐高，让你能在自己的房子里搭一个会自己干活的小机器人。

最小调用形态（按 npm `0.3.207`）：

```ts
import { query } from "@anthropic-ai/claude-agent-sdk"

for await (const msg of query({
  prompt: "读一下 README.md 然后告诉我这个项目是干嘛的",
  options: {
    tools: ["Read"],
    allowedTools: ["Read"],
    model: "sonnet"
  }
})) {
  console.log(msg)
}
```

一个 `query()` 函数，传 prompt 和 options，拿回一个**异步消息流**——agent 每说一句话、每调一次工具、每读一次文件，都会作为一条消息流出来。这里 `tools` 决定模型能看到哪些内置工具，`allowedTools` 只决定这些工具是否自动通过权限检查。

## 为什么重要

不理解这个包，下面这些事你做不出来：

- **CI 里跑 Claude Code**：webhook 触发，自动读 PR diff，自动写 review 评论。IDE 里的 Claude 做不到，因为它需要人坐在电脑前。
- **多 agent 流水线**：一个 researcher 子 agent 收集资料、一个 writer 子 agent 起草、一个 reviewer 子 agent 挑刺。在 IDE 里这三角戏没法演，因为只有一个对话窗口。
- **长期任务**：晚上 11 点跑一个 agent，让它一次性把仓库里 50 个 markdown 都校对一遍，第二天看结果。

## 核心要点

### 四个关键能力（对应 ADR-1 三选一对照）

#### 1. memory —— 长期记忆怎么存

SDK 提供两条路，但要特别注意版本差异：

- **settingSources**：控制是否加载 user / project / local 的文件系统配置，例如 `CLAUDE.md`、`.claude/settings.json`、`.claude/agents/`、`.claude/skills/`。为了 CI 和后端服务可复现，建议显式写 `settingSources: ["project"]` 或 `settingSources: []`，不要依赖默认值。
- **memory tool**（Anthropic 官方的工具）：让 agent 自己往一个 `/memories` 文件夹里写小纸条，下次启动再读回来。适合"agent 自己学到的事实"，不是人写的。

类比：settingSources 是冰箱上贴的家规（人写好），memory tool 是 agent 自己的小本本（agent 自己记）。

**版本注意**：官方网页仍有页面写"默认不加载 filesystem settings"，但 `@anthropic-ai/claude-agent-sdk@0.3.207` 发布包类型定义写的是"省略时加载所有来源，传 `[]` 才禁用"。两者冲突时，生产代码应锁版本并用 `resolveSettings()` 验证实际加载结果。

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
    }
  }
})
```

SDK 会把这些 programmatic agents 交给内置子代理机制调度。每个子 agent 有**独立 context 窗口**——这是关键，主 agent 不会被子 agent 的 token 撑爆。

类比：父 agent 是项目经理，子 agent 是专家顾问。经理不必把每份合同读完，听摘要就够。

#### 3. tool control —— 工具不是一个开关

当前 SDK 至少有三层工具控制：

- `tools`：决定内置工具集合，例如 `["Read", "Bash"]` 或 `[]`。这是"模型能不能看到这些内置工具"。
- `allowedTools`：自动批准这些工具，减少权限弹窗。它不是严格沙箱；没列进去的工具仍可能进入权限流程。
- `disallowedTools`：从模型上下文里移除并禁止使用指定工具。

类比：`tools` 像给员工发了哪些工具箱，`allowedTools` 像哪些操作不用再找主管签字，`disallowedTools` 像明令禁止碰的设备。三者混用时，安全含义不同。

#### 4. cache —— 一个钱袋的优化

SDK 继承 Claude Code 的 prompt caching 和性能优化。流程大致是：

- system prompt、工具定义、长上下文里稳定不变的前缀，更容易命中缓存
- 多轮对话或多次跑同一套 agent harness 时，缓存能降低成本和延迟
- 具体价格、缓存窗口和命中规则要以当前模型计费页与 SDK 版本为准

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
    tools: ["Bash", "Read"],
    allowedTools: ["Bash", "Read"],
    model: "sonnet",
    permissionMode: "acceptEdits"
  }
})
for await (const m of it) {
  if (m.type === "text") console.log(m.content)
}
```

**逐部分**：`prompt` 是任务描述，`tools` 把内置工具集合限制到 Bash 和 Read，`allowedTools` 让这两个工具自动通过权限检查，`permissionMode` 控制剩余权限流程。

### 案例 2：父 + 子 agent 流水线

把上面 researcher / writer 例子真的跑起来——SDK 会按子 agent 的 `description` 匹配合适角色，拿到大纲后再交给 writer。整个过程**父 agent 的 context 只看到摘要**，不爆。

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
2. **settingSources 默认值有文档冲突**：网页和发布包类型定义不一致。生产里不要猜，显式写 `["project"]`、`["user", "project"]` 或 `[]`。
3. **allowedTools 不是沙箱**：它是"自动批准列表"，不是"唯一可用工具列表"。想限制内置工具，写 `tools`；想禁止工具，写 `disallowedTools`。
4. **Skill 启用方式在迁移**：早期示例会把 `"Skill"` 放进 `allowedTools`；0.3.207 类型定义已经标注 deprecated，新的主入口是 `skills` option。
5. **cache 命中率看前缀稳定性**：system prompt 里塞动态时间戳就废了 cache，要把动态部分放最后。

## 适用 vs 不适用场景

**适用**：CI agent / 多 agent 流水线 / 后端嵌入 / 长任务批跑
**不适用**：纯 chat、需要 Python、不需要工具调用

## 历史小故事（可跳过）

- **2024 年**：Claude Code 先以 CLI 产品形态让 agent 直接读写仓库，SDK 需求来自"想把同一套能力放进自动化脚本"。
- **2025 年**：旧名 Claude Code SDK 逐步改成 Agent SDK，包名和文档也切到 `@anthropic-ai/claude-agent-sdk`。
- **2026 年 7 月**：TypeScript SDK 到 `0.3.207`，持续和 Claude Code `2.1.x` 对齐；新增 command lifecycle、外部 sessionStore、`skills` option、`tools` 精确内置工具集合等嵌入式运行时能力。

## 学到什么

1. **agent 是一个流**：query 返回 AsyncIterable 不是 Promise——agent 一边干活一边吐消息，对应它的"思考过程"
2. **多 agent 的 context 隔离**靠的是子代理独立上下文，不是把所有资料塞回主线程
3. **工具控制要分层看**：`tools` 控制可见工具，`allowedTools` 控制免批准，`disallowedTools` 控制禁止
4. **SDK 与 IDE 的 Claude Code 共享同一套底层**：写过 CLAUDE.md、agent 和 skill 的人迁过来成本低，但要显式管理 `settingSources`

## 延伸阅读

- 官方文档：[Claude Agent SDK 概览](https://docs.claude.com/en/docs/agent-sdk/overview)
- TypeScript 参考：[Agent SDK reference - TypeScript](https://docs.claude.com/en/docs/agent-sdk/typescript)
- 权限指南：[Handling Permissions](https://docs.claude.com/en/docs/agent-sdk/permissions)
- GitHub：[anthropics/claude-agent-sdk-typescript](https://github.com/anthropics/claude-agent-sdk-typescript)
- npm 包：[@anthropic-ai/claude-agent-sdk](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)
- 迁移指南：Claude Code SDK → Claude Agent SDK（官方文档子页）

## 关联

- [[claude-code]] —— IDE 版的 Claude，本 SDK 是它的"出 IDE 版"
- [[anthropic-cookbook]] —— Anthropic 官方代码示例集
- [[mcp-ts-sdk]] —— MCP TypeScript SDK，agent 调外部工具的协议层

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[botbuilder-js]] —— Bot Framework SDK JS — 微软多渠道 chatbot 的 Adapter + Middleware 抽象
