---
title: Borg / Omega / Kubernetes — Google 调度器三代同源
来源: 'Burns, Grant, Oppenheimer, Brewer, Wilkes, "Borg, Omega, and Kubernetes", ACM Queue 2016'
日期: 2026-05-31
分类: 分布式系统
难度: 中级
---

## 是什么

这是 Google 五位作者写的一份**家史**：把内部用 12 年的 Borg、想替代 Borg 但失败的 Omega、以及 2014 年开源的 Kubernetes 摆在一起讲——三代调度器同源，每代都把上一代的痛改掉，但都保留了同一个核心抽象（容器 + 声明式 + 控制环）。

日常类比：像三代造车师傅——爷爷（Borg）造了一台跑了 12 年的卡车，结实但内饰老；爸爸（Omega）想推一台多引擎并联的概念车，工程上没扛住；儿子（Kubernetes）综合两代经验造了一台开源车，把爷爷那套传出车库给所有人开。

读这篇 12 页短文不是学新算法，是**理解 Kubernetes 的每一个设计决定从哪来**——pod 不是凭空想的，labels 不是凭空想的，控制器模式不是凭空想的。

## 为什么重要

不读这篇，下面这些"为什么 K8s 长这样"的问题都答不出：

- 为什么 K8s 最小调度单元不是容器而是 **pod**——因为 Borg 早就发现"一组紧耦合任务"应该一起调度（alloc）
- 为什么 K8s 用 **labels** 而不是 job 名字——因为 Borg 的层级命名太死，多维选择是刚需
- 为什么 K8s 是**声明式 API + 控制器**——因为 Borg 的命令式 BCL 配置无法复用、不能版本化
- 为什么每个 pod 有**自己的 IP**——因为 Borg 单 IP per machine 让端口管理变成运维黑洞
- 为什么 Omega 没成——单调度器加 priority/preemption 已经够用，多调度器并行的收益不抵复杂度

## 核心要点

### 三代演化的对照表

| 维度       | Borg (2003)        | Omega (2013)            | Kubernetes (2014)            |
|----------|--------------------|-------------------------|------------------------------|
| 调度模型     | 单一 monolithic 调度器 | shared state + 并行调度乐观并发 | 声明式 + 控制器协调               |
| 配置语言     | BCL 命令式             | 内部 DSL                  | YAML 声明式（desired state）     |
| 最小单元     | task（job 内）         | task                    | **pod**（一组共享网络和卷的容器）       |
| 网络模型     | 单 IP per machine + 端口共享 | 同 Borg               | **IP per pod**             |
| 分组抽象     | job（层级命名）           | job                     | **labels**（无层级、多维选择）     |
| 真相存储     | BorgMaster Paxos 内存 | 共享 state store          | etcd（Raft）                |
| 可扩展性     | 改源码                | 多调度器                    | 控制器即插即用                  |
| 状态       | 仍在 Google 全部生产     | **从未替代 Borg**           | 开源主流                     |

### 三个最关键的迁移

**1. 从 task 到 pod**：Borg 里"一组紧耦合任务"叫 alloc，是工程上加上去的概念；Kubernetes 把它提到一等公民——pod 内多容器共享网络命名空间和卷，sidecar 模式（日志收集、代理、指标）天然成立。日常类比：Borg 是"住一栋楼里的几户邻居"，pod 是"一户里的几间卧室"——共享卫浴、互相能直接喊。

**2. 从 job 名字到 labels**：Borg 的 job 是 "search/frontend/prod-zone-eu" 这种**层级字符串**——你想问"所有 prod 的 frontend 不分服务"就要用通配符拼。Kubernetes 改成 `{tier: frontend, env: prod, team: search}` 这种**无层级标签**，selector 可以任意维度组合。这是从"目录树"到"标签"的一次思维换挡。

**3. 从命令式到声明式**：Borg 的 BCL 是 "请帮我跑 100 份，调度到这些机器，启动顺序如下..."；Kubernetes 是 "我要 100 份在跑"——剩下的让控制器持续把现实（observed）拉向期望（desired）。这就是**自愈**的来源：机器死了？控制器看到只有 99 份，自动在别处补一份。

## 实践案例

### 案例 1：pod 抽象怎么解决"sidecar"问题

Borg 时代要给一个服务加日志收集，得在 BCL 里写"在同一台机器上再跑一个 task，跟主 task 共享一些目录"——能跑但脆。

Kubernetes：

```yaml
apiVersion: v1
kind: Pod
spec:
  containers:
    - name: web
      image: my-web:v1
    - name: log-agent
      image: fluentd:v2
      volumeMounts: [{ name: logs, mountPath: /logs }]
  volumes:
    - name: logs
      emptyDir: {}
```

两个容器在**同一个 pod**，共享网络（`localhost` 互通）和 volume。这正是 Borg alloc 的"精炼开源版"。

### 案例 2：labels 怎么替代层级命名

```yaml
# 给 100 份 frontend 打标签
metadata:
  labels:
    app: search
    tier: frontend
    env: prod
```

```yaml
# 一个 Service 用 selector 抓全部 prod frontend
selector:
  tier: frontend
  env: prod
```

想分流"只把 canary 流量给带 `version: v2` 的 pod"？再加一维 selector 就行。Borg 时代要改 job 名字层级，破坏性极大。

### 案例 3：控制器模式 = 一个永不停歇的协调循环

ReplicaSet 控制器伪代码：

```python
while True:
    desired = spec.replicas        # 你说要 100 份
    observed = count_pods(selector)  # 现在实际有多少
    if observed < desired:
        create_pods(desired - observed)
    elif observed > desired:
        delete_pods(observed - desired)
    sleep(short_interval)
```

每个 K8s 资源类型都有一个这样的控制器（Deployment / Job / DaemonSet / StatefulSet）。**API 表面小、状态集中在 etcd、组件可独立替换**——这套范式在 Borg 是隐藏的、在 Kubernetes 是显式的。

## 踩过的坑（论文作者亲述）

1. **Omega 不是失败的失败**：从未替代 Borg，但它的优化（更好的抢占、调度策略解耦）反哺回 Borg。共享状态 + 乐观并发的设计也启发了 K8s 的 etcd 模型。
2. **应用导向容器 ≠ 机器导向 VM**：Borg 的关键洞察是用 cgroups 做轻量隔离、围绕"应用"建模。这直接催生了 LXC → Docker → containerd 整条生态——容器不是"装系统"，是"装一个应用"。
3. **声明式 API 不是漂亮——是必要**：命令式配置很难版本化、很难 diff、很难复用模板。Helm / Kustomize / GitOps 都建立在"K8s 资源是声明式 YAML"这个前提上。
4. **小心抽象债**：Borg 的 job/task 后来被证明对 Spark / MPI 这种成组任务太死。Kubernetes 用 pod + Job + StatefulSet 拆分，但每加一个抽象都是一次赌博。

## 适用 vs 不适用场景

**这篇论文适合**：

- 想理解 Kubernetes 设计意图而不是只学 API 的人
- 在做集群调度 / orchestration 系统的工程师——三代踩过的坑你可以直接绕开
- 写技术决策文档时需要"为什么不选 X 而选 Y"的引用源

**不适合当作**：

- Kubernetes 教程（这是设计哲学回顾，不教 kubectl）
- 调度算法论文（不证明任何算法，是经验报告）
- Omega 详细架构文献（点到为止，要看 EuroSys 2013 原文）

## 历史小故事（可跳过）

- **2003 年左右**：Borg 在 Google 内部成形，目标是把大规模服务和批处理任务放进同一个集群池里跑。
- **2013 年**：Omega 论文公开，尝试用 shared state 和乐观并发支持多个调度器并行决策。
- **2014 年**：Kubernetes 开源，把 Borg/Omega 里的经验改写成社区能用的 pod、label、controller 和声明式 API。
- **2016 年**：ACM Queue 这篇文章把三代系统放在一起复盘，重点不是炫技，而是解释设计选择从哪里来。

## 学到什么

1. **K8s 不是发明，是提炼**——把 Borg 12 年的运维直觉 + Omega 的实验结论开源化
2. **设计决定都有出处**——pod / labels / 控制器 / 声明式 / IP per pod，每条都对应前代的一处痛
3. **失败的实验也有价值**——Omega 没替代 Borg，但它的思想活在 etcd 共享状态里
4. **应用导向容器**是过去 20 年最重要的运维范式迁移，源头就在 Google
5. **大型系统的演化不是推倒重来，是不断重构核心抽象的同时保留肌肉记忆**

## 延伸阅读

- 论文 12 页 PDF：[Borg, Omega, and Kubernetes (ACM Queue 2016)](https://research.google/pubs/pub44843/)（密度低、可读性高，建议一次读完）
- [[borg]] — Borg 详细论文（EuroSys 2015），先读这篇再看 Borg 你会更有共鸣
- Kubernetes 官方设计文档：[Kubernetes Design Proposals](https://github.com/kubernetes/design-proposals-archive)（每个核心抽象都有 design doc）
- 视频：[John Wilkes — Cluster Management at Google](https://www.youtube.com/watch?v=0W49z8hVn8E)（作者本人讲）

## 关联

- [[borg]] — 直接前作，先读 Borg 再读这篇可以"对照检查"每个改动
- [[raft]] — etcd 的共识协议，K8s 单一真相存储的基础
- [[paxos]] — Borg 时代的 BorgMaster 用 Paxos 做副本复制
- [[paxos-simple-2001]] — Lamport 简化版，理解 BorgMaster Paxos 的最快路径
- [[epaxos-2013]] — 同期共识协议演化方向，与 Raft 并列

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[borg-2015]] —— Borg 2015 — Google 把一万台机器假装成一台
- [[kubernetes-2016]] —— Kubernetes — 为什么选声明式 API 加协调环
- [[mesos]] —— Mesos — 让多种计算框架共用一套集群
- [[mesos-2011]] —— Mesos 2011 — 把数据中心切成资源 offer 发给框架自己挑
- [[papers/mlflow]] —— MLflow — 给机器学习实验装上「记账本和身份证」
- [[omega-2013]] —— Omega 2013 — 让多个调度器同时改一份 cluster 状态
- [[quincy-2009]] —— Quincy — 把"派活给机器"变成一道最小费用流题
- [[ray-2018]] —— Ray 2018 — 把任务和演员放进同一个分布式舞台
- [[soltesz-2007]] —— Soltesz 2007 — 容器：比虚拟机轻一档的隔离方案
- [[sparrow-2013]] —— Sparrow — 让毫秒级任务也能被精准调度的去中心化调度器
