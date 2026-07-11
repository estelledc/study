---
title: Andromeda — Google Cloud 网络虚拟化的高速通道
来源: 'Dalton et al., "Andromeda: Performance, Isolation, and Velocity at Scale in Cloud Network Virtualization", NSDI 2018'
日期: 2026-06-01
分类: 网络系统
难度: 中级
---

## 是什么

Andromeda 是 Google Cloud 把**云上的网络**做出来的那套软件。日常类比：你在 Google Cloud 开一台 VM，登进去一看好像有自己的内网、自己的防火墙、自己的子网——其实物理上并没有这些电缆。它们都是宿主机上一段叫 Andromeda 的程序"伪装"给你看的。

你以为自己在用网线，其实是软件在替你转发每一个数据包。Andromeda 要做的事就一句话：**让这种伪装跑得跟真的一样快、加新功能时不能掉包、控制面不能爆炸**。

这篇 NSDI 2018 论文是 Google 把这个系统从 2014 年做到 2018 年的工程总结。

## 为什么重要

不理解 Andromeda（以及它的同类 AWS VPC、Azure VFP），下面这些事就解释不了：

- 为什么在 GCP 开两台 VM，能配出"它俩在同一个 192.168 子网"——物理上它们可能跨整个数据中心
- 为什么云厂商敢说"VM 之间 32 Gbps 吞吐"——一台普通服务器的网卡也就 25/40 Gbps
- 为什么云上的防火墙规则改了**马上生效**，不需要重启网络
- 为什么云厂商升级网络组件时你的 VM 不会断连——传统软件升级是要停机的

这些"看起来理所当然"的体验，背后是 Andromeda 这类系统在替你扛。

## 核心要点

Andromeda 把整个系统拆成 **三层抽象**，每一层对应一个具体问题：

1. **控制面（Control Plane）**：谁来告诉每台宿主机"该把这个包送到哪台机器"。问题：几十万台 VM，路由表加起来几个 GB，不能全发到每台机器。
2. **数据面（Data Plane）**：包真的来了之后**怎么以最小开销转走**。问题：用通用 CPU 跑软件转发，性能怎么追上专用硬件。
3. **升级机制（Hitless Upgrade）**：怎么在 VM 流量正在流的时候**换掉转发程序自己**。

三层各有一招杀手锏：

- 控制面用 **Hoverboard 模型**——默认路由先走集中网关，热流再下发到点对点
- 数据面用 **Fast Path + Coprocessor Path** 分层——快路径只做最小包头查表，慢路径处理防火墙等复杂逻辑
- 升级用 **状态迁移 + 一秒内切换**——旧版本把流表交给新版本，再退出

## 实践案例

### 案例 1：Hoverboard 是怎么省状态的

设想你在 GCP 有一万台 VM，理论上任意两台都可能通信。最朴素的做法：每台宿主机都装一份"一万 × 一万"的路由表。这吃内存吃到爆。

Andromeda 的观察：**90% 以上的 VM 对从来不互相通信**。所以默认路由表是空的，新流量先送到一个叫 Hoverboard 的中央网关。网关一边转发一边告诉控制面"这两台 VM 在通话"，控制面才把直连路由下发到这两台宿主机。

类比：城市公交。默认所有人去市中心换乘（Hoverboard），等系统发现「天通苑到中关村每天 5000 人」，才专门开一条直达班车。

### 案例 2：Fast Path 是怎么逼近硬件速度的

数据包到一台宿主机后，Andromeda 让它经过两条路径之一：

- **Fast Path**：跑在一颗专用 CPU 上，循环里只做"查 flow cache → 改包头 → 发出去"，几乎不碰内存。处理高 PPS 流量（PPS = packets per second，每秒包数）。
- **Coprocessor Path**：跑通用包处理逻辑（防火墙规则、计费、加密、负载均衡）。慢，但功能丰富。

第一个包走 Coprocessor 建立"决策"，写进 fast path 的 flow cache。后续同 flow 的包就由 fast path 直接转发，不再打扰 coprocessor。

效果：**32.8 Gbps、12.2 微秒 RTT**（RTT = round-trip time，一个包来回的时间），跟专用网卡硬件已经在同一个数量级。

### 案例 3：Hitless Upgrade 怎么做到不掉包

最神奇的部分。Andromeda 数据面平均**几周升级一次**——加新功能、修 bug、改性能。如果每次都让 VM 断连，没人敢用云。做法：

1. 新版本数据面进程在旁边起来，从旧版本拿一份 flow 状态副本
2. 旧版本停止接新流，把已有流表"交接"给新版本
3. 控制面把数据通路切到新版本（毫秒级）
4. 旧版本退出

整个过程对 VM 内的程序而言，看到的只是一个**几百毫秒的小停顿**——TCP 自己就能扛过去，不会断连。

类比：高速公路施工不能直接拦路，得在旁边先修一条新车道，把车流引过去再拆旧的。

## 踩过的坑

1. **Coprocessor 路径性能差**：早期版本所有包都走 coprocessor，被防火墙规则数量拖垮。引入 fast path + flow cache 才把 PPS 拉上去。

2. **Hoverboard 不能太集中**：第一版 Hoverboard 是少数几台机器，热点 VM 的流量打爆它。后来改成区域分布、按 VM 哈希分配。

3. **流表 cache 失效风暴**：防火墙规则一改，所有 cached flow 要重新决策，瞬间几百万次 coprocessor 调用。需要做增量失效，不要一刀切清空。

4. **升级时丢 ICMP / 短连接**：纯 TCP 流量能扛过几百毫秒切换，但短连接（DNS 查询、ICMP）有概率丢。论文承认这个 tradeoff——他们选择"不可能 100% 无感，但 TCP 长连接 100% 无感"。

5. **Fast path 的 flow cache 是有限的**：超大规模 burst 流量（比如 DDoS）会把 cache 撑爆，新流被迫退到 coprocessor 慢路径。需要专门的 admission control 决定哪些 flow 配上 fast path 资源。

6. **观测性比单机网络栈难得多**：包从 VM 出发到对端 VM，中间经过 hoverboard / fast path / coprocessor 多层软件，传统 tcpdump 看不到这些环节。Andromeda 内部建了套专属 tracing 才能定位"为什么这条流变慢了"。

## 适用 vs 不适用场景

**适用**：

- 公有云的多租户网络虚拟化（VPC、安全组、负载均衡）
- 控制面状态量远大于数据面常驻状态的系统
- 需要频繁加功能但不能停机的网络服务
- 一份代码同时服务"少数热流" 和 "海量冷流"
- 数据面更新频率高于硬件迭代周期，软件的灵活性比硬件极限更值钱的场景

**不适用**：

- 单租户、规模固定的传统数据中心——overhead 不值
- 对延迟极端敏感的场景（HFT、HPC）——专用硬件如 RDMA 仍不可替代
- 需要硬件级隔离（强合规）→ AWS Nitro 那种"专用 ASIC + Hypervisor 卸载"路线更合适
- 控制面拓扑剧变频繁（无线网络）——Hoverboard 的"默认 + 按需下发"假设站不住
- 流量分布均匀、几乎所有节点对都通信——Hoverboard 的稀疏假设彻底失效，路由表反而该全量下发

## 历史小故事（可跳过）

- **2007 年**：Amazon EC2 第一次让人用云上 VM，但网络是直接桥接到物理 VLAN，扩展性差
- **2009 年**：OpenFlow 论文发表，"控制面和数据面分开" 的思想第一次有标准协议
- **2014 年**：Google 内部 Andromeda 1.0 上线，第一代用 Open vSwitch 改造
- **2016 年**：Andromeda 2.0 引入 Fast Path 与 Coprocessor 分层，正是论文图表数据所基于的版本
- **2018 年**：NSDI 这篇论文发表 Andromeda 2.x，Hoverboard 和 Fast Path 都是这一代加进来的
- **2020 年后**：行业里对应的工业系统是 AWS Nitro（硬件卸载路线）和 Azure VFP（论文 NSDI 2017）

三家云厂商的网络虚拟化路线分化很有意思：Google 走"全软件 + 极致优化"，AWS 走"专用硬件卸载"，Azure 走"可编程 NIC + 软件流表"。各有各的取舍。Google 这条路的赌注是"软件迭代速度比硬件设计周期更值钱"——加新协议、修安全漏洞，软件都能在几周内全网发车，硬件方案得等下一代板卡。

时至今日，Cilium、OVN、Calico 这些开源云原生网络项目都在不同程度上复用 Andromeda 的设计——尤其是"控制面下发流表 + 数据面 fast/slow 分层 + 状态可热迁移"这套模式。

## 学到什么

1. **状态量是分布式系统的根本约束**——能不能装下决定能不能扩。Hoverboard 是「默认稀疏 + 按需稠密」的经典实现
2. **快慢分离是性能工程通用招式**——CPU 缓存、JIT、CDN 边缘缓存都是这个思路的变体
3. **网络也能"热升级"**——不是说不可能，而是要把状态显式建模、显式迁移
4. **公有云的网络是软件**，物理网卡不再决定上限——但软件的可观测性和热升级反而成了更难的问题
5. **80/20 不是借口**：90% 的 VM 对从不通信这个事实，是 Hoverboard 模型的根基。承认负载有强偏斜，比假装一切流量同质化要诚实
6. **测性能要有诚实的对照**：论文里 32.8 Gbps 的对照组是"什么都不做的最简转发"，方便读者校准期望，不是拿一个被刻意做差的 baseline 充数

## 延伸阅读

- 论文 PDF：[Dalton et al. 2018](https://www.usenix.org/conference/nsdi18/presentation/dalton)（17 页，密度高但工程细节扎实）
- 同期工作：[Azure VFP NSDI 2017](https://www.usenix.org/conference/nsdi17/technical-sessions/presentation/firestone)（微软的对照系统，重点对比 hoverboard vs match-action 表）
- AWS Nitro 公开资料：re:Invent 2018 演讲（讲专用硬件卸载路线，回答"为什么 AWS 不走 Andromeda 的全软件路线"）
- 入门教程：搜 SDN / Network Function Virtualization (NFV)，先把"控制面 vs 数据面"讲清楚再读 Andromeda
- 工业实践：Cilium 项目用 eBPF/XDP 实现的 Kubernetes 网络，可以视作 Andromeda 思想的开源对照实现

## 关联

- [[vl2-2009]] —— 数据中心扁平网络的早期论文，Andromeda 站在它的肩膀上
- [[vfp-2017]] —— Azure 的同类系统，对照阅读最好
- [[ebpf]] —— Linux 内核里的"快路径"思想，今天很多 cloud SDN 用 eBPF/XDP 替代 Andromeda 的 fast path
- [[dpdk]] —— 用户态高速包处理库，Andromeda fast path 的技术基础之一
- [[openflow]] —— 控制面与数据面分离的标准协议，Andromeda 的精神先驱
- [[aws-nitro]] —— 同类问题的硬件卸载路线，正好和 Andromeda 全软件方案形成对照
- [[load-balancer-maglev]] —— Google 自家的 L4 负载均衡器，常被部署在 Andromeda 网络之上
- [[bgp-routing]] —— 跨数据中心仍然用 BGP；Andromeda 解决的是数据中心**内部**的虚拟化层
- [[rdma-roce]] —— 对延迟敏感场景常绕开 Andromeda 直接用 RDMA，正是 fast path 也比不过的领域

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
