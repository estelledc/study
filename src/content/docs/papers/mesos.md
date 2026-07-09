---
title: Mesos — 让多种计算框架共用一套集群
来源: 'Hindman et al., "Mesos: A Platform for Fine-Grained Resource Sharing in the Data Center", NSDI 2011'
日期: 2026-07-09
分类: 分布式系统
难度: 中级
---

## 是什么

日常类比：一栋办公楼里有很多空会议室，前台不替每个团队决定开哪场会，只把"3 楼 A 室空 2 小时、5 楼 B 室空 1 小时"这些机会发给各团队，团队自己决定要不要用。Mesos 做的就是这个前台：它把数据中心里的 CPU、内存这些空闲资源做成 offer，发给 Hadoop、Spark、MPI 这类计算框架自己挑。

技术上说，Mesos 是一个**集群资源共享层**。它不直接理解每个任务的业务逻辑，而是在 master 里负责资源分配，在 framework scheduler 里保留任务调度决策，这就是常说的**两级调度**。

这篇论文的核心价值，是证明"一个集群同时跑多种计算框架"可以不用把所有框架都改写成同一个系统。Mesos 只提供很薄的一层机制，让各框架继续保留自己的调度器。

## 为什么重要

不理解 Mesos，下面这些事都很难说清：

- 为什么 2010 年前后的公司会为 Hadoop、MPI、批处理、交互查询分别维护集群，机器利用率却不高。
- 为什么 Spark 早期能作为一个新框架快速试验出来，因为它可以接到 Mesos 上共享已有集群。
- 为什么 Kubernetes、Borg、Omega 这些后来的调度系统经常被拿来和 Mesos 对比，它们都在回答"谁来做最终调度"。
- 为什么"公平"在集群里不是一句口号，而是 CPU、内存、数据本地性、任务长短一起纠缠的工程问题。

## 核心要点

1. **资源 offer**：Mesos master 像发菜单一样，把某台机器当前空闲的 CPU 和内存打包发给某个框架。类比：餐厅告诉你"现在有靠窗两人桌"，你可以坐，也可以等更合适的位置。

2. **两级调度**：第一层由 Mesos 决定"这份资源先给哪个框架看"，第二层由框架决定"用这份资源跑哪个任务"。类比：校务处分教室，老师决定这节课讲什么。

3. **细粒度共享**：Mesos 依赖很多短任务不断结束，把资源快速还回来再分出去。类比：共享单车周转快，大家更容易借到车；如果每个人骑一天，调度再聪明也很难流动。

三点合起来，Mesos 的选择是：中央层保持简单，框架层保留自由，用频繁的小任务换高利用率和低改造成本。

再换句话说，Mesos 不追求"一个调度器懂所有工作负载"。

它追求的是"资源层只做通用协调，专业判断留给专业框架"。

## 实践案例

### 案例 1：一个 offer 怎么流动

```text
slave-7 -> master: free = 4 cpu, 8 gb
master -> spark: offer(slave-7, 4 cpu, 8 gb)
spark -> master: accept, launch task-a with 2 cpu, 4 gb
master -> slave-7: run task-a
master -> hadoop: offer(slave-7, 2 cpu, 4 gb)
```

**逐部分解释**：

- `slave-7` 是工作机器，它只汇报自己还有多少资源。
- `master` 不知道 `task-a` 做机器学习还是日志分析，它只搬运资源和启动请求。
- `spark` 接受一部分资源后，剩下资源还能继续被 Mesos 发给别的框架。

### 案例 2：框架如何表达"我不要这批资源"

```python
def on_offer(offer):
    if offer.node not in nodes_with_my_data:
        return reject(offer, timeout="5s")
    return accept(offer, task="scan-local-block")
```

**逐部分解释**：

- `nodes_with_my_data` 代表框架自己的知识：哪些机器上有本任务要读的数据。
- `reject` 不是失败，而是告诉 Mesos："这次不合适，晚点再问我。"
- `timeout="5s"` 类似 delay scheduling，短等几秒可能换来更好的数据本地性。

### 案例 3：为什么短任务更适合 Mesos

```text
mean_task_time = 30s
framework_share = 10%
expected_wait_to_get_share ~= mean_task_time * framework_share
# 大约 3s 后，新框架就能逐步拿到自己的资源份额
```

**逐部分解释**：

- Mesos 通常等任务自然结束后重新分配资源，所以任务越短，资源流动越快。
- `framework_share` 越小，第一次拿到资源可能越快，但拿满份额仍要经历多轮 offer。
- 如果集群里全是几小时长任务，Mesos 可能需要 revocation，也就是杀掉或回收任务。

## 踩过的坑

1. **以为 Mesos 会替框架做完整调度**：它只决定资源先给谁看，因为具体任务位置由 framework scheduler 决定。

2. **以为 offer 越细越一定越快**：offer 太频繁会增加通信和决策开销，原因是每次 offer 都要框架响应。

3. **忽略长任务带来的资源僵住**：细粒度共享依赖任务快速结束，长任务会让资源很久不能重新分配。

4. **把拒绝 offer 当成浪费**：拒绝有时是为了等本地数据或更合适的机器，原因是远程读数据可能比等几秒更慢。

## 适用 vs 不适用场景

**适用**：

- 同一批机器上要同时跑 Hadoop、Spark、MPI、批处理等多种框架。
- 任务多数比较短，框架能随着资源多少弹性扩缩。
- 框架自己很懂任务偏好，比如数据本地性、失败重试、慢任务处理。
- 组织希望中央资源层稳定，不想每出现一种新框架就重写整套集群系统。

**不适用**：

- 所有任务都需要一次性拿到固定资源才能开始，例如强同步的大型 MPI 作业。
- 调度必须全局最优，并且需要复杂的跨框架反亲和、抢占、装箱优化。
- 任务时间很长且不愿被回收，资源几乎不会自然流动。
- 团队没有能力维护 framework scheduler，只想把应用交给平台统一安排。

## 历史小故事（可跳过）

- **2000 年代后期**：数据中心里 Hadoop、MPI、Dryad 等框架各有一套集群，资源被静态切开，忙闲不均。
- **2010 年**：UC Berkeley 团队写出 Mesos 技术报告，核心想法是让框架通过 resource offer 共享集群。
- **2011 年**：论文发表于 NSDI，并展示 Hadoop、MPI、Torque、Spark 都能跑在 Mesos 上。
- **同一时期**：Spark 作为 Mesos 上的专用框架出现，用缓存数据反复迭代的方式加速机器学习任务。
- **后来**：Borg、Omega、Kubernetes 等系统走出不同路线，Mesos 成为理解集群调度设计取舍的参照物。

## 学到什么

- **机制和策略可以分开**：Mesos 提供资源 offer 机制，把具体任务选择策略留给框架。
- **共享不是平均切块**：真正的共享要考虑任务长短、数据位置、框架弹性和多资源公平。
- **简单中央层有代价**：master 简单带来可扩展性，但全局最优调度、跨框架约束会更难。
- **论文的工程判断很清楚**：在短任务、弹性框架、数据本地性可等待的环境里，两级调度足够好。

## 延伸阅读

- 论文页面：[Mesos: A Platform for Fine-Grained Resource Sharing in the Data Center](https://www.usenix.org/conference/nsdi11/mesos-platform-fine-grained-resource-sharing-data-center)
- 论文 PDF：[USENIX NSDI 2011 PDF](https://www.usenix.org/events/nsdi11/tech/full_papers/Hindman.pdf)
- [[mapreduce]] —— 理解 Mesos 支持的典型短任务框架。
- [[borg-omega-kube-2016]] —— 对比 Google 系调度器如何选择共享状态和单层调度。
- [[zookeeper]] —— Mesos master 高可用依赖这类选主与协调服务。

## 关联

- [[mapreduce]] —— MapReduce 的短 map/reduce task 是 Mesos 细粒度共享最合适的工作负载之一。
- [[gfs]] —— 数据本地性来自分布式文件系统，框架会为了本地数据选择或拒绝 offer。
- [[borg]] —— Borg 更像中央调度器，和 Mesos 的两级调度形成鲜明对照。
- [[borg-omega-kube-2016]] —— 这篇把 Borg、Omega、Kubernetes 串起来，适合看 Mesos 之后的路线演化。
- [[kubernetes]] —— Kubernetes 最终选择平台统一调度 pod，而不是让每个框架都拿 offer 自己挑。
- [[aurora]] —— Aurora 是 Mesos 生态里跑长服务的上层框架，说明 Mesos 不只服务批处理。
- [[zookeeper]] —— Mesos 用类似协调系统做 master 选主，保证资源层故障后能恢复。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
