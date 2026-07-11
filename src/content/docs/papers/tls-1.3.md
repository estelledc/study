---
title: TLS 1.3 — 把 HTTPS 握手砍到一个来回
来源: 'Eric Rescorla, "The Transport Layer Security (TLS) Protocol Version 1.3", RFC 8446, IETF TLS Working Group, 2018'
日期: 2026-05-30
分类: 网络协议
难度: 中级
---

## 是什么

TLS 1.3 是**保护 HTTPS 流量的握手协议第二代大版本**。日常类比：你和银行柜员第一次见面，原来的流程是"出示身份证 → 等柜员核对 → 商量用哪种加密章 → 再签字"，要来回 4 趟；TLS 1.3 把这个过程压成"一上来就把身份证、加密章建议都摊在桌上"，柜员一次性回应，2 趟就开始办业务。

具体说，浏览器和服务器之间建立加密连接，TLS 1.2 时代要往返 2 次（2-RTT，约 200-600 毫秒），TLS 1.3 砍到 1 次（1-RTT），重连甚至 0 次（0-RTT，第一字节应用数据和握手一起发）。

它是 HTTP/2、HTTP/3、QUIC 的底层加密层。2023 年 Cloudflare 报告全球 70%+ 的 web 流量跑在 TLS 1.3 上。

## 为什么重要

不理解 TLS 1.3，下面这些事都没法解释：

- 为什么 HTTPS 网站近几年明显感觉变快——不只是带宽，是握手少了一个来回
- 为什么"前向安全"（forward secrecy）从可选变成强制——服务器私钥被偷也保护历史流量
- 为什么 BEAST / POODLE / Lucky 13 这串 TLS 漏洞名词在 1.3 之后突然不见了——CBC 模式整个被删掉
- 为什么 HTTP/3 / QUIC 不像 TCP+TLS 那样分两层做加密，而是直接把 TLS 1.3 嵌进去

## 核心要点

TLS 1.3 的设计可以拆成 **三个动作**：

1. **乐观握手（少一个来回）**：客户端不等服务器告诉自己用什么曲线，**直接在第一条消息里把 X25519 公钥塞进去**。猜对了（90%+ 场景）省一个来回，猜错了服务器让你换。这是协议层的"预测执行"。

2. **删除大于增加（攻击面缩小）**：TLS 1.2 有 300+ 种 cipher 组合，TLS 1.3 只剩 5 种 AEAD（AES-GCM / ChaCha20-Poly1305 / CCM）。RSA 静态密钥、CBC 模式、压缩、重协商、SHA-1 全部砍掉。类比："给厨房断舍离，留下的都是好刀"。

3. **HKDF 域分离（key 不串味）**：所有 key 从一个根 secret 派生，但每种用途（握手加密、应用加密、恢复连接）用**不同标签字符串**派生。类比：同一桶面粉，标签写 "馒头面" / "饺子面" / "面条面"，互不污染。

三个动作合在一起，就是"快 + 紧 + 干净"。

## 实践案例

### 案例 1：用 curl 看一次真实的 1-RTT 握手

```bash
curl -v --tls-max 1.3 https://www.cloudflare.com 2>&1 | grep -E 'TLS|SSL'
```

输出会有：

```
* SSL connection using TLSv1.3 / TLS_AES_256_GCM_SHA384
* Server certificate: ...
```

**逐部分解释**：

- `TLSv1.3`：协商出来的协议版本
- `TLS_AES_256_GCM_SHA384`：cipher suite，AEAD 是 AES-256-GCM，HKDF 用 SHA-384
- 注意没有"密钥交换算法"——TLS 1.3 把曲线协商挪到独立的 extension 里了

### 案例 2：用 openssl 命令行看握手细节

```bash
openssl s_client -tls1_3 -connect example.com:443 -msg 2>&1 | head -30
```

会打印每条握手消息的方向和长度。你会看到：`>>> ClientHello` → `<<< ServerHello, EncryptedExtensions, Certificate, CertificateVerify, Finished` → `>>> Finished`。

**关键观察**：从 ServerHello 之后，所有消息都是加密的（包括证书）。在 TLS 1.2 里证书是明文，被动监听者能看到你访问哪个网站。

### 案例 3：Python 客户端强制 TLS 1.3

```python
import ssl, socket

ctx = ssl.create_default_context()
ctx.minimum_version = ssl.TLSVersion.TLSv1_3   # 强制 1.3
ctx.maximum_version = ssl.TLSVersion.TLSv1_3

with socket.create_connection(("example.com", 443)) as sock:
    with ctx.wrap_socket(sock, server_hostname="example.com") as tls:
        print(tls.version())            # 'TLSv1.3'
        print(tls.cipher())              # ('TLS_AES_256_GCM_SHA384', ...)
```

`minimum_version` 是关键——老服务器若不支持 1.3，会直接抛 `SSLError` 而不是默默降级到 1.2。生产环境推荐这样写。

## 踩过的坑

1. **0-RTT 数据可以被重放**：攻击者抓到 ClientHello + early_data 包，可以重放给服务器。GET 请求重放浪费资源，POST 重放可能重复扣款。必须靠服务器 freshness check + 应用层 idempotency 双保险，**任何一侧漏开就出事**。

2. **middlebox 兼容模式是妥协**：早期 1.3 用真版本号 0x0304，被中间盒（企业防火墙 / 老路由器）当成异常包丢掉。最终方案：legacy_version 永远写 0x0303 假装 1.2，真版本藏进 supported_versions extension。这意味着 1.4 / 1.5 还会被同样的中间盒卡住。

3. **PSK 重连无 forward secrecy**：psk_ke 模式（纯 PSK）速度快但**没有前向安全**——服务器长期 PSK 泄露能解所有历史 0-RTT 数据。生产环境推荐 psk_dhe_ke 模式（PSK + (EC)DHE 混合），代价是慢一点。

4. **SNI 仍是明文**：TLS 1.3 加密了证书但没加密 SNI（server_name extension），被动监听仍能精确知道你访问哪个域名。ECH（Encrypted Client Hello）是后续扩展，2024-2025 才开始大规模部署。

## 适用 vs 不适用场景

**适用**：

- 公网 HTTPS / API 调用 / 跨数据中心 RPC：1-RTT 直接收益
- 移动网络（高延迟场景）：每省一个 RTT 都是 100-300 ms 体验提升
- HTTP/3 / QUIC 部署：TLS 1.3 是 RFC 9001 强制要求
- 内部 mTLS（双向认证）：psk_dhe_ke 模式有 PFS，比 1.2 安全模型更干净

**不适用**：

- 必须做企业 SSL 流量审计：1.3 强制 forward secrecy，传统中间人解密设备失效，需用 ETSI Enterprise TLS 或换审计架构
- 极端受限的 IoT 设备（< 64KB 内存）：1.3 库实现普遍比 1.2 大，可考虑 DTLS 1.3 + CCM-8 cipher
- 受 PCI-DSS / FIPS 历史合规约束的老系统：升级前先确认监管要求接受 1.3

## 历史小故事（可跳过）

- **1995-1999**：Netscape 设计 SSL 2.0 / 3.0，IETF 接手改名 TLS 1.0（RFC 2246）
- **2008**：TLS 1.2（RFC 5246）发布，之后 10 年被 BEAST、Lucky 13、POODLE、FREAK、Logjam、DROWN、ROBOT 等漏洞反复打补丁
- **2013**：Snowden 棱镜门曝光大规模流量监听，行业共识必须强制 forward secrecy
- **2014**：IETF TLS 工作组启动 1.3 立项，Hugo Krawczyk 提交 OPTLS 握手原型
- **2014-2018**：Eric Rescorla（Mozilla）主笔，经历 28 轮 draft，INRIA / Microsoft Research 用 ProVerif / F* 形式化验证协议安全性
- **2018-08**：RFC 8446 发布，主流浏览器和 CDN 几个月内全面切换
- **2021**：RFC 9001 把 TLS 1.3 嵌入 QUIC，成为 HTTP/3 底层

从 1.2 到 1.3 走了 10 年，但中间盒兼容性问题一度让 draft 卡了两年——协议演进的真正瓶颈不是 IETF 而是部署在全球的网络盒子。

## 学到什么

1. **删除可以是最大的安全升级**：TLS 1.3 删了 90% 历史包袱，攻击面比加新功能更有效地变小
2. **协议层也能做"预测执行"**：客户端乐观发 key_share 是软件优化思路在协议设计里的复用
3. **域分离比一个 secret 走天下安全**：HKDF 的 label 体系把 key 用途隔离，是密码协议设计的范式
4. **forward secrecy 必须强制**：可选的安全特性等于没有，1.2 时代允许 RSA 静态密钥就是历史教训

## 延伸阅读

- RFC 8446 原文：[TLS 1.3 标准](https://www.rfc-editor.org/rfc/rfc8446)（160 页，第 2 / 4 / 7 节是核心）
- RFC 5869：[HKDF 标准](https://www.rfc-editor.org/rfc/rfc5869)（理解 key 派生必读）
- Cloudflare 博客：[An Overview of TLS 1.3](https://blog.cloudflare.com/rfc-8446-aka-tls-1-3/)（实战部署经验）
- 视频：[Eric Rescorla — TLS 1.3 IETF 100 talk](https://www.youtube.com/results?search_query=TLS+1.3+Eric+Rescorla)（主笔人讲设计取舍）
- [[quic]] —— TLS 1.3 在 QUIC 中的嵌入实现
- [[tcp]] —— TLS 1.3 跑在 TCP 上的版本仍受 TCP 三次握手 RTT 影响

## 关联

- [[tcp]] —— TLS 跑在 TCP 上，握手 RTT 直接受 TCP 三次握手影响
- [[quic]] —— QUIC（RFC 9001）把 TLS 1.3 直接嵌入做握手，省掉分层
- [[http-2]] —— HTTP/2 over TLS 是 TLS 1.3 最大流量来源
- [[aes]] —— TLS 1.3 强制 AEAD 的 AES-GCM 是默认 cipher
- [[paxos]] —— 共识协议假定加密 transport，TLS 1.3 是分布式系统的安全底层
- [[spanner]] —— 跨数据中心 RPC 走 TLS 1.3 加密
- [[kafka]] —— broker 间通信和 client 协议常用 TLS 1.3 保护

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aes]] —— AES Rijndael 对称分组密码
- [[cerf-kahn-1974]] —— Cerf-Kahn 1974 — 用网关把异构网络拼成一个互联网
- [[chaum-1981-mix]] —— Mix Network — 用信封套信封让邮局也不知道谁寄给谁
- [[clark-1988]] —— Clark 1988 — TCP/IP 七大目标的优先级，决定了 Internet 长成今天这样
- [[cryptoverif-2008]] —— CryptoVerif — 让计算机直接证密码协议在真实计算模型下安全
- [[diffie-hellman-1976]] —— New Directions 1976 — 给协议世界写下公钥宪法
- [[dingledine-mixminion-2003]] —— Mixminion — 用一次性回信票据保护匿名邮件
- [[dns]] —— DNS — 把全球域名解析切成一棵可分布维护的树
- [[dot-doh-perf-2020]] —— DoT/DoH 性能 — 给 DNS 加密之后网页变快还是变慢
- [[dwork-calibrating-noise-2006]] —— 校准噪声 — 往统计结果里加多少噪音才能保护隐私
- [[easycrypt-2011]] —— EasyCrypt — 让密码学家的安全证明能被机器自动检查
- [[ebpf]] —— eBPF — 用户写小程序，内核证明安全后再跑
- [[heartbleed-2014]] —— Heartbleed — 一个忘了写边界检查的 bug 让全网 1/3 的 HTTPS 站点漏内存
- [[http-2]] —— HTTP/2 — 把 HTTP 从文本协议改造成二进制多路复用
- [[io-uring]] —— io_uring — Linux 让 N 次 IO 摊销到 1 次 syscall
- [[logjam-2015]] —— Logjam 2015 — 全世界共用一把锁，国家级窃听者一次撬完
- [[lucky13-2013]] —— Lucky 13 — 用毫秒级时间差把 TLS 加密看穿
- [[mitls-2014-triple-handshake]] —— Triple Handshake — TLS 同一把主密钥被复用，黑客就能换人不换锁
- [[proverif-2001]] —— ProVerif — 把密码协议翻成 Prolog 规则让计算机自己证安全
- [[reed-onion-routing-1998]] —— Onion Routing 1998 — Tor 前身把匿名连接做成网络积木
- [[sgx-2013]] —— Intel SGX — 在 CPU 里建一间谁都偷看不了的密室
- [[tamarin-2012]] —— Tamarin — 让计算机自己证 Signal、TLS 1.3 这种带 DH 的协议是不是真安全
- [[websocket-rfc-6455]] —— WebSocket RFC 6455 — 让浏览器和服务器开一条不挂断的双向电话
- [[wireguard-2017]] —— WireGuard — 4000 行代码重写 VPN 的极简主义
- [[mbedtls]] —— Mbed TLS — 嵌入式设备的轻量级 TLS 加密库
- [[signal-android]] —— Signal Android — 让 Android 上的每条消息都只有两端能看见
- [[signal-ios]] —— Signal iOS — 让 iPhone 上的每条消息都只有两端能看见
- [[signal-server]] —— Signal-Server — 服务端看不到任何明文的即时通信后端
- [[zephyr]] —— Zephyr — 一份代码树跑遍所有嵌入式芯片的开源 RTOS
