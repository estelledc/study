---
title: 分布式系统
description: 从 Lamport Clock、Paxos 到 Raft，理解时钟、一致性和共识
---

这条精选路线先解决“节点怎样描述先后”，再进入“节点怎样在故障中达成一致”。三篇读完后，再扩展到复制、调度和存储系统会更容易。

<div class="study-meta-panel">
  <div><strong>适合</strong><span>会写服务，想补系统基础</span></div>
  <div><strong>建议顺序</strong><span>事件顺序 → 共识 → 工程实现</span></div>
  <div><strong>读法</strong><span>画消息时序图</span></div>
  <div><strong>目标</strong><span>建立故障下的系统判断</span></div>
</div>

## 先读这 3 篇

<!-- STUDY:LEARNING_PATHS:TOPIC:DISTRIBUTED_SYSTEMS:BEGIN -->
<div class="study-card-grid"><a class="study-note-card" href="/study/papers/lamport-1978/">
<div class="study-meta-row"><span>论文</span><span>Pillar</span><span>逻辑时钟</span></div>
<h3>Lamport Clock</h3>
<p>理解没有全局时钟时，系统怎样描述事件之间的先后关系。</p>
<div class="study-why">先把“时间”和“顺序”分开，后面的协议才不会混乱。</div>
</a>
<a class="study-note-card" href="/study/papers/paxos-1998/">
<div class="study-meta-row"><span>论文</span><span>Pillar</span><span>共识</span></div>
<h3>Paxos</h3>
<p>理解节点和消息都可能失败时，一组参与者如何对一个值达成一致。</p>
<div class="study-why">把安全性与活性分开看，不要先陷入角色名词。</div>
</a>
<a class="study-note-card" href="/study/papers/raft/">
<div class="study-meta-row"><span>论文</span><span>Pillar</span><span>可理解性</span></div>
<h3>Raft</h3>
<p>通过 leader election、log replication 和 safety 理解共识的工程结构。</p>
<div class="study-why">用更明确的模块划分，对照 Paxos 建立实现直觉。</div>
</a>
</div>
<!-- STUDY:LEARNING_PATHS:TOPIC:DISTRIBUTED_SYSTEMS:END -->

## 读完你应该能回答

1. 逻辑时钟能告诉你什么，又不能告诉你什么？
2. 共识协议为什么不能只靠“多数节点投票”这一句话解释？
3. Paxos 与 Raft 的核心目标相同，为什么工程表达方式不同？
4. 网络延迟、节点宕机和消息重复分别会影响协议的哪一部分？

这页不是论文全表。继续探索可进入 [论文精选队列](/study/papers-queue/)；知道协议名时再查 [论文全景索引](/study/papers-atlas/)。
