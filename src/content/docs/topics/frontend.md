---
title: 前端与全栈
description: 从 React、TanStack Query、shadcn-ui 到 Radix，理解现代前端工程判断
---

这条路线不教 API 大全，而是回答：现代前端为什么要在渲染、状态、数据、组件和构建之间做这些取舍。

<div class="study-meta-panel">
  <div><strong>适合</strong><span>会一点 JS 或 React</span></div>
  <div><strong>建议节奏</strong><span>先读 3 篇，再按问题扩展</span></div>
  <div><strong>读法</strong><span>项目源码优先</span></div>
  <div><strong>目标</strong><span>从会用升级到会判断</span></div>
</div>

## 先读这 3 篇

<!-- STUDY:LEARNING_PATHS:TOPIC:FRONTEND:BEGIN -->
<div class="study-card-grid"><a class="study-note-card" href="/study/projects/react/">
<div class="study-meta-row"><span>项目</span><span>Pillar</span><span>渲染模型</span></div>
<h3>React</h3>
<p>理解组件、状态和渲染如何组成前端应用的基本模型。</p>
<div class="study-why">这是 React 前端项目，不是 ReAct 论文。</div>
</a>
<a class="study-note-card" href="/study/projects/tanstack-query/">
<div class="study-meta-row"><span>项目</span><span>Pillar</span><span>服务端状态</span></div>
<h3>TanStack Query</h3>
<p>理解服务端状态为什么不能只当作普通的全局状态来管理。</p>
<div class="study-why">重点看缓存、失效和观察者模型怎样协作。</div>
</a>
<a class="study-note-card" href="/study/projects/shadcn-ui/">
<div class="study-meta-row"><span>项目</span><span>Pillar</span><span>UI 工程</span></div>
<h3>shadcn-ui</h3>
<p>理解“复制进项目的组件源码”为什么也是一种产品化交付方式。</p>
<div class="study-why">它改变了组件只能通过 npm 包交付的默认假设。</div>
</a>
</div>
<!-- STUDY:LEARNING_PATHS:TOPIC:FRONTEND:END -->

## 按你的问题继续

<div class="study-card-grid">
  <a class="study-note-card" href="/study/projects/radix-ui/">
    <div class="study-meta-row"><span>项目</span><span>Headless UI</span></div>
    <h3>Radix UI</h3>
    <p>想理解无样式 primitive、可访问性和行为复用时读。</p>
  </a>
  <a class="study-note-card" href="/study/projects/zustand/">
    <div class="study-meta-row"><span>项目</span><span>状态管理</span></div>
    <h3>Zustand</h3>
    <p>想比较极简 store 与 Provider 模式的取舍时读。</p>
  </a>
  <a class="study-note-card" href="/study/projects/vite/">
    <div class="study-meta-row"><span>项目</span><span>构建工具</span></div>
    <h3>Vite</h3>
    <p>想理解开发期与生产构建为什么采用不同策略时读。</p>
  </a>
</div>

## 读完你应该能回答

1. React 提供的核心抽象是什么，状态变化为什么会触发新的渲染工作？
2. TanStack Query 管的是状态，为什么它又不是 Redux 的替代品？
3. shadcn-ui 与 Radix UI 各自负责哪一层？
4. 一个新需求应该放进本地状态、服务端缓存，还是共享 store？

更多精选内容可进入 [项目精选队列](/study/queue/)；需要按名字查找时再使用 [项目全景索引](/study/projects-atlas/)。
