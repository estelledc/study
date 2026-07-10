---
title: 从这里开始
description: 给新读者的第一站：先选一条短路线，再进入主题和全量索引
---

<div class="study-callout">
  <strong>先别打开 atlas。</strong>
  <p>Atlas 是给“已经知道要找什么”的读者准备的全量索引。第一次来时，先从下面三条路线选一条，按顺序读完前三篇，再决定要不要继续扩展。</p>
</div>

<section class="study-section">
  <h2>选择一条最贴近你的路线</h2>
  <p class="study-muted">不用三条都读。先解决你眼前最想弄懂的问题，就是最好的入口。</p>

  <div class="study-card-grid">
    <article class="study-path-card">
      <span class="study-chip">路线一</span>
      <h3>前端产品工程</h3>
      <p><strong>适合谁：</strong>会写一点 JavaScript 或 React，能做出页面，但还不清楚状态、服务端数据和组件代码应该怎样组织。</p>
      <div>
        <strong>先读哪几篇：</strong>
        <ol>
          <li><a href="/study/projects/react/">React</a>：先理解组件、状态与渲染模型。</li>
          <li><a href="/study/projects/tanstack-query/">TanStack Query</a>：再区分服务端状态和本地状态。</li>
          <li><a href="/study/projects/shadcn-ui/">shadcn-ui</a>：最后看组件代码如何交付给产品团队。</li>
        </ol>
      </div>
      <p><strong>读完能做什么：</strong>面对一个前端需求时，能说清状态放在哪里、数据何时失效，以及组件应该被封装成依赖还是保留为可修改源码。</p>
      <footer><a href="/study/topics/frontend/">进入完整的前端与全栈路线</a></footer>
    </article>

    <article class="study-path-card">
      <span class="study-chip">路线二</span>
      <h3>AI Agent 入门</h3>
      <p><strong>适合谁：</strong>想理解 coding agent 为什么能读文件、调用工具、修改代码和根据测试结果继续行动，不要求先有机器学习基础。</p>
      <div>
        <strong>先读哪几篇：</strong>
        <ol>
          <li><a href="/study/papers/attention/">Attention</a>：建立模型如何利用上下文的基础直觉。</li>
          <li><a href="/study/papers/chain-of-thought/">Chain-of-Thought</a>：理解中间推理步骤的作用。</li>
          <li><a href="/study/papers/react/">ReAct</a>：把推理、行动和环境反馈连成循环。</li>
        </ol>
      </div>
      <p><strong>读完能做什么：</strong>能用 Thought / Action / Observation 拆解一个 agent 工作流，并判断一次性生成代码与可反馈、可验证的 agent loop 有什么差别。</p>
      <footer><a href="/study/topics/ai-agent/">进入完整的 AI Agent 路线</a></footer>
    </article>

    <article class="study-path-card">
      <span class="study-chip">路线三</span>
      <h3>系统底层入门</h3>
      <p><strong>适合谁：</strong>会写业务代码，想补数据库与分布式基础，却常被“一致性、共识、时钟”这些词挡在门外。</p>
      <div>
        <strong>先读哪几篇：</strong>
        <ol>
          <li><a href="/study/papers/lamport-1978/">Lamport Clock</a>：先理解分布式系统怎样描述事件先后。</li>
          <li><a href="/study/papers/paxos-1998/">Paxos</a>：再看节点怎样在故障中达成一致。</li>
          <li><a href="/study/papers/raft/">Raft</a>：用更工程化的结构理解共识实现。</li>
        </ol>
      </div>
      <p><strong>读完能做什么：</strong>能区分事件排序、复制和共识，知道系统设计为什么要在一致性、可用性与实现复杂度之间取舍。</p>
      <footer><a href="/study/topics/distributed-systems/">进入完整的分布式系统路线</a></footer>
    </article>
  </div>
</section>

## 如何读一篇笔记

1. 先看一句话定位，确认它在解决什么问题。
2. 再读 Why，弄清为什么不用更直观的替代方案。
3. 项目笔记看心脏代码，论文笔记看关键机制；先抓住输入、处理、输出。
4. 完成笔记里的动手实验或自检题，用结果验证自己是否真的理解。
5. 只顺着一个相关链接继续，不要一次打开十几个标签页。

## 不建议的读法

- 不要从 atlas 第一条一路读到最后一条。
- 不要把“收藏了”当成“学会了”。
- 不要只看标题和摘要，跳过 Why、机制与验证。
- 不要强行把项目和论文分开；同一个主题通常需要论文解释地基、项目展示取舍。
- 不要同时开三条路线。读完一条的前三篇，再决定下一步。

<div class="study-callout">
  <strong>已经知道具体名字？</strong>
  <p>这时再用顶部搜索，或进入 <a href="/study/projects-atlas/">项目全景索引</a> 和 <a href="/study/papers-atlas/">论文全景索引</a>。</p>
</div>
