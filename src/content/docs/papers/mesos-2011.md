---
title: Mesos 2011 — 把数据中心切成资源 offer 发给框架自己挑
来源: 'Hindman et al., "Mesos: A Platform for Fine-Grained Resource Sharing in the Data Center", NSDI 2011'
日期: 2026-06-01
分类: 分布式系统
难度: 中级
---

## 是什么

Mesos 是一个**集群资源调度器**，但它的玩法和后来的 Kubernetes 不一样：它不替你决定"这个任务跑到哪台机器"，而是把空闲资源切成一份份"offer"主动塞给上层框架（Hadoop、Spark、MPI 等），让框架自己挑要不要接、接了拿来跑什么。这种"我提供资源，你决定调度"的两步走，叫**双层调度**（two-level scheduling）。

日常类比：Mesos 是一个**人才市场的中介**，每天把空着的工位（CPU/内存切片）打包成 offer 发到各家公司（Hadoop / Spark）的 HR 邮箱；HR 看完决定要不要接，要的话派哪个员工（task）去坐。中介本身不管员工是谁、做什么活。

论文 2011 年发表在 NSDI，作者来自 UC Berkeley AMPLab——同一个实验室还产出了 Spark；早期 Spark 正是作为 Mesos 上的 framework，用来验证双层调度是否好用。

## 为什么重要

不理解 Mesos，下面这些事都说不清：

- 为什么 Twitter 在 2010 年代长期把生产集群跑在 Mesos + Aurora 上，而不是一上来就用后来的 Kubernetes
- 为什么 Apple Siri 后端早期、Airbnb、eBay 都选过 Mesos
- 为什么 Kubernetes 最后没走双层路线——它看到了 Mesos 的代价，主动选了单层
- 为什么 Spark 能在 2010 年代起飞——它早期作为 Mesos 上层框架验证了"自带调度器接入共享集群"
- 为什么 Google 的 Omega（2013）要发明"共享状态 + 乐观并发"——就是嫌 Mesos 双层太悲观

Mesos 是**集群即操作系统**这条思路里，较早能在工业环境跑起来的实现之一。

## 核心要点

Mesos 的设计可以拆成 **三块**：

1. **Resource Offer（资源邀约）**：Master 把每台 slave 的空闲资源（4 CPU + 8 GB）打包成一个 offer，挨个发给已注册的 framework。Framework 看到 offer 后，要么 accept（顺便告诉 master 这次跑什么 task），要么 reject（offer 退回 master 再发给下一家）。

2. **Two-Level Scheduling（双层调度）**：Master 只决定"把哪批资源发给哪个 framework"（第一层）；framework 自己的 scheduler 决定"用这份资源跑哪个具体 task"（第二层）。Master 完全不知道任务内部的逻辑。

3. **DRF（Dominant Resource Fairness）**：多维资源（CPU/MEM）下怎么算公平？Mesos 团队同期发明的算法——看每个 framework 的"主导资源占比"，谁的主导占比小就先给谁。这套方法后来成了多资源公平调度的事实标准。

三块加起来的核心承诺：**一个集群同时跑多种异构框架，互不打架**。

## 实践案例

### 案例 1：一份 offer 怎么走完一轮

假设集群有 100 台机器，Hadoop 和 Spark 都注册在 Mesos 上：

```
Master → Spark scheduler: "node-7 有 4 CPU + 8 GB 空闲，要吗？"
Spark scheduler: "要，跑 task-A（占 2 CPU + 4 GB），剩下退回"
Master → Hadoop scheduler: "node-7 还剩 2 CPU + 4 GB，要吗？"
Hadoop scheduler: "不要，资源太碎"
Master → Spark scheduler: "node-7 还剩 2 CPU + 4 GB，要吗？"
...
```

Master 不知道 task-A 是什么、为什么 Hadoop 嫌碎。它只搬资源。

### 案例 2：Spark 为什么和 Mesos 一起出生

Zaharia 当年要给 Mesos 写一个验证用的 framework，证明"上层调度器能轻松接入"。他选的题目是"内存里跑迭代式机器学习"，写出来就是 Spark RDD。换句话说：**早期 Spark 是挂在 Mesos 上的 framework**，用来证明双层调度真能跑新计算引擎。后来 Spark 火了，反过来盖过 Mesos 本身。

### 案例 3：Twitter Aurora vs Kubernetes 的路线分叉

Twitter 在 2010–2019 年前后用的是 Mesos + Aurora（Aurora 是个 framework，专跑长服务）。这套方案扛住了大规模生产流量，但运维体感很重：写一个新 workload 类型经常要写一个新 framework。

Kubernetes 出来后看到这点，反向选了**单层**——一个 kube-scheduler 看全集群、决策所有 pod。代价是不能任意接入"自己写调度逻辑的上层"，但好处是：

- 全局视图，公平和抢占容易做
- 没有 offer 来回的 RPC，调度延迟低
- 大部分团队不需要自己写 scheduler，K8s 替他们决定就够了

Twitter 自己 2020 后也迁到了 K8s。

### 案例 4：DRF 怎么算公平

两个 framework 抢同一台机器（9 CPU + 18 GB）：

- Framework A 每个 task 要 1 CPU + 4 GB（瓶颈在内存）
- Framework B 每个 task 要 3 CPU + 1 GB（瓶颈在 CPU）

DRF 不看 CPU 总量也不看内存总量，看每家**主导资源**的占比：A 的主导是内存，B 的主导是 CPU。Mesos 让两家的"主导占比"相等——结果 A 拿到 3 task（占 12/18 = 66% 内存），B 拿到 2 task（占 6/9 = 66% CPU）。两家都觉得自己拿到了 2/3 的"应得份额"。

这套算法的核心价值：在多维资源下找到一个**所有人都不嫉妒**（envy-free）的分配点。

## 踩过的坑

1. **Offer 是悲观锁**：同一份 offer 同一时刻只在一个 framework 手里。如果 framework A 拿着不动，framework B 就看不到这部分资源——尾延迟问题。Mesos 用"超时回收"硬扛，但天花板就在那。

2. **跨 framework 没有全局视图**：抢占（preemption）、跨 framework 公平、跨 framework 反亲和——这些在 Mesos 里都很难做，因为 master 不懂 framework 内部状态。Google Omega 论文专门指出这是双层调度的根本缺陷。

3. **DRF 假设资源同质**：CPU/MEM 是连续可分的，DRF 推得很漂亮。一旦混进 GPU、整卡 NVLink、网络带宽这种异构/不可分资源，DRF 的公平性就开始崩。

4. **Executor 模型让 task 启动重**：Mesos 上一个 task 要先起 framework 的 executor 进程，再起 task 进程。比 K8s 直接拉 pod 多一层开销。短任务被拖累。

## 适用 vs 不适用场景

**适用**：

- 一个集群要跑**多种异构框架**（Hadoop + Spark + MPI + 长服务）且每种框架自带强调度逻辑——这是 Mesos 的主场
- 团队有能力**为每种 workload 写 framework**——Twitter / Apple 这种规模玩得转
- 需要**框架隔离**——一个 framework 挂了不影响别人

**不适用**：

- 大部分中小团队——他们不需要自己写 scheduler，K8s 的单层就够
- workload 主要是**容器化无状态服务** —— K8s 的 Deployment/Service 抽象更顺手
- 需要**强抢占和跨 workload 全局优化** —— 单层调度更合适
- 需要**异构硬件感知调度**（多种 GPU、RDMA） —— DRF 的多维公平开始捉襟见肘

## 历史小故事（可跳过）

- **2009-2010**：Berkeley AMPLab 启动，Hindman 等人想"做一个能同时跑 Hadoop 和 MPI 的集群层"，因为当时各组互相抢机器
- **2010**：第一版 Mesos 在 Berkeley 集群上线；Zaharia 同期为验证 Mesos 写了 Spark
- **2011**：NSDI 论文发表
- **2012**：Twitter 全量上 Mesos，定制了 Aurora framework 跑长服务
- **2013**：Google Omega 论文出来，明确批评双层调度的悲观锁问题，提出共享状态 + 乐观并发的"第三条路"
- **2014**：Kubernetes 开源，选了单层
- **2015-2019**：Mesosphere 推 DC/OS 商业化，与 K8s 正面竞争
- **2020-2021**：Twitter 迁 K8s；Apache Mesos 项目投票进 Attic（半休眠）

技术不是失败了，是被另一种取舍的方案在普及度上压过去了。

## 学到什么

1. **机制 vs 策略的分离**：Mesos master 只做机制（搬资源），策略（怎么调度）交给 framework——这是 OS 层"微内核"思想在集群层的复刻
2. **双层调度的代价**：分离意味着无法做全局优化；K8s 选单层是看到了这一点
3. **抽象的胜负不只看技术**：Mesos 双层在技术上更通用，但 K8s 单层更简单、更适合大多数人——简单常常赢
4. **多资源公平是个真问题**：DRF 是 Mesos 留给后世最稳的资产，K8s 的 Scheduling Framework 里还能看到它的影子
5. **"通用"不一定赢**：Mesos 把"接入任何 framework"做到了极致，但市场不需要那么通用；K8s 用更窄的抽象（Pod/Deployment/Service）覆盖了 80% 的需求
6. **历史不是技术决定的**：Mesos 进 Apache Attic 不是技术不行，是社区与生态被 K8s 拉走——再好的内核也要有应用层愿意写

## 延伸阅读

- 论文 PDF：[Mesos NSDI 2011](https://people.csail.mit.edu/matei/papers/2011/nsdi_mesos.pdf)（14 页，4 节后开始有意思）
- DRF 原始论文：[Dominant Resource Fairness, NSDI 2011](https://people.csail.mit.edu/matei/papers/2011/nsdi_drf.pdf)（同一批作者同会议同年）
- Google Omega 论文：[Omega: flexible, scalable schedulers, EuroSys 2013](https://research.google/pubs/pub41684/)（明确批评 Mesos 双层）
- Mesos 与 K8s 设计权衡综述：[Borg, Omega, Kubernetes (CACM 2016)](https://research.google/pubs/pub44843/)
- [[borg]] —— Google 内部的单层调度器，K8s 的精神祖宗
- [[borg-omega-kube-2016]] —— 三代调度器的取舍回顾

## 关联

- [[borg]] —— 同时代单层调度器，验证了"中央 scheduler + 全局视图"是另一条路
- [[borg-omega-kube-2016]] —— 把 Borg / Omega / Kubernetes 三代放在一起对比，是理解 Mesos 历史定位的最佳入口
- [[spark-rdd-2012]] —— 早期 Spark 作为 Mesos framework 验证双层调度；理解 Mesos 才知道 Spark 早期为何这样接入
- [[chubby-2006]] —— Mesos master 用 ZooKeeper 选主，思想同源
- [[yarn-2013]] —— Hadoop 自家的"准双层"调度器，资源管理与作业调度同样分离，但只服务 Hadoop 生态
- [[microkernel-1995]] —— Mesos 的"机制 vs 策略分离"是微内核思想搬到集群层
- [[zookeeper]] —— Mesos master 高可用的依赖底座，框架注册与领导选举都靠它

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[borg-2015]] —— Borg 2015 — Google 把一万台机器假装成一台
- [[ciel-universal-execution-engine-distributed-data-flow-2011]] —— CIEL 2011 — 让分布式数据流会自己长出下一步
- [[linux-kernel]] —— Linux kernel — 三层解释开源内核如何协作
- [[omega-2013]] —— Omega 2013 — 让多个调度器同时改一份 cluster 状态
- [[twine-2020]] —— Twine — Facebook 把整个数据中心当一台机器调度
