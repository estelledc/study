---
title: LitmusChaos — 给 K8s 集群安排"故意搞坏"的演习
来源: https://github.com/litmuschaos/litmus
日期: 2026-06-01
分类: 云原生
难度: 中级
---

## 是什么

LitmusChaos（以下简称 **Litmus**）是一个**专门给 Kubernetes 集群做"故意搞坏"演习的开源框架**。CNCF 孵化项目，4.6k stars。

日常类比：消防演习。平时谁都说"我们应急预案没问题"，但真要等到火灾才知道——电梯没人按、安全门锁着、灭火器过期。Litmus 就是**主动放火的人**：在你说"系统稳"的时候，它跑过来"砰"地拔掉一个 Pod、塞满一块磁盘、把网络延迟拉到 500ms，看你的告警/重试/降级到底有没有真的工作。

技术上，Litmus 用 K8s 自己的方式做这件事：**把每种"故障"写成一个 CRD（自定义资源）**，你 `kubectl apply` 一个 YAML，集群里就发生了对应的故障。

## 为什么重要

如果你做后端、SRE、平台工程，下面这些场景都绕不开 Litmus 这类工具：

- **生产事故复盘后的"防回归测试"**：上次因为 pod OOM 导致雪崩，怎么证明修完不会再发生？跑一个 pod-memory-hog 实验
- **新服务上线前的韧性验收**：你说有重试和熔断，那把上游服务删一个 Pod 看看，崩了就是嘴上说说
- **多集群灾备演练**：主集群挂一半节点，业务能不能切到备集群，多久切完

不做混沌工程的代价是——**线上才发现问题，而且总在凌晨**。Netflix 2010 年提出 Chaos Monkey 就是这个原因，Litmus 是把这套思路做成 K8s 原生的成熟项目之一。

## 核心要点

Litmus 的整个世界观可以拆成 **三层 CRD**：

1. **ChaosExperiment（实验定义）**：一种故障的"模板"。比如 `pod-delete` 就是一个 ChaosExperiment，里面写了"怎么删 Pod、删几个、间隔多久"。这层是**复用的**——Chaos Hub 上几十个现成模板直接拉。

2. **ChaosEngine（实验绑定）**：把"模板"绑到"具体目标"。比如"对 namespace=prod、label=app:checkout 的 Pod 跑 pod-delete 实验"。这层是**你写的**——它说清楚"在哪做、做什么、做多久"。

3. **ChaosResult（实验结果）**：跑完之后产生的报告 CRD。包含"Pod 是否真的被删了""目标 SLO 是否还达标"。这层是**自动生成**的。

加上一个 **ChaosCenter**（Web UI + Workflow 编排），让你能用图形界面把多个实验串成"演习剧本"。Litmus 3.0（2023）开始 Workflow 引擎换成 Argo Workflows，不再自己造。

**为什么拆成三层**：这是 K8s 控制器模式的标准做法——**模板 / 实例 / 结果分离**。模板可以版本化共享（Chaos Hub 上几十种现成实验），实例是项目自己的配置，结果是审计材料。和 Deployment / Pod / Event 的分层是同一种思路。

## 实践案例

### 案例 1：最小可跑的"删一个 Pod"实验

```yaml
apiVersion: litmuschaos.io/v1alpha1
kind: ChaosEngine
metadata:
  name: nginx-chaos
  namespace: default
spec:
  appinfo:
    appns: default
    applabel: 'app=nginx'
  chaosServiceAccount: litmus-admin
  experiments:
    - name: pod-delete
      spec:
        components:
          env:
            - name: TOTAL_CHAOS_DURATION
              value: '30'
```

**逐字段解释**：

- `appinfo.applabel`：选中带 `app=nginx` 标签的所有 Pod
- `experiments[0].name: pod-delete`：跑"删 Pod"这个实验（前提是 ChaosHub 里这个 ChaosExperiment 已经装好）
- `TOTAL_CHAOS_DURATION: 30`：持续 30 秒，期间反复删 Pod

`kubectl apply` 之后，Litmus 的 Chaos Operator 会创建一个 Job 来真正执行删除动作，并把结果写回 ChaosResult CRD。

### 案例 2：和 Argo Workflow 串成多步骤演习

实际生产里，单一故障注入意义有限，**真实演习是"多个故障 + 验证"串起来**：

```
1. 先注入网络延迟 100ms（network-latency）
2. 同时杀掉 1 个 Pod（pod-delete）
3. 跑探测脚本：调用 /healthz，期望 200 在 3 秒内返回
4. 如果探测失败 → 整个 Workflow 标红
```

Litmus 3.0 之后，这种串接直接复用 Argo Workflows 的 DAG 能力，不再自己实现。这也是开源项目演化的常见路径——**先全栈自造，后专注核心、复用周边**。

### 案例 3：在 PR Pipeline 里跑"韧性回归"

成熟团队的玩法：每次合并到 main 之前，CI 会触发一个 Litmus Workflow——把 PR 的镜像部到测试集群，跑一遍预设的混沌实验，全部通过才允许合入。这把"韧性"变成了**像单测一样可回归的指标**。

### 案例 4：Probe — 让实验有"通过/失败"的判断

Litmus 提供四种 Probe（探针）：

- **httpProbe**：实验期间持续打目标 HTTP，期望状态码/延迟在阈值内
- **cmdProbe**：跑一段 shell 命令，期望退出码 0
- **k8sProbe**：检查某个 K8s 资源状态（如 Pod 数量稳定）
- **promProbe**：查 Prometheus 指标，期望某个 PromQL 结果在区间内

Probe 把"故障注入"和"业务影响"绑到一起——没有 Probe 的实验等于只制造混乱不验证结果。

## 踩过的坑

1. **不要在生产直接跑**：Litmus 默认行为相对克制，但 disk-fill / network-loss 这种实验如果选错命名空间/标签，会真把生产搞挂。新人务必先在 staging 集群跑通。

2. **RBAC 配置麻烦**：Litmus 需要 `chaosServiceAccount` 有权限 delete Pod / exec 容器 / 写 CRD，社区给的 admin SA 权限很大。生产应该按实验类型最小化授权——这是初学者最常忽略的。

3. **Chaos Hub 实验质量参差**：官方 Hub 的实验大致可信，但有些社区贡献的实验脚本写得糙，`pod-cpu-hog` 在不同内核版本表现不一致。生产用前先读源码。

4. **ChaosResult 不等于业务影响**：实验跑成功只是说"故障真的注入了"，**业务侧 SLO 是否被破**要你自己接 Prometheus/Grafana 来判断。Litmus 提供 Probe 机制做这件事，但需要额外配置。

5. **3.0 升级不向后兼容**：从 2.x 升 3.0 需要迁移 Workflow 定义，因为底层换了 Argo。已有大量 2.x YAML 的团队要做迁移工作。

## 适用 vs 不适用

**适用**：
- Kubernetes 原生工作负载的韧性测试
- 团队已有 GitOps（ArgoCD/Flux）习惯，把混沌实验纳入 IaC 管理
- 需要可视化编排多步演习（ChaosCenter）

**不适用**：
- 非 K8s 环境（裸金属、传统 VM）→ 看 Chaos Toolkit / Pumba
- 需要内核级故障注入（syscall 层面）→ Chaos Mesh（PingCAP，sidecar 注入更深入）
- 团队连 K8s 都没玩明白 → 先把基本的 Deployment/Service/Probe 跑通再来

## 和 Chaos Mesh 的对比（一句话版）

- **Litmus**：应用层注入，门槛低，生态广，CNCF 孵化背书
- **Chaos Mesh**：内核态注入，能做更精细的故障（如 IO 错误、时间偏移），单集群能力更强

选哪个看团队：先要"能用、能管"选 Litmus；要"深入、定制"选 Chaos Mesh。

## 历史小故事（可跳过）

- **2017**：MayaData（OpenEBS 团队）内部为了测自己分布式存储的韧性，开始写小工具
- **2019**：开源出来叫 Litmus，最初只是 OpenEBS 的存储混沌工具
- **2020 年 6 月**：捐给 CNCF，进入 Sandbox（沙箱阶段）
- **2022 年 4 月**：升级 CNCF Incubating（孵化），意味着已经有数家生产用户
- **2023 年**：Litmus 3.0 大改架构，Workflow 引擎换成 Argo Workflows，自己专注 Chaos Operator + ChaosCenter

可以看出**典型 CNCF 项目演化路径**：内部工具 → 开源 → 沙箱 → 孵化 → 毕业。Litmus 目前还没毕业（毕业要求更高），但已经是这个赛道里 K8s 原生派的事实标准之一。

## 学到什么

1. **混沌工程的本质是"主动制造已知故障"**——不是为了搞坏，是为了**验证应急预案真的能跑**
2. **K8s CRD 模式让"工具变成集群原住民"**——Litmus 不是装在 K8s 里的程序，它是 K8s 词汇表的一部分
3. **开源项目演化路径：先全栈自造 → 后专注核心**（Litmus 3.0 把 Workflow 让给 Argo）
4. **韧性测试可以像单测一样进 CI**——这是从"事后救火"变成"事前预防"的关键转变
5. **CNCF Incubating 的含金量**：意味着已经有数家生产用户、API 趋稳、社区活跃；不是"试验阶段"

## 延伸阅读

- [Litmus 官方文档](https://docs.litmuschaos.io/) — 从 quick start 到 Probe 配置
- [Chaos Hub](https://hub.litmuschaos.io/) — 现成的实验目录
- [Netflix Chaos Engineering Principles](https://principlesofchaos.org/) — 混沌工程的祖师爷文档
- [CNCF Litmus 项目页](https://www.cncf.io/projects/litmus/) — 孵化状态与治理信息

## 关联

- [[kubernetes]] —— Litmus 的运行底座；不懂 Deployment/Service/Probe 先别上混沌
- [[argo-workflows]] —— Litmus 3.0 之后的 Workflow 编排引擎
- [[argocd]] —— GitOps 流水线常和 Litmus 搭配，把演习 YAML 当代码管
- [[prometheus]] —— promProbe 直接查指标，判断故障有没有打穿 SLO
- [[grafana]] —— 演习期间看盘；ChaosResult 之外的业务视角
- [[istio]] —— 服务网格的重试/熔断常被 Litmus 拿来验收

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
