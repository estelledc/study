---
title: WireGuard — 4000 行代码重写 VPN 的极简主义
来源: 'Jason A. Donenfeld, "WireGuard: Next Generation Kernel Network Tunnel", NDSS 2017'
日期: 2026-06-24
分类: 网络协议
难度: 中级
---

## 是什么

WireGuard 是一个运行在 Linux 内核里的 VPN 隧道协议，只用大约 4000 行 C 代码就实现了传统 VPN（OpenVPN 约 10 万行、IPsec/StrongSwan 约 40 万行）的核心功能。日常类比：传统 VPN 像配了几百个按钮的老式仪表盘飞机——功能全但没人敢审计每个开关；WireGuard 像只有方向盘和油门的卡丁车——零件少到谁都能看完，反而更难出事。

它在 2020 年正式合并进 Linux 5.6 内核主线，现在是大多数 Linux 发行版开箱可用的 VPN 方案；macOS / Windows / iOS / Android 则多用用户态实现（wireguard-go），配置格式与内核版一致。

核心设计目标三条：容易正确实现、容易安全审计、高性能。三者互相强化——代码少所以跑得快（缓存友好）、代码少所以审计快、审计快所以能保证正确。

## 为什么重要

- 代码量少 = 可审计面小。4000 行让形式化验证变得可行（后续确有 CryptoVerif 机械化证明）
- 论文基准下，内核态 + ChaCha20Poly1305 的吞吐与延迟显著优于典型用户态 OpenVPN
- 配置极简：一个接口 = 一个私钥 + 一组 peer 公钥 + 允许的 IP，十几行配置就完事
- 设计哲学影响后来者：Tailscale、Cloudflare WARP、Netbird 等产品都构建在 WireGuard 之上

## 核心要点

**1. Cryptokey Routing（加密密钥路由）**

传统路由是「目标 IP → 下一跳网口」；WireGuard 是「目标 IP → peer 的公钥」。发包查公钥决定用谁的密钥加密；收包从解密成功的密钥反查身份。路由和认证合二为一。类比：信箱上贴着锁，能打开锁就证明邮递员是对的人，不必另查工牌。

**2. Noise 握手（固定套件）**

用 Noise_IKpsk2（Trevor Perrin 的 Noise 框架的一种模式）做密钥协商。整个握手只要 1-RTT（一来一回）。DH（双方各出一把「半钥匙」合成共享秘密）用 Curve25519；哈希用 BLAKE2s；AEAD（加密同时验真伪）用 ChaCha20Poly1305。密码原语不可协商——没有「选套件」步骤，也就没有降级攻击面。对比 TLS 1.2 常要 2-RTT 还要协商套件，中间人可能伪造「我只支持最弱的」。

**3. 内核态 Layer 3 隧道**

WireGuard 表现为普通网卡（如 wg0），只处理 Layer 3（IP 包这一层），用 UDP 封装发出。Linux 内核实现的数据路径不经过用户态加解密进程，可直接接 iptables、路由表、network namespace。不用 TCP 封装，是为了避免 TCP-over-TCP 重传叠加（OpenVPN TCP 模式的经典坑）。

## 实践案例

### 场景 1：两台服务器建隧道

```bash
# 服务器 A（10.0.0.1）——先放行 UDP 51820
wg genkey | tee privatekey_a | wg pubkey > publickey_a
ip link add wg0 type wireguard
wg set wg0 private-key ./privatekey_a
wg set wg0 listen-port 51820
wg set wg0 peer <B公钥> \
  allowed-ips 10.0.0.2/32 \
  endpoint B_IP:51820
ip addr add 10.0.0.1/24 dev wg0
ip link set wg0 up

# 服务器 B（10.0.0.2）——对称镜像
wg genkey | tee privatekey_b | wg pubkey > publickey_b
ip link add wg0 type wireguard
wg set wg0 private-key ./privatekey_b
wg set wg0 listen-port 51820
wg set wg0 peer <A公钥> \
  allowed-ips 10.0.0.1/32 \
  endpoint A_IP:51820
ip addr add 10.0.0.2/24 dev wg0
ip link set wg0 up
# 两边防火墙放行 UDP 51820 后：在 A 上 ping 10.0.0.2
```

**逐部分解释**：

- `private-key`：本机身份（私钥），对应公钥交给对端
- `peer` + 公钥：指定「信谁」
- `allowed-ips`：哪些目标 IP 走这条隧道（Cryptokey Routing 的表项）
- `endpoint`：对端当前公网地址与端口
- `listen-port`：本机收 UDP 的端口（默认常写 51820）

对比 OpenVPN：生成 CA → 签服务器/客户端证书 → 写 `.ovpn` → 配转发，光证书就够新手折腾一下午。

### 场景 2：笔记本漫游（Wi-Fi ↔ 4G）

1. 发生了什么：笔记本从 Wi-Fi 切到 4G，公网 IP 变了。
2. 协议怎么反应：endpoint 定义为「最后一次收到合法包的来源」；下一包能解密成功就自动更新 endpoint，不必重握手、也不必单独保活会话。
3. 你看到什么：上层 SSH / 视频通话不断线——地铁里 Wi-Fi 与蜂窝反复切换时体验最明显。

### 场景 3：K8s 节点间 overlay 加密

跨节点 Pod 流量默认不加密。Calico、Cilium 等 CNI 可内置开启 WireGuard：

```yaml
# Calico 开启 WireGuard
apiVersion: projectcalico.org/v3
kind: FelixConfiguration
metadata:
  name: default
spec:
  wireguardEnabled: true
```

1. 发生了什么：打开开关后，CNI 给每个节点自动配 peer 关系。
2. 协议怎么反应：跨节点包自动进入加密隧道，业务 Pod 无感。
3. 你看到什么：业务 YAML 几乎不变，节点间多了一层透明加密。

## 踩过的坑

1. **没有内建密钥分发**：公钥怎么安全送到对端要自己管；大规模部署需 Tailscale 控制面或自建 API，别误以为「配完就安全」。
2. **不可协商套件是双刃剑**：若 Curve25519 被攻破，不能像 TLS 换套件了事，需要协议版本升级（作者设想 WireGuard v2）。
3. **IP 与身份绑定**：Cryptokey Routing 要求事先配 allowed-ips；想做任意 IP 匿名中继反而不合适。
4. **NAT 超时**：UDP 在企业防火墙上可能被清表项；需 PersistentKeepalive（如每 25 秒），但会暴露流量节奏。

## 适用 vs 不适用场景

**适用**：

- 服务器 site-to-site、远程办公接入、容器 overlay 加密、对延迟敏感的 VPN
- 点对点或小规模 mesh（peer 通常几十以内可手配）；更大规模需外置密钥分发

**不适用**：

- 要匿名性（用 Tor）——不隐藏双方身份
- 只能走 TCP/HTTP 代理的网络——WireGuard 只用 UDP
- 合规要求可协商特定算法、或需要内建 PKI/证书吊销的企业环境

## 历史小故事（可跳过）

- 审计出身的 Jason Donenfeld 在审 OpenVPN / IPsec 时被代码量与历史包袱震惊——协商逻辑、兼容补丁、状态机分支让安全分析几乎无法穷尽
- 他问：若今天从零设计 VPN，在已有现代密码学原语前提下，最少需要多少代码？答案约 4000 行
- 2017 年论文发表于 NDSS
- Linus Torvalds 在邮件列表称其相对 OpenVPN / IPsec「a work of art」，并希望尽快合入主线
- 2020 年 3 月正式进入 Linux 5.6——从学术论文到全球部署，速度很快

## 学到什么

1. **极简是一种安全策略**：代码越少，攻击面越小，可审计性越高
2. **不可协商 ≈ 不可降级**：固定套件消掉整类降级攻击；与 TLS 1.3 削减可选套件的方向一致（并行演进，非因果）
3. **路由与认证统一**：Cryptokey Routing 用一张表同时回答「发给谁」和「信不信」
4. **内核数据路径省掉用户态往返**：每个包少两次上下文切换，是相对用户态 VPN 的关键性能差来源之一

## 延伸阅读

- [WireGuard 白皮书 PDF](https://www.wireguard.com/papers/wireguard.pdf)
- [Noise Protocol Framework](http://noiseprotocol.org/noise.html)
- [Tailscale 如何在 WireGuard 上建控制面](https://tailscale.com/blog/how-tailscale-works)
- [CryptoVerif 对 WireGuard 的形式化证明](https://hal.inria.fr/hal-02100345)
- [Linus 邮件列表评价](https://lists.openwall.net/netdev/2018/08/02/124)

## 关联

- [[diffie-hellman]] —— 握手的数学基础，Curve25519 是 ECDH 的一种
- [[tls-1.3]] —— 同向的「砍功能提安全」协议设计，场景不同
- [[quic]] —— 同样 UDP、追求低延迟，但解决传输层而非隧道
- [[cryptoverif-2008]] —— WireGuard 握手后来被形式化证明
- [[bbr-2017]] —— 同年网络论文：BBR 管拥塞、WireGuard 管隧道加密
- [[ebpf]] —— 常与 WireGuard 配合做流量策略的内核工具
- [[saltzer-1984-e2e]] —— 端到端原则：加密放在端点而非中间设备

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[chaum-1981-mix]] —— Mix Network — 用信封套信封让邮局也不知道谁寄给谁
- [[cryptoverif-2008]] —— CryptoVerif — 让计算机直接证密码协议在真实计算模型下安全
- [[diffie-hellman]] —— Diffie-Hellman 密钥交换
- [[ebpf]] —— eBPF — 用户写小程序，内核证明安全后再跑
- [[openwrt]] —— OpenWrt — 把家用路由器变成 Linux 服务器
- [[quic]] —— QUIC — 把可靠传输从内核搬到用户空间
- [[saltzer-1984-e2e]] —— End-to-End Arguments — 把功能尽量推到端上做
