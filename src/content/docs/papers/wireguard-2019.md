---
title: "WireGuard: Next Generation Kernel Network Tunnel"
来源: https://www.wireguard.com/papers/wireguard.pdf
日期: 2026-06-13
分类: 网络协议
子分类: networks
provenance: pipeline-v3
---

## 是什么

WireGuard 是一个极简的现代 VPN（虚拟专用网络）隧道协议，于 2019 年正式发表学术论文。它被 Linux 内核 5.6 版本直接采纳为内置模块，是目前最快、最简单的 VPN 方案之一。

**日常类比**：想象你要把两栋楼之间修一条秘密通道。传统 VPN（如 OpenVPN）就像先签一份几十页的合同、核对双方身份证、交换加密证书、协商用哪种锁——整个过程可能花好几秒。WireGuard 的做法是：双方提前交换好一把钥匙，见面时说一句话就能打通通道，之后所有通信都用这把钥匙加密。整个协议的核心代码不到 4000 行，而 OpenVPN 有超过 10 万行。

## 为什么重要

- Linux 内核自 5.6 起原生支持，无需安装第三方软件
- 性能远超传统 VPN：内核级实现可达 10 Gbps 吞吐量
- 配置极简：只需共享公钥和允许的路由范围即可建立连接
- 密码学选择"固执"（opinionated）：不提供算法协商，减少安全漏洞面
- 学术与工程结合的典范：论文只有几页，但每一行都有对应的工程实现

## 核心概念

### 1. 密钥体系：四种密钥各司其职

WireGuard 使用四种密钥，每种有明确职责：

| 密钥类型 | 用途 | 生命周期 |
|----------|------|----------|
| 静态私钥 (Static Private Key) | 标识身份，用于握手的第一步 DH 计算 | 长期不变 |
| 临时私钥 (Ephemeral Private Key) | 每次握手生成新的，提供前向保密 | 每次握手更换 |
| 预共享密钥 (PSK, Optional) | 额外一层保护，抗量子计算威胁 | 长期不变 |
| 会话密钥 (Session Keys) | 实际加密数据包的对称密钥 | 每 3 分钟或 2^64 包轮换 |

**类比**：静态私钥是你的身份证号码（不变），临时私钥是每次见面用的暗号（换），会话密钥是当天聊天用的加密字典（定期换）。

### 2. 握手协议：Noise IKpsk2

WireGuard 使用 Noise 协议框架的 **IKpsk2** 模式，仅需两条消息完成握手：

**第一条消息（客户端 → 服务器）**：
```
1. 客户端生成临时密钥对 (e_priv_i, e_pub_i)
2. 计算 DH(responder_static_pub)         → 得到密钥 K1
3. 计算 DH(e_priv_i, responder_static_pub) → 得到密钥 K2
4. 混入 PSK（如果有）                       → 得到密钥 K3
5. 派生出会话密钥 (T_send, T_recv)
6. 发送: (e_pub_i, 加密(static_pub_i), 加密(timestamp))
```

**第二条消息（服务器 → 客户端）**：
```
1. 服务器生成临时密钥对 (e_priv_r, e_pub_r)
2. 计算 DH(initiator_static_pub)          → 得到密钥 K4
3. 计算 DH(e_priv_r, initiator_static_pub) → 得到密钥 K5
4. 混入同样的 PSK                           → 得到密钥 K6
5. 派生出同样的会话密钥 (T_send, T_recv)
6. 发送: (e_pub_r, 加密(empty), cookie?)
```

握手完成后，双方拥有相同的会话密钥，可以立即开始传输数据。**全程只需 1-RTT（一次往返）**，而传统的 IKEv2（IPsec 的密钥交换协议）需要四条消息。

### 3. 数据包格式：极简加密帧

每个 WireGuard 数据包的结构如下：

```
| Type (4字节) | Reserved (4字节) | Receiver Index (4字节) | Counter (8字节) | 加密数据 + 认证标签 (16字节) |
```

- **Type**：表示这是握手包还是数据包
- **Receiver Index**：告诉对方"我是哪个 peer"，用数字代替 IP，更简洁
- **Counter**：单调递增的序号，用于防重放攻击（防止黑客截获旧包重新发送）
- **加密数据**：使用 ChaCha20 流密码加密
- **认证标签**：Poly1305 生成的 MAC，确保数据未被篡改

### 4. 防重放与 Cookie 机制

**防重放攻击**：每个数据包携带递增计数器，接收方维护一个窗口，只接受窗口内的新计数器值。旧的、重复的包直接丢弃。

**Cookie 反 DoS**：当服务器遭受大量握手请求时，它会向客户端发送一个加密的 Cookie。客户端必须在下次握手时附带这个 Cookie，服务器才能处理。这防止了攻击者用伪造 IP 地址发动握手洪水攻击。

## 代码示例

### 示例 1：WireGuard 配置文件

WireGuard 的配置极其简洁，一个典型的客户端配置如下：

```ini
[Interface]
# 本机的私钥（生成命令: wg genkey > private.key）
PrivateKey = aBcDeFgHiJkLmNoPqRsTuVwXyZ1234567890abcdefABCDEF=

# 本机虚拟网卡的 IP 地址
Address = 10.200.0.2/32

[Peer]
# 服务器的公钥（生成命令: wg pubkey < server-private.key）
PublicKey = XyZ1234567890aBcDeFgHiJkLmNoPqRsTuVwXyZ=

# 服务器的公网地址和端口
Endpoint = vpn.example.com:51820

# 允许通过隧道转发的 IP 范围（路由规则）
AllowedIPs = 0.0.0.0/0

# 每隔 25 秒发送 keepalive 包，维持 NAT 映射
PersistentKeepalive = 25
```

对应的服务端配置：

```ini
[Interface]
PrivateKey = ServerPrivateKeyHere1234567890abcdefABCDEF=
Address = 10.200.0.1/24
ListenPort = 51820

[Peer]
# 客户端 A
PublicKey = ClientAPublicKeyHere1234567890abcdefABCDEF=
AllowedIPs = 10.200.0.2/32

[Peer]
# 客户端 B
PublicKey = ClientBPublicKeyHere1234567890abcdefABCDEF=
AllowedIPs = 10.200.0.3/32
```

注意：`AllowedIPs` 决定了哪些流量走隧道。`0.0.0.0/0` 表示所有流量都经过 VPN（全量代理），`10.200.0.0/24` 表示只有内网流量走隧道（部分代理）。

### 示例 2：wg 命令行操作

```bash
# 1. 生成密钥对
wg genkey | tee client-private.key | wg pubkey > client-public.key
wg genkey | tee server-private.key | wg pubkey > server-public.key

# 2. 查看当前配置（相当于 ifconfig 但针对 WireGuard）
wg show

# 3. 从配置文件加载接口
wg-quick up wg0

# 4. 断开并卸载
wg-quick down wg0

# 5. 实时查看连接状态（包括最后一次握手时间、传输字节数）
wg show wg0 dump

# 6. 动态添加 peer（无需重启）
wg set wg0 peer <public-key> allowed-ip 10.200.0.5/32
```

### 示例 3：内核态 vs 用户态的数据流

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐     ┌─────────────┐
│  应用层       │     │ TCP/UDP 套接字 │     │  WireGuard   │     │  物理网卡     │
│  (浏览器等)   │────▶│  (内核 socket) │────▶│  内核模块     │────▶│  (eth0)     │
│              │     │              │     │  (wireguard.ko)│     │             │
└─────────────┘     └──────────────┘     └──────────────┘     └─────────────┘
                         ▲                        │
                         │                        ▼
                    DNS 解析              ChaCha20 加密
                                         Poly1305 认证
                                         Noise 握手
```

内核态实现的 WireGuard 直接将加密数据交给网卡驱动，没有用户态拷贝的开销。这就是它比 OpenVPN（工作在用户空间）快 5-10 倍的原因。

## 核心密码学组件

WireGuard 选用的都是经过严格审查的现代密码学原语：

| 组件 | 算法 | 作用 | 为什么选它 |
|------|------|------|-----------|
| 密钥交换 | Curve25519 | 安全地共享密钥 | 快且安全，无弱参数风险 |
| 数据加密 | ChaCha20 | 加密数据包 | 软件实现快，不需要 AES-NI |
| 认证 | Poly1305 | 防止数据篡改 | 与 ChaCha20 配套，AEAD 模式 |
| 哈希 | BLAKE2s | 密钥派生和 HMAC | 比 SHA-256 快 3 倍 |
| 密钥派生 | HKDF | 从 DH 结果派生密钥 | 标准、可证明安全 |

## 与传统 VPN 对比

| 维度 | WireGuard | IPsec (IKEv2) | OpenVPN |
|------|-----------|---------------|---------|
| 代码行数 | ~4,000 | ~400,000 | ~100,000 |
| 握手消息数 | 2 条 (1-RTT) | 4 条 (2-RTT) | 4 条+ (TLS 1.2) |
| 算法选择 | 固定，不可协商 | 可协商（可能选弱算法） | 可协商（历史包袱） |
| 运行位置 | 内核态 | 内核态 | 用户态 |
| 配置复杂度 | 极低 | 高 | 中 |
| 吞吐量 | ~10 Gbps | ~5 Gbps | ~1 Gbps |

## 局限性

- **不支持算法协商**：无法使用国密算法（SM4/SM3），在中国等特定合规场景受限
- **NAT 穿透有限**：虽然支持 UDP hole punching，但在多层 NAT 下不如 ICE/STUN 成熟
- **认证机制简单**：仅依赖公钥认证，没有 PKI 证书体系的细粒度权限管理
- **路由功能有限**：不支持复杂的 BGP 路由策略，主要面向点对点或小规模组网

## 学到的东西

1. **越少越安全**：4000 行代码比 40 万行更容易审计，漏洞更少
2. **固执是一种美德**：固定密码学选择避免了降级攻击（Downgrade Attack）
3. **内核态是关键**：用户态到内核态的上下文切换是性能杀手
4. **学术与工程可以兼得**：简洁的论文 + 简洁的代码 = 简洁的系统

## 延伸阅读

- 原文：https://www.wireguard.com/papers/wireguard.pdf
- WireGuard 官网：https://www.wireguard.com
- Noise 协议框架：https://noiseprotocol.org/noise.html
- [[ice-rfc-5245]]
- [[tor-2004]]
