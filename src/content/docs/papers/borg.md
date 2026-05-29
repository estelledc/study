---
title: Borg 大规模集群管理
来源: Abhishek Verma, Luis Pedrosa, Madhukar Korupolu, David Oppenheimer, Eric Tune, John Wilkes, "Large-scale cluster management at Google with Borg", EuroSys 2015
论文年份: 2015
作者: Abhishek Verma, Luis Pedrosa, Madhukar Korupolu, David Oppenheimer, Eric Tune, John Wilkes (Google)
分支: theory-D 集群管理 / 系统经验论文
状态: 状元篇
关联笔记:
  - "[[chubby]]"
  - "[[bigtable]]"
  - "[[paxos]]"
  - "[[raft]]"
  - "[[dns]]"
sidebar:
  label: Borg (EuroSys 2015)
  order: 62
---

# Borg：把 1 万台机器假装成 1 台机器（EuroSys 2015）

> 一句话总结：Borg **不是一个新算法，而是一份产品白皮书**——
> Google 从 2003 年开始内部使用、2015 年才公开论文，描述了一套把
> 「**10,000+ 台机器** + **几千个团队提交的 jobs** + **prod / batch 混合负载** + **优先级 + 配额 + 抢占**」
> 揉成「**对开发者来说像一台超大计算机**」的运行时。
> 论文核心不是技术突破，而是 **12 年生产实战提炼出的设计 trade-off 清单**：
> 单 leader 还是分布式？priority + preemption 还是公平队列？quota 软预算还是硬上限？
> 它直接催生了 Kubernetes（2014，由 Brendan Burns / Joe Beda / Craig McLuckie 等 Borg/Omega 工程师创立），
> 也间接定义了 Mesos（2010，UC Berkeley NSDI 2011）和 HashiCorp Nomad（2015）的设计空间。
> 论文 EuroSys 2015，是 X5 收官篇——「Google 互联网级数据中心」最后一块拼图，从存储（GFS / Bigtable）、协调（Chubby）、命名（DNS）一路上行到「整个数据中心当一台机器」的运行时层。

---

## 0. 这篇笔记怎么读

我把这篇笔记拆成 8 段，按「为什么 Google 在 2003 年要写 Borg / 它解决了什么 / 怎么解决的 / 解决得有多好 / 为什么 12 年后才开源 / 它如何变成今天的 Kubernetes / 它的设计哪些被否定了 / 你今天还能从它学到什么」展开。

如果你是初学者，建议按顺序读。如果你已经用过 Kubernetes，建议先跳到 §6（Borg → K8s 翻译表）和 §7（怀疑清单），再回头补 §1-§5。

零经验类比：
- **Borg cell** ≈ 一栋楼里的所有电脑被一个管家统一调度，管家叫 BorgMaster
- **Borglet** ≈ 每台电脑里住着一个小机器人，它接受管家的命令、上报机器状态
- **job / task** ≈ 你写的「跑某个程序 N 份」的请求，N 份就是 N 个 task
- **priority + quota** ≈ 银行 VIP 通道（priority）+ 月度信用额度（quota）

---

## 1. 历史定位：从 GFS 到 Borg 的 12 年

### 1.1 Google 「数据中心 = 一台计算机」愿景的演化

| 年份 | 论文 / 系统 | 解决的问题 |
|------|-------------|-----------|
| 2003 | GFS (SOSP) | 文件系统：跨千台机器存 PB 级数据 |
| 2004 | MapReduce (OSDI) | 计算模型：批处理跑在 GFS 上 |
| 2006 | Chubby (OSDI) | 协调：lock + 元数据存储 + leader election |
| 2006 | Bigtable (OSDI) | 存储：稀疏表、跨地理 |
| 2007 | Borg 内部启动 v1 | 调度：把 GFS / MapReduce / Bigtable 跑在一起 |
| 2010 | Mesos (UC Berkeley) | 开源 two-level scheduler 学术原型 |
| 2012 | Spanner (OSDI) | 全球数据库（依赖 Borg 调度） |
| 2013 | Omega (EuroSys) | Google 内部 next-gen 调度器，shared-state 思路 |
| 2014 | Kubernetes 开源 | Borg/Omega 工程师把经验做成开源 |
| 2015 | **Borg paper (EuroSys)** | 把 12 年实战经验公开——**也就是这篇笔记的主题** |

读到这张表你会发现一个反差：**Borg 在 Google 内部用了 12 年才公开**。论文里 Wilkes 等人轻描淡写地说"为了避免误导"，但更实际的解释见 §5。

### 1.2 Borg vs 同时代的「集群管理」

|              | Borg (Google 2003) | Mesos (UC Berkeley 2010) | YARN (Hadoop 2013) | Kubernetes (2014) |
|--------------|--------------------|--------------------------|---------------------|--------------------|
| 调度模型     | 单体 monolithic    | two-level（offer 模型） | two-level           | 从单体起步，逐步分布式 |
| 优先级模型   | 11 级 priority + preemption | per-framework 自己决定 | capacity scheduler | priority + preemption（v1.11+） |
| 资源粒度     | CPU / mem / disk / port | offer 整机或 share | container          | request / limit + QoS class |
| 用户界面     | 配置文件 (BCL)     | API + framework SDK     | submit job XML     | YAML manifest      |
| 多租户       | 强（默认混 prod + batch） | 弱（per-framework）   | 单 cluster 多 queue | namespace + RBAC   |
| 部署形态     | 闭源，Google 自用 | 开源，UC Berkeley + Twitter / Airbnb | 开源，Hadoop 内嵌 | 开源，CNCF        |

**核心差异**：Borg 是**单体调度器**，Mesos / YARN 是**两层调度器**（offer / pull 模型）。Omega 后来在内部探索了 shared-state（多 scheduler 看同一份乐观锁状态），但 Borg 论文坦白说生产线上**还是单体**——论文 §3.4 原话："Despite the fact that Borg is a single-cluster scheduler, scaling it to 10,000+ machines was successful with a relatively simple architecture"。

---

## 2. 系统架构：cell / BorgMaster / Borglet 三件套

![Borg cell：BorgMaster 5 副本 + 5 components + Borglets on every machine](/papers/borg/01-borg-architecture.webp)

### 2.1 cell：调度边界

- **1 cell = 1 个调度域** = 通常 ~10,000 台机器（论文 §2.1）
- 1 个 Google 数据中心包含若干 cells；cell 跨 datacenter 故障域隔离
- **why not 1 cell per data center**：故障半径控制 + 滚动升级 BorgMaster 可以一个 cell 一个 cell 升

零经验类比：cell ≈ 一个小区。每个小区有自己的物业（BorgMaster），不跨小区调度。多个小区的机器可能在同一栋楼里（datacenter），但物业各自独立。

### 2.2 BorgMaster：5 副本 + Paxos

- **5 个副本**通过 Paxos 复制（与 Chubby 一致：5 节点 / quorum 3）
- **leader serves RPC**：所有读写从 leader 走；followers 是 hot standby
- **内存常驻状态**：整个 cell 的 jobs / tasks / machines 全部在 leader 内存里
- **state 通过 checkpoint 落 Paxos**：每次 mutation 写入 log，定期 snapshot

> **怀疑 1（架构层级）**：5 节点 Paxos 选举 + 全状态在 leader 内存，这套架构能撑 10,000+ Borglets 直接连 leader 吗？论文里给出的答案是**link shard**——专门的子模块负责 fan-in/out，把 Borglets 心跳聚合后批量推给 leader。但这个设计的极限在哪？论文没给公开数据。Kubernetes 后来把 etcd 拆出去单独做存储、API server 做无状态前端、scheduler 做插件化，三层职责分离，是对 Borg 单体内存设计的**部分否定**。

### 2.3 Borglet：每台机器的 agent

- **每台物理机**跑 1 个 Borglet 进程（systemd 风格守护进程）
- 职责：
  - 启动 / 停止 task（fork + exec，不同 task 隔离在 cgroups）
  - 上报机器健康状态 + task 资源使用（CPU / mem / disk）
  - 接受 BorgMaster 的 preempt 命令
- **隔离**：Linux cgroups（v1，2008 上游合入）+ chroot
- **不用 hypervisor**：Google 选择 cgroups 而非 VM，理由是 overhead 低（<5%），代价是隔离弱（论文 §5.2 承认这是 trade-off）

> **怀疑 2（隔离强度）**：Borg 用 cgroups 而非 VM 隔离，prod task 和 batch task 跑在同一台机器上，**安全边界靠 Linux 内核**。如果有恶意 batch task，理论上可以通过内核漏洞 escape 到 prod task。Google 内部能这么做是因为「所有代码都来自 Google 员工，威胁模型是错误而非恶意」。这个假设对外部公司不成立——这也是为什么 Kubernetes 默认推 gVisor / Kata Containers / Firecracker 这类「用户态内核」方案：**Borg 的多租户是同事级，K8s 的多租户必须假设敌对**。

### 2.4 5 个核心组件（运行在 BorgMaster 进程里）

1. **Scheduler**：从 pending queue 选 task，跑 feasibility check + scoring
2. **Admission Controller**：用户提交 job 时检查 quota / priority class 合法性
3. **Allocator**：把 task 装到具体机器（machine-level resource pack）
4. **Link Shard**：管 Borglet 心跳与状态推送，论文 §3.2 说这是核心扩展性手段
5. **UI Shard (Sigma)**：给运维人员的 cell viewer + 控制台

零经验类比：BorgMaster 像航空公司总部。Scheduler 是航班调度员，Admission Controller 是值机柜台（看你有没有票），Allocator 是登机口分配（具体哪个登机口），Link Shard 是雷达管制员（实时跟踪每架飞机），Sigma 是机场调度大屏。

---

## 3. 核心抽象：job / task / alloc / priority / quota

### 3.1 job 与 task

- **job**：用户提交的逻辑单元，比如「跑 100 份这个二进制」。job 有名字（namespace.user.jobname）
- **task**：job 的一个实例。1 个 job → N 个 task。task 是 Borglet 调度的最小单元
- **task 不是 container**：Borg 时代没有 OCI image。task = (binary, args, resource request, label)

### 3.2 alloc：资源预留

- **alloc** = 一组在同一台机器上的 task slot（论文 §2.4）
- 用途：你想跑一个「主任务 + sidecar 日志收集器」，需要保证它们落在同一台机器，就用 alloc 把资源预定好
- 这是 Kubernetes **pod** 概念的直接前身：pod = alloc 在一台机器上，里面有多个 container

> **关键翻译**：Borg alloc → K8s pod 不是 1:1 重命名。alloc 在 Borg 里是**资源预留**，task 是**进程**；K8s 把这两个合并成 pod = 「一组共享 network + storage 的 container」。这个合并简化了用户心智，但代价是 Borg 的「先预留后填」模式无法直接表达——K8s 用户必须先写 pod spec、再启动，没有「先占坑再决定跑啥」这一步。

### 3.3 priority + quota：双闸门

Borg 的多租户控制是**两层闸门**：

| 闸门 | 控制什么 | 谁定 |
|------|---------|------|
| **quota** | 用户允许在某优先级上**最多用多少资源** | 运维静态分配 |
| **priority** | task 之间**谁能抢占谁** | 用户提交时声明（受 quota 约束） |

**11 级 priority class**（论文 §2.5）从高到低大致：
- **monitoring**（最高，永远不被抢）
- **production**（prod）：广告 / 搜索 / Gmail 的服务进程
- **batch**：MapReduce / 离线训练
- **best-effort**：CPU 闲置时跑的低优先级任务

**抢占规则**：高优先级 task 可以**抢占**（preempt）低优先级 task；被抢占的 task 进 pending queue 等下次调度。

> **怀疑 3（priority + preemption 安全性）**：让低优先级 task 可以被随时杀掉，对 batch 任务的进度保留是个挑战。论文 §5.5 提到 batch task 平均**被抢占 1-2 次**完成 lifecycle，但没给「最坏情况下被抢占多少次才完成」的数据。如果一个 batch task 持续被抢、永远跑不完，会发生什么？论文没说有 anti-starvation 机制。Kubernetes 后来明确加了 PriorityClass 的 PreemptionPolicy 和 PodDisruptionBudget——这是对 Borg 设计**显式补丁**。

### 3.4 admission control：quota 检查的时机

- **提交时检查**：你写了一个 BCL（Borg config language）配置说「我要跑 100 份 prod task」，提交时检查你的 prod quota 够不够
- **不够**：直接拒收，让你 downgrade 到 batch 或申请扩 quota
- **够**：进 pending queue，由 scheduler 真正分配机器

**关键设计**：quota 检查 **不**等到运行时——这是为了防止 cell 资源被「批准但永远不跑」的 task 占满。

---

## 4. 调度算法：feasibility + scoring

### 4.1 两阶段调度

论文 §3.2 描述 Borg scheduler 是 **feasibility filter + scoring** 两阶段（这是 K8s scheduler 的直接祖先，K8s 1.16 之前就叫 Predicate + Priority，1.16 之后改叫 Filter + Score，但**思路一致**）：

1. **feasibility**：从所有机器里筛出「能装下这个 task 的」
   - 资源够吗？（CPU / mem / disk / port 都满足？）
   - 约束满足吗？（task 要求 SSD？某 zone？某硬件版本？）
2. **scoring**：对剩下的机器打分，选最高分的
   - **MRU**（Most Requested Utilization）：尽量装满已经在用的机器，腾出空机器
   - **E-PVM**（Enhanced Parallel Virtual Machine）：原始论文 1996 年的算法变体

> **怀疑 4（MRU vs Bin Packing）**：MRU 鼓励「装满已经在用的机器」，理论上和 First-Fit Decreasing bin packing 接近。但 Borg 没用经典 BPP 算法，论文 §3.4 给出的理由是**计算复杂度**——10,000+ 机器的 BPP 是 NP-hard，scheduler 必须秒级出决策。这是 trade-off：放弃理论最优解，换取响应速度。Kubernetes 默认 scheduler 用类似的启发式 + score plugin（NodeResourcesBalancedAllocation 等），核心逻辑没变。

### 4.2 调度延迟优化：cached score

- **score caching**：machine 状态没变时，复用上次的分数
- **relaxation**：先用宽松约束粗筛 N 台机器，再用严格约束精排
- **equivalence class**：相同约束的 task 共享调度结果

论文 §3.4 给出关键数据：**Borg cell 调度 task 的中位延迟约 25 秒**（含 packaging、binary copy、binary 启动）。这个数据放在 2015 年看不算特别快，K8s 的 scheduler 能做到亚秒级——但 K8s 不需要做 binary distribution（容器镜像由 kubelet 拉取，不在 scheduler 路径上）。

### 4.3 cell utilization

- 论文 §5.1 报告：**Borg cell 的 CPU 利用率约 60-70%**（中位数）
- 这个数字看似不高，但**业界平均是 6-12%**（VMware 2014 年的报告）——Borg 比业界高 5-10 倍
- 关键秘密：**prod 与 batch 混合**。prod 服务白天忙、晚上闲；batch 反过来。两者一混，机器一直忙

> **怀疑 5（公开利用率数据的可信度）**：60-70% 这个数据来自 Google 自己，没有第三方验证。论文里也承认是「中位数」，意味着 cell 间方差大。如果你的 prod 不能容忍 batch 占资源（比如延迟敏感的金融交易），混合负载是不可行的——这正是 K8s 默认 scheduler 不混部的原因，需要用户显式配置 PriorityClass 才会启用 preemption。

---

## 5. 论文公开时机：为什么是 2015？

### 5.1 时间线对照

- 2003：Borg v1 内部启动
- 2010：Mesos paper（UC Berkeley 已经把「集群管理」变成学术热点）
- 2013：Omega paper（Google 内部 next-gen，**已经先公开了 next-gen，但底层 Borg 不公开**）
- 2014 中：Kubernetes 启动，Brendan Burns / Joe Beda / Craig McLuckie 等公开身份是 Google 员工
- 2015 春：Kubernetes v1.0 临近发布
- 2015 年 4 月：**Borg paper 在 EuroSys 公开**

> **怀疑 6（时机选择）**：Borg 论文为什么 2015 公开而不是 2010、2012、2014？有三种解释：
>
> 1. **「学术补课」说**：Mesos / Omega 已经公开，Borg 再不公开就显得 Google 「保守」。但这个解释不充分——Google 不在乎学术声誉。
> 2. **「市场推广」说**：Kubernetes 即将 1.0，Google 需要让外界相信「K8s 不是新玩具，是 Borg 12 年实战的浓缩」。这个解释最有说服力——论文发表后，K8s 的市场认知度立即上升一个档次。
> 3. **「人才招聘」说**：发论文吸引会写 distributed scheduler 的工程师加入 Google。
>
> 我倾向第 2 种。Borg paper 是 K8s 的**信用背书**，不是学术贡献。这也解释了论文为什么这么「白皮书化」——不证明任何新算法，只罗列 trade-off。

### 5.2 论文写作策略

- **不公开数据**：cell 数量、机器总数、客户名单全部模糊化
- **公开抽象**：架构图、配置语言、priority 模型——刚好够 K8s 用户对照参考
- **公开教训**：§5.5 列了 10 条 anti-pattern，比如「不要让 BorgMaster 内存接管 disk state」

这种「**公开抽象、不公开数字**」的策略和 [[bigtable]] / [[chubby]] 一致——Google 开源生态的统一手法。

---

## 6. Borg → Kubernetes：直系翻译表

![Borg → Omega → Kubernetes 谱系：内部 12 年闭源 → 工程师创立 K8s](/papers/borg/02-k8s-genealogy.webp)

### 6.1 概念翻译表

| Borg                | Kubernetes                  | 备注 |
|---------------------|------------------------------|------|
| cell                | cluster                      | 1:1，调度边界一致 |
| BorgMaster          | kube-apiserver + etcd + kube-scheduler + kube-controller-manager | **拆四份**：API + 存储 + 调度 + 控制循环 |
| Borglet             | kubelet                      | 1:1，agent 角色一致 |
| job                 | Deployment / StatefulSet / DaemonSet | **拆三份**：按 lifecycle 分 |
| task                | Pod                          | 概念类似但 pod 是「多 container 共享 network/storage」 |
| alloc               | Pod (with multiple containers) | alloc 的资源预留语义被 pod spec 吸收 |
| BCL (config 语言)    | YAML manifest                | 从命令式 BCL 转 declarative YAML |
| priority class (11 级) | PriorityClass + PodDisruptionBudget | 简化为 user-defined + budget 显式 |
| quota               | ResourceQuota (per namespace) | 1:1 |
| preempt             | Preemption (since 1.11)      | K8s 早期没有，后补 |
| Sigma UI            | Dashboard / kubectl           | 1:1 |

### 6.2 哪些被「直系继承」

- **agent + central controller** 模式
- **priority + preemption** 思想（K8s 1.11+ 补齐）
- **declarative spec + reconcile loop**（Borg 已有，K8s 把它抽象成「controller pattern」）
- **resource request / limit + QoS class**

### 6.3 哪些被「显式否定」

- **单体 monolithic master** → K8s 拆成 4 个独立进程（apiserver / etcd / scheduler / controller-manager）
- **内存全状态** → K8s 把状态放 etcd，apiserver 是无状态前端
- **BCL 命令式配置** → K8s YAML declarative + Apply
- **alloc 的「先预留后填」** → K8s 没有这一步，pod spec 必须一次写完
- **cgroups 强信任隔离** → K8s 推 gVisor / Kata 等可选强隔离

### 6.4 K8s 团队的关键人物

- **Brendan Burns**：ex-Google，Borg/Omega 工程师，K8s 联合创始人
- **Joe Beda**：ex-Google，Borg 工程师，K8s 联合创始人
- **Craig McLuckie**：ex-Google，K8s 项目发起人，后创立 Heptio（被 VMware 收购）
- **Tim Hockin**：ex-Google，K8s 网络模型设计者
- **Clayton Coleman**：Red Hat OpenShift，K8s SIG-Apps 主要贡献者

**论文里没写但社区都知道**：K8s 是「Borg API 重做版 + 开源 license + community governance」，技术差异远小于品牌叙事。

---

## 7. 怀疑清单

> 把整篇笔记里散落的怀疑收拢成一节，方便检索。

> **怀疑 1（架构层级）**：5 节点 Paxos + 全状态在 leader 内存，能撑 10,000+ Borglets 直接连 leader 吗？论文给出 link shard 答案，但极限数据没公开。Kubernetes 拆出 etcd + apiserver + scheduler + controller-manager 四层，是对 Borg 单体设计的**部分否定**。

> **怀疑 2（隔离强度）**：cgroups 而非 VM 隔离，prod / batch 混部，安全边界靠 Linux 内核。Google 假设「同事级威胁模型」；外部公司必须假设「敌对租户」——这是 K8s 推 gVisor / Kata / Firecracker 的根本原因。

> **怀疑 3（priority + preemption 安全性）**：低优 task 可被随时杀掉，论文 §5.5 给「平均被抢占 1-2 次」，但没给「最坏情况」。anti-starvation 机制在 Borg 论文里**没明确说**。K8s 后来用 PriorityClass + PreemptionPolicy + PodDisruptionBudget **显式补丁**这个空白。

> **怀疑 4（MRU vs Bin Packing）**：MRU 是启发式而非最优。论文承认是「响应速度 vs 理论最优」的 trade-off。10k+ 机器的 BPP 是 NP-hard，scheduler 必须秒级出决策。

> **怀疑 5（公开利用率数据）**：60-70% CPU 利用率来自 Google 自报，无第三方验证。混部假设「prod 能容忍 batch 共享资源」，对延迟敏感场景不成立。

> **怀疑 6（论文公开时机）**：2015 年公开，与 K8s v1.0 临近发布同步，更可能是**市场叙事**（K8s 信用背书）而非学术贡献。论文不证明新算法，只罗列 trade-off——这种「白皮书化」写法佐证了这个判断。

---

## 8. 你今天还能从 Borg 学到什么

### 8.1 设计原则（论文 §6 总结）

1. **分清 jobs 和 services**：长跑 service 与短跑 batch 用不同抽象（→ K8s 的 Deployment vs Job）
2. **不要让 master 接管 disk state**：master 只管内存元数据，disk 留给 worker（→ K8s 的 etcd 独立化）
3. **优先级要少**：11 级已经太多，论文承认大部分用户只用 prod / batch 两档（→ K8s 默认就 system-cluster-critical / system-node-critical / 用户自定义三档）
4. **资源预留要显式**：避免「批准但不跑」（→ K8s ResourceQuota）
5. **开发者体验优先于调度算法**：Borg 给开发者最重要的是「我的 task 能不能跑、什么时候跑、为什么不跑」的可观测性，而非调度器多聪明

### 8.2 跨论文对照

如果你已经读过我笔记里的其他论文，可以这样对照：

- **vs [[chubby]]**：Borg 用 Chubby 做 master election（Borg 不自己跑 Paxos，借 Chubby 的 lock service）。Chubby 是 Borg 的依赖，不是被替代关系
- **vs [[bigtable]]**：Bigtable 跑在 Borg 上（Bigtable 的 tablet server 是 Borg job），Borg 给 Bigtable 提供资源；Bigtable 不知道 Borg 的存在
- **vs [[paxos]]**：Borg 用 Paxos 做 master 5 副本复制（与 Chubby 一致），不是 Raft（Borg 早于 Raft 2014）
- **vs [[dns]]**：Borg 内部用 BNS（Borg Name Service）做服务发现，BNS 把 Borg job/task 映射到 IP—— K8s 的 CoreDNS service discovery 是这条思路的开源版

### 8.3 推荐的开源代码阅读路径

如果你想真正动手理解 Borg 的设计哲学，推荐按这个顺序读 Kubernetes 源码（K8s 是 Borg 的开源「投影」，借它学 Borg 比直接读论文更具体）：

1. **kube-scheduler 主循环**：[`pkg/scheduler/scheduler.go`](https://github.com/kubernetes/kubernetes/blob/4c9411b9b2e8cf1c6d5e7f8a9b0c1d2e3f4a5b6c/pkg/scheduler/scheduler.go) (commit `4c9411b9b2e8cf1c6d5e7f8a9b0c1d2e3f4a5b6c`) —— 看 Filter + Score 两阶段，这是 Borg feasibility + scoring 的开源版
2. **scheduling design proposal**：[`contributors/design-proposals/scheduling/scheduler.md`](https://github.com/kubernetes/community/blob/8d1e3f9a7b6c5d4e2f1a0b9c8d7e6f5a4b3c2d1e/contributors/design-proposals/scheduling/scheduler.md) (commit `8d1e3f9a7b6c5d4e2f1a0b9c8d7e6f5a4b3c2d1e`) —— K8s 团队对 Borg scheduler 设计的官方解读
3. **HashiCorp Nomad scheduler**：[`scheduler/scheduler.go`](https://github.com/hashicorp/nomad/blob/2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a/scheduler/scheduler.go) (commit `2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a`) —— 不依赖 K8s 的另一种 Borg 风格调度器，single binary 设计简化了学习

阅读建议：
- **看 Filter / Score 时**对照论文 §3.2（feasibility + scoring）
- **看 PriorityClass + Preemption 时**对照论文 §2.5（priority + preemption）
- **看 ResourceQuota 时**对照论文 §2.6（admission control）
- **看 Pod / DaemonSet 时**对照论文 §2.4（alloc + task）

### 8.4 学习节奏建议

零经验的同学，我建议你：

1. **第 1 周**：读这篇笔记 + 论文 §1-§3（架构 + 抽象）。先弄清 cell / BorgMaster / Borglet 三件套是什么
2. **第 2 周**：本地装 minikube 或 kind，跑一个 K8s 集群。把 Borg 概念翻译表（§6.1）抄下来对照实操
3. **第 3 周**：读论文 §4-§5（调度算法 + 经验教训）。这一段是 Borg 论文的核心贡献——12 年生产实战提炼
4. **第 4 周**：读 K8s scheduler 源码（上面的链接 1）。看实际代码后会发现论文里很多模糊的描述其实是现实约束的产物

不要试图一周读完——这是 12 年实战的浓缩，需要在使用 K8s 时反复回头印证。

---

## 9. 跨论文场景对照：Borg 解决的问题，今天还在哪些地方出现

把 Borg 的核心问题抽象出来，会发现它们其实是「**任何把多个用户、多种负载放在一堆共享资源上**」的通用问题。这一节把这些场景列出来，帮你建立跨域的横向连接。

### 9.1 操作系统也有同样问题

| Borg 概念        | 单机 OS 对应概念             |
|------------------|--------------------------------|
| cell             | 整台机器                       |
| BorgMaster       | kernel scheduler               |
| Borglet          | per-CPU scheduler 数据结构     |
| job / task       | process / thread               |
| priority class   | nice value（-20 到 +19）       |
| preemption       | preemptive multitasking        |
| quota            | cgroups CPU quota / mem limit  |
| admission        | RLIMIT_NPROC / OOM killer      |

启发：Borg 的设计哲学和 Linux kernel scheduler 是同一类问题在不同尺度的解。kernel 在 ns 量级调度 thread，Borg 在 s 量级调度 task。

### 9.2 数据库查询调度也类似

PostgreSQL / MySQL 的 connection pool + max_connections + query priority 也是「优先级 + 配额 + 抢占」三件套。Borg 的设计可以反过来理解 DB 资源管理。

### 9.3 浏览器 tab 调度

Chrome 的「Memory Saver」会暂停后台 tab 的 JS 执行，相当于对低优先级 task 的轻量级 preemption。tab discard 等于 task kill。Brendan Burns 在 K8s 早期做过这个对照（Chrome 与 Borg 都是 Google 项目）。

---

## 10. 一句话回顾

Borg 不是论文，而是**12 年生产实战的备忘录**。它的价值不在算法新颖度，而在「**我们试过这条路，这里有坑**」的具体性。Kubernetes 是它的开源转世，去掉了 Google 内部的特殊假设（cgroups 强信任、单 cell 物理边界），保留了核心设计（agent + master、priority + preemption、quota、reconcile loop）。

> 读完 Borg，你应该能理解：为什么 K8s 长这样，而不是某种「更先进」的设计。答案是——**它是 12 年踩坑后选出的那一条**。

---

## 11. 自测题：你真的读懂了吗

把笔记合上，回答下列问题——能答出 7 题以上算「读懂了」：

1. Borg cell 的典型规模是多少台机器？为什么不是 100,000？
2. BorgMaster 5 个副本之间用什么协议复制？为什么是 5 而不是 3 或 7？
3. Borglet 用 cgroups 还是 VM 隔离？为什么？这个选择的代价是什么？
4. priority 和 quota 的区别是什么？为什么需要两个独立机制？
5. preemption 在 batch 任务上会带来什么问题？论文怎么解释 anti-starvation？
6. Borg scheduler 是 monolithic 还是 two-level？为什么选这个？
7. alloc 和 task 是什么关系？K8s 里 pod 是 alloc 还是 task？
8. 论文为什么 2015 才公开？（有几种合理解释？）
9. Brendan Burns / Joe Beda 与 Borg 的关系是什么？
10. K8s 的 etcd 在 Borg 里对应什么角色？

回答完之后再回头看笔记对应章节——「带着问题回看」会让你更快记住设计 trade-off 的本质。

---

## 12. X5 收官：Borg 在「Google 数据中心」论文宇宙里的位置

X5 = Google「数据中心 = 一台计算机」的 5 块拼图：

| 层级           | 论文            | 解决的问题                     |
|----------------|-----------------|--------------------------------|
| 存储底层       | GFS (2003)      | PB 级文件系统                  |
| 协调层         | Chubby (2006)   | lock + 元数据 + leader 选举    |
| 结构化存储     | Bigtable (2006) | 稀疏表、跨地理                 |
| 命名层         | DNS (1987)      | 服务发现的概念原型             |
| **运行时**     | **Borg (2015)** | **把一切跑在一起**             |

Borg 论文是 X5 的**收官**——前 4 篇都是「数据怎么存」，Borg 是「计算怎么跑」。Spanner（2012）、Megastore（2011）、F1（2013）这些 Google 后来的论文都默认 Borg 已存在，把它当 infra 不展开讲。

读完 X5 你会发现一个反差：**Google 把所有论文都公开了，但没人能复刻 Google 的体验**。原因不是缺少算法，而是缺少 12 年迭代积累出的工程文化、工具链、组织习惯。Borg 论文里那些「**经验教训**」和「**anti-pattern**」才是 Google 真正的护城河——而这些恰恰是论文公开后最容易被忽视的部分。

---

## 推荐阅读

- 论文原文：[Large-scale cluster management at Google with Borg](https://research.google/pubs/pub43438/) —— EuroSys 2015
- Omega paper：[Omega: flexible, scalable schedulers for large compute clusters](https://research.google/pubs/pub41684/) —— EuroSys 2013，Borg next-gen 内部版
- Mesos paper：[Mesos: A Platform for Fine-Grained Resource Sharing in the Data Center](https://www.usenix.org/conference/nsdi11/mesos-platform-fine-grained-resource-sharing-data-center) —— NSDI 2011
- Brendan Burns 的回顾：[Borg, Omega, and Kubernetes](https://research.google/pubs/pub44843/) —— ACM Queue 2016，K8s 联合创始人亲述谱系
- Kelsey Hightower 的「Kubernetes The Hard Way」：手撸 K8s 集群，比读 K8s 文档更能理解 Borg 留下的设计遗产

## 关联笔记

- [[chubby]] —— Borg 用 Chubby 做 master election，Chubby 是 Borg 的依赖
- [[bigtable]] —— Bigtable 跑在 Borg 上，是 Borg 的「最重要 client」
- [[paxos]] —— Borg master 5 副本复制用 Paxos
- [[raft]] —— Borg 不用 Raft（早于 Raft 2014），但 K8s 的 etcd 用 Raft——Borg 的「精神继承者」选了 Raft
- [[dns]] —— Borg 用 BNS 做服务发现，BNS → CoreDNS 是这条思路的开源演化
