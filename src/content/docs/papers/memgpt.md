---
title: 'MemGPT — 把 LLM 记忆管理做成一套虚拟上下文操作系统'
description: '用 MemGPT 理解为什么长程 agent 不能只靠扩大 context window，而要显式管理快速记忆、长期记忆和控制流。'
来源: 'arXiv:2310.08560'
日期: 2026-07-15
分类: AI Agent / Memory System
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: paper
  note_type: paper
  canonical_source: https://arxiv.org/abs/2310.08560v2
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-07-15'
  publication_id: arXiv:2310.08560
  source_version: arXiv:2310.08560v2
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-07-15'
  review_after: null
  applicable_version: arXiv v2
---

## 是什么

MemGPT: Towards LLMs as Operating Systems 是一篇把 LLM 长程记忆问题类比成操作系统内存管理问题的论文。

类比：普通 LLM context window 像桌面上的一小块工作区；MemGPT 像操作系统，负责把当前最重要的材料放在桌面上，把暂时不用但未来可能用到的材料放进长期存储，并在需要时搬回来。

本卡只基于 arXiv v2 和论文静态阅读整理，没有运行 MemGPT 代码，也没有复现 document analysis 或 multi-session chat 实验。所有结果保持 `UNVERIFIED`。

## 问题是什么

扩大 context window 可以缓解长文本问题，但不能彻底解决 agent memory：

- window 再大也有限；
- 所有历史都塞进去会增加成本和噪声；
- 旧信息需要更新、删除、压缩和检索；
- agent 还需要知道什么时候主动整理记忆。

MemGPT 的问题是：能否像操作系统管理虚拟内存一样，让 LLM 在有限上下文里获得“看起来更大的记忆空间”？

## 为什么重要

- 它把 memory 从“外挂向量库”提升成 agent 控制流的一部分。
- 它强调 context management，而不只是 retrieval。
- 它区分快速上下文和长期存储，接近工程产品里的 memory 分层。
- 它把 interrupt / function call 用作记忆读写控制机制。
- 它解释了为什么 [[generative-agents]] 之后需要更系统的 memory runtime。

## 核心方法

MemGPT 的核心叫 virtual context management。它借鉴 OS 的 virtual memory：程序以为自己有很大的内存，实际由系统在 fast memory 和 slow memory 之间搬运页面。

在 LLM agent 里，这对应：

| OS 概念 | MemGPT 对应物 | 作用 |
|---|---|---|
| main memory | 当前 context | 直接参与生成 |
| disk / swap | archival memory | 长期保存 |
| page movement | memory read / write | 把信息移入或移出上下文 |
| interrupt | 系统消息 / 函数调用 | 触发记忆管理动作 |

论文展示了两个场景：长文档分析和多会话聊天。前者测能不能处理超过上下文窗口的大文档，后者测 agent 是否能在长期交互中记住用户和历史。

## 论文地形

1. 引言说明有限上下文窗口对长程任务的限制。
2. 方法部分提出 virtual context management。
3. 系统部分定义 memory tiers 和 control flow。
4. 实验部分覆盖 document analysis 和 multi-session chat。
5. 讨论部分说明 OS 隐喻的边界和后续方向。

读这篇时最重要的是看“谁决定记什么”。MemGPT 不是简单检索历史，而是让 agent 参与管理自己的上下文。

## 手工 toy 复现

假设一个 coding agent 连续处理同一仓库三天：

```text
fast context:
- 当前 bug 描述
- 最近失败日志
- 当前相关文件

archival memory:
- 上周修过的认证模块路径
- 项目测试命令
- mentor 对 PR 风格的要求
```

当 agent 发现当前 bug 又涉及认证，它需要从 archival memory 取回“认证模块路径”；当它总结出新的测试命令，也要写入 archival memory。

如果没有 MemGPT 式管理，agent 要么忘记旧经验，要么把全部历史塞进 prompt，最终又贵又乱。

## 评测读法

MemGPT 结果要看三类问题：

1. **任务是否成功**：长文档问答、多会话聊天是否更准；
2. **记忆是否有用**：提升来自 memory management，而不是模型本身更强；
3. **管理成本是否可接受**：读写记忆会增加调用和复杂度。

本卡没有运行 MemGPT，因此不验证论文数值，只保留其系统设计和实验结论作为静态证据。

## 踩过的坑

1. **OS 隐喻不是等价实现**：LLM 没有确定性 page table，记忆读写仍然靠生成式决策。
2. **错误记忆会长期污染**：一旦写入错事实，后续检索会放大错误。
3. **长期记忆需要治理**：需要过期、合并、冲突解决和来源追踪。
4. **函数调用不是银弹**：工具接口能约束格式，但不能保证 agent 决策正确。
5. **多会话聊天不等于工作流记忆**：用户画像和代码排查经验的结构不同。

## 与当前工作的连接

`study` 的 handoff 和 memory 体系也在处理类似问题：哪些内容留在当前上下文，哪些进入长期文件，哪些只作为历史归档。

MemGPT 给我们的提醒是：memory 不是“越多越好”，而是要有读写协议。没有协议的 memory 会变成污染源；有协议的 memory 才能成为 agent runtime 的基础设施。

这也和 AI Harness 的 route 思路相通：缺事实走 `ask_user`，工具失败走 `retry`，验证失败走 `fail`。记忆系统也需要明确“可写入、需确认、需过期、不可采信”的状态。

## 学到什么

MemGPT 的价值在于把上下文窗口看成稀缺资源，而不是无限容器。agent 真正需要的是 memory policy：什么时候读、写什么、怎么压缩、如何确认来源。

如果 [[generative-agents]] 证明了 memory / reflection / planning 能产生可信行为，MemGPT 则说明这些模块需要一个运行时来管理资源和控制流。

## 延伸阅读

- arXiv: [MemGPT: Towards LLMs as Operating Systems](https://arxiv.org/abs/2310.08560)
- project: [MemGPT / Letta](https://memgpt.ai)
- [[generative-agents]] —— memory stream 和 reflection 的社会模拟架构
- [[memorybank]] —— 长期用户记忆和遗忘曲线

## 关联

- [[generative-agents]] —— 记忆、反思、计划的前置架构
- [[memorybank]] —— 面向陪伴场景的长期记忆
- [[memgym]] —— 长程 agent memory 的评测
- [[reflexion]] —— 失败经验写回 prompt memory
- [[self-evolving-agents-survey]] —— 自进化 agent 的 memory 维度
- [[evo-memory-2511]] —— 后续 long-term memory 方向
- [[lats]] —— 另一种 agent 控制流：搜索而非记忆管理

## 反向链接

<!-- backlinks:start -->
<!-- backlinks:end -->
