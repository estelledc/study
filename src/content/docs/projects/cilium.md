---
title: Cilium — 用 eBPF 把 K8s 网络从 iptables 时代搬出来
来源: 'https://github.com/cilium/cilium'
日期: 2026-06-01
子分类: cloud-native
分类: 基础设施
难度: 中级
provenance: pipeline-v3
---

## 是什么

Cilium 是一个**让 Kubernetes 集群不再靠 iptables 转发流量**的网络方案。日常类比：原来快递分拣靠一墙的便签纸（iptables 规则），来一个包裹工人从头扫一遍找匹配的那张；Cilium 换成了刷码枪（eBPF map），扫一下直接知道送哪。

它由 Isovalent 创立、2017 开源、2023-10 从 CNCF graduated，与 [[kubernetes]] / [[prometheus]] 同级。底层用 **eBPF**——Linux 内核里跑沙箱字节码的小 VM，不改内核就能在网络 packet 路径插钩子。

最小心智模型：

```
原来：pod-A 出包 → iptables 一长串规则 → 匹配命中 → 转发给 pod-B
Cilium：pod-A 出包 → eBPF map 一次 hash 查表 → 转发给 pod-B
```

它一套方案同时干了三件事：CNI（给 pod 分网卡）、kube-proxy 替代（service 转发）、L7 策略 + 可观测（Hubble）。

## 为什么重要

不理解 Cilium，下面这些事都没法解释：

- 为什么大厂 K8s 集群规模过 5000 节点后必须换掉默认网络方案——iptables 规则匹配是 O(n)，几十万条链表扫到 CPU 打满
- 为什么"基于 IP 的安全策略"在 K8s 时代行不通——pod 重启 IP 就变，策略追不上
- 为什么 [[envoy]] / [[istio]] 这类 service mesh 在 Cilium 集群里可以"省一个 sidecar"
- 为什么云厂商 EKS / GKE / AKS 都把 Cilium 列成首选 CNI 之一

## 核心要点

1. **eBPF 替代 iptables**：每个节点装一个 cilium-agent，把转发 / NAT / 策略编译成 eBPF 字节码挂到内核 hook 点（XDP / TC / socket）。流量到内核就被处理，不走用户态。类比：从"让前台翻便签找人"改成"门禁刷卡机直连数据库"。

2. **Identity 不是 IP**：Cilium 给每个 pod 按它的 K8s label 算一个 32-bit identity，eBPF map 的 key 就是这个 identity。pod 重启 IP 变了 identity 不变，策略不用动。类比：识别员工靠工牌而不是工位号——换工位不用重发证。

3. **L7 借 Envoy、L3/L4 自己来**：要解析 HTTP path / Kafka topic 这类应用层语义，cilium-agent 把流量重定向到本节点的 [[envoy]] 实例做 L7 解析；L3/L4 完全在 eBPF 里搞定。这是 Cilium 既能做"轻量 CNI"又能做"service mesh"的拼装方式。

## 实践案例

### 案例 1：替换 kube-proxy

默认的 kube-proxy 把 ClusterIP / NodePort 翻译成 iptables DNAT 规则。集群里 5000 个 service × 平均 10 个 endpoint = 5 万条规则，每个包从头匹配。

Cilium 开 `kubeProxyReplacement: true` 后：

```bash
# 装的时候直接关掉 kube-proxy
helm install cilium cilium/cilium \
  --set kubeProxyReplacement=true \
  --set k8sServiceHost=<api-server-ip>
```

service 转发从 iptables 链表搜索变成 eBPF hash map 查表，O(n) → O(1)。Lyft / Datadog 这种规模公司换完 CPU 直接降几个百分点。

### 案例 2：L7 策略——只允许 GET /api/v1/users

写一份 CiliumNetworkPolicy：

```yaml
apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
spec:
  endpointSelector:
    matchLabels: { app: user-service }
  ingress:
  - fromEndpoints:
    - matchLabels: { app: web }
    toPorts:
    - ports: [{ port: '8080', protocol: TCP }]
      rules:
        http:
        - method: GET
          path: '/api/v1/users.*'
```

匹配的流量 cilium-agent 重定向给本节点 Envoy，Envoy 解析 HTTP 后判定，命中 → 放行 / 拒绝。业务代码完全不知情。

### 案例 3：Hubble 看 pod 间真实流量

```bash
hubble observe --from-pod default/web --to-pod default/user
# Mar 1 10:23:45 default/web-x → default/user-y :8080 GET /api/v1/users 200
# Mar 1 10:23:46 default/web-x → default/user-y :8080 POST /api/v1/users 403 (policy-denied)
```

每条 flow 都标了 namespace + label + L7 详情。线上排查"哪个服务在偷偷调谁"不用再 tcpdump。

## 踩过的坑

1. **内核版本要够新**：eBPF 完整功能需要 Linux ≥ 5.10。CentOS 7 的 3.10 内核基本只能用最弱模式，工业部署前先确认节点 OS。
2. **从 kube-proxy 切 Cilium 要清旧规则**：旧的 iptables 链表 Cilium 不会自动删，剩在那里会抢匹配优先级，必须手动 `iptables -F` 或重装节点。
3. **Hubble UI 默认无 RBAC**：暴露端口谁都能看全集群所有 pod 流量，等于把内部调用拓扑公开。生产必须套 ingress + auth。
4. **L7 策略多一跳**：流量从 eBPF 转给本机 Envoy 再转出，HTTP 吞吐比纯 L3/L4 模式低 30-50%。只在确实需要的 service 上开，不要全集群 L7。
5. **升级时 eBPF 程序重载**：major 版本升级（比如 1.13 → 1.14）会重新挂载 eBPF program，节点上的活动连接可能瞬断。必须 rolling 一台一台来。

## 适用 vs 不适用场景

适用：
- K8s 集群 > 500 节点，iptables 已成性能瓶颈
- 需要细粒度 L7 策略 + 可观测，但不想给每个 pod 加 sidecar
- 多集群联邦（ClusterMesh），跨集群 service 调用要透明
- 安全合规要求"按身份审计而非按 IP"

不适用：
- 节点 < 50 的小集群，默认 [[flannel]] / kube-proxy 完全够用，Cilium 学习曲线不划算
- 节点内核 < 4.19，eBPF 功能残缺
- 团队没人懂 eBPF / 内核网络，出问题排查门槛极高
- Windows 节点为主——eBPF 是 Linux 特性，Cilium 不支持

## 历史小故事（可跳过）

- 2015：Thomas Graf（前 Linux 内核网络维护者）看到 K8s 用 iptables 走不远，开始用刚成型的 eBPF 做 PoC。
- 2017-04：Cilium 开源 v0.8，主打"用 eBPF 替代 iptables"。
- 2018：Isovalent 公司成立专门做 Cilium，发布 v1.0。
- 2019：Google 选 Cilium 做 GKE Dataplane V2，第一家云厂商背书。
- 2021-10：进入 CNCF incubation。
- 2023-10：CNCF graduated，与 [[kubernetes]] / [[prometheus]] 同级。
- 2023-12：Cisco 宣布收购 Isovalent（2024 完成）——eBPF 网络栈正式进主流商业版图。

## 学到什么

- "把网络从用户态搬到内核 eBPF" 是过去十年云原生网络最大的范式变化，Cilium 是这个变化的物理载体。
- 数据结构选错（iptables 链表）规模一上来就崩，再多优化也救不回；换 hash map 是质变。
- 身份模型从 IP 换成 label，是配合 K8s "pod 是临时的、label 是稳定的"这个事实做的对齐——不对齐的方案规模一大就漏。
- L7 不是必须的：能用 L3/L4 解决就别开 L7，多一跳是真实代价。

## 延伸阅读

- 官方文档 docs.cilium.io —— 必看 Concepts → Networking 那一章，讲 eBPF datapath 怎么编排
- Thomas Graf 演讲"How eBPF will solve Service Mesh"（KubeCon 2021）—— 创始人解释为什么 sidecar 不是终局
- Liz Rice《Learning eBPF》—— 想搞懂 Cilium 底层先把这本翻完
- isovalent.com/blog —— 公司 blog，常发数据面优化深度文
- [[kubernetes]] —— Cilium 几乎只在 K8s 里部署
- [[envoy]] —— L7 策略时 Cilium 会把流量转给它做解析

## 关联

- [[kubernetes]] —— Cilium 的宿主，CNI 接口就是 K8s 定义的
- [[envoy]] —— L7 解析的执行者，Cilium 提供数据面调度、Envoy 干应用层
- [[istio]] —— 传统 service mesh，每 pod 一个 Envoy sidecar；Cilium 走"无 sidecar"路线抢同一块地
- [[linkerd2]] —— 另一个 service mesh，Rust 写，跟 Cilium 哲学不同（用户态 vs 内核态）
- [[prometheus]] —— Cilium 暴露大量 eBPF map 指标，Hubble metrics 直接被 Prometheus 抓取
- [[grafana]] —— Hubble UI 之外，Cilium 官方提供 Grafana dashboard 模板

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[calico]] —— Calico — 用 BGP 路由把 K8s pod 当成一个个小路由器
- [[envoy]] —— Envoy — 把网络通信从业务代码里抠出来的代理进程
- [[grafana]] —— Grafana — 监控可视化看板
- [[istio]] —— Istio — 给微服务装一层透明的网络治理面
- [[kubernetes]] —— Kubernetes — 容器编排平台
- [[longhorn]] —— Longhorn — K8s 原生的轻量分布式块存储
- [[prometheus]] —— Prometheus — 时序监控系统
- [[rook]] —— Rook — 把 Ceph 装进 K8s 的 CRD 里

