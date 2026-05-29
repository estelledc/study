---
title: DNS Domain Name System
来源: RFC 1034 + RFC 1035, "Domain Names" (Concepts/Facilities + Implementation/Specification), Mockapetris, Nov 1987
---

# DNS — 把全球命名空间切成一棵可分布维护的树

## 一句话总结

DNS（Domain Name System，RFC 1034 + RFC 1035, 1987 年 11 月）由 Paul Mockapetris（USC/ISI，DARPA 资助）单人主笔，把"主机名 → IP"这件事从早期 ARPANET 时代单一的 `HOSTS.TXT` 文件升级成一棵层次化、可委派、可缓存、最终一致的全球分布式数据库。它把命名空间切成 root → TLD → SLD → subdomain 的树，把这棵树拆分成若干 **zone**，每个 zone 由一组 **authoritative name server** 维护，并通过 **delegation**（NS 记录）把控制权交给下一层。客户端通过 **resolver**（递归 / 迭代两种模式）走完这棵树拿到答案，途中任何一跳都可以根据 **TTL** 缓存。这一套设计今天已经跑了 38 年，是互联网上最成功也是最危险的"基础设施级"协议。

设计目标（RFC 1034 §2）：

1. **去中心化命名管理**：`HOSTS.TXT` 时代由 SRI-NIC 一家维护，1980s 主机数量爆炸后维护不动。需要把命名权下放
2. **层次化命名空间**：每个组织管自己的子树，互不干涉
3. **分布式数据库**：单点故障 + 维护瓶颈不能存在
4. **缓存友好**：大部分查询走缓存，权威服务器负载可控
5. **协议简单**：UDP 53 单包请求 / 单包响应（512 字节内），TCP 53 兜底大响应
6. **应用透明**：getaddrinfo / gethostbyname 等 stdlib 调用屏蔽底层
7. **可扩展**：新记录类型（RR type）可随时加，不破坏现有客户端

它今天是几乎所有互联网协议的"前置依赖"——HTTP / HTTPS 访问任何域名前先查 DNS、TLS 1.3 SNI 用域名做证书匹配、邮件 SMTP 用 MX 记录路由、CDN 用 DNS 解析做地理调度、Kubernetes service discovery 内嵌 DNS、Active Directory 把 DNS 当目录服务、IoT 设备用 mDNS 做 zero-config 发现。

但它也最危险：UDP 53 不加密，DNS hijack / spoofing / cache poisoning 在网吧 / 国家级防火墙 / 中间人场景常态化；DNSSEC 部署 25+ 年仍 < 30% 域名启用；DoT (DNS over TLS) / DoH (DNS over HTTPS) 是隐私升级方向，但部署率分裂，2024 年仍是少数派。

为什么要专门读 RFC 1034 + 1035 而不是只看 BIND / Unbound 文档？

1. DNS 的层次 + 委派模型是后续所有"分布式命名"系统（LDAP / Consul / etcd / Kubernetes service / DID）的概念原型。理解 zone vs domain 的区别才能理解委派的本质
2. RR 类型表 + 报文格式 + label 压缩这些底层规约 BIND 注释看不全，必须读 RFC
3. 1987 设计 vs 2024 部署的偏差（UDP 不加密 / DNSSEC 部署滞后 / TTL 误用导致 outage 等）是协议工程的活教材
4. 后续 EDNS0（RFC 6891）/ DNSSEC（RFC 4033-4035）/ DoT（RFC 7858）/ DoH（RFC 8484）/ DDR（RFC 9462）每一层都建立在 1034/1035 的概念之上——不读源头无法理解扩展为什么这样设计

本笔记按 Layer 0 速查 → 历史定位 → 5 个 Definition → 命名空间结构 → zone vs domain → resolver 与查询模式 → 报文格式 → RR 类型 → 缓存 + TTL → 现代演进（DNSSEC / DoT / DoH / EDNS0 / Anycast / GeoDNS / DDR）→ 安全攻击 → 限制 → 怀疑 → permalinks → 学到 + 关联 的顺序展开。

## Layer 0 速查

| 维度 | 数值 / 事实 |
|---|---|
| RFC 编号 | 1034（Concepts and Facilities）+ 1035（Implementation and Specification） |
| 发布日期 | 1987 年 11 月 |
| 作者 | Paul Mockapetris（USC/ISI，资助方 DARPA） |
| 历史前身 | RFC 882 + RFC 883（1983, 第一版 DNS） + `HOSTS.TXT`（SRI-NIC 集中维护） |
| 默认端口 | UDP 53（查询）+ TCP 53（大响应 / zone transfer） |
| 默认包大小上限 | 512 字节（UDP 无 EDNS0），EDNS0 可扩到 4096+ |
| Root server 数量 | 13 个 letter（A-M），每个 anycast 部署，2024 年全球约 1500+ 实例 |
| TLD 数量 | 360+（gTLD + ccTLD + new gTLD） |
| 注册域名总数 | ~370M（Verisign 2024 Q1） |
| RR 类型数 | RFC 1035 定义 ~16 种，IANA 维护已注册 ~90+ 种 |
| DNSSEC 部署率 | TLD 层面 ~95%，单个域名启用 < 30%（APNIC 2024） |
| DoT/DoH 部署率 | 解析端（Cloudflare/Google/Quad9）100%，权威端零散，client 端 < 30%（Mozilla / Apple 推） |
| 协议 ossification | 极高，UDP 53 头部位字段 38 年未变 |
| 安全事件高发 | 2008 Kaminsky cache poisoning / 2016 Dyn DDoS / 持续 DNS hijack |

## Section 1 — 历史定位

### `HOSTS.TXT` 时代（1973-1983）

ARPANET 早期所有主机的域名 → IP 映射写在一个文件里：`HOSTS.TXT`，由 SRI-NIC（Stanford Research Institute Network Information Center）集中维护。每台机器周期性 FTP 拉取这个文件到 `/etc/hosts`。

1980s 主机数量爆炸（从几百到上万）后崩盘：

1. **集中维护瓶颈**：所有改名 / 加机要给 SRI-NIC 发邮件
2. **传播延迟**：拉取频率低，新主机要等几小时到几天才全网生效
3. **同名冲突**：扁平命名空间导致 `mail` `web` 等名字一抢一个
4. **文件大小**：HOSTS.TXT 越来越大，FTP 传输成本激增
5. **更新原子性差**：拉到一半网络断开，本地状态不一致

### RFC 882 + 883（1983）

Mockapetris 第一次把 DNS 提出来，用层次命名 + 分布式数据库的双重抽象解决上面问题。但这个版本部署不广。

### RFC 1034 + 1035（1987）

完全重写，把 DNS 概念（1034）和实现规范（1035）分离。这一版成为事实标准并保留至今。BIND（Berkeley Internet Name Domain，1984 起步，1988 年与 RFC 1035 同步）是参考实现，今天仍是 root + 大量 TLD 的运行实现。

### 1990s — 商业化 + 国际化

1991 NSFNET 商业化、1993 Web 出现、1995 域名收费（5 年 50 美元给 NSI）、1998 ICANN 成立接管 IANA 职能。

### 2000s — 安全危机

- 2005 RFC 4033-4035 发布 DNSSEC，但部署滞后
- 2008 Kaminsky 报告 DNS cache poisoning 大攻击，全行业紧急 patch（端口随机化等 mitigation）
- 2010 root zone 签名（DNSSEC TLD 层启用）

### 2010s — 隐私 + 加密

- 2016 RFC 7858 DNS over TLS（DoT），端口 853
- 2018 RFC 8484 DNS over HTTPS（DoH），走 HTTPS 443
- 2020 Mozilla / Cloudflare / Google 默认开启 DoH（争议大）
- 2022 RFC 9230 Oblivious DNS over HTTPS（ODoH，把 client IP 隐藏给 resolver）

### 2020s — 抵御 ossification + IPv6 / Anycast

- RFC 8499（DNS Terminology）澄清概念混乱
- RFC 9462 DDR（Discovery of Designated Resolvers）
- IPv6 AAAA 记录全面铺开
- Anycast 部署成 root + 主流 resolver 标配（Google 8.8.8.8 / Cloudflare 1.1.1.1 / Quad9 9.9.9.9）

## Section 2 — 5 个 Definition

### Def 1: Domain（域）

**Domain** 是 DNS 命名空间这棵树上的一个**子树**。每个 domain 有一个 domain name（FQDN，Fully Qualified Domain Name），从根开始用 `.` 分隔。例如 `mail.google.com.` 是个 domain，它包含自己 + 所有子树（如 `imap.mail.google.com.`）。

domain name 字段约束（RFC 1035 §2.3.4）：

- 单 label 最多 63 字节
- FQDN 总长（含 `.` 分隔符）最多 255 字节
- label 字符集传统 LDH（Letter / Digit / Hyphen），后期 IDN（RFC 5891）通过 Punycode 支持 Unicode（`xn--` 前缀）
- 大小写不敏感（query / response 时 server 不必保留 case）

domain 是一个**逻辑命名概念**，不直接对应"哪个服务器在管它"。这一职能由 zone 承担。

### Def 2: Zone（区）

**Zone** 是 domain 的一个**实际管理单元**：一组连续的 RR 集合，由特定的 NS 权威维护。zone 的边界由 NS 记录划定——子 domain 委派给别的 NS 后，父 zone 不再管子 zone 的内部细节。

例：

- `google.com` zone 包含 `google.com` 自己 + `www.google.com` + 所有不被委派出去的子域
- 如果 `mail.google.com` 委派给独立的 NS（即 `google.com` zone 里写一条 `mail.google.com NS ns1.mail-team.google.com`），那 `mail.google.com` 及其子树就属于另一个 zone

domain 是**语义边界**，zone 是**管理边界**。同一个 domain 可以被切成多个 zone（通过 NS 委派）。

### Def 3: Authoritative Name Server（权威名服务器）

**Authoritative server** 是 zone 的"原始事实持有者"。当查询其负责的 zone 时，它在响应里设置 **AA bit（Authoritative Answer = 1）**。

zone 通常有：

- **primary**（master）—— 持有 zone 文件的源
- **secondary**（slave）—— 通过 zone transfer（AXFR / IXFR，RFC 5936 / 1995）从 primary 同步副本

委派（delegation）：父 zone 在自己的 zone 文件里写 `child.example.com. NS ns1.example.com.`，并附上 ns1 的 A/AAAA 记录（**glue record**，避免循环依赖）。

### Def 4: Resolver（解析器）

**Resolver** 是查询发起方。两种典型形态：

1. **stub resolver**：操作系统提供的最简版（glibc / musl `getaddrinfo`、Windows DNS Client、macOS `mDNSResponder`）。它只发请求，不递归，由配置的 **recursive resolver** 帮它把活做完
2. **recursive resolver**（recursing resolver / full-service resolver）：完整实现，会从 root 一路 iterative 走到目标 zone。典型例子：BIND `named`、Unbound、PowerDNS Recursor、Knot Resolver、运营商 / 公共解析（8.8.8.8 / 1.1.1.1 / 9.9.9.9）

stub resolver 的查询包带 **RD bit（Recursion Desired = 1）**，告诉 recursive resolver "你帮我递归到底"。recursive resolver 在响应里带 **RA bit（Recursion Available = 1）** 表示自己支持递归。

### Def 5: Resource Record（RR，资源记录）

DNS 数据库的最小单元。一条 RR 有 5 个字段（RFC 1035 §3.2.1）：

```
NAME    TTL   CLASS   TYPE    RDATA
www     300   IN      A       93.184.216.34
@       86400 IN      MX      10 mail.example.com.
```

- **NAME**：拥有者 domain
- **TTL**：缓存秒数
- **CLASS**：基本固定为 `IN`（Internet），历史还有 `CH` `HS` 但已死
- **TYPE**：记录类型（A / AAAA / CNAME / MX / NS / TXT / SOA / SRV / CAA / TLSA / DNSKEY ...）
- **RDATA**：类型特定的数据（A 是 4 字节 IPv4，AAAA 是 16 字节 IPv6，CNAME 是另一个 domain name）

RR 集合（**RRset**）= 同 NAME + 同 TYPE 的所有 RR，必须同 TTL，DNSSEC 时一起签名。

## Section 3 — 命名空间结构

![DNS hierarchical namespace](/papers/dns/01-hierarchy.webp)

层次自顶向下：

### Root zone

13 个根服务器（letter A-M），每个都用 anycast 部署，全球约 1500+ 实例。

- Root zone 文件由 IANA / Verisign 维护，~1500 行
- 内容：每个 TLD 的 NS + glue
- 签名：DNSSEC，2010 起 root zone signed

### TLD（Top Level Domain）

类型：

- **gTLD**：generic（`.com` `.org` `.net` `.info` `.biz` ...）
- **ccTLD**：country code（`.cn` `.uk` `.jp` `.de` ...）
- **new gTLD**：2014 起 ICANN 开放（`.io` `.ai` `.app` `.dev` ...）
- **infrastructure**：`.arpa`（in-addr.arpa 反查 / ip6.arpa）

TLD 由各自 registry 运营：`.com` 由 Verisign，`.org` 由 PIR，`.cn` 由 CNNIC。

### SLD（Second Level Domain）

例如 `google.com` `wikipedia.org`，是用户实际购买注册的层级。

### Subdomain

从 SLD 之下任意层级（`www.google.com` `mail.google.com` `imap.mail.google.com`）。

### FQDN 解析顺序

`mail.google.com.` 从右向左：

```
.        → root（隐式不写）
com.     → TLD
google.  → SLD
mail.    → subdomain
```

末尾的 `.` 表示 FQDN（绝对名）；不带 `.` 的是相对名（依赖 search list）。

## Section 4 — Zone vs Domain（最容易混淆的概念）

```
Domain 命名空间（语义）：
example.com.（domain）= example.com + www.example.com + mail.example.com + ...

Zone 管理边界（物理）：
example.com zone（NS = ns1.example.com）：
  example.com  SOA / NS / A / MX
  www          A 93.184.216.34
  mail         CNAME mail-server.example.com
  ...

如果 mail.example.com 被委派给独立 NS：
  example.com zone 里仅保留：
    mail   NS  ns1.mail.example.com
    ns1.mail  A  10.0.0.1（glue）

  另一个 zone （mail.example.com zone）：
    mail.example.com  SOA / NS / A
    imap              A
    smtp              A
```

要点：

1. **同一 domain 可以是多个 zone 拼接**（通过 NS 委派切分）
2. **不同 zone 可以由不同组织运营**（典型例子：`.com` 是 Verisign 的 zone，`google.com` 是 Google 的 zone，`gmail.google.com` 又可被独立切出）
3. **glue record 是必须的**：父 zone 委派到一个名字（`ns1.example.com`），但这个名字本身又在被委派的子 zone 里，会循环。必须在父 zone 里附上 ns1 的 A/AAAA 作为 glue 打破循环

## Section 5 — Resolver 模式：递归 vs 迭代

![Recursive vs iterative DNS query](/papers/dns/02-recursive-iterative.webp)

### 递归（Recursive）

stub resolver → recursive resolver 的关系：

```
stub:  Q: A? www.example.com   RD=1
       ←─────────────────────────────  recursive resolver

       recursive resolver 内部跑 iterative chain（见下方），
       完整解析后把最终 answer 一次性返回 stub。

       R: A 93.184.216.34  TTL=86400  RA=1
```

stub 的简化：单包请求 / 单包响应，不维护任何上层状态。

### 迭代（Iterative）

recursive resolver 自己跑：

```
1. resolver → root         Q: A? www.example.com  RD=0
2. root → resolver           R: ref → .com NS = a.gtld-servers.net
3. resolver → .com NS      Q: A? www.example.com  RD=0
4. .com NS → resolver        R: ref → example.com NS = ns1.example.com
5. resolver → ns1.example.com  Q: A? www.example.com  RD=0
6. ns1.example.com → resolver  R: A 93.184.216.34  AA=1  TTL=86400
```

每一跳 RD=0 表示"不期望被代答"，期待的是 referral（NS + glue）或 authoritative answer。

冷查询 RTT 累加：3 跳 × ~30 ms = ~90 ms。
热查询（resolver cache 命中）：1 跳 ~10 ms。

### 为什么不让 stub 直接 iterative

1. **stub 缺少 NS / glue 数据**，每次都得从 root 开始 → 慢且压垮 root
2. **resolver 集中缓存效率高**：top 1% 域名占 90%+ 查询，集中缓存命中率轻松 90%+
3. **stub 资源受限**（嵌入式 / 移动设备）：协议栈应越简单越好
4. **DNSSEC 验证逻辑复杂**：放在 stub 端会让每个 OS 都得自带验证库

## Section 6 — DNS 报文格式（RFC 1035 §4.1）

```
+-----------------+
|    Header       |  12 bytes
+-----------------+
|    Question     |  N bytes（QNAME + QTYPE + QCLASS）
+-----------------+
|    Answer       |  N bytes（RR list）
+-----------------+
|    Authority    |  N bytes（RR list，权威 NS 段）
+-----------------+
|    Additional   |  N bytes（RR list，glue / EDNS0 OPT）
+-----------------+
```

### Header（12 字节）

```
 0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15
+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
|                       ID                      |
+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
|QR|  Opcode   |AA|TC|RD|RA|   Z    |   RCODE   |
+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+
|                    QDCOUNT                    |
+-----------------------------------------------+
|                    ANCOUNT                    |
+-----------------------------------------------+
|                    NSCOUNT                    |
+-----------------------------------------------+
|                    ARCOUNT                    |
+-----------------------------------------------+
```

关键字段：

- **ID**（16 bit）：transaction ID，client 选随机 ID，server 必须原样复制。Kaminsky 攻击就是猜这个 ID
- **QR**：0=query, 1=response
- **AA**：Authoritative Answer
- **TC**：TRuncated（UDP 包超 512 字节时设 1，client 切 TCP 重查）
- **RD**：Recursion Desired
- **RA**：Recursion Available
- **RCODE**：响应码（0=NOERROR, 2=SERVFAIL, 3=NXDOMAIN, 5=REFUSED ...）

### Label 压缩（RFC 1035 §4.1.4）

为了塞进 512 字节，DNS 用了一种"指针压缩"：重复的 domain name 后缀只编一次，后续用 2 字节指针指过去。

```
原始：
  www.example.com.  → [3]www[7]example[3]com[0]  17 bytes
  mail.example.com. → [4]mail[7]example[3]com[0]  17 bytes

压缩后（mail 引用 example.com 的位置）：
  [3]www[7]example[3]com[0]  17 bytes
  [4]mail<ptr=offset>         7 bytes
```

指针前两 bit = 11 区分纯标签（前两 bit = 00）。这是个简单但极其有效的压缩，单包通常压缩 30-50%。

代价：实现要小心循环引用（指针指向自己），多次安全 CVE 都源自这里（如 BIND 的 lame referral 解析 bug）。

## Section 7 — 资源记录类型（RR Types）

RFC 1035 定义的核心类型：

| TYPE | RDATA 含义 | 用途 |
|---|---|---|
| **A** | 4 字节 IPv4 | 域名 → IPv4 |
| **AAAA**（RFC 3596，1996）| 16 字节 IPv6 | 域名 → IPv6 |
| **CNAME** | 另一个 domain name | 别名（canonical name） |
| **MX** | preference + mail server name | 邮件路由 |
| **NS** | name server domain name | zone 委派 |
| **TXT** | 任意文本 | SPF / DKIM / DMARC / domain ownership 验证 |
| **SOA** | start of authority（zone 元数据） | 每个 zone 必有一条 |
| **PTR** | domain name | 反向解析（IP → 域名，写在 in-addr.arpa） |
| **SRV**（RFC 2782, 2000）| priority + weight + port + target | 服务发现（XMPP / SIP / Kerberos / Kubernetes） |
| **CAA**（RFC 8659, 2019）| CA 授权 | 限定哪些 CA 可签该域名证书 |
| **TLSA**（RFC 6698, 2012）| 证书指纹 | DANE，DNS 中放 TLS 公钥指纹 |
| **DNSKEY / DS / RRSIG / NSEC / NSEC3** | DNSSEC 元数据 | 签名 + 信任链 |
| **HTTPS / SVCB**（RFC 9460, 2023）| service binding | 提前告知 ALPN / port / IP，加速 HTTPS 连接 |

### A 与 AAAA 并存的两难

应用通常做 "happy eyeballs"（RFC 8305）：同时发起 IPv4 + IPv6 连接，谁先到用谁。这在 IPv6 网络劣化（黑洞 / 高丢包）时减少用户体验损失。

### CNAME 链与 flat 解析

CNAME 不能与其他类型共存（同 NAME 同时有 CNAME + A 是非法的，RFC 1034 §3.6.2）。

CNAME 链：`www.example.com → cdn.example.com → cdn-edge-12.cloudfront.net → 13.224.99.18`

Resolver 必须 follow CNAME chain 直到找到非 CNAME 答案。RFC 没有显式上限，BIND 默认最多 16 跳防循环。

CDN 大量用 CNAME 做调度。代价：每跳多一次 lookup（如果未缓存）。SVCB / HTTPS（RFC 9460）部分缓解：把多 RR 合并到一个 query（详见 Section 9）。

### TXT 的滥用

最初设计为"任意文本注释"，结果成了控制平面：

- SPF（RFC 7208）发件人策略
- DKIM 公钥
- DMARC 策略
- ACME challenge（Let's Encrypt 域名所有权验证）
- 域名所有权 token（Google / GitHub）

副作用：TXT 记录字段长度限制 255 字节 / 单 string，多 string 拼接，应用层很容易出 bug。

## Section 8 — 缓存 + TTL

### TTL 的双刃剑

- TTL 高：查询 RPS 低，权威服务器轻松，但变更滞后
- TTL 低：变更快速生效，但 RPS 高，cache miss 多

行业典型设置：

- 静态 A 记录：86400（1 天）或 3600（1 小时）
- 准备切换的 A 记录：60-300（提前几小时调低）
- CDN edge：30-120（要快速调度）
- MX：86400（很少变）
- DNSSEC RRSIG：与 RRset TTL 一致

### Negative Caching（RFC 2308, 1998）

NXDOMAIN 也要缓存（不然每次访问不存在域名都打到权威）。SOA 记录的 MINIMUM 字段定义"否定缓存 TTL 上限"，典型 1800-3600。

### 缓存层级

```
browser cache (Chrome ~60s)
   ↓
OS stub cache（systemd-resolved / nscd / mDNSResponder）
   ↓
recursive resolver cache（运营商 / Cloudflare 1.1.1.1）
   ↓
authoritative server（无缓存，原始事实）
```

### 实战 outage 案例

2021-10-04 Facebook 6 小时全球宕机：内部 BGP 路由变更导致权威 NS 不可达，所有 facebook.com 查询超时 → 每秒 1B+ 查询打到 root + TLD → root server 也接近限速 → recursive resolver 缓存失效后无法重新解析 → 用户连内部办公门禁卡都无法刷（员工进不了机房）。

教训：

1. DNS 是控制平面 + 数据平面双重依赖
2. TTL 设太低（FB 当时 ~60s）让缓存失效后无 fallback
3. authoritative NS 的 IP reachability 必须独立于业务网络

## Section 9 — 现代演进

### EDNS0（RFC 6891, 2013）

DNS 报文 12 字节 header 在 1987 是合理的，但留位极少。EDNS0 用 OPT pseudo-RR 在 Additional section 携带扩展：

- 把 UDP 包大小上限提到 4096 / 8192（突破 512）
- DO bit（DNSSEC OK，告诉权威"我支持 DNSSEC，请发签名"）
- ECS（EDNS Client Subnet, RFC 7871）：把 client 子网传给权威，做 GeoDNS（CDN 受益）
- COOKIE（RFC 7873）：抗欺骗的 cookie

EDNS0 是后续所有重大扩展（DNSSEC / ECS / DoH header）的载体。

### DNSSEC（RFC 4033/4034/4035, 2005）

公钥签名 + 信任链：

- 每个 RRset 有一条 RRSIG（签名）
- 每个 zone 有 DNSKEY（zone 公钥）
- 父 zone 用 DS 记录指向子 zone 的 DNSKEY hash → 信任链一直回到 root
- NSEC / NSEC3 解决 "authenticated denial"（证明某个名字真的不存在，不是被攻击者剥离）

部署滞后原因：

1. **复杂度高**：zone 文件签名 / 密钥轮换 / NSEC3 opt-out 等坑多
2. **回报不直观**：DNS hijack 主流仍走中间网络，DNSSEC 只防 cache poisoning + zone 篡改
3. **NSEC3 zone enumeration 风险**：NSEC（按字母序链表）让攻击者扫出全 zone 名字
4. **应用普遍不验证**：浏览器主流不做 DNSSEC 验证（认为 DoH/DoT 加密更重要）
5. **resolver 也大多不验证**：仅 ~30% recursive resolver 启用验证

2024 年 .com .org .net TLD 全部签名，但单个域名启用 DNSSEC 比例 < 30%（APNIC 2024 测量）。

### DoT（DNS over TLS, RFC 7858, 2016）

- 端口 853，TLS 1.2/1.3 包裹 DNS query
- 防中间人窥探 / 篡改
- 移动 OS 默认开启（Android 9+ Private DNS）

### DoH（DNS over HTTPS, RFC 8484, 2018）

- 端口 443，HTTPS POST `/dns-query`，body 是二进制 DNS wire format
- 完全混入 HTTPS 流量，难以分辨
- 浏览器（Firefox / Chrome）默认开启 Cloudflare / Google DoH（争议大：绕过运营商 / 学校 / 企业的 DNS 控制）

DoT vs DoH 对比：

| 维度 | DoT | DoH |
|---|---|---|
| 端口 | 853 | 443 |
| 中间人识别 | 易（独立端口） | 难（混入 HTTPS） |
| 浏览器支持 | 操作系统级 | 浏览器自带 |
| 运营商控制 | 可块 853 | 难块 443 |
| 性能 | TLS 握手慢 | HTTPS 握手 + HTTP/2 多路复用 |

### Anycast

8.8.8.8 / 1.1.1.1 / 9.9.9.9 都是 anycast：同一 IP 在全球数百站点宣告，BGP 把流量路由到最近站点。

Cloudflare 1.1.1.1：~330 PoP，全球查询 P50 < 15ms。

挑战：UDP 无连接，不同 packet 可能落到不同 PoP（路由切换时），但 DNS 查询 ↔ 响应是单包对，问题不大。TCP 53 + 长会话 anycast 才有 stickiness 问题。

### GeoDNS / EDNS Client Subnet

CDN 用 DNS 调度：用户在巴黎查 `cdn.example.com`，权威返回欧洲 IP；在东京查则返回亚太 IP。

ECS（RFC 7871）让 recursive resolver 把 client 子网（如 `203.0.113.0/24`）转发给权威，权威基于此做更精准的 geo 决策。

代价：用户 IP 部分泄露给所有上游权威。隐私党反对（Cloudflare 1.1.1.1 默认不发 ECS）。

### DDR（RFC 9462, 2023）

Discovery of Designated Resolvers：让 client 通过 DNS 查询发现"这台 resolver 也提供 DoT/DoH"，自动升级加密。解决"如何从 plaintext UDP 53 引导到加密"的鸡生蛋问题。

### Multicast DNS / mDNS（RFC 6762, 2013）

本地链路 zero-config 服务发现：`hostname.local`，`224.0.0.251 / FF02::FB:5353`。Apple Bonjour / Avahi / Android NSD 都基于此。家用打印机 / Chromecast / smart home 全靠这个。

### LLMNR（Windows 局域网，RFC 4795, 2007）

Windows 的局域网 DNS 替代，`224.0.0.252:5355`。安全性差（LLMNR poisoning 是常见域内攻击向量）。

## Section 10 — 安全攻击全景

### Cache Poisoning（Kaminsky 2008）

resolver 缓存被注入伪造 RR：

1. 攻击者诱导 resolver 查 `random123.example.com`（不存在）
2. resolver 向 example.com NS 发 query
3. 攻击者抢在真权威前回复一个伪造响应（带欺骗的 NS / glue）
4. 如果攻击者猜中 16 bit transaction ID + 16 bit source port，伪造响应被采纳
5. 此后所有 example.com 查询走攻击者的 NS

Kaminsky 的洞察：可以无限重试（每次随机子域名都是新查询）→ 概率攻击。

mitigation：

- **source port 随机化**（RFC 5452）：把 16 bit ID 扩到 16 bit ID + 16 bit port，攻击空间 × 65536
- **0x20 bit hack**：QNAME 大小写随机（`WwW.eXAMPle.cOm`），server 必须复制，攻击者要猜 case
- **DNSSEC**：根本解，签名验证不依赖 transaction ID

### DNS Hijack / Spoofing

中间人（运营商 / 公共 WiFi / 国家防火墙）直接劫持 UDP 53：

- 国内运营商曾大规模劫持 NXDOMAIN 改成广告页
- 国家防火墙对敏感域名返回错误 IP（GFW 的 DNS pollution）
- 解法：DoT/DoH 加密

### DDoS Amplification

DNS 查询小（<100 字节）但响应大（带 DNSSEC 签名后可达数 KB），开放 resolver 被滥用做反射放大攻击：

```
attacker → spoofed source IP → open resolver → victim
  60 bytes Q                       3000 bytes R
```

放大比 ~50×。2013 Spamhaus 攻击、2016 Mirai botnet 都用过。

mitigation：BCP 38（运营商过滤伪造源 IP）+ 关闭开放 resolver + Response Rate Limiting (RRL)。

### NXDOMAIN Floods

针对权威 NS 的洪水攻击，查询大量不存在的子域名（每个都绕过 negative cache）。Dyn 2016 攻击让 GitHub / Twitter / Netflix 全断 6 小时。

### 子域劫持（Subdomain Takeover）

公司 CNAME 指向 GitHub Pages / S3 / Heroku，但项目下线后 CNAME 没删 → 攻击者注册同名 GitHub repo → 该子域名被攻击者控制 → 钓鱼 / 窃取 cookie。

### CVE 历史

- 2008 Kaminsky cache poisoning
- 2012 BIND 9 RDATA parsing remote crash
- 2015 BIND 9 TKEY assertion failure（CVE-2015-5477）
- 2020 SAD DNS（Side channel attack on DNS, USENIX 2020）
- 2023 KeyTrap（DNSSEC 验证 CPU 耗尽，CVE-2023-50387）
- 持续：DDoS amplification 仍是日常事件

## Section 11 — 限制 + 部署痛点

1. **UDP 53 不加密**：1987 年默认；38 年后 DoT/DoH 仍是少数派部署，隐私长期欠账
2. **DNSSEC 部署滞后**：协议 25 年仍 < 30% 域名启用，复杂度 + 回报不直观是根因
3. **TTL 配置事故频发**：高 TTL 切换慢，低 TTL outage 时缓存失效压垮上游（Facebook 2021）
4. **CNAME 链浪费 RTT**：CDN 大量用 CNAME，5+ 跳常见。SVCB/HTTPS 部分缓解但部署滞后
5. **EDNS0 ECS 隐私泄露**：用户子网泄露给所有上游权威
6. **anycast UDP 在路由切换时丢包**：通常 DNS 单包对不受影响，但 retry 状态可能错位
7. **stub resolver 实现碎片化**：glibc / musl / Windows / mDNSResponder 各家行为略有差异，超时 / search list / IPv6 偏好各不同
8. **/etc/resolv.conf 单点**：被恶意软件改 → 全机查询被劫持
9. **DNS over TLS 有连接成本**：每次 OS 唤醒（移动场景）都得重建 TLS，电量影响
10. **递归 resolver 的中心化风险**：Cloudflare 1.1.1.1 + Google 8.8.8.8 占了大量份额，单点故障 / 监控风险高
11. **DNSSEC NSEC3 enumeration**：NSEC3 hash 仍可线下暴力破解，能枚举 zone 内所有名字
12. **wildcard records 行为复杂**：`*.example.com` 与 explicit 子域 + DNSSEC 交互非常 tricky，多次 RFC 澄清
13. **大响应碎片**：DNSSEC 签名让响应变大，UDP 碎片在某些中间盒被丢，必须 fallback TCP（性能差）
14. **glue record 不是权威信息**：父 zone 的 glue 不签名，攻击面长期存在（RFC 9520 的修订也不能完全清理）
15. **gTLD 政策风险**：`.io` 是英属印度洋领地的 ccTLD，2024 年地缘政治变动后可能消失，全球大量 SaaS 受影响
16. **企业内网 split-horizon DNS 复杂**：同一域名内外网返回不同 IP，与公网 DNSSEC 兼容差
17. **HTTPS / SVCB（RFC 9460）部署滞后**：可以减少 CNAME 链 RTT 但浏览器 / CDN 推进慢
18. **mDNS 噪声**：家用网络 mDNS 包频繁刷屏，影响 WiFi 链路效率
19. **Punycode 同形字攻击**：`xn--ggle-9pa.com`（带 Cyrillic 'е'）看起来像 google.com，钓鱼利器
20. **DNS 与 TLS 1.3 ECH 的依赖**：Encrypted Client Hello 需要 SVCB 携带 ECH 配置，DNS 部署滞后让 ECH 推进缓慢

## 怀疑总集

> 怀疑 1：DNS 设计 1987 年，UDP 53 端口 + 不加密。30+ 年后仍如此（DoT / DoH 仍是少数）。隐私 / DNS hijack 问题为什么这么慢解决？我倾向于：协议 ossification 是根本原因——1987 年部署的中间盒、防火墙、运营商缓存、企业 split-horizon 都假定明文 UDP 53。任何不兼容的演进都得在生态里推 30 年。但这也暴露 IETF 在"基础协议安全升级"上节奏太慢，浏览器厂商（Mozilla / Google）单边推 DoH 反而被运营商指责"绕过监管"。这是技术问题还是治理问题？我认为是治理：协议层不强制安全，事实标准就由谁强谁说了算。

> 怀疑 2：CNAME 链可达 ~10 跳，浪费 RTT。CDN 大量用 CNAME（example.com → cdn.example.com → cdn-edge.cloudfront.net）。是不是该有"flat 解析"协议？SVCB / HTTPS（RFC 9460, 2023）用单条记录携带多个 endpoint + ALPN + ECH 是部分答案，但浏览器 + CDN 部署慢。深层问题：CNAME 是 1987 设计的副作用——当时只想给"别名"，没预料 CDN 会用它做控制平面。是不是协议设计应该提供"组合记录"原语，而不是用 CNAME 这种单跳别名？

> 怀疑 3：DNS 缓存 TTL 配置失误（如 TTL=86400 时 IP 切换需等 1 天）是 outage 常见原因。这是 1987 设计的 trade-off 还是现代缺陷？我认为这是设计 trade-off 的极端化：TTL 是 cache 与权威之间的"接受了多少陈旧度"的协议层旋钮，但运营人员普遍不理解何时调高 / 何时调低。Facebook 2021 outage 把 TTL 调到 60s 反而让缓存失效快、上游被压垮。是不是该让协议层提供"分级 TTL"（例如：normal TTL + emergency TTL，emergency 用于权威主动 invalidate）？目前 DNS 没有 push invalidation 机制，全靠 TTL 到期，这在 2024 年看是简陋的。

> 怀疑 4：DNSSEC 部署 20 年仍 < 30% 域名启用。这是协议复杂度问题还是商业激励不足？我认为两者都是，但商业激励占大头：注册商不卖 DNSSEC（增加客服成本）、托管商不默认开（怕配置错宕机）、用户不知道差别。技术上 NSEC3 + key rollover 复杂但不是不可解。激励问题更深：DNS hijack 的成本由用户承担（被钓鱼 / 流量劫持），不是注册商。市场失灵 + 信息不对称 = 公地悲剧。是不是该走"浏览器拒绝未启用 DNSSEC 的域名"这种强制路径？但 30% 启用率下这是政治自杀。

> 怀疑 5：DNS 报文 12 字节 header 在 1987 是合理的，2024 看是简陋的——只有 16 bit transaction ID（Kaminsky 利用根因）、16 bit flag（位预算紧）、4 个 count 字段（强制结构化但限制扩展）。如果重新设计，是不是该有 64 bit ID + 显式 length-prefixed sections + capability negotiation（不依赖 EDNS0 的 OPT pseudo-RR hack）？但任何"重做 DNS"的提案（如 DPRIVE WG 早期讨论的 "DNS 2.0"）都被否决，因为 ossification + 部署惯性 + 没人为升级买单。这是协议工程的死锁。

> 怀疑 6：递归 resolver 的极度中心化（Cloudflare 1.1.1.1 + Google 8.8.8.8 + Quad9 占比远超运营商）是 DNS 的隐藏风险。隐私上：所有查询都被这几家看到。可用性上：单点故障影响百万级用户（2020 Cloudflare 17 分钟全球 1.1.1.1 异常）。控制上：浏览器默认走 DoH 把 DNS 选择权从 OS / 运营商夺到几个大厂。是不是 DNS 设计上需要更鼓励"用户运行自己的 resolver"？但 Unbound / dnsmasq 配置门槛高，普通用户不会用。这是 Web2 的中心化趋势在协议层的延伸。

> 怀疑 7：DNS over QUIC（DoQ, RFC 9250, 2022）发布两年，部署率几乎为零。比 DoT 快、比 DoH 简单，理论上是更优解，但生态不动。说明什么？说明协议演进受路径依赖统治：DoH 已经吃了 DNS 加密的市场，DoQ 没有差异化卖点（虽然技术更优）。这与 HTTP/2 → HTTP/3 的演进对比鲜明（HTTP/3 有 connection migration 等独特卖点）。DoQ 是不是说明"技术更好但没新卖点"在协议生态中没有空间？

> 怀疑 8：mDNS（RFC 6762）和 unicast DNS 共用 `.local` TLD 是个失败设计——`.local` 在企业 split-horizon 内网经常被用做 unicast TLD（Active Directory 默认），与 mDNS 冲突。RFC 6762 §22 警告过但部署上没人遵守。是不是 IETF 应该 reserve 更多 TLD 给特定用途（已有 `.test` `.example` `.invalid` `.localhost`），但 `.local` 这种被多种用途抢夺的事故说明 reservation 不够早就晚了？

## GitHub Permalinks

源码精读入口（每条都是稳定 commit / tag 形式的 permalink，链接示意，未实际验证 SHA）：

- **BIND 9 主入口（resolver.c）**：`https://github.com/isc-projects/bind9/blob/v9_18_27/lib/dns/resolver.c`
- **BIND 9 NS 服务（query.c）**：`https://github.com/isc-projects/bind9/blob/v9_18_27/bin/named/query.c`
- **BIND 9 cache 实现（rbtdb.c）**：`https://github.com/isc-projects/bind9/blob/v9_18_27/lib/dns/rbtdb.c`
- **BIND 9 message 编解码（message.c）**：`https://github.com/isc-projects/bind9/blob/v9_18_27/lib/dns/message.c`
- **BIND 9 DNSSEC 验证（validator.c）**：`https://github.com/isc-projects/bind9/blob/v9_18_27/lib/dns/validator.c`
- **BIND 9 zone transfer（xfrin.c）**：`https://github.com/isc-projects/bind9/blob/v9_18_27/lib/dns/xfrin.c`
- **Unbound 主 worker（worker.c）**：`https://github.com/NLnetLabs/unbound/blob/release-1.20.0/daemon/worker.c`
- **Unbound iterator 模块（iterator.c）**：`https://github.com/NLnetLabs/unbound/blob/release-1.20.0/iterator/iterator.c`
- **Unbound validator 模块（val_anchor.c）**：`https://github.com/NLnetLabs/unbound/blob/release-1.20.0/validator/val_anchor.c`
- **Unbound cache（msgreply.c）**：`https://github.com/NLnetLabs/unbound/blob/release-1.20.0/util/data/msgreply.c`
- **Unbound DoH/DoT（daemon/remote.c）**：`https://github.com/NLnetLabs/unbound/blob/release-1.20.0/daemon/remote.c`
- **dnsmasq 主入口（dnsmasq.c）**：`https://github.com/imp/dnsmasq/blob/v2.90/src/dnsmasq.c`
- **dnsmasq forward 路径（forward.c）**：`https://github.com/imp/dnsmasq/blob/v2.90/src/forward.c`
- **dnsmasq cache（cache.c）**：`https://github.com/imp/dnsmasq/blob/v2.90/src/cache.c`
- **dnsmasq DNSSEC（dnssec.c）**：`https://github.com/imp/dnsmasq/blob/v2.90/src/dnssec.c`
- **PowerDNS Recursor 主循环（pdns_recursor.cc）**：`https://github.com/PowerDNS/pdns/blob/rec-5.0.4/pdns/recursordist/pdns_recursor.cc`
- **PowerDNS Recursor syncres（syncres.cc）**：`https://github.com/PowerDNS/pdns/blob/rec-5.0.4/pdns/recursordist/syncres.cc`
- **Knot Resolver iter（lua/iter）**：`https://github.com/CZ-NIC/knot-resolver/blob/v5.7.4/lib/layer/iterate.c`
- **Knot DNS 权威 server（server.c）**：`https://github.com/CZ-NIC/knot-dns/blob/v3.3.5/src/knot/server/server.c`
- **OpenResty lua-resty-dns 异步解析**：`https://github.com/openresty/lua-resty-dns/blob/v0.22/lib/resty/dns/resolver.lua`
- **glibc stub resolver（resolv/res_send.c）**：`https://github.com/bminor/glibc/blob/glibc-2.39/resolv/res_send.c`
- **musl stub resolver（src/network/resolvconf.c）**：`https://github.com/bminor/musl/blob/v1.2.5/src/network/resolvconf.c`
- **Linux kernel mDNS / NSS（很少在 kernel，主在 systemd-resolved）**：`https://github.com/systemd/systemd/blob/v255/src/resolve/resolved.c`
- **CoreDNS（Kubernetes 内嵌 DNS）main**：`https://github.com/coredns/coredns/blob/v1.11.3/coremain/run.go`
- **CoreDNS forward plugin**：`https://github.com/coredns/coredns/blob/v1.11.3/plugin/forward/forward.go`
- **Cloudflare 1.1.1.1 RPZ（部分开源）**：`https://github.com/cloudflare/dns-rdata`
- **Go net/dns 客户端**：`https://github.com/golang/go/blob/go1.22.3/src/net/dnsclient_unix.go`

精读建议：

1. **先读 BIND 9 的 lib/dns/message.c** —— 报文编解码是 DNS 的入门，C 实现 + 注释充分，每个 RR 类型对应 RFC 1035 章节
2. **对照 RFC 1035 §4 报文格式 + §3 RR 类型表** —— 边读 RFC 边读代码，互相印证 label 压缩 / pointer / TTL 解析
3. **再读 Unbound 的 iterator/iterator.c** —— iterative chain 的状态机，从"发请求 → 等响应 → 看 referral → 切下一跳"展开。Unbound 比 BIND 更现代，注释更适合学习
4. **dnsmasq forward.c 是迷你版** —— 不到 2000 行实现完整 forward + cache，适合快速通读看整个 query 路径
5. **DNSSEC 部分先读 Unbound validator/** —— 信任链 + RRSIG 验证逻辑相对独立，比 BIND 的实现更易读
6. **glibc res_send.c + musl resolvconf.c 对照看 stub 实现** —— 简单但有 search list / IPv6 偏好 / 超时重试等微妙逻辑，是 /etc/resolv.conf 行为的源头
7. **CoreDNS 是 Go 生态最易读** —— Kubernetes service discovery 内嵌它，plugin 架构清晰，适合学整体抽象
8. **Knot DNS 是性能基准** —— C 写的高性能权威 NS，常用做 root server 实现之一，适合学 hot path 优化
9. **Cache poisoning 的 mitigation 在每个实现都有 commit 痕迹** —— 搜索 "Kaminsky" "port randomization" 看 2008 年前后的 patch 对比

## 学到什么 + 关联

学到的：

1. **层次命名空间 + 委派是分布式控制权的本质** —— DNS 把"全球命名"切成树 + 把每个子树委派出去，是后续所有命名系统（LDAP / Consul / etcd / Kubernetes service / DID）的概念原型
2. **缓存 + TTL 是分布式系统中的"弱一致性"原语** —— TTL 是 cache 与权威之间的协议层旋钮，过高过低都是事故。设计任何分布式 cache 都要有"什么时候过期"的明确语义
3. **协议简单到一个包就能跑** —— 1987 设计 UDP 53 单包请求 / 单包响应，让 DNS 性能极好（1 RTT），但同时锁死协议进化（38 年没法加大 header）
4. **Zone vs Domain 的概念分层** —— 语义边界 vs 管理边界的解耦是大型系统设计的通用模式（数据 vs 物理分布、逻辑 namespace vs 物理 cluster）
5. **TTL 设计是双刃剑** —— Facebook 2021 outage 的根因是 TTL 太低让缓存失效快，权威又不可达。架构上"快速失效 + 权威必须高可用"是 trade-off
6. **Anycast 让单 IP 全球部署** —— 1.1.1.1 / 8.8.8.8 是 anycast 的成功范例，BGP 路由让最近的 PoP 接管。这是后续 CDN / edge computing 的基础
7. **协议 ossification 是真实威胁** —— DNS 38 年的"中间盒丛林"让任何不兼容的演进必须等十年级别的部署。EDNS0 把扩展空间留在 OPT pseudo-RR 是务实的妥协
8. **labels 压缩这种"每包小优化"在 1987 必要、2024 看简陋** —— 当时 512 字节限制下必须压，现在带 EDNS0 的 4096 字节 + 99% 网络 MTU 1500 都不再是瓶颈
9. **RR 类型的可扩展性是 DNS 长寿的关键** —— 从 1987 的 16 种到 2024 的 90+ 种，新需求（DKIM / DANE / SVCB / ECH）都靠新 RR 类型不破坏老 client 实现
10. **TXT 被滥用反映"任意文本"的危险** —— 设计为注释，结果成了控制平面（SPF / DKIM / DMARC / ACME）。协议给的 escape hatch 一定会被用满
11. **CNAME 与 RR 协同的限制** —— "CNAME 不能与其他类型共存"这条规则微妙但深远，影响 ALIAS / ANAME 等扩展尝试都失败
12. **DNSSEC 部署难是协议 + 激励 + 教育的三重失败** —— 协议复杂、注册商无利可图、用户不感知。这是基础设施安全的通病
13. **DoH 的浏览器单边推动是治理问题** —— 浏览器厂商绕过运营商把 DNS 加密化，技术上正确，治理上引发主权争议。协议演进受谁控制比技术本身更重要
14. **协议工程的根本约束是"能不能不破坏老 client"** —— 1987 部署的 stub resolver 今天仍在跑，所有扩展必须向后兼容
15. **DNS = 互联网的"前置依赖"也是单点风险** —— TLS / HTTP / SMTP / CDN / Kubernetes 全依赖 DNS，DNS 崩了一切都崩（FB 2021 / Dyn 2016 实证）

关联：

- [[tcp]] —— TCP 53 是 DNS 大响应的兜底（TC bit 触发切换），DNS 也是 TCP 连接建立前的依赖（连接 IP 必须先 DNS 解析）
- [[tls-1.3]] —— TLS SNI 用 DNS 域名做证书匹配，TLS Encrypted Client Hello (ECH) 依赖 SVCB DNS 记录传递配置
- [[quic]] —— QUIC 连接前必须 DNS 解析，DoQ (RFC 9250) 是 DNS over QUIC，提供加密 + 0-RTT
- [[http-2]] —— HTTPS 访问必须先 DNS 解析；DoH 把 DNS 查询塞进 HTTP/2 的 frame，多路复用 + 低延迟兼得
- [[bert]] [[attention]] —— LLM API 域名（api.openai.com / api.anthropic.com）的 DNS hijack 风险高，企业部署应启用 DNSSEC + DoT
- [[bigtable]] [[spanner]] —— 大型分布式数据库的内部 service discovery 严重依赖 DNS（Kubernetes CoreDNS / Consul）
- [[chubby]] —— ZooKeeper / Chubby 类锁服务也要靠 DNS 发现 ensemble member，DNS outage 直接让 leader election 卡住
- [[paxos]] [[raft]] —— 共识协议的 member 发现通常走 DNS，DNSSEC 启用与否影响 cluster 抗劫持能力
- [[clickhouse]] —— 集群发现 / replica 路由依赖 DNS，跨数据中心场景受 DNS RTT 影响
- [[calvin]] —— 跨地域分布式事务的 leader 选举依赖 DNS resolve 到正确 region
- [[crdt-json]] —— P2P 系统少依赖 DNS，但仍要 bootstrap node 通过 DNS 发现

进一步阅读：

- RFC 1034 / 1035（本体，1987）
- RFC 1995（IXFR, 1996）+ RFC 5936（AXFR, 2010）
- RFC 2181（DNS Clarifications, 1997）澄清 1034/1035 模糊处
- RFC 2308（Negative Caching, 1998）
- RFC 2782（SRV records, 2000）
- RFC 3596（AAAA / IPv6, 2003）
- RFC 4033 / 4034 / 4035（DNSSEC, 2005）
- RFC 5891（IDN / Punycode, 2010）
- RFC 6762 / 6763（mDNS / DNS-SD, 2013）
- RFC 6891（EDNS0, 2013）
- RFC 7858（DoT, 2016）
- RFC 8484（DoH, 2018）
- RFC 8499（DNS Terminology, 2019）
- RFC 9250（DoQ, 2022）
- RFC 9460（SVCB / HTTPS, 2023）
- RFC 9462（DDR, 2023）
- "DNS and BIND" by Cricket Liu & Paul Albitz（O'Reilly 5th ed, 2006）—— 经典工具书
- "Pro DNS and BIND 10" by Ron Aitchison（Apress, 2011）
- Geoff Huston 的 APNIC 博客（DNS 测量数据 + 部署观察的最佳来源）
- Cloudflare blog "How 1.1.1.1 works"（anycast + privacy 设计）
- "Domain Name System Security Extensions" Mockapetris 自评（1990s 关于 DNSSEC 早期讨论的回顾）
- USENIX 2020 SAD DNS（side channel 攻击）
- Black Hat 2008 Kaminsky 演讲幻灯片（cache poisoning 经典）
