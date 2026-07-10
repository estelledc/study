---
title: AI Agent 与 LLM 系统
description: 从 Attention、CoT、ReAct 到 SWE-Agent，理解 coding agent 的主循环
---

这条路线回答：LLM 为什么不只能聊天，还能读取环境、调用工具、修改代码，并根据执行结果继续行动。

<div class="study-meta-panel">
  <div><strong>适合</strong><span>零基础到初级</span></div>
  <div><strong>建议节奏</strong><span>先读 3 篇，再看工程闭环</span></div>
  <div><strong>读法</strong><span>论文与工程案例混读</span></div>
  <div><strong>目标</strong><span>理解 agent loop</span></div>
</div>

## 先读这 3 篇

<div class="study-card-grid">
  <a class="study-note-card" href="/study/papers/attention/">
    <div class="study-meta-row"><span>论文</span><span>背景</span><span>上下文</span></div>
    <h3>Attention</h3>
    <p>先建立模型如何从上下文里选择相关信息的基础直觉。</p>
    <div class="study-why">它是理解 Transformer 与后续 LLM 能力的入口。</div>
  </a>

  <a class="study-note-card" href="/study/papers/chain-of-thought/">
    <div class="study-meta-row"><span>论文</span><span>推理</span><span>中间步骤</span></div>
    <h3>Chain-of-Thought</h3>
    <p>理解显式中间步骤为什么能帮助模型处理多步问题。</p>
    <div class="study-why">ReAct 的 Thought 部分建立在这条思路上。</div>
  </a>

  <a class="study-note-card" href="/study/papers/react/">
    <div class="study-meta-row"><span>论文</span><span>Pillar</span><span>行动循环</span></div>
    <h3>ReAct — Reasoning and Acting</h3>
    <p>把“想一下 → 调工具 → 看反馈 → 再想”连成可观察的 agent 循环。</p>
    <div class="study-why">这是 ReAct 论文，不是 React 前端项目。</div>
  </a>
</div>

## 从机制走向工程闭环

<div class="study-card-grid">
  <a class="study-note-card" href="/study/papers/toolformer/">
    <div class="study-meta-row"><span>论文</span><span>工具使用</span></div>
    <h3>Toolformer</h3>
    <p>看模型如何学习什么时候调用外部 API。</p>
  </a>
  <a class="study-note-card" href="/study/papers/reflexion/">
    <div class="study-meta-row"><span>论文</span><span>反馈与反思</span></div>
    <h3>Reflexion</h3>
    <p>看 agent 如何把失败轨迹转化为下一次行动的提示。</p>
  </a>
  <a class="study-note-card" href="/study/papers/swe-bench/">
    <div class="study-meta-row"><span>论文</span><span>评测</span></div>
    <h3>SWE-bench</h3>
    <p>理解为什么要用真实 GitHub issue 检验软件工程 agent。</p>
  </a>
  <a class="study-note-card" href="/study/papers/swe-agent/">
    <div class="study-meta-row"><span>论文</span><span>工程案例</span></div>
    <h3>SWE-Agent</h3>
    <p>观察 agent loop 怎样落到读仓库、改代码和跑测试。</p>
  </a>
</div>

## 读完你应该能回答

1. ReAct 的 Thought、Action、Observation 在产品中分别对应什么？
2. Toolformer 关注的能力与 ReAct 组织的循环有什么差别？
3. SWE-bench 为什么比“代码看起来合理”更适合检验 coding agent？
4. 为什么 shell、编辑器和测试反馈是软件工程 agent 的关键环境？

<div class="study-callout">
  <strong>做一个 30 分钟验证</strong>
  <p>找一个小仓库，让 LLM 只完成“读一个文件、改一处、跑测试、根据错误再改”这件事，并把每一步标成 Thought、Action 或 Observation。</p>
</div>

继续扩展可进入 [论文精选队列](/study/papers-queue/) 和 [项目精选队列](/study/queue/)。
