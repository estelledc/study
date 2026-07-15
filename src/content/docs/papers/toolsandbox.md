---
title: 'ToolSandbox — 状态化对话工具调用评测'
description: '用 ToolSandbox 理解为什么工具调用 agent 需要测状态依赖、信息不足和多轮用户反馈，而不是只测单轮函数参数。'
来源: 'Lu et al., arXiv:2408.04682'
日期: 2026-07-15
分类: AI Agent / Tool Use Benchmark
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: paper
  note_type: paper
  canonical_source: https://arxiv.org/abs/2408.04682v2
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-15'
  publication_id: arXiv:2408.04682
  source_version: arXiv:2408.04682v2
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-15'
  review_after: null
  applicable_version: arXiv v2
---

## 是什么

ToolSandbox: A Stateful, Conversational, Interactive Evaluation Benchmark for LLM Tool Use Capabilities 是一个评估 LLM 工具使用能力的 benchmark。它强调三件事：工具有状态、对话是多轮的、评价要看中间里程碑和最终结果。

类比：普通 function calling benchmark 像考“这个函数该传什么参数”；ToolSandbox 更像让客服一边和用户聊天，一边查系统、改系统、处理用户改口，还要确保每一步没有把状态搞乱。

本卡只基于 arXiv v2 和论文静态阅读整理，没有运行 ToolSandbox 环境，也没有执行任何工具轨迹。所有结论保持 `UNVERIFIED`。

## 问题是什么

早期工具调用评测常常是 stateless：给模型一个用户请求，模型输出一个函数名和参数，评分器比对答案。但真实工具使用有状态和对话：用户会补充信息，工具结果会改变后续可用信息，某些任务缺必要参数，模型应该追问而不是乱调用。

ToolSandbox 的问题是：如何系统评估 LLM agent 在状态化、多轮、可交互工具环境里的能力？

这和 [[appworld]] 很接近，但角度不同。AppWorld 更强调写代码操作多个 App；ToolSandbox 更强调 conversational tool use：用户模拟器、状态依赖、信息不足和轨迹中的动态评价。

## 为什么重要

- 它把 tool use 从单轮参数匹配推进到多轮对话执行。
- 它显式测试 state dependency：先前工具调用会改变后续世界。
- 它包含 insufficient information：信息不足时 agent 应该追问。
- 它用 user simulator 支持 on-policy conversational evaluation。
- 它比离线轨迹重放更接近真实 agent 产品。

## 核心方法

| 组件 | 作用 | 工程直觉 |
|---|---|---|
| stateful tool execution | 工具调用改变环境状态 | 调用顺序和副作用重要 |
| user simulator | 模拟多轮用户反馈 | 评估追问和澄清 |
| dynamic evaluation | 检查中间和最终 milestone | 不只看最后一句 |
| task categories | State Dependency / Canonicalization / Insufficient Information 等 | 把失败类型拆开 |

ToolSandbox 的贡献不是又加一套函数列表，而是把“工具调用是对话里的状态机”这件事变成 benchmark。

## 论文地形

1. 引言说明单轮、无状态工具评测的不足。
2. Benchmark 设计介绍工具、状态、用户模拟器和任务类别。
3. Evaluation strategy 说明如何检查中间与最终里程碑。
4. Baseline 章节比较开源和闭源模型表现。
5. 分析章节讨论复杂任务类别为什么仍然困难。

读这篇时，我会把它当作 tool-use 产品测试清单：状态、追问、规范化、错误恢复、最终验证，每一项都能映射到真实客服 / 助手场景。

## 手工 toy 复现

我用一个小型出行助手任务手推 ToolSandbox：

用户：帮我预订明早去机场的车。

| 回合 | agent 应该做什么 | ToolSandbox 能测什么 |
|---|---|---|
| 用户没给城市 | 追问出发地 | insufficient information |
| 用户说“从公司” | 查公司地址 | canonicalization |
| agent 查天气 / 路况 | 获取外部状态 | tool result integration |
| agent 预订车辆 | 修改系统状态 | state dependency |
| 用户改口“改成 7 点” | 修改已有订单 | conversational update |
| 最终检查订单 | 地址、时间、乘客都匹配 | final milestone |

如果 agent 一开始就乱订，或者用户改口后又新建一个重复订单，这在单轮 function calling 里可能看不出来，但 ToolSandbox 会暴露。

## 评测读法

ToolSandbox 结果要按任务类别读：

1. **State Dependency**：模型是否理解调用副作用。
2. **Canonicalization**：模型能否把自然语言实体规范成系统实体。
3. **Insufficient Information**：模型是否会追问，而不是编参数。
4. **Intermediate Milestones**：模型是否中途已经偏离目标。

这些维度比总分更重要，因为它们对应不同修复策略：加 memory、加 schema、加 clarification policy，或加强工具返回解析。

## 踩过的坑

1. **不要把 tool call JSON 当能力本身**：真实能力在状态和对话里。
2. **不要默认信息总是足够**：会追问比强行调用更安全。
3. **不要忽略中间里程碑**：最后失败时，定位哪一步错很关键。
4. **不要只重放固定轨迹**：on-policy 对话能暴露模型自己的决策错误。
5. **不要把工具结果当纯文本**：工具结果往往改变后续可用动作。

## 与当前工作的连接

今天就能用：做工具调用 agent 时，给每个工具任务加“信息不足”用例，明确什么时候必须追问。

下个月可以用：设计内部 eval 时，可以把任务拆成 ToolSandbox 风格的里程碑：参数确认、状态修改、用户改口、最终检查。

不要照搬：公开 sandbox 的工具和用户模拟器不等于真实业务。真实产品还要处理权限、审计、敏感操作和人工确认。

## 学到什么

- 工具调用评测应该关注状态机，不只是函数签名。
- 多轮用户反馈会显著增加 agent 难度。
- ToolSandbox 和 [[appworld]] 共同说明：真实工具任务需要可执行环境和动态检查。
- 对 study 来说，它补齐了 [[toolformer]] 与 [[toolllm-2023]] 之后的评测层。

## 延伸阅读

- 原文：<https://arxiv.org/abs/2408.04682>
- 本卡使用版本：<https://arxiv.org/abs/2408.04682v2>
- [[appworld]]：多 App、交互式 coding agent benchmark。
- [[toolformer]]：工具使用训练路线。
- [[toolllm-2023]]：ToolBench / ToolLLM 方向。
- [[agent-planning-benchmark-2026]]：规划维度的 agent 诊断 benchmark。

## 关联

- [[appworld]]
- [[toolformer]]
- [[toolllm-2023]]
- [[agent-planning-benchmark-2026]]
- [[react-agent]]

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
