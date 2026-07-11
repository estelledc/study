---
title: Mockapetris 1988 DNS — 设计者亲口讲为什么 DNS 长这样
来源: 'Paul Mockapetris and Kevin Dunlap, "Development of the Domain Name System", SIGCOMM 1988'
日期: 2026-06-01
分类: 网络协议
难度: 中级
---

## 是什么

这是 DNS 设计者 Paul Mockapetris **五年后的回顾论文**——1983 年他写出第一版 DNS，1987 年 RFC 1034/1035 重写完正式部署，1988 年他和 Kevin Dunlap 在 SIGCOMM 上写下"我们当年到底为什么这么选，跑了五年发现哪些对、哪些错"。

日常类比：像盖完一栋楼五年后回头写"设计手记"。当年画图纸时纠结的"承重墙放哪"、"楼梯多宽"，住进去之后才知道哪些选对了、哪些其实可以更省。Mockapetris 这篇就是 DNS 的设计手记。

它不是协议规范——规范是 RFC 1034/1035。它是**设计哲学**：为什么 DNS 选了**层次命名 + 缓存 + 委派**这三件事，为什么没选别的。

## 为什么重要

不读这篇，下面这些事都没法理解：

- 为什么 DNS 不是"全球数据库统一查询"，而是一棵树——委派比集中省得多
- 为什么 DNS 接受弱一致性、依赖 TTL 缓存——绝对一致 vs 可扩展性，选了后者
- 为什么 DNS 至今 38 年没大改但能跑下来——**机制和策略分离**这一招真的耐用
- 为什么后来的 LDAP / Kubernetes service discovery / Consul 都长得像 DNS——它们是 DNS 这套思路的徒孙

## 核心要点

论文把 DNS 的设计精髓总结成 **三组取舍**：

1. **层次命名空间 vs 扁平命名空间**：扁平（hosts.txt 时代）每加一台机器全网都要更新；层次让每一级只管自己那一层。类比：邮政地址写"国-省-市-街-号"而不是"全球唯一编号"——前者每个市自己管自己。代价：跨越层级的查询要走多跳。

2. **委派 vs 集中维护**：每个 zone 的权威由本地组织自己跑。`mit.edu` 的记录由 MIT 自己改，根服务器只记"问 MIT 这台机器"。类比：连锁餐厅总部不管每家店的菜单细节，只管哪家店开在哪里。这一招让 DNS 能扩到全球——**没有任何一个团队管所有数据**。

3. **缓存 + TTL vs 强一致性**：每条记录带"保质期"，谁查到谁可以缓存到期前不再问权威。论文明说：选了 **availability 高于 consistency**——权威可以挂、缓存还能扛一阵。类比：超市进货单写"3 天有效"，3 天内不用反复打电话核价。这是 DNS 永远弱一致的根本原因。

三组取舍合起来，就是后来分布式系统书里反复引用的 **"机制 vs 策略分离"** 经典案例：协议层只定义"怎么查、怎么缓存、怎么委派"（机制），具体记录类型、命名规则、刷新频率（策略）留给各 zone 自己定。

## 实践案例

### 案例 1：委派让 DNS 能扛住主机数爆炸

1983 年 ARPANET 大约 500 台主机，全装在一个 hosts.txt 里还能扛。1988 年论文写作时已经 6 万台。如果还用 hosts.txt：

```
# 每台机器每天要拉这个文件
example.arpa  IN A  10.0.0.1
mit-ai.arpa   IN A  10.0.0.2
...（6 万行）
```

文件大、传输慢、改一行要全网刷新。DNS 的解法：

```
# 根只记下一级在哪
.com  NS  a.gtld-servers.net.
.edu  NS  a.edu-servers.net.
# .edu 自己的服务器再记 mit.edu 在哪
mit.edu  NS  bitsy.mit.edu.
```

**逐部分解释**：根只有几十条 NS 记录，不再管下面的细节。MIT 改自己一台机器的 IP，只刷新自己的 zone，根服务器一个字都不动。这就是委派的力量——**改动局部化**。

### 案例 2：TTL 让缓存扛住权威短暂宕机

```
$ dig +noall +answer www.example.com
www.example.com. 3600 IN A 93.184.216.34
```

`3600` 是 TTL（秒）。任何 resolver 拿到这条记录，1 小时内不必再问权威。论文里 Mockapetris 强调：**TTL 是设计者交给运营者的旋钮**——不是协议帮你定，是你自己根据"切换频率 vs 权威负载"调。

实际效果：2021 年 Facebook 内部 BGP 配置错误把权威 DNS 隔绝了 6 小时，**外部 resolver 缓存里的旧记录在 TTL 内还能用**——只是 TTL 一过就一起雪崩。这正是论文当年"availability > consistency"取舍的两面性。

### 案例 3：协议机制和数据策略分离

DNS 协议本身只规定"5 字段记录格式"：NAME / TTL / CLASS / TYPE / RDATA。具体 TYPE 可以无限扩展。1987 年只有 A / NS / MX / CNAME / PTR 几种，后来加了：

```
AAAA   # 1995, IPv6 地址
SRV    # 2000, 服务发现
DNSKEY # 2005, DNSSEC 签名
SVCB   # 2023, 服务绑定（HTTP/3 + ECH）
```

**协议代码一行没改**，每次只在 RDATA 里加新字段。这就是机制 vs 策略分离的复利——38 年后还能加新功能。

论文里 Mockapetris 反复说一句话：**"keep the protocol simple, keep the data flexible"**。协议越简单，越能扛住时间。

## 踩过的坑

1. **TTL 没有"正确值"**：太高，权威切 IP 等几小时；太低，缓存命中率低、权威被压垮。论文承认这是个**让运营者头疼的旋钮**——五年实践没找到自动办法，今天仍是手工艺。

2. **glue record 漏写**：父 zone 委派给 `ns1.example.com`，但这名字本身又在被委派的子 zone 里——会循环。父 zone 必须附上 ns1 的 IP（glue）。论文专门说这个坑当年绊倒不少早期部署。

3. **CNAME 顶点禁忌**：`example.com` 本身不能用 CNAME（会和 SOA / NS 冲突）。论文里 Mockapetris 说这条规则当年看似 minor，后来成了 CDN 接入时无数运维的拦路虎。

4. **UDP 53 不加密、不认证**：论文当年的世界还没人想到 cache poisoning。Kaminsky 2008 攻击让全网紧急打补丁；今天 DNSSEC 部署率仍 < 30%。Mockapetris 自己后来反思过：**当年应该把签名留个口子**。

## 适用 vs 不适用场景

**适用**：

- 全球唯一命名 + 分布式维护（互联网域名、邮件路由、CDN 调度）
- 服务发现（Kubernetes CoreDNS、Consul、Active Directory）
- 本地链路 zero-config（家里打印机、Chromecast 走的 mDNS）

**不适用**：

- 强一致性（DNS 永远弱一致 + TTL 缓存，不能当事务存储）
- 内置加密（明文 UDP 53 是默认，加密要靠 DoT/DoH 附加层）
- 主动 push 失效（DNS 没有 invalidation，全靠 TTL 自然到期）
- 高频读写（一条记录改完要等 TTL，不是数据库）

## 历史小故事（可跳过）

- **1973-1983 年**：ARPANET 用一个文件 `HOSTS.TXT` 存所有主机，SRI-NIC 集中维护。每台机器周期性 FTP 拉。主机过千之后这套模式撑不住。
- **1983 年**：Mockapetris 发出 RFC 882/883，第一版 DNS 概念。部署不广。
- **1987 年**：完全重写为 RFC 1034（概念）和 RFC 1035（实现），成事实标准。
- **1988 年**：本论文 SIGCOMM 发表，**回顾五年实战**——这是 DNS 自己讲自己。
- **1988 年**：伯克利 BIND 作为参考实现发布，今天根服务器和大量 TLD 仍在跑它的后代。
- **2005 年**：DNSSEC（RFC 4033）发布，给 DNS 加签名防篡改。
- **2018 年**：DoH（RFC 8484）把 DNS 塞进 HTTPS，Mockapetris 三十年前留下的明文设计终于补上加密层。

之后 38 年，从浏览器到 Kubernetes 到智能家居，全部建在这棵树上。

## 学到什么

1. **设计取舍要写下来**——Mockapetris 五年后回头讲清"为什么是 X 不是 Y"，让后人不必重学一遍
2. **机制 vs 策略分离是真复利**——38 年加 IPv6、加 DNSSEC、加 SVCB，协议代码一行没动
3. **委派把全球问题切成局部问题**——后来所有分布式命名系统（LDAP / Consul / etcd / K8s service）都借这一招
4. **availability > consistency 的工程取舍**——CAP 定理 12 年后才被 Brewer 总结，DNS 1988 年已经这么做了

## 延伸阅读

- 论文 PDF：[Development of the DNS](https://www.cs.cornell.edu/people/egs/615/mockapetris.pdf)（17 页，密度低，可读性极好的设计回顾）
- RFC 原文：[RFC 1034](https://www.rfc-editor.org/rfc/rfc1034) + [RFC 1035](https://www.rfc-editor.org/rfc/rfc1035)（实战部署对照本论文里的设计意图）
- 工具书：Cricket Liu and Paul Albitz, "DNS and BIND" O'Reilly 第 5 版（部署运维经典）
- 视频教程：[Cloudflare — How DNS Works](https://www.youtube.com/watch?v=72snZctFFtA)（10 分钟动画把整棵查询树讲清楚）
- 测量数据：[APNIC Geoff Huston DNS 博客](https://blog.apnic.net/category/tech-matters/dns/)（DNSSEC / DoH 部署率全球长期跟踪）

## 关联

- [[dns]] —— DNS 协议机制与查询流程，本篇是它的设计意图回顾本
- [[clark-1988]] —— 同年 SIGCOMM 论文，把 TCP/IP 七大目标排序，和 DNS 这套设计哲学同源
- [[jacobson-1988]] —— 同年 SIGCOMM 论文，TCP 拥塞控制；1988 是网络架构反思年
- [[tcp]] —— DNS 大响应包超 512 byte 切到 TCP 53；TCP 建连前必须 DNS 解析
- [[akamai-2002]] —— CDN 的 anycast + 短 TTL 把 DNS 当全球流量调度器，是 Mockapetris 当年没预见的用法
- [[kubernetes]] —— CoreDNS 内嵌进集群，把"层次命名 + 委派"思路搬到容器世界
- [[paxos]] —— DNS 选 availability 不选 consistency；Paxos 走另一条路，对照鲜明

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[amplification-hell-2014]] —— Amplification Hell 2014 — 把家用宽带放大成几百 Gbps 的反射攻击
- [[calder-2015-anycast-cdn]] —— Calder 2015 — Anycast CDN 在生产环境真的能用吗
- [[codons-2004]] —— CoDoNS — 用 P2P 哈希表替代分层 DNS 的实验
- [[dot-doh-perf-2020]] —— DoT/DoH 性能 — 给 DNS 加密之后网页变快还是变慢
- [[rfc-3833-dns-threats]] —— RFC 3833 — IETF 第一次正式承认 DNS 不安全
