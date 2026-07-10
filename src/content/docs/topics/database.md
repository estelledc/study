---
title: 数据库
description: 从 PostgreSQL、Bigtable 到 Spanner，建立数据系统的工程判断
---

这条精选路线从一个成熟的单机数据库出发，再看大规模分布式存储和全球事务。重点不是背名词，而是理解数据怎样被组织、复制和保持一致。

<div class="study-meta-panel">
  <div><strong>适合</strong><span>写过 CRUD，想理解数据库内部</span></div>
  <div><strong>建议顺序</strong><span>实现 → 分布式存储 → 全球事务</span></div>
  <div><strong>读法</strong><span>项目与论文混读</span></div>
  <div><strong>目标</strong><span>理解存储与一致性取舍</span></div>
</div>

## 先读这 3 篇

<div class="study-card-grid">
  <a class="study-note-card" href="/study/projects/postgresql/">
    <div class="study-meta-row"><span>项目</span><span>Pillar</span><span>关系型数据库</span></div>
    <h3>PostgreSQL</h3>
    <p>从真实实现理解查询、事务、索引和存储引擎如何组成数据库。</p>
    <div class="study-why">先建立“一个数据库内部有什么”的整体地图。</div>
  </a>

  <a class="study-note-card" href="/study/papers/bigtable-2006/">
    <div class="study-meta-row"><span>论文</span><span>分布式存储</span><span>数据模型</span></div>
    <h3>Bigtable</h3>
    <p>理解大规模结构化数据如何按 tablet 切分、存储和调度。</p>
    <div class="study-why">观察规模增长后，单机结构怎样变成分布式系统。</div>
  </a>

  <a class="study-note-card" href="/study/papers/spanner/">
    <div class="study-meta-row"><span>论文</span><span>全球事务</span><span>时间</span></div>
    <h3>Spanner</h3>
    <p>理解全球复制、外部一致性和 TrueTime 如何共同支撑事务。</p>
    <div class="study-why">重点看“时间”为什么会成为数据库协议的一部分。</div>
  </a>
</div>

## 读完你应该能回答

1. 单机数据库的查询、事务、索引和存储分别解决什么问题？
2. Bigtable 为什么要切分 tablet，它牺牲和保留了哪些能力？
3. Spanner 为什么需要 TrueTime，时钟不确定性怎样影响提交？
4. 业务说“需要一致性”时，你还应该继续追问什么？

这页只保留精选起点。更多内容可进入 [项目精选队列](/study/queue/) 与 [论文精选队列](/study/papers-queue/)；知道名字时再查 [项目全景索引](/study/projects-atlas/) 或 [论文全景索引](/study/papers-atlas/)。
