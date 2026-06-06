---
title: Calico — 用 BGP 路由把 K8s pod 当成一个个小路由器
来源: 'https://github.com/projectcalico/calico'
日期: 2026-06-01
子分类: DevOps 与运维
分类: 基础设施
难度: 中级
provenance: pipeline-v3
---

## 是什么

Calico 是一个**让 K8s 集群里每个 pod 都能直接用真实路由协议互通**的网络方案。日常类比：原来 K8s 默认网络像小区里的"对讲快递员"——每个包裹要先包一层小区信封（VXLAN/IPIP overlay），到对面再拆；Calico 直接给每户挂了门牌号，邮政（BGP）按门牌投递，不需要二层封装。

它由 Metaswitch（后来独立成 Tigera）在 2014 年开源，比 [[kubernetes]] 还早一年，是最老牌的 K8s CNI 之一。底层默认走 **BGP**——互联网骨干网用了 30 年的路由协议，Calico 把它搬进了集群里，让每个节点像一台小路由器，把"我这台机器上有哪些 pod IP"广播给邻居。

最小心智模型：

```
overlay 派（flannel-vxlan）：pod-A 出包 → 节点封 VXLAN → 解封 → pod-B
Calico BGP：pod-A 出包 → 节点查路由表 → 直接路由到 pod-B 所在节点 → pod-B
```

一套方案同时干三件事：CNI（给 pod 分网卡）、数据面策略（NetworkPolicy）、跨节点路由（BGP 或可选的 VXLAN）。2020 年后还加了第二条数据面：**eBPF 模式**，对标 [[cilium]]。

## 为什么重要

不理解 Calico，下面这些事都没法解释：

- 为什么很多老牌 K8s 发行版（kops / RKE / OpenShift）默认 CNI 是 Calico——它出现得早、稳得久
- 为什么"无 overlay 的 K8s 网络"是可能的——Calico 用 BGP 让 pod IP 在底层网络里就可路由
- 为什么 K8s 官方 NetworkPolicy 长那个样子——最早一版规范就是 Tigera 主导写的
- 为什么同一个产品既能跑"传统 iptables 数据面"又能跑"eBPF 数据面"——Calico 在 [[cilium]] 火起来之后做的对位升级

## 核心要点

1. **BGP 把 pod 当一等公民**：每个节点跑一个 BIRD（轻量 BGP 实现）守护进程，把节点上分到的 pod CIDR 段作为路由广播给其它节点或机房路由器。pod-to-pod 流量走的就是普通 IP 路由，没封装。类比：每户挂真实门牌，快递直送，不进小区中转站。

2. **Felix 是数据面编排器**：每节点一个 felix agent，监听 K8s API → 把 NetworkPolicy / Service 翻译成 iptables 规则（默认）或 IPVS 规则或 eBPF 程序（新模式）。这一层是"控制面 → 数据面"的翻译官，跟 [[cilium]] 的 cilium-agent 角色对应。

3. **三种数据面可选**：iptables（默认、最稳）、eBPF（新、性能接近 [[cilium]]）、Windows HNS（少见但支持）。同一控制面、不同执行后端，这是 Calico 跟 [[cilium]] 最大的工程差异——后者只有 eBPF 一条路。

4. **etcd 还是 Kubernetes 当后端都行**：Calico 控制面状态可以存在自己的 etcd 集群里，也可以直接落到 K8s API（CRD）。早期非 K8s 场景（OpenStack / 裸机）走 etcd；K8s 场景默认走 CRD。两套数据模型实际是同一份 schema 的两种存储后端。

## 实践案例

### 案例 1：装一个最小 Calico

```bash
kubectl apply -f https://raw.githubusercontent.com/projectcalico/calico/v3.27.0/manifests/calico.yaml
# 默认开 IPIP overlay（兼容性最好）
# 想关 overlay 走纯 BGP：改 IPPool 的 ipipMode: Never + vxlanMode: Never
```

装完每个节点会出现一个 `calico-node` pod，里面跑 BIRD + Felix。`calicoctl node status` 能看到 BGP peer 列表，类似路由器看 OSPF 邻居。

### 案例 2：写一条 GlobalNetworkPolicy

K8s 原生 NetworkPolicy 只能限 namespace 内，跨 namespace 的全局规则没法写。Calico 自己扩展了 GlobalNetworkPolicy：

```yaml
apiVersion: projectcalico.org/v3
kind: GlobalNetworkPolicy
metadata:
  name: deny-egress-to-metadata
spec:
  selector: all()
  egress:
  - action: Deny
    destination:
      nets: [169.254.169.254/32]
```

效果：全集群所有 pod 都禁止访问 AWS 元数据 endpoint——避免被攻破后偷 IAM 凭证。这种"集群级别红线"K8s 原生写不出来。

### 案例 3：切到 eBPF 数据面

```bash
kubectl patch felixconfiguration default \
  --type=merge -p '{"spec":{"bpfEnabled":true}}'
```

切完之后 service 转发从 iptables DNAT 变成 eBPF map 查表，O(n) → O(1)，能把 kube-proxy 也省掉。但需要内核 ≥ 5.3，且 Felix 会重新挂载 eBPF program，连接可能瞬断——必须 rolling。

### 案例 4：用 calicoctl 看 BGP 邻居

```bash
calicoctl node status
# IPv4 BGP status
# +---------------+-------------------+-------+----------+-------------+
# |  PEER ADDRESS |     PEER TYPE     | STATE |  SINCE   |    INFO     |
# +---------------+-------------------+-------+----------+-------------+
# | 10.0.0.2      | node-to-node mesh | up    | 03:14:52 | Established |
# | 10.0.0.3      | node-to-node mesh | up    | 03:14:55 | Established |
```

每个节点跟其它节点之间都是一对 BGP session（full mesh）。规模过 50 节点要切 route reflector 模式，否则 N² 个 session 会先压垮 BIRD。

## 踩过的坑

1. **BGP peering 跟物理网络耦合**：纯 BGP 模式（无 overlay）需要机房交换机支持 BGP 邻居，或所有节点二层互通。云上托管 K8s（EKS/GKE）二层不通，多数情况只能开 IPIP/VXLAN——退化成 overlay 派。
2. **iptables 规则爆炸**：默认数据面下，每个 NetworkPolicy 都翻译成多条 iptables。集群规模上去后 `iptables-save` 输出几十万行，felix 同步一次几十秒，新策略生效慢。
3. **Pod CIDR 跟办公网撞**：默认 192.168.0.0/16 经常跟公司内网冲突，装之前必须改 IPPool。撞了之后 pod 出公司 VPN 全断，回滚要重建集群。
4. **eBPF 模式跟旧版本不能混跑**：节点级开关，集群里一半 BPF 一半 iptables 时跨节点策略可能漏判。升级前要么全切要么全不切。
5. **Tigera Operator vs manifest 两套部署**：官方文档同时存在两条安装路径。新部署用 operator（v3.20+ 推荐），老集群多数还是 manifest。混用会出现 CR 冲突。

## 适用 vs 不适用场景

适用：
- 自建机房 K8s，机房交换机支持 BGP，想要"无 overlay、原生路由"的极简栈
- OpenShift / RKE / kops 默认部署，跟着发行版走最省心
- 已有大量 iptables NetworkPolicy 的存量集群，迁移到 [[cilium]] 成本高
- 需要 GlobalNetworkPolicy / HostEndpoint（保护节点本身而不只是 pod）这类企业网络策略

不适用：
- 公有云托管 K8s，二层不通 BGP 用不上，跟其它 overlay CNI 比没特别优势
- 集群规模 > 5000 节点 + 高频策略变更——iptables 数据面会先崩；要么切 eBPF 要么换 [[cilium]]
- 需要深度 L7 策略 + 流量可视化（HTTP/Kafka 解析、拓扑图）——Calico 在这块明显落后 Cilium 的 Hubble
- 团队完全没人懂 BGP——出问题排查门槛高（路由环路、AS path 异常这些）

## 历史小故事（可跳过）

- 2014：Metaswitch 在伦敦做电信级网络栈出身，把"BGP 应用到云"的思路抽出来开源 Project Calico v0.x。
- 2016：Tigera 从 Metaswitch 拆分独立，全职做 Calico，同年给 K8s 提 NetworkPolicy 草案。
- 2017：K8s 1.7 NetworkPolicy GA，Calico 是第一个完整实现的 CNI。
- 2018：Calico v3.0 大重构，引入 calicoctl + Operator 雏形。
- 2020：[[cilium]] 凭 eBPF 高速崛起，Calico 启动 eBPF 数据面项目对位。
- 2022：Calico v3.24 eBPF 模式 GA，跟 Cilium 在数据面层面抹平差距，但生态体量已经被反超。
- 2024：Tigera 发布 Calico Open Source 3.28，主打"BGP + eBPF 双模"是市面唯一。

## 学到什么

- 一个开源项目能活十年靠"早 + 稳"——Calico 不是技术最炫，但发行版默认装它，存量基数巨大。
- 数据面可插拔（iptables / eBPF / Windows）的代价是控制面要做翻译层抽象——Felix 这层是 Calico 不容易被替代的核心。
- 跟着标准走会反过来塑造你——Calico 因为参与了 NetworkPolicy 设计，所有 CNI 都得兼容它的语义，是隐形护城河。
- 选型不只看技术——团队懂不懂 BGP、机房支不支持 peering、是不是托管 K8s，比"哪个性能更强"更决定你能不能用 Calico。

## 延伸阅读

- 官方文档 docs.tigera.io —— Concepts → Networking 那一章讲 BGP 模式 vs Overlay 模式怎么选
- 《Kubernetes Networking and Cilium》对比章节 —— 把 Calico / [[cilium]] / [[flannel]] / weave 横向比一遍
- Tigera blog 上的 Felix architecture 系列 —— 想搞懂 Calico 数据面翻译流程
- BGP 入门：RFC 4271 + Cumulus 的 BGP in Data Center 白皮书 —— 不懂 BGP 看 Calico 等于看天书
- [[kubernetes]] —— Calico 几乎只在 K8s 里部署
- [[cilium]] —— Calico 当前最大的对位竞品

## 关联

- [[kubernetes]] —— Calico 的宿主，CNI 接口就是 K8s 定义的
- [[cilium]] —— 同生态最强对手，eBPF-first vs Calico 的多数据面策略
- [[envoy]] —— Calico 不内置，但 L7 场景可以跟它配合（不如 Cilium 紧密）
- [[kubebuilder]] —— Tigera Operator 用它生成 CRD 控制器
- [[prometheus]] —— Felix 暴露 metrics endpoint 给 Prometheus 抓

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[cilium]] —— Cilium — 用 eBPF 把 K8s 网络从 iptables 时代搬出来
- [[envoy]] —— Envoy — 把网络通信从业务代码里抠出来的代理进程
- [[kubebuilder]] —— Kubebuilder — 写 K8s Operator 的官方脚手架
- [[kubernetes]] —— Kubernetes — 容器编排平台
- [[prometheus]] —— Prometheus — 时序监控系统

