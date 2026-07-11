---
title: Sparrow — 让毫秒级任务也能被精准调度的去中心化调度器
来源: 'Ousterhout, Wendell, Zaharia, Stoica, "Sparrow: Distributed, Low Latency Scheduling", SOSP 2013'
日期: 2026-05-31
分类: 分布式系统
难度: 中级
---

## 是什么

Sparrow 是一个**去中心化的集群任务调度器**，专门处理"任务很多、每个任务很短（几十到几百毫秒）"的场景。

日常类比：餐厅高峰期，一个总台传菜员要给 20 个厨师派单。如果每来一张单都跑去看 20 个炉子谁最闲，光看就来不及。Sparrow 的做法是：**派一群传菜员同时干活，每个人随机问两个厨师哪个闲，谁闲就给谁**——不需要总台、不需要互相通报。

放到机器上：

- 一个集群有上万个 CPU 核，框架像 Spark 把作业切成几千个几百毫秒的小任务
- 中心式调度器（Mesos / Borg / YARN）一次决策要 5–10 毫秒，对 100 毫秒的任务来说调度本身就吃掉了 10%
- Sparrow 启动多个**完全不通信**的调度器并行做决策，每个调度器只问几个 worker 谁闲，把任务直接塞过去

核心结论：在万核集群上，Sparrow 的响应时间能做到**理想中心式调度器的 88% 这么好**，但延迟低 1.5 倍以上。

## 为什么重要

不理解 Sparrow，下面这些事都没法解释：

- 为什么 2013 年之后 Spark / Impala 这类"亚秒级查询引擎"才真正能跑大集群——它们等的就是配套调度器
- 为什么后来的 Kubernetes 默认调度器仍是中心式——长任务场景不需要 Sparrow 这种激进设计
- 为什么"power-of-two-choices"会从负载均衡论文跨界变成系统设计的常用招式
- 为什么"无状态、无协调"在 2013 年开始成为分布式系统的潮流——Sparrow 是早期把它推到极端的代表

## 核心要点

Sparrow 的设计可以拆成 **三招**：

1. **去中心化的多调度器**：起 N 个调度器，每个调度器处理一部分作业请求。它们之间**不交换状态、不投票、不选主**。一个挂了其他照常工作。

2. **Power-of-two-choices 采样**：来一个任务，**随机选 2 个 worker**，问它们队列多长，把任务塞给较闲的那个。理论上（Mitzenmacher 1996 已证）这比"完全随机"好指数级，比"全看一遍"只差一点点。

3. **Batch sampling + Late binding**：一个作业有 m 个任务，**一次采样 d×m 个 worker**（不是每个任务各采 d 个），这样 m 个任务能挑出 m 个最闲的 worker。再加 **late binding**——不看 worker 现在的队列（会过时），而是让 worker 真的空下来时反向 ping 调度器领任务，避免"我看你 5 ms 前是空的，结果你刚被别人占了"。

三招合起来叫 **Sparrow 算法**。

## 实践案例

### 案例 1：power-of-two-choices 凭什么有效

随机扔一个球到 n 个桶里，最满的桶大约有 log n / log log n 个球。但如果扔之前**先看 2 个桶**，挑较空的扔，最满的桶只有 log log n 个。

```
n = 1000 桶：
  纯随机：最满桶 ≈ 7 个
  看 2 个挑空：最满桶 ≈ 4 个
  看 1000 个挑最空（中心式）：最满桶 ≈ 1 个
```

看 2 个 vs 看 1000 个，差距很小；看 2 个 vs 看 1 个，差距巨大。**收益主要来自从 1 跳到 2**。

### 案例 2：late binding 修了什么坑

不加 late binding 的天真版：

```
调度器：worker A 队列长度 0，worker B 队列长度 2 → 选 A
（中间 5 ms 过去了，别的调度器也选了 A）
调度器：把任务塞给 A → A 实际队列变成 4
```

late binding 版：

```
调度器：随机选 A、B、C，给三个都发"预留"
worker A 真的空了 → 主动找调度器领一个任务 → 调度器把任务给 A，撤销 B、C 的预留
```

这样**排队完全发生在调度器侧**，worker 一空就有活，不会出现"看上去闲、其实在排队"的错觉。

### 案例 3：和中心式调度的边界

```
任务长度 100 ms：Sparrow 几乎打平中心式
任务长度 10 s：Sparrow 跟中心式差不多，但中心式公平性/优先级更好
任务长度 1 hr：上中心式（Borg / Kubernetes），调度延迟可忽略
```

**Sparrow 不是替代品，是一个补位选手**——专攻短任务高吞吐场景。

## 踩过的坑

1. **长任务会被卡住**：采样只问 2 个 worker，如果一个长任务正好挂在被采样到的 worker 上，后续短任务一直会被分配过去等。论文里建议混合方案。

2. **公平性只能尽力**：调度器之间不通信，没法做"每个用户分到 1/n 资源"这种全局保证。Sparrow 用 weighted fair queueing 在 worker 侧做近似公平。

3. **数据本地性受限**：Spark 类作业讲究"算子贴着数据跑"。Sparrow 用约束调度——采样时只问"持有数据的那批 worker"，但样本变小了，调度质量也会下降。

4. **想用全局视图就别选 Sparrow**：需要 gang scheduling（一组任务必须同时启动）、严格优先级抢占、跨用户 SLA——这些都需要全局状态，Sparrow 设计上就拒绝。

## 适用 vs 不适用场景

**适用**：

- 亚秒级任务为主的引擎（Spark、Impala、Trino、Presto 的早期版本）
- 单作业任务数 ≥ 几十、调度决策每秒上万的高吞吐场景
- 容忍近似公平、近似最优的工程权衡

**不适用**：

- 长批处理（小时级别）→ 中心式 Borg / Kubernetes 更合适
- 严格优先级 / 抢占 / SLA 保证 → 需要全局视图
- gang scheduling（MPI、分布式训练 all-reduce）→ 一组任务必须同时调度
- 强本地性强约束（GPU 拓扑、NUMA 亲和）→ 采样数据不够准

## 历史小故事（可跳过）

- **2009 年**：Spark 在 Berkeley AMPLab 诞生，主打"内存里跑"，作业被切成大量短任务
- **2011 年**：Mesos 论文（同实验室）发表，提出双层 offer-based 调度，但 master 仍是单点
- **2013 年**：Google 发 Omega，用乐观并发共享状态做多调度器；同年 Berkeley 发 Sparrow，走完全相反的路——**啥都不共享**
- **2013 年之后**：Hawk（EuroSys 2015）、Mercury（USENIX ATC 2015）等"hybrid 调度器"都拿 Sparrow 当短任务路径

Sparrow 的论文一作 Kay Ousterhout 后来博士论文做"调度延迟到底重不重要"，结论是**对很多 Spark 作业延迟瓶颈其实不在调度而在网络**——一个让人警醒的反思。

## 学到什么

1. **不是所有问题都需要全局视图**：当决策频率高到让"读全局"本身成为瓶颈时，**主动放弃完美**反而更快
2. **统计学里的老结论会回来救命**：power-of-two-choices 1996 年就证完了，2013 年才在系统圈大放异彩
3. **采样过时是分布式信息的核心难题**：Sparrow 用 late binding 把"看快照"换成"等通知"，这招在很多其他系统也通用
4. **调度器的设计目标决定边界**：Sparrow 选了短任务、高吞吐、近似公平这三件事，其他事它根本不管——边界清晰是好系统的标志
5. **理论 → 工程的迁移要找新约束**：把 power-of-two-choices 直接搬过来不够，必须叠加 batch + late binding 才能在毫秒尺度真的好用

## 延伸阅读

- 论文 PDF：[Sparrow SOSP 2013](https://people.csail.mit.edu/matei/papers/2013/sosp_sparrow.pdf)（14 页，可读性高）
- 一作演讲：[Kay Ousterhout — Sparrow at SOSP 2013](https://www.youtube.com/watch?v=qkE5DgyEPiE)
- 反思之作：[Kay Ousterhout PhD thesis](https://www2.eecs.berkeley.edu/Pubs/TechRpts/2017/EECS-2017-191.pdf)（追问"调度延迟真的是瓶颈吗"）
- 数学背景：[Mitzenmacher — Power of Two Choices](https://www.eecs.harvard.edu/~michaelm/postscripts/handbook2001.pdf)
- [[mesos]] —— 同实验室前身，双层 offer-based 调度
- [[borg]] —— Google 中心式集群管理器，对照组

## 关联

- [[mesos]] —— 同 Berkeley AMPLab 系列，Sparrow 是 Mesos 的"超低延迟特化版"
- [[borg]] —— Google 中心式调度器，长任务场景的对照样本
- [[borg-omega-kube-2016]] —— 把 Borg / Omega / Kubernetes 三代经验总结的论文
- [[spark-rdd]] —— Sparrow 的主要服务对象
- [[akamai-2002]] —— 同样靠"就近 + 随机"做大规模决策，思想相通
- [[chord]] —— 去中心化思想的另一个经典案例，DHT 的代表作

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[omega-2013]] —— Omega 2013 — 让多个调度器同时改一份 cluster 状态
