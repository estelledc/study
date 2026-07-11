---
title: Apollo — 让两万台机器自己决定谁跑哪个任务
来源: 'Boutin et al., "Apollo: Scalable and Coordinated Scheduling for Cloud-Scale Computing", OSDI 2014'
日期: 2026-05-31
分类: 分布式系统
难度: 中级
---

## 是什么

Apollo 是微软 Bing 后端跑了好几年的**集群调度器**，处理这样的事：每天 17 万个数据分析任务、2 万台机器、每秒上万次调度决策——决定哪个任务跑在哪台机器上。

日常类比：想象一个超大餐厅有 2 万张桌子，每天来 17 万拨客人。如果只有一个领位员（中心调度器），他会被堵死。Apollo 的做法是——**每桌自己挂一块牌子写"现在排队预计多久"，每拨客人来了自带一个临时领位员，看完所有牌子自己挑桌子坐**。

技术语言里，这叫"分布式调度 + 中心化估算"。每台机器（server）算自己的等待预估，每个任务（job）自己一个 Job Manager 独立做决策。

## 为什么重要

不理解 Apollo，下面几件事都没法解释：

- 为什么 Kubernetes 默认的 `kube-scheduler` 是**单点**——它的规模上限就是 Apollo 在 2014 年早就遇到并解决的问题
- 为什么 Mesos 的 "resource offer" 模式在大规模下会**让 framework 互相打架**——Apollo 的 wait-time matrix 是对它的直接回答
- 为什么 Volcano / YuniKorn 这类新调度器都在做"两层"——中心估算 + 分布决策的范式 10 年前就被 Apollo 验证过
- 为什么搜索引擎后端、广告系统、大数据平台敢说"99.9% 任务能在 SLA 内完成"——背后是估算 + 纠偏两套机制叠加

## 核心要点

Apollo 把调度拆成 **三个独立组件**：

1. **Resource Monitor（每机一份）**：每台 server 自己维护一张"等待时间矩阵"——行是 CPU 需求、列是内存需求，格子里是"如果你现在请求这种资源，得等多久才轮到你"。每台机器把矩阵广播出去。

2. **Job Manager（每 job 一份）**：每个任务来了，启动一个 JM，拿到所有机器的矩阵，自己挑——不是挑"现在最空闲"，而是挑"等待 + 数据传输 + 执行"总时长最短的那台。这叫**估算式调度**（estimation-based）。

3. **Deferred Correction（纠偏）**：多个 JM 可能同时选中同一台机器。Apollo 不回滚，让 server 端在排队时再纠偏——重排、复制、或踢回让 JM 重选。

另一个关键设计是**两类任务**：

- **Regular**：占用预算配额，保证完成
- **Opportunistic**：填空闲资源，可被抢占

两类叠加把集群利用率推过 80%——这是普通"只跑 regular"的调度器很难做到的。

## 实践案例

### 案例 1：wait-time matrix 长什么样

一台 server 此刻发布的矩阵（简化版）：

```
            内存 4G   内存 8G   内存 16G
CPU 1 核     0s        2s        15s
CPU 2 核     5s        8s        25s
CPU 4 核    20s       40s        90s
```

JM 看到这个矩阵就知道："如果我的任务需要 2 核 8G，丢这台机器要等 8 秒"。所有 server 的矩阵汇总到 JM，它就有了**全集群的预估视图**——不是当前空闲快照，而是未来等待时间。

### 案例 2：选机器不是选最空，是选最快做完

任务需要读 5GB 数据 + 跑 20 秒计算。两台机器：

- 机器 A：数据本地，但要排队 30 秒
- 机器 B：数据要拉 5GB（10 秒），但现在空闲

传统调度器看"数据本地性"会选 A（30+0+20 = 50 秒）。Apollo 把三段相加比较——B 是 0+10+20 = 30 秒，**反而更快**。这种把"等待 + 传输 + 执行"统一成总时长来比较的能力，是 wait-time matrix 给的。

### 案例 3：决策冲突怎么办

JM-1 和 JM-2 同时拿到同一份矩阵，都觉得机器 X 最优，都把任务发过去。机器 X 队列满了。

Apollo 不回滚，**server 自己处理**：

- 重排队列（让小任务先走）
- 把重复任务复制到别的机器
- 提前告诉 JM"这里满了，请重选"——JM 拿新矩阵再选一次

这叫 **deferred correction**——延迟纠偏。代价是单次决策可能错，但**不需要全局锁**，所以能扩到 2 万台。

## 踩过的坑

1. **估算永远滞后**：JM 拿到的 wait-time matrix 是几秒前的数据。集群繁忙时，"预估等 5 秒"可能实际等 30 秒。Apollo 用 deferred correction 兜底，但这意味着 SLA 不能纯靠估算——还要有重试、复制。

2. **opportunistic 被抢的代价**：Opportunistic 任务跑到一半被踢掉，已经做的工作白费。要么写好 checkpoint，要么挑选小粒度任务。Apollo 在论文里强调：**opportunistic 适合 map 阶段（无状态），不适合 reduce 阶段（有累积状态）**。

3. **每 job 一个 JM = JM 数量爆炸**：2 万台机器同时跑几千个 job，就有几千个 JM。JM 自身故障要有重启机制。Apollo 用一个独立的 "Process Node" 服务来托管 JM 生命周期。

4. **数据本地性退化**：如果纯按 wait-time matrix 选，可能总把任务调走、丢失本地性优势。Apollo 让 JM 的估算函数**显式带数据传输代价**，避免一边倒。

## 适用 vs 不适用场景

**适用**：

- 大规模批处理（数千 - 几万机器，每秒上万决策）
- 任务粒度均匀（map-reduce / SQL on Big Data 这种）
- 容忍单次决策"不是最优"——只要 99% 决策合理就行

**不适用**：

- 小集群（< 100 机器）：估算误差比节省的协调开销还大，不如用 Kubernetes 单点
- 在线服务调度（毫秒级 SLA）：deferred correction 的延迟兜底容忍不了
- 强一致需求（金融交易、配额刚性）：分布式决策天然有冲突，不适合
- 异构硬件复杂（GPU + CPU + FPGA 混排）：wait-time matrix 是二维的（CPU + 内存），扩到多维就退化

## 历史小故事（可跳过）

- **2009 年前后**：微软 Bing 后端 Cosmos / SCOPE 平台用单点调度器，规模撞墙
- **2011 年**：Mesos 在 NSDI 提出"两层调度 + resource offer"，但 framework 看到的资源是局部的
- **2013 年**：Google Omega 在 EuroSys 提出"shared state + 乐观并发"，多 scheduler 共读全局快照
- **2014 年**：Apollo 在 OSDI 把 Omega 的思想再推一步——不光读当前快照，还**预测未来等待时间**，决策完全分布式

之后的 Borg 后续版本、Volcano、YuniKorn 都吸收了 Apollo 的"估算 + 分布"范式。

## 关键数字（Bing 生产实测）

论文里给的是**真实生产数据**，不是 benchmark：

- **集群规模**：单集群 2 万 + 服务器
- **每天调度量**：17 万 + 个 SCOPE job，几百万个任务
- **峰值决策速率**：> 2 万次 / 秒（单集群）
- **CPU 利用率**：峰值 > 80%，靠 opportunistic 任务填空
- **稳定性**：99.9% 任务在估算时间窗内完成

对比一下：2014 年的 Hadoop JobTracker 单集群上限大约 4 千台、每秒几百次决策。Apollo 把这两个数字都推了一个数量级。

## 学到什么

1. **大规模系统的瓶颈往往在协调，不在计算**：Apollo 用每秒 2 万决策证明，把协调从中心拿走、换成"广播估算"，规模就能往上推一个数量级
2. **估算 + 纠偏 比 一致 + 同步 更现实**：等所有人达成共识太慢，不如先各自决策再事后调整。这是分布式系统设计的一个范式选择
3. **两类任务（regular + opportunistic）是利用率密码**：纯保证型任务永远填不满集群，加一层"机会型"才能把利用率推过 80%
4. **理论上的"最优调度"在大规模下不可达**：Apollo 接受"99% 决策合理"就够，不追求每次都最优——这种工程取舍是大规模系统能落地的关键
5. **单台机器自己暴露能力，而不是被中心查询**：Resource Monitor 是 push 模型，每台 server 主动广播自己的 wait-time matrix——这种"被动协调 → 主动广告"的反转是分布式系统常见模式

## 延伸阅读

- 论文 PDF：[Apollo OSDI 2014](https://www.usenix.org/conference/osdi14/technical-sessions/presentation/boutin)（17 页，第 3-5 节是核心机制）
- 视频：[OSDI 2014 Apollo Talk](https://www.usenix.org/conference/osdi14/technical-sessions/presentation/boutin)（USENIX 官方视频，Boutin 本人讲）
- 对比阅读：[Mesos NSDI 2011](https://www.usenix.org/conference/nsdi11/mesos-platform-fine-grained-resource-sharing-data-center) + [Omega EuroSys 2013](https://research.google/pubs/pub41684/)——三篇连起来读完整理解集群调度演化
- [[mesos]] —— 两层调度的经典反面教材：framework 视野受限
- [[borg-2015]] —— Google 同期产品，单点 + 高度优化的对照组

## 关联

- [[mesos]] —— Apollo 用 wait-time matrix 直接回应了 Mesos resource offer 的视野局限
- [[borg-2015]] —— 同样大规模，但走单点 + 高度优化路线；Apollo 走分布式 + 估算
- [[mapreduce]] —— Apollo 调度的就是这类 map-reduce 风格的批任务
- [[raft]] —— Apollo 内部的元数据存储用 Paxos 类协议；分布式决策不等于不需要一致性
- [[kubernetes]] —— 现代继承者，但默认 scheduler 还是单点，规模上限远不如 Apollo

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
