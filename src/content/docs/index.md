---
title: 从真实项目和经典论文里，建立工程判断力
description: 给零基础工程师的开源项目与论文学习地图，从真实项目和经典论文里建立工程判断力
template: splash
---

<div class="study-hero-panel">
  <span class="study-kicker">给零基础工程师的开源项目与论文学习地图</span>
  <h2>先选一个问题，再把项目与论文放在一起读</h2>
  <p>这里不按“项目”和“论文”把你分流。先选一个真实问题，再把源码实现与经典思想放在同一条学习路径里读：看它解决什么、为什么这样设计、你能亲手验证什么。</p>
  <div class="study-cta-row">
    <a class="study-button" href="/study/start/">从这里开始</a>
    <a class="study-button-secondary" href="/study/topics/">按主题找入口</a>
    <a class="study-button-secondary" href="/study/queue/">看精选队列</a>
  </div>
</div>

<div class="study-stats-strip">
  <div><strong>1975</strong><span>篇学习笔记</span></div>
  <div><strong>1014</strong><span>篇论文</span></div>
  <div><strong>961</strong><span>个开源项目</span></div>
  <div><strong>19</strong><span>个主题簇</span></div>
</div>

<p class="study-muted"><strong>当前规模：</strong>1014 篇论文 + 961 个项目 = 1975 篇笔记，按 19 个主题组织。</p>

<section class="study-section">
  <h2>先选一条新手路径</h2>
  <p>不要从全量索引的第一条开始读。选一条路线，先完成前三篇，再决定向哪个分支扩展。</p>

  <div class="study-card-grid">
    <a class="study-path-card" href="/study/topics/frontend/">
      <span class="study-chip">路线 · 有一点 JavaScript 基础</span>
      <h3>前端产品工程</h3>
      <p>从 React、TanStack Query 到 shadcn/ui，理解状态、数据和组件背后的工程取舍。</p>
      <footer>先读：React → TanStack Query → shadcn/ui</footer>
    </a>
    <a class="study-path-card" href="/study/topics/ai-agent/">
      <span class="study-chip">路线 · 零基础友好</span>
      <h3>AI Agent 入门</h3>
      <p>从 Attention、Chain-of-Thought 到 ReAct，拆开智能体“思考、行动、观察”的主循环。</p>
      <footer>先读：Attention → CoT → ReAct</footer>
    </a>
    <a class="study-path-card" href="/study/topics/distributed-systems/">
      <span class="study-chip">路线 · 想补系统基础</span>
      <h3>系统底层入门</h3>
      <p>从逻辑时钟、Paxos 到 Raft，建立理解数据库、分布式系统和基础设施的地基。</p>
      <footer>先读：Lamport Clock → Paxos → Raft</footer>
    </a>
  </div>
</section>

<section class="study-section">
  <h2>按主题找入口</h2>
  <p>主题页只保留精选路径，不把全量内容搬过来。项目与论文会在同一条路线里混排。</p>

  <div class="study-card-grid">
    <a class="study-topic-card" href="/study/topics/frontend/"><span class="study-chip">主题</span><h3>前端与全栈</h3><p>React 生态、状态、路由、组件与构建工具。</p><footer>从会用框架，到能判断设计</footer></a>
    <a class="study-topic-card" href="/study/topics/ai-agent/"><span class="study-chip">主题</span><h3>AI Agent 与 LLM 系统</h3><p>推理、工具使用、反馈循环与软件工程智能体。</p><footer>从模型能力，到 agent loop</footer></a>
    <a class="study-topic-card" href="/study/topics/database/"><span class="study-chip">主题</span><h3>数据库</h3><p>PostgreSQL、Bigtable、Spanner、事务与存储。</p><footer>从单机关系库，到全球分布式 SQL</footer></a>
    <a class="study-topic-card" href="/study/topics/distributed-systems/"><span class="study-chip">主题</span><h3>分布式系统</h3><p>逻辑时钟、共识、一致性、复制与容错。</p><footer>先建立“没有全局时钟”的直觉</footer></a>
    <a class="study-topic-card" href="/study/topics/pl-type-systems/"><span class="study-chip">主题</span><h3>编程语言与类型系统</h3><p>Lambda Calculus、类型推断与程序正确性。</p><footer>理解编译器为何能替你证明一部分错误</footer></a>
    <a class="study-topic-card" href="/study/topics/infrastructure/"><span class="study-chip">主题</span><h3>基础设施</h3><p>容器、编排、调度与可观测性。</p><footer>从一个容器，到可运营的集群</footer></a>
  </div>
</section>

<section class="study-section">
  <h2>全站枢纽笔记</h2>
  <p>这 8 篇连接了最多的后续概念。项目与论文混着读，能更快看到“思想如何落到实现”。</p>

  <div class="study-card-grid">
    <a class="study-note-card" href="/study/projects/react/"><div class="study-meta-row"><span>项目</span><span>前端</span><span>Pillar</span></div><h3>React</h3><p>从组件、状态与调度出发，理解现代 UI 的核心模型。</p><div class="study-why">这是 React 前端项目。</div></a>
    <a class="study-note-card" href="/study/papers/react/"><div class="study-meta-row"><span>论文</span><span>AI Agent</span><span>Pillar</span></div><h3>ReAct</h3><p>把推理与行动交错起来，形成可观察、可继续的智能体循环。</p><div class="study-why">这是 ReAct 论文。</div></a>
    <a class="study-note-card" href="/study/papers/attention/"><div class="study-meta-row"><span>论文</span><span>LLM</span><span>Pillar</span></div><h3>Attention Is All You Need</h3><p>理解 Transformer 与大语言模型如何从上下文中选择信息。</p></a>
    <a class="study-note-card" href="/study/projects/postgresql/"><div class="study-meta-row"><span>项目</span><span>数据库</span><span>Pillar</span></div><h3>PostgreSQL</h3><p>从查询到存储，观察成熟关系数据库如何平衡正确性与性能。</p></a>
    <a class="study-note-card" href="/study/papers/paxos-1998/"><div class="study-meta-row"><span>论文</span><span>分布式</span><span>Pillar</span></div><h3>Paxos</h3><p>理解多个节点在故障与延迟中如何对同一个决定达成共识。</p></a>
    <a class="study-note-card" href="/study/papers/hindley-milner/"><div class="study-meta-row"><span>论文</span><span>类型系统</span><span>Pillar</span></div><h3>Hindley–Milner</h3><p>从类型推断出发，看编译器如何在少写标注时仍发现错误。</p></a>
    <a class="study-note-card" href="/study/projects/kubernetes/"><div class="study-meta-row"><span>项目</span><span>基础设施</span><span>Pillar</span></div><h3>Kubernetes</h3><p>用声明式控制循环理解集群里的调度、恢复与期望状态。</p></a>
    <a class="study-note-card" href="/study/projects/vite/"><div class="study-meta-row"><span>项目</span><span>前端工具链</span><span>Pillar</span></div><h3>Vite</h3><p>理解开发时按需加载与生产构建为何可以采用不同策略。</p></a>
  </div>
</section>

<section class="study-section">
  <h2>为什么这些笔记值得读</h2>
  <p>数量只是覆盖面，真正的价值在于每篇笔记如何帮你形成判断。</p>

  <div class="study-card-grid">
    <div class="study-callout"><strong>不是摘要</strong><p>不只复述“它做了什么”，还追问它解决了哪个旧问题、为什么选择这条路。</p></div>
    <div class="study-callout"><strong>不是收藏夹</strong><p>项目笔记会尽量定位到公开源码与核心文件；是否实际运行，以页面复核状态和对应证据为准。</p></div>
    <div class="study-callout"><strong>不是百科</strong><p>笔记会说明希望你读完后能解释、判断或尝试什么，但“待复核”不代表代码已经实际运行。</p></div>
  </div>
  <p class="study-evidence-note"><strong>先看复核状态：</strong>尚未迁移到当前证据契约的历史内容统一标为“待复核”；它们可以作为学习入口，但不据此宣称已经完成真实运行或最新版本复核。</p>
</section>

<div class="study-callout">
  <strong>已经知道名字？直接搜索。</strong>
  <p>按 Cmd/Ctrl + K，试试 React、ReAct、Paxos、PostgreSQL 或 Kubernetes；需要查全量时再进入 <a href="/study/projects-atlas/">项目 Atlas</a> 或 <a href="/study/papers-atlas/">论文 Atlas</a>。</p>
</div>
