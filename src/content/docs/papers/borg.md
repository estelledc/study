---
title: Borg — Google 把一万台机器假装成一台
来源: 'Verma et al., "Large-scale cluster management at Google with Borg", EuroSys 2015'
日期: 2026-05-30
子分类: 分布式系统
分类: 分布式系统
难度: 中级
provenance: pipeline-v3
---

## 是什么

Borg 是 **Google 内部用了 12 年才公开论文的集群管理系统**，它把一万台机器组织成一个调度域，让开发者交一份配置就能"在不知道哪台机器上"跑起 100 份服务。

日常类比：像航空公司总部。你买票（提交 job），值机柜台看你够不够格（quota 检查），调度员排登机口（feasibility 过滤），雷达管制员实时盯每架飞机的位置（Borglet 心跳上报）。乘客（开发者）不需要知道飞机停在哪个机库——你只关心航班准点。

```
你提交：跑 100 份 search 服务，每份 4 CPU 8 GB
Borg 决定：machine-17 跑 23 份、machine-42 跑 31 份、machine-88 跑 46 份
你看到的：100 份都在跑，访问 /search 永远有人接
```

Borg 不是一个新算法，是一份**12 年实战的备忘录**——单 leader 还是分布式？priority 加抢占还是公平队列？quota 软预算还是硬上限？每条都有踩过的坑。这份备忘录直接催生了 Kubernetes（2014 由 Borg/Omega 老兵创立），也间接定义了 Mesos / Nomad 的设计空间。

## 为什么重要

不理解 Borg，下面这些事都解释不了：

- 为什么 Kubernetes 长这样——它就是 Borg 工程师 2014 年开源的"重做版"
- 为什么 Google 数据中心 CPU 利用率 60-70%，业界平均却只有 6-12%
- 为什么 prod 服务和 batch 任务可以混跑在同一台机器，又不互相干扰
- 为什么 12 年的内部系统公开论文，反而不证明任何算法、只罗列 trade-off

## 核心要点

Borg 的核心抽象可以拆成 **三层**：

1. **cell + BorgMaster + Borglet 三件套**：cell 是调度边界（约 1 万台机器），BorgMaster 是总管家（5 副本 Paxos 复制，内存常驻全状态，靠 link shard 子模块聚合 Borglet 心跳），Borglet 是每台机器上的小机器人，启停 task、上报健康、接收抢占命令。类比：一栋楼的物业（BorgMaster）+ 每个单元的门禁机（Borglet）。

2. **priority + quota 双闸门**：quota 是"你最多能用多少"（运维静态分配，提交时检查不到运行时），priority 是"谁能抢谁"（用户提交时声明，受 quota 约束）。11 级 priority 从 monitoring（永不被抢）到 prod、batch、best-effort，高优可以抢占低优。类比：银行 VIP 通道（priority）+ 月度额度（quota）。

3. **feasibility + scoring 两阶段调度**：scheduler 先过滤"能装下这个 task 的机器"（CPU / mem / disk / port + 约束如 SSD 或 zone），再对剩下的打分选最高分。装箱启发式叫 MRU（Most Requested Utilization）——尽量装满已经在用的机器，腾出空机器留给大 job。类比：搬家时先挑容量够的箱子，再挑最不空的那个塞进去。

## 实践案例

### 案例 1：提交一个 prod 服务

你写一份 BCL 配置（Borg config language，命令式）：

```
job search_frontend {
  task_count = 100
  priority = production
  resources = { cpu = 4, mem = 8GB }
  binary = "/path/to/search_server"
}
```

Borg 收到后做四步：admission controller 查你 prod quota 够不够 → scheduler 过滤可装下的机器 → scoring 选最高分 → Borglet 拉 binary 启动。整个过程你不知道也不需要知道具体哪台机器。

### 案例 2：batch 被 preempt 让位 prod

晚上 11 点，一个 MapReduce batch 任务在 machine-23 跑得正欢。突然有 prod 服务流量高峰，scheduler 发现机器不够：

```
prod search_frontend 缺 8 CPU
machine-23: 当前装着 batch task（占 8 CPU）
→ 抢占 batch task（kill），让 prod 装进来
→ batch task 进 pending queue 等下次调度
```

batch 平均被抢占 1-2 次完成 lifecycle。论文坦白：anti-starvation 没明确机制，是个公开漏洞。

### 案例 3：alloc 预留同机跑 sidecar

你的服务需要"主进程 + 日志收集 sidecar"必须同机：

```
alloc { cpu = 8, mem = 16GB }
  task main_server { cpu = 6, mem = 12GB }
  task log_shipper { cpu = 2, mem = 4GB }
```

alloc 是"先预留资源、再决定填什么 task"的两步抽象——你先占好一块同机资源，然后往里塞 task。Kubernetes 的 pod 就是 alloc 的简化继承：把"预留"和"填"合并成一步，pod spec 必须一次写完，没法表达"先占坑再决定跑啥"——简化了用户心智，代价是丢了一种灵活性。

## 踩过的坑

1. **cgroups 不是安全沙箱**：prod 和 batch 跑同机，安全边界靠 Linux 内核。Google 假设"同事级威胁模型"，外部公司必须假设"敌对租户"——这是 K8s 推 gVisor / Kata 强隔离的根本原因。

2. **leader 内存全状态扩展有极限**：BorgMaster 把整个 cell 状态放内存，论文没给极限数据；K8s 拆成 etcd 存储 + apiserver 前端 + scheduler 调度三层，是对单体设计的部分否定。

3. **preemption 缺 anti-starvation**：低优任务可能被反复抢；论文只给"平均被抢 1-2 次"。K8s 后来用 PriorityClass + PodDisruptionBudget 显式补丁这个空白。

4. **11 级 priority 太多**：论文承认大部分用户只用 prod / batch 两档；过多优先级增加心智负担。K8s 默认只有 system-cluster-critical / system-node-critical / 用户自定义三档。

## 适用 vs 不适用场景

**适用**：

- 单一组织内部、信任成员的多租户混部（Google 内网、企业自有数据中心）
- 服务 + 批处理混合负载，希望提高资源利用率
- 千台到万台规模，需要统一调度边界
- 接受"不可解释的调度决策"换取响应速度

**不适用**：

- 敌对多租户（公有云）→ 用 [[kubernetes]] + gVisor / Firecracker 强隔离
- 跨数据中心调度 → cell 是单数据中心边界，跨域要靠上层
- 要严格 SLA 的延迟敏感场景（金融交易）→ 不能容忍 batch 抢占
- 100 台以下小规模 → BorgMaster 5 副本 Paxos 是过度复杂

## 历史小故事（可跳过）

- **2003 年**：Google 启动 Borg v1，是 GFS / MapReduce / Bigtable 等系统的运行时底座
- **2010 年**：UC Berkeley 发表 Mesos 论文，把"集群管理"变成学术热点
- **2013 年**：Google 公开 Omega 论文（next-gen 调度器，shared-state 思路），但底层 Borg 仍然不公开
- **2014 年**：Brendan Burns / Joe Beda / Craig McLuckie 启动 Kubernetes，公开身份是 ex-Google 工程师
- **2015 年 4 月**：Kubernetes v1.0 临近发布，Borg 论文同期 EuroSys 公开——时机被广泛解读为 K8s 的"信用背书"
- **2016 年起**：CNCF 把 Kubernetes 收为旗舰项目，Borg 的 12 年血泪正式变成开源世界的事实标准

12 年内部用、12 年不公开，公开时点又卡在 K8s v1.0 前——这种"白皮书化"写法不证明算法、只罗列 trade-off，更像市场叙事而非学术贡献。

## 学到什么

1. **trade-off 比算法更重要**：Borg 没有发明任何新算法，但它把 12 年踩坑提炼成"我们试过这条路、这里有坑"的具体清单——这种"白皮书"才是真护城河
2. **agent + central controller 是云原生原型**：BorgMaster + Borglet 这一对结构，被 K8s（apiserver + kubelet）、Mesos、Nomad 全部继承
3. **混部是利用率的关键**：prod 白天忙、batch 晚上忙，两者一混 cell 利用率从 6-12% 提到 60-70%
4. **公开"抽象"不公开"数据"**：Google 系论文统一手法，让外人能学结构、不能复刻规模

## 延伸阅读

- 论文原文：[Large-scale cluster management at Google with Borg](https://research.google/pubs/pub43438/) —— EuroSys 2015
- Brendan Burns 回顾：[Borg, Omega, and Kubernetes](https://research.google/pubs/pub44843/) —— ACM Queue 2016，K8s 联合创始人亲述谱系
- Omega 论文：[Omega: flexible, scalable schedulers for large compute clusters](https://research.google/pubs/pub41684/) —— EuroSys 2013，Borg 的内部 next-gen
- Mesos 论文：[Mesos: A Platform for Fine-Grained Resource Sharing](https://www.usenix.org/conference/nsdi11/mesos-platform-fine-grained-resource-sharing-data-center) —— NSDI 2011
- [[kubernetes]] —— Borg 的开源转世
- [[chubby]] —— Borg 用 Chubby 做 master election

## 关联

- [[chubby]] —— Borg 用 Chubby 做 master election，Chubby 是 Borg 的依赖
- [[bigtable]] —— Bigtable 跑在 Borg 上，是 Borg 最重要的 client
- [[paxos]] —— BorgMaster 5 副本复制用 Paxos
- [[raft]] —— Borg 早于 Raft（2014），但 K8s etcd 用 Raft——精神继承者换了协议
- [[gfs]] —— Borg 调度的 task 大量读写 GFS
- [[mapreduce]] —— 典型的 batch 负载，是 Borg preempt 的常见受害者
- [[spanner]] —— 全球数据库，跑在 Borg 上、把 Borg 当 infra 不展开讲
- [[kubernetes]] —— Borg 的开源转世，拆 BorgMaster 为四份独立进程

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bonawitz-fl-system-2019]] —— Bonawitz FL System 2019 — Google 工业级联邦学习系统设计
- [[borg-omega-kube-2016]] —— Borg / Omega / Kubernetes — Google 调度器三代同源
- [[chubby]] —— Chubby — 给凡人用的分布式锁服务
- [[dapper-2010]] —— Dapper — Google 大规模分布式系统链路追踪基础设施
- [[gfs]] —— GFS — 编译器决定不做哪些事
- [[ix-2014]] —— IX — 把网络栈装进受保护的数据面 OS
- [[kubernetes]] —— Kubernetes — 容器编排平台
- [[kubernetes-2016]] —— Kubernetes — 为什么选声明式 API 加协调环
- [[mapreduce]] —— MapReduce — 用户只写两个函数，框架替你扛千节点
- [[mesos-2011]] —— Mesos 2011 — 把数据中心切成资源 offer 发给框架自己挑
- [[omega-2013]] —— Omega 2013 — 让多个调度器同时改一份 cluster 状态
- [[paxos]] —— Paxos — 分布式共识算法
- [[quincy-2009]] —— Quincy — 把"派活给机器"变成一道最小费用流题
- [[raft]] —— Raft — 易理解的共识算法
- [[soltesz-2007]] —— Soltesz 2007 — 容器：比虚拟机轻一档的隔离方案
- [[spanner]] —— Spanner — 全球分布式 SQL 数据库
- [[sparrow-2013]] —— Sparrow — 让毫秒级任务也能被精准调度的去中心化调度器

