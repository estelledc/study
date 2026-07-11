---
title: Omega 2013 — 让多个调度器同时改一份 cluster 状态
来源: 'Schwarzkopf, Konwinski, Abd-El-Malek, Wilkes, "Omega: flexible, scalable schedulers for large compute clusters", EuroSys 2013'
日期: 2026-06-01
分类: 分布式系统
难度: 中级
---

## 是什么

Omega 是 **Google 在 Borg 之后想做的下一代集群调度器**——它没有真正替代 Borg，但把"多个调度器并行操作同一份 cluster 状态"这个思路写成论文，直接成了 Kubernetes scheduler 的设计蓝本。

日常类比：超市收银台升级。

- **Borg 模式**（monolithic）：一个总收银员管所有顾客，简单但排长队
- **Mesos 模式**（two-level）：一个分发员把空收银台"轮流推荐"给不同小队（offer），小队只能从被推荐的台子里选，看不到全场
- **Omega 模式**（shared-state）：每个小队都有一份"全场实时地图"复印件，自己挑台子下单；下单时如果发现台子已被别人占了，回去重选——这就是**乐观并发**

```
3 个 scheduler 并行抢机器:
  scheduler A 看本地副本 → 选 machine-7 → 提交: 成功
  scheduler B 看本地副本 → 也选 machine-7 → 提交: 冲突, 重试
  scheduler C 看本地副本 → 选 machine-9 → 提交: 成功
```

冲突不是"加锁防止"，是"发生后重试"。这套机制在数据库里叫 OCC（optimistic concurrency control），Omega 把它搬到了集群调度。

## 为什么重要

不理解 Omega，下面这些 Kubernetes 设计都会显得"凭空冒出来"：

- 为什么 K8s 每个对象都有 `resourceVersion` 字段——这是 etcd 的 modindex，做 CAS 写时用来检测冲突
- 为什么 controller / scheduler 都用 **informer cache + watch** 而不是直接查 apiserver——本地缓存就是 Omega 的"全场副本"
- 为什么 K8s 控制器都是**级触发 reconcile + 失败重试**，而不是事件驱动一次性完成——这就是 OCC 重试循环
- 为什么 K8s 可以跑多个调度器（kube-scheduler、自定义 scheduler）共存——Omega 论文核心论点是"shared-state 让多调度器并存可行"

## 核心要点

Omega 把"集群调度器"分成 **三类架构**，并论证 shared-state 在大 cluster + 多调度器时最优：

1. **Monolithic（Borg 代表）**：一个调度器一条决策路径。简单、好做全局策略，但调度器是单线程瓶颈，新调度策略要改源码。

2. **Two-level（Mesos 代表）**：中央 resource manager 把空闲资源**主动 offer 给** framework，framework 只能从 offer 里选。问题：拿不到 offer 的 framework 看不到全场，无法做"我宁愿等更好的机器"这种决策；offer 是悲观锁，资源被锁住时其他人干等。

3. **Shared-state（Omega 自己）**：cell state 存中央副本（一份 master 数据），每个调度器**异步同步**本地副本，决策后**原子 commit**。冲突：commit 时若发现 cell state 已被改过（CAS 失败），整个事务作废、重试。

关键工程取舍：

- **冲突处理走 OCC 不走锁**——假设冲突少、重试便宜，换来无锁高并发
- **状态对所有调度器透明**——任何调度器看到的都是完整 cluster，不像 Mesos 只看 offer
- **中央 cell state 仍是单点**——但只做"原子提交 + 版本号"，不做调度决策，瓶颈轻

## 实践案例

### 案例 1：批处理 + 服务两个调度器并存

Google 内部典型：service scheduler 关心延迟（决策快、机器选得好）；batch scheduler 关心吞吐（决策可以慢、要装满机器）。

```
service scheduler: 看到 cell state, 给 service-A 选 machine-7 → commit 成功
batch scheduler: 看到 cell state（同一时刻已含 service-A 的占用）→ 给 batch-X 选 machine-9 → commit 成功
```

两个调度器**互不知情**，各自跑自己的算法，全靠 cell state 协调。Borg 里要这样做必须改源码加新策略；Omega 里只需新增一个调度器进程。

### 案例 2：冲突重试的代价

```
12 个调度器同时抢 50 台机器:
  第一轮 commit: 8 个成功 / 4 个冲突
  4 个重试, 重新读 cell state, 选别的机器
  第二轮 commit: 4 个全部成功
```

论文 trace 模拟显示：在 Google 真实负载下，冲突率随调度器数量缓慢上升，重试成本远低于"一个调度器排队全做"的延迟。**前提是冲突真的少**——如果都抢同一个稀缺资源，OCC 就退化成自旋锁。

### 案例 3：K8s 里 OCC 的影子

你 `kubectl apply` 一份 Deployment：

```
1. apiserver 把对象写 etcd, 拿到 resourceVersion=42
2. controller-manager 的 informer 缓存看到 v42, 决定创建 3 个 pod
3. 同时 HPA 也基于 v42 决定扩到 5 个
4. controller 提交时带 resourceVersion=42
   - 第一个 commit 成功, 对象升 v43
   - 第二个发现 etcd 已是 v43, 冲突, 重试
   - 重试时读到 v43, 重新计算, 提交 v44
```

这段流程**不是 K8s 自创**，是 Omega 论文里明确写的 OCC 循环。

## 踩过的坑

1. **Omega 在 Google 内部没真正替代 Borg**：论文虽然漂亮，但 Borg 已经长出几千个用户和工具链生态，迁移成本压倒了架构收益。这个事实在 2016 三代同源那篇论文里被作者们坦白。

2. **冲突重试不解决饥饿**：长 batch job 选大机器时，可能反复被短 service job 抢先 commit，永远 commit 不成。Omega 没给 anti-starvation 机制，K8s 后来用 PriorityClass 补。

3. **全局策略难写**：fairness、quota 这种"看全场决定谁让谁"的逻辑，在 monolithic 调度器里一行代码，在 shared-state 里要嵌进 cell state schema 当字段，所有调度器都要遵守约定。

4. **state 同步带宽**：每个调度器看完整 cluster state，cluster 大到几万台时，同步带宽和内存压力都升。K8s 用 watch 增量推送 + 字段裁剪缓解，但 etcd 的 watch fanout 仍是性能瓶颈。

## 适用 vs 不适用场景

**适用**：

- 多种工作负载并存，希望各自有专门调度器（service / batch / ML 训练）
- cluster 大到 monolithic 调度器成单点瓶颈（数千节点起）
- 团队接受"重试代替加锁"的工程范式
- 已有 etcd / ZooKeeper 这种带版本号的存储

**不适用**：

- 小集群（百节点以下），monolithic 简单可靠
- 工作负载高度同质（全是短任务），调度策略只有一种
- 资源极度稀缺，冲突率高到 OCC 不停重试
- 需要严格全局公平 / 配额仲裁——shared-state 协调成本高

## 历史小故事（可跳过）

- **2003 年**：Google Borg 上线，monolithic 调度器
- **2010 年**：Berkeley Mesos 论文，two-level offer 模型成学术热点
- **2013 年 4 月**：Omega 论文 EuroSys 发表，作者 John Wilkes 同时是 Borg 老人和后来 K8s 的精神领袖
- **2014 年**：Brendan Burns / Joe Beda / Craig McLuckie 启动 Kubernetes，scheduler 直接用 Omega 思路
- **2015 年**：Borg 论文公开 (EuroSys)，三代调度器面纱同时揭开
- **2016 年**：[[borg-omega-kube-2016]] 三代同源回顾，作者们承认 Omega 没在 Google 内部胜出，但活在 K8s 里

Omega 的命运很像很多研究系统：**作为产品失败，作为思想活下来**。

## 学到什么

1. **乐观并发不只是数据库技术**：把"假设冲突少 + 出事重试"搬到分布式调度，能解锁多调度器并行
2. **shared state 是 K8s 的脊柱**：理解 resourceVersion / informer / reconcile 三件套，本质是理解 Omega
3. **架构论文的影响力 > 系统本身**：Omega 没在 Google 内部成功，但论文塑造了开源时代的调度器设计空间
4. **Borg → Omega → K8s 是一条"先做对、再做大、再开源"的路径**：每代解决上代的具体痛，不是从零设计

## 延伸阅读

- 论文原文：[Omega: flexible, scalable schedulers for large compute clusters](https://research.google/pubs/pub41684/) —— EuroSys 2013，14 页
- 三代同源回顾：[Borg, Omega, and Kubernetes](https://research.google/pubs/pub44843/) —— ACM Queue 2016
- [[borg]] —— 上一代 monolithic 调度器，Omega 想替代但没成
- [[mesos-2011]] —— two-level 对照组，Omega 论文重点对比对象
- [[borg-omega-kube-2016]] —— 三代同源，明确说 Omega 在 Google 没胜出但思想被 K8s 继承

## 关联

- [[borg]] —— Omega 想替代它，没成；Borg 12 年生态压倒了 Omega 架构优势
- [[mesos-2011]] —— two-level offer 模型，Omega 论文用它当反面教材证明 shared-state 更好
- [[borg-omega-kube-2016]] —— 三代调度器同源，Omega 在中间承上启下
- [[sparrow-2013]] —— 同年另一种思路：去中心化 + 随机抽样，对短任务效果更好
- [[quincy-2009]] —— 把调度建模为最小费用流，monolithic 派系的高级形态
- [[paxos]] —— cell state 用类 Paxos 做副本一致性
- [[raft]] —— K8s etcd 的实际共识协议，承载 Omega OCC 落地

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[borg-2015]] —— Borg 2015 — Google 把一万台机器假装成一台
- [[kubernetes-2016]] —— Kubernetes — 为什么选声明式 API 加协调环
- [[twine-2020]] —— Twine — Facebook 把整个数据中心当一台机器调度
