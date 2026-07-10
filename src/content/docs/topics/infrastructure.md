---
title: 基础设施
description: 从 Docker、Kubernetes 到 OpenTelemetry，理解容器、编排与可观测性
---

这条精选路线沿着应用上线后的真实问题前进：先得到一致的运行环境，再管理大量工作负载，最后观察系统是否真的健康。

<div class="study-meta-panel">
  <div><strong>适合</strong><span>部署过应用，想理解平台层</span></div>
  <div><strong>建议顺序</strong><span>容器 → 编排 → 可观测</span></div>
  <div><strong>读法</strong><span>结合一次真实部署</span></div>
  <div><strong>目标</strong><span>理解生产运行闭环</span></div>
</div>

## 先读这 3 篇

<div class="study-card-grid">
  <a class="study-note-card" href="/study/projects/docker/">
    <div class="study-meta-row"><span>项目</span><span>Pillar</span><span>容器</span></div>
    <h3>Docker</h3>
    <p>理解镜像、容器和隔离怎样把应用及其运行环境一起交付。</p>
    <div class="study-why">先分清镜像与容器，再讨论编排才有共同语言。</div>
  </a>

  <a class="study-note-card" href="/study/projects/kubernetes/">
    <div class="study-meta-row"><span>项目</span><span>编排</span><span>控制循环</span></div>
    <h3>Kubernetes</h3>
    <p>理解声明式 API 和控制器如何让实际状态持续靠近期望状态。</p>
    <div class="study-why">把“部署工具”升级为“持续调和的系统”来理解。</div>
  </a>

  <a class="study-note-card" href="/study/projects/opentelemetry/">
    <div class="study-meta-row"><span>项目</span><span>可观测性</span><span>遥测</span></div>
    <h3>OpenTelemetry</h3>
    <p>理解 traces、metrics 和 logs 如何用统一语义描述运行中的系统。</p>
    <div class="study-why">系统能运行之后，还要能回答它为什么慢、为什么错。</div>
  </a>
</div>

## 读完你应该能回答

1. 镜像、容器和虚拟机的边界分别是什么？
2. Kubernetes 的控制循环为什么比一串部署脚本更适合长期运行？
3. traces、metrics、logs 各自最适合回答哪类问题？
4. 一次发布从打包到观测，哪些环节需要可重复、可回滚和可验证？

这页只保留三个入口，不复制全量目录。继续探索可进入 [项目精选队列](/study/queue/)；知道项目名时再查 [项目全景索引](/study/projects-atlas/)。
