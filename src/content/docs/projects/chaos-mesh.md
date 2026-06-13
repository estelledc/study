---
title: Chaos Mesh — K8s 原生混沌工程平台
来源: https://github.com/chaos-mesh/chaos-mesh
日期: 2026-06-01
子分类: cloud-native
分类: 基础设施
难度: 中级
provenance: pipeline-v3
---

## 是什么

Chaos Mesh 是一个**专门给 Kubernetes 集群"故意搞破坏"的工具**。你写一份 yaml 说"把 payment 这个服务的 pod 每 5 分钟随机 kill 一个"或者"给 order 服务和 db 之间的网络加 200ms 延迟"，它就替你执行，完事自动恢复。

日常类比：

- **以前测系统容错**像考前不模拟、直接上考场：等线上真挂了才知道扛不住
- **Chaos Mesh** 像在考前请教练故意拌你一脚——主动制造失败，看系统能不能自己爬起来

由 PingCAP（TiDB 背后的公司）2019 年内部开发，最初只为测 TiDB 这种分布式数据库的容错。2020 年 12 月开源，2021 年 6 月进 CNCF Sandbox，2022 年 6 月升级 Incubating。是 K8s 生态里**故障注入种类最完整**的开源项目之一。

## 为什么重要

不理解 Chaos Mesh，下面这些事都不好解释：

- **混沌工程为什么从 Netflix Chaos Monkey 演进到 K8s 原生**——早期工具只能随机 kill 进程，现在可以精确控制网络 / IO / 时钟 / DNS / 内核
- **为什么微服务团队定期"演练故障"**——容错代码写得对不对，只有真把依赖打挂才知道
- **为什么 SRE 把"可注入故障"当架构指标**——能不能在测试环境复现一个生产故障，决定故障复盘的深度
- **K8s 控制器模式还能怎么用**——cert-manager 是"声明证书"，Chaos Mesh 是"声明故障"，同一种范式不同场景

## 核心要点

Chaos Mesh 可以拆成 **CRD + 双进程 + 多种故障注入手段** 三层：

1. **CRD 声明故障**：你写 PodChaos / NetworkChaos / IOChaos 等 yaml，描述目标（label selector）+ 模式（one / all / fixed-percent）+ 持续时间。这是用户唯一要写的东西。

2. **双进程协同**：`chaos-controller-manager` 跑在控制平面，watch CRD 决定该做什么；`chaos-daemon` 是 DaemonSet，每个节点一份，**真正动手**——它通过 `nsenter` 进入目标容器的 namespace 执行 tc / iptables / FUSE 挂载。

3. **底层技术按类型分**：网络故障用 Linux `tc + netem + iptables`；IO 故障用 FUSE 文件系统劫持调用；时钟用动态库改 vDSO；内核故障用 eBPF；JVM 异常用 BCC。每种故障类型选一种最合适的内核/用户态机制。

v2.0（2022）后又加了 **Workflow**（多步骤编排：先注网络延迟再 kill pod）和 **Schedule**（定时跑混沌实验，类似 CronJob）。

## 实践案例

### 案例 1：装 Chaos Mesh

```bash
helm repo add chaos-mesh https://charts.chaos-mesh.org
kubectl create ns chaos-mesh
helm install chaos-mesh chaos-mesh/chaos-mesh -n chaos-mesh
```

装好后会跑起 controller-manager / daemon（DaemonSet）/ dashboard 三个组件。打开 dashboard 是个 Web UI，可视化看实验状态、编排 workflow。

### 案例 2：随机 kill 一个 pod

```yaml
apiVersion: chaos-mesh.org/v1alpha1
kind: PodChaos
metadata:
  name: kill-payment-pod
  namespace: chaos-mesh
spec:
  action: pod-kill
  mode: one
  selector:
    namespaces: [staging]
    labelSelectors:
      app: payment
  duration: 30s
```

含义："在 staging namespace 里 label `app=payment` 的 pod 中**随机选一个**杀掉，30 秒后恢复"。daemon 收到指令后直接 `kill` 容器进程，K8s ReplicaSet 自动重建。

### 案例 3：给两个服务之间注入网络延迟

```yaml
apiVersion: chaos-mesh.org/v1alpha1
kind: NetworkChaos
spec:
  action: delay
  mode: all
  selector:
    labelSelectors:
      app: order
  delay:
    latency: "200ms"
    jitter: "50ms"
  direction: to
  target:
    selector:
      labelSelectors:
        app: db
    mode: all
```

含义："所有 `app=order` 的 pod 发往 `app=db` 的 pod 的包，加 200±50ms 延迟"。daemon 在 order pod 的网络 namespace 里跑 `tc qdisc add dev eth0 root netem delay 200ms 50ms`，同时配 iptables 把目标限定到 db pod 的 IP。

## 踩过的坑

1. **chaos-daemon 必须 hostNetwork + privileged**——它要进别人的 namespace 操作 tc / iptables / FUSE，必须特权模式。安全敏感的集群（金融、政务）落地难，需要 PSP / OPA 例外规则。

2. **IOChaos 注入会让目标 pod 重启一次**——FUSE 挂载是通过 mutating webhook 给 pod 注入 sidecar，这要求 pod 重新创建。第一次给生产 pod 加 IOChaos 会以为"它把我服务搞挂了"。

3. **NetworkChaos partition 在不同 CNI 下行为不一样**——Cilium 用 eBPF datapath，Calico 用 iptables/IPVS，Flannel 用 VXLAN。`tc + iptables` 对它们的拦截层不一样，partition 在 Cilium 下经常不彻底。

4. **TimeChaos 不影响 Go 的 monotonic clock**——Chaos Mesh 改的是 vDSO 时钟函数（`clock_gettime(CLOCK_REALTIME)`）。Go runtime 测时间间隔用的是 monotonic clock 走另一条 syscall，注不进去。Java / Python 不受这个限制。

5. **selector 写错很危险**——少写一个 namespace 字段，可能把生产环境也匹配上。最佳实践：所有 *Chaos 资源固定放 staging namespace，selector 显式指定 `namespaces`。

## 适用 vs 不适用场景

**适用**：

- K8s 集群里的混沌工程演练（计划内 / 持续 / 定时）
- 分布式系统容错回归测试（数据库 / 消息队列 / 微服务）
- 故障复盘后的"复现故障 → 验证修复"
- SRE 团队建立"游戏日"（Game Day）演练机制

**不适用**：

- 非 Kubernetes 环境（裸机、VM、Serverless）→ 用 Chaos Toolkit / Pumba / Gremlin agent
- 需要在生产环境**真无差别**乱搞 → 风险太高，建议先在 staging 长期跑，生产只跑 PodChaos 之类弱故障
- 应用内部业务逻辑故障注入（比如"让 SQL 报错"）→ 用应用层故障注入框架（Java 用 ChaosBlade-Java agent 等）
- 集群本身控制平面故障演练（kill kube-apiserver）→ Chaos Mesh 自己也跑在 K8s 上，控制平面挂了它也挂

## 历史小故事（可跳过）

- **2019 年**：PingCAP 工程师为测 TiDB 容错，受 Netflix Chaos Monkey 启发，开发 Chaos Mesh 雏形
- **2020 年 12 月**：在 GitHub 开源，最初只有 PodChaos / NetworkChaos
- **2021 年 6 月**：捐给 CNCF 进 Sandbox
- **2022 年 6 月**：CNCF 升级为 Incubating，与 Argo / Linkerd 同级
- **v2.0**：引入 Workflow（多步编排）+ Schedule（定时）+ Dashboard 重构，从单纯故障注入工具变成完整混沌工程平台

## 学到什么

1. **故障也可以"声明式"管理**——cert-manager 声明证书状态，Chaos Mesh 声明故障状态。K8s 控制器模式的覆盖面比想象中广
2. **不同故障要选不同内核机制**——网络用 tc，IO 用 FUSE，时钟用 vDSO 注入，内核用 eBPF。一个工具背后是一整套 Linux 用户态/内核态接口
3. **混沌工程的关键不是"随机"，是"可控可观测"**——能精确选择目标、限制影响范围、看到状态变化，比"随便挂个东西"重要得多
4. **CRD 高低分层**：用户写 *Chaos（高层意图），系统内部生成 schedule / workflow（低层执行计划），分层让用户体验和实现解耦

## 延伸阅读

- 官方文档：[chaos-mesh.org](https://chaos-mesh.org/docs/)（结构清晰，从 install 到每种 *Chaos 一站式）
- 源码：[github.com/chaos-mesh/chaos-mesh](https://github.com/chaos-mesh/chaos-mesh)（Go 写的控制器，看 `controllers/` 目录是入口）
- 混沌工程原书：Casey Rosenthal《Chaos Engineering》（OReilly 2020），讲 Netflix 起源、原则与方法论
- Linux tc / netem 手册：理解 NetworkChaos 底层，`man tc-netem`
- [[cert-manager]] —— 同样的 K8s CRD + 控制器模式，对照看会更明白
- [[argocd]] —— K8s 平台层的另一块拼图，GitOps + 混沌工程组合很常见

## 关联

- [[cert-manager]] —— 都是 CNCF Incubating + K8s 控制器模式典型案例
- [[argocd]] —— 一个声明应用状态，一个声明故障状态，K8s 平台层互补
- [[istio]] —— 服务网格也支持轻量故障注入（HTTP 延迟 / 错误码），但只到 L7；Chaos Mesh 覆盖 L3-L7 + 节点层

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[argocd]] —— Argo CD — Kubernetes GitOps 工具
- [[cert-manager]] —— cert-manager — K8s 自动签发与续期 TLS 证书
- [[istio]] —— Istio — 给微服务装一层透明的网络治理面
- [[openthread]] —— OpenThread — Google 开源的 Thread mesh 网络协议栈

