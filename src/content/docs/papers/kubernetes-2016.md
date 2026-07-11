---
title: Kubernetes — 为什么选声明式 API 加协调环
来源: Burns, Grant, Oppenheimer, Brewer, Wilkes, Borg Omega and Kubernetes, ACM Queue 2016
日期: 2026-06-01
分类: 分布式系统
难度: 中级
---

## 是什么

Kubernetes（**K8s**）是 Google 把内部 Borg/Omega 12 年的运维经验**提炼成开源版**的集群编排系统。但这篇 ACM Queue 2016 论文里，五位作者（含 Brewer 和 Wilkes）其实在解释一个更窄的问题：**为什么 K8s 不直接抄 Borg 的命令式 API，而是全押在声明式（declarative）+ 协调环（reconciliation loop）这套范式上？**

日常类比：
- 命令式像**给保姆写步骤**："上午 9 点开冰箱，拿牛奶，倒进瓶子，放到桌上"——任何一步出问题（停电、瓶子摔了），后面就乱了
- 声明式像**贴一张愿望清单**："桌上随时要有一瓶满的牛奶"——保姆每隔 30 秒看一眼，少了就补、空了就换。这就是 K8s 的核心循环

读这篇 12 页短文不是学 API 用法，是**理解 K8s 长这样的根本动机**——pod / etcd / controller 都是这个选择的产物。

## 为什么重要

不理解"声明式 + 协调环"这一选择，下面这些事都说不清：

- 为什么 K8s 配置都是 YAML 一段段贴出去（desired state），而不是 `kubectl run-step-1; kubectl run-step-2`
- 为什么 K8s 自动把死掉的容器拉回来——不是检测到死亡再补，而是**循环对账**永远在跑
- 为什么 GitOps / Helm / Argo CD / Kustomize 这套生态能成立——因为 YAML 是真相，可 diff、可版本化
- 为什么 Operator 模式（自定义控制器）成了 K8s 扩展的标准答案——它复用了同一个协调环框架

## 核心要点

### 命令式 vs 声明式：本质区别

| 维度       | 命令式（Borg BCL）              | 声明式（K8s YAML）                |
|----------|----------------------------|------------------------------|
| 用户表达     | "怎么做"（启动顺序、迁移步骤）            | "想要什么"（要有 100 份在跑）             |
| 失败恢复     | 操作员手动重发漏掉的命令               | 控制器看到差距，**自动**把现实拉回期望        |
| diff 能力    | 几乎不可能（命令历史不留）              | `kubectl diff` 一行命令对比期望 vs 现实  |
| 版本化       | 难（命令是动作，不是状态）              | YAML 进 git，commit 即历史            |
| 抽象债      | 加一种资源就要加一组命令                | 加一种资源加一个 controller，**API 不变** |

### 三个支柱

**1. 期望状态（desired state）写进 etcd**

用户提交一份 YAML：`replicas: 100`。API server 校验后塞进 etcd（Raft 复制的 KV 存储）。**etcd 是真相**——所有组件以它为准，任何节点重启都从 etcd 重新读取。

**2. 控制器（controller）持续协调**

每种资源（Deployment / ReplicaSet / Job / DaemonSet…）都对应一个控制器。控制器伪代码就一段循环：

```python
while True:
    desired = etcd.read(spec)        # 期望：100 份
    observed = api.list_pods(label)  # 现实：实际有多少
    if observed < desired:
        api.create_pods(desired - observed)
    elif observed > desired:
        api.delete_pods(observed - desired)
    sleep(short_interval)
```

关键性质——**level-triggered（基于水位）而不是 edge-triggered（基于事件）**：丢一条事件没事，下一轮循环还会发现差距。这就是为什么 K8s 抗网络抖动、抗组件重启。

**3. API server 当中介，组件解耦**

控制器不直接互相调用，全都通过 API server 读写 etcd。Scheduler 也是一个特殊控制器：看到没分配节点的 pod（observed），把节点字段填上（move toward desired）。**整个系统就是一组并行运行的协调循环**。

### 为什么这套范式赢了

论文作者说三个原因（按重要度排）：

1. **运维心智简单**——命令式要记"现在到哪一步了"，声明式只要记"想要什么"。新人上手快
2. **故障恢复天然内建**——任何瞬时失败下一轮循环都会重试，不需要人工干预
3. **可组合**——多个控制器并行盯不同资源，互不打架。生态扩展（Operator）靠加新控制器即可

## 实践案例

### 案例 1：自愈背后到底发生了什么

部署 100 份 nginx，机器 A 突然断电，上面 5 份 pod 死亡。

```yaml
apiVersion: apps/v1
kind: Deployment
spec:
  replicas: 100
  selector:
    matchLabels: { app: nginx }
```

发生了什么：

1. kubelet 心跳停 → node controller 把 A 标 NotReady
2. 5 秒后 pod 被标 Unknown
3. ReplicaSet controller 协调循环：observed=95 < desired=100 → 创建 5 个新 pod
4. Scheduler 看到 5 个未分配节点的 pod → 选健康节点填进去
5. 新节点 kubelet 拉镜像启动

**没人发"重启"指令**。每个组件都在跑自己的循环，差距出现自动收敛。

### 案例 2：滚动更新也是协调出来的

```yaml
spec:
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 10
      maxSurge: 10
```

Deployment controller 不是按步骤"先杀 10 个、再起 10 个"。它把 ReplicaSet 数量变成两份（旧 90 + 新 10），看到现实达标后再把比例移到 80/20、70/30…**整个滚动是一连串小的"期望 → 现实"对齐**，而不是一段命令脚本。

中途你 Ctrl+C 取消，下次继续从 etcd 当前状态接着跑——不会"卡在第 4 步"。

### 案例 3：Operator 模式 = 把这套框架开放给业务

PostgreSQL 想跑在 K8s 上，主从切换、备份、扩容都要自动化。Operator 的做法：

1. 定义 `kind: PostgresCluster`（CRD，自定义资源）
2. 写一个控制器循环：盯 PostgresCluster 资源，把"期望集群状态"翻译成具体的 StatefulSet/Service/PVC

数据库厂商用同一套范式接进 K8s——**没改 API server，没改 etcd，没改 scheduler**。这就是声明式架构的可扩展性红利。

## 踩过的坑（论文作者亲述）

1. **声明式不等于声明就行**——你写 `replicas: 100` 不代表立刻有 100 份。中间有调度延迟、镜像拉取、健康检查。理解"最终一致"很关键
2. **协调环不是免费午餐**——大集群里 controller 每秒都在 list 资源，list-watch 机制（增量推送）就是为了不把 API server 压垮而设计
3. **顺序依赖很难表达**——声明式假设资源之间无强顺序，但现实里 DB 必须先于 App 起来。社区用 init container / readiness probe / 自定义 Operator 补这个洞
4. **etcd 是单点性能瓶颈**——所有真相都在 etcd，资源对象数 > 几十万就要分集群。这是声明式中心化代价

## 适用 vs 不适用场景

**这套范式适合**：
- 长生命周期、可重启的工作负载（web / 微服务 / 批处理）
- 故障恢复优先级高于秒级延迟的场景
- 需要审计 / 版本化 / GitOps 的团队

**不适合**：
- 真正的实时控制（毫秒级响应）——协调循环周期太长
- 一次性脚本任务——杀鸡用牛刀
- 资源数极大且变化极频繁——etcd 扛不住

## 学到什么

1. **声明式 + 协调环**是 K8s 一切设计的根——理解了它，pod / controller / Operator 都是推论
2. **Level-triggered 比 edge-triggered 更鲁棒**——这是分布式系统抗网络故障的通用法则
3. **etcd 真相 + 控制器肌肉 + API server 中介**这套三层结构可以套到很多协调系统上
4. **API 表面小、状态集中、组件解耦**——大型系统长青的设计模式
5. **K8s 不是发明，是提炼**——把 Borg 12 年的运维直觉换成可开源的范式语言

## 延伸阅读

- 论文 12 页 PDF：[Borg, Omega, and Kubernetes (ACM Queue 2016)](https://research.google/pubs/pub44843/)
- [[borg-omega-kube-2016]] — 同一篇论文的另一视角，讲三代演化
- [[borg]] — Borg 原论文（EuroSys 2015），命令式调度的代表
- [[omega-2013]] — Omega 共享状态调度器，K8s etcd 模型的精神前辈
- 视频：[Brian Grant — Declarative Application Management in Kubernetes](https://www.youtube.com/watch?v=AnvFt35RVnc)（作者之一讲设计哲学）

## 关联

- [[borg-omega-kube-2016]] — 三代调度器演化背景
- [[borg]] — 命令式 BCL 的痛点直接催生了声明式 YAML
- [[omega-2013]] — 共享状态 + 乐观并发是 etcd 的思想前身
- [[etcd-raft]] — K8s 真相存储的实现
- [[gitops]] — 把 git 当唯一真相，建立在声明式 API 之上

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[selinux-2001]] —— SELinux — 给 Linux 装上不可绕过的安检门
