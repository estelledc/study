---
title: Twine — Facebook 把整个数据中心当一台机器调度
来源: 'Tang et al., "Twine: A Unified Cluster Management System for Shared Infrastructure", OSDI 2020'
日期: 2026-06-01
子分类: 内核与虚拟化
分类: 操作系统
难度: 中级
provenance: pipeline-v3
---

## 是什么

Twine 是 Facebook（现 Meta）2020 年公开的**集群管理系统**，管着公司内部超过 100 万台机器。它的目标只有一句：**把分布在十几个数据中心的所有机器，当成一台超大计算机来调度**。

日常类比：把整个公司的会议室连成一个共享池，员工不再说 `我要 3 楼的 207 室`，只说 `我下午 2 点要一间能坐 10 人的房间，哪个楼都行`，由总调度系统自动分配。Twine 干的就是这件事——只是房间换成了 CPU、内存、GPU。

## 为什么重要

不理解 Twine，下面这些事会想不通：

- 为什么 Facebook、Google 都不用 Kubernetes（K8s）——他们自己造，K8s 是给外部的简化版
- 为什么 K8s 一个集群官方上限是 5000 节点，Twine 却能调度 10 万+ 台
- 为什么 `把 K8s 集群继续做大` 这条路在某个规模会撞墙，需要换思路
- 为什么数据中心调度论文 2020 年还在产生新结构，没有 `终极答案`

K8s/Borg 是教科书答案，Twine 是 `超大规模下教科书怎么演化` 的真实样本。

## 核心要点

Twine 和 Borg/K8s 拉开差距的设计有 **5 个**：

1. **Entitlement（配额承诺）**：应用拿到的不是 `某个集群里的 100 个 pod`，而是 `跨地域的资源承诺`——比如 `亚洲区 5000 vCPU、欧洲区 3000 vCPU`。具体放哪台机器，调度器随后再算。

2. **Host Profile（宿主机定制）**：应用能声明 `我要 5.10 内核、HugePages 开 2GB、sysctl 这几项改成 X`，Twine 会**把宿主机重装/重配**成这个样子再交付。K8s 的 DaemonSet 改不动这一层。

3. **TaskControl 双向协商**：要重启/迁移容器前，调度器先**问应用** `现在能动你吗`。应用可以拒绝、可以延后、可以串行化。K8s 的 preStop 只是单向通知。

4. **Power Capping（功耗调度）**：数据中心总功耗有上限，Twine 把功率当一种资源调度——和 CPU、内存平级。Borg 2015 论文没强调这点，5 年后这件事变成了首要目标。

5. **单插槽小机器**：Facebook 选 single-socket（单 CPU 插槽）的小机器，故障域小、调度粒度细、功耗好管。这是和 Borg `dual-socket 大机器` 哲学差异最大的一处硬件选型。

## 实践案例

### 案例 1：entitlement 怎么发挥作用

传统做法（K8s）：

```
应用方: 我要在 us-east 集群启 100 个 pod
集群: 我这只剩 60 个槽位
应用方: 那我去 us-west 自己再申请一遍
```

Twine 做法：

```
应用方: 我要 us-east 5000 vCPU + us-west 3000 vCPU
Twine: 收到，配额已就绪
应用方: 现在我想跑 100 个实例
Twine: 自动分配——80 个去 us-east、20 个去 us-west
```

**配额** 和 **具体放哪** 解耦后，调度器有空间做全局优化（功耗、网络、故障域）。

### 案例 2：host profile 解决的痛点

ML 训练任务要 `透明大页（HugePages）+ 特定内核版本`；Web 前端要 `普通 4KB 页 + 长期支持内核`。

K8s 里这两类任务**不能共享宿主机**——内核参数全机器统一。Twine 的解法：

1. 应用声明 `host profile = ml-training-v3`
2. 调度器找一台空闲机器
3. **重装这台机器** 成 ml-training-v3（分钟级，不是秒级）
4. 把容器交付上去

代价是宿主机交付变慢，收益是利用率大幅提高——同一批硬件能服务所有差异化需求。

### 案例 3：TaskControl 救数据库

K8s 重启 pod 时序：

```
1. K8s 发 SIGTERM
2. 容器 preStop hook 跑 30 秒
3. SIGKILL 强杀
```

数据库正在 fsync 一笔事务怎么办？Twine 的协议：

```
Twine: 我想重启你这个实例，可以吗？
数据库: 现在不行，我有 3 笔事务在飞，给我 90 秒
Twine: 好，90 秒后再问
（90 秒后）
Twine: 现在呢？
数据库: 可以了，我已经把 leader 切给同伴
Twine: 开始重启
```

**双向协商** 让状态服务（数据库、缓存）能在共享集群里安全跑。

## 与 Borg / K8s 的对比

| 维度 | Borg (2015) | Kubernetes | Twine (2020) |
|---|---|---|---|
| 单集群规模 | 1 万台/cell | 5000 节点 | 跨 cell，10 万+ |
| 配额单元 | cell 内 | namespace quota | 跨 region entitlement |
| 宿主机定制 | 有限 | 不支持 | host profile（重装级） |
| 重启协商 | 单向通知 | preStop（单向） | TaskControl（双向） |
| 功耗调度 | 弱 | 无 | 一等公民 |
| 硬件偏好 | dual-socket | 不限 | single-socket 小机器 |

## 踩过的坑（论文里说的）

1. **跨 region 调度的延迟成本**：entitlement 跨域听起来美，实际上 placement 决策延迟会被网络放大；Twine 用了多级缓存和异步预分配。
2. **host profile 切换是分钟级**：宿主机重装慢，所以 Twine 必须**预测需求** 提前切换 profile，否则交付延迟会让应用方抓狂。
3. **TaskControl 拒绝过多**：早期应用方滥用 `拒绝重启` 让调度器无法回收资源；后来加了**强制超时** 和 SLO 兜底。

## 适用 vs 不适用

**适用**：
- 单家公司、内部基建、机器规模 5 万+ 台
- 工作负载差异大（前端 + ML + 数据库 + Cache 共存）
- 愿意付出 `不通用` 的代价换 `极致优化`

**不适用**：
- 通用云服务（要卖给外部，host profile 这种侵入式设计不能做）
- 千台规模以下（K8s 已经够，自造系统不划算）
- 工作负载单一（比如全是无状态 Web，K8s 简单且足够）

## 学到什么

1. **`一个集群` 不是必然抽象**：当规模到 10 万台，cell/cluster 边界要打开，资源要跨域流动。
2. **教科书答案有边界**：K8s 在 1 万台是好答案，5 万台开始抖、10 万台必须换。
3. **`不通用` 是一种武器**：Facebook 不卖云，所以可以做侵入式设计；这是它和 K8s 的根本区别。
4. **功耗是新维度**：2015 年没人把功率写进调度论文首页，2020 年成了首要目标——硬件红利消失，软件要替硬件省钱。
5. **双向协商 > 单向通知**：状态服务要平稳调度，必须给应用 `说不` 的权力。

## 延伸阅读

- 论文 PDF：[Twine OSDI 2020](https://www.usenix.org/system/files/osdi20-tang.pdf)（18 页，可读）
- [[borg-2015]] —— Borg — Google 2015 公开的集群管理原型，K8s 的爹
- [[kubernetes-2014]] —— Kubernetes — Borg 简化版 + 开源
- [[mesos-2011]] —— Mesos — 双层调度的另一种解法

## 关联

- [[borg-2015]] —— Borg 提供了基本概念（cell/job/task），Twine 把 cell 边界打开
- [[kubernetes-2014]] —— K8s 是 Borg 简化版给外部，Twine 是 Borg 进化版留给内部
- [[mesos-2011]] —— Mesos 的双层调度思路在 Twine 里以 entitlement 形式回归
- [[firmament-2016]] —— Firmament — 把调度建模成最小费用流的另一种思路

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

