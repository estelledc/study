---
title: DNS — 把全球域名解析切成一棵可分布维护的树
来源: 'Paul Mockapetris, "Domain Names - Concepts and Facilities / Implementation and Specification", RFC 1034 + RFC 1035, 1987'
日期: 2026-05-30
子分类: 网络协议
分类: 网络协议
难度: 中级
provenance: pipeline-v3
---

## 是什么

DNS（Domain Name System）是**把全世界的域名翻译成 IP 地址的分布式数据库**。日常类比：像一个超大型图书馆分馆系统。总馆不存所有书，它只记一件事——"想看医学书去 A 分馆，想看小说去 B 分馆"。A 分馆自己再管"心脏病在三楼、皮肤病在四楼"。读者一层一层问下去，最后拿到书。

你在浏览器输入 `www.google.com`：

1. 你电脑问运营商的 DNS：`www.google.com` 的 IP 是多少？
2. 运营商先问根服务器：`.com` 归谁管？
3. 再问 `.com` 服务器：`google.com` 归谁管？
4. 最后问 Google 的服务器：`www.google.com` 是哪个 IP？答 `142.250.0.0`。

整个过程通常 50 毫秒内完成，且大部分查询会被缓存住，下次直接回答。

## 为什么重要

不理解 DNS，下面这些事都没法解释：

- 为什么改一次域名指向，要等几小时甚至一天才全网生效——是 TTL 缓存在挡你
- 为什么 Facebook 2021 年宕机 6 小时，员工连办公门禁都刷不开——DNS 一倒，整个公司的内部服务连入口都找不到
- 为什么"DNS 污染"能让一个网站在某些地区打不开——中间人在你和真服务器之间塞了假回答
- 为什么 Kubernetes 集群里改个服务名字，所有微服务自动找得到对方——内部跑了一个微型 DNS

## 核心要点

DNS 的设计精髓可以拆成 **5 块**：

1. **层次命名空间**：所有域名挂在一棵树上，根节点是 `.`，往下分 `.com` `.org` `.cn`，再往下是 `google.com`，再往下是 `www.google.com`。类比：邮政地址从国家到省到市到街道。

2. **zone 委派**：每一级可以把"管这个子树"的权力委派给别人。`.com` 的 zone 不直接管 `google.com` 的细节，只记一句"问 Google 自己的服务器"。类比：上级单位把分公司业务全部放手。

3. **resolver 走树**：客户端有个叫 resolver 的小程序，它从根开始一层层问，每问一次就更靠近答案。类比：导航 App 一段段拿路线，不是一次性下载全国地图。

4. **TTL 缓存**：每条记录都带"保质期"（TTL）。在保质期内，任何中间人都可以缓存答案，不必每次都打回权威。类比：超市进货单写"3 天有效"，3 天内不必重新询价。

5. **资源记录（RR）多类型**：DNS 不只存"域名 → IP"，还存"域名 → 邮件服务器（MX）"、"域名 → 别名（CNAME）"、"域名 → 公钥（DNSKEY）"等。类比：图书馆卡片不只写位置，还写作者、出版社、ISBN。

## 实践案例

### 案例 1：在命令行看一次完整查询

```bash
dig +trace www.example.com
```

`+trace` 让 dig 模拟 resolver，从根开始一跳跳走：

```
.        IN NS  a.root-servers.net.
com.     IN NS  a.gtld-servers.net.
example.com.   IN NS  a.iana-servers.net.
www.example.com.  IN A  93.184.216.34
```

**逐部分解释**：每一行都是一次"问下一层在谁那"，最后一行 `A` 才是真答案。中间几跳叫 referral（转交），不是 answer。

### 案例 2：TTL 怎么影响切换速度

域名管理后台你可能见过这个：

```
www  A  93.184.216.34  TTL=3600
```

TTL 3600 秒 = 1 小时。意思是任何 resolver 拿到这条记录，1 小时内不会再问权威。如果你要换 IP，先把 TTL 调到 60，等 1 小时让旧记录在全网失效，再改 IP，新 IP 几分钟就生效。直接改不调 TTL，可能有用户卡在旧 IP 一整天。

### 案例 3：Kubernetes 内部用 DNS 做服务发现

```yaml
apiVersion: v1
kind: Service
metadata:
  name: redis
```

集群里其他 Pod 直接用 `redis.default.svc.cluster.local` 就能连上。背后是 CoreDNS 维护一个 cluster.local zone，每个 service 自动有 A 记录，service 删了 DNS 也跟着删。微服务间不再硬编码 IP，DNS 当注册中心。

## 踩过的坑

1. **TTL 配错**：TTL 太高，切换 IP 等一天；TTL 太低，权威挂了缓存全部失效，所有用户挤上去把权威压垮。Facebook 2021 outage 就是后者。

2. **CNAME 与其他记录冲突**：同一个名字下不能同时有 CNAME 和 A，也不能把 CNAME 放在 zone 顶点（`example.com` 本身）。这条规则坑过无数 CDN 接入新手。

3. **UDP 53 不加密**：默认 DNS 查询是明文 UDP 包，运营商或公共 WiFi 可以看见、改写。中文世界常说的"DNS 污染"就是这个。解法是 DoT（端口 853）或 DoH（443 走 HTTPS）。

4. **stub resolver 实现差异**：你电脑里的 DNS 客户端在 macOS 是 mDNSResponder、Linux 是 systemd-resolved、Windows 是 DNS Client，对 `/etc/hosts`、search list、IPv6 偏好的处理各不相同，跨平台调试 DNS 经常是"我这能跑你那不行"。

额外踩坑：**glue record 缺失**。父 zone 委派给 `ns1.example.com`，但这个名字本身又在被委派的子 zone 里，会循环。父 zone 必须附上 ns1 的 IP（glue）打破循环；漏写就一查 SERVFAIL。

## 适用 vs 不适用场景

**适用**：

- 全球唯一命名 + 分布式维护（互联网域名、邮件路由、CDN 调度）
- 服务发现（Kubernetes CoreDNS、Consul、Active Directory）
- 本地链路 zero-config（家里打印机、Chromecast 走的 mDNS）

**不适用**：

- 强一致性场景（DNS 永远是弱一致 + TTL 缓存，不能当事务存储）
- 内置加密通信（明文 UDP 53 是默认，加密要靠 DoT/DoH 附加层）
- 主动 push 失效（DNS 没有 invalidation 机制，全靠 TTL 自然到期）
- 高频读写（一条记录改完要等 TTL，不是数据库）

## 历史小故事（可跳过）

- **1973-1983 年**：ARPANET 用一个文件 `HOSTS.TXT` 存所有主机名 → IP，由 SRI-NIC 集中维护，每台机器周期性 FTP 拉取。主机过千之后，这个模式崩了。
- **1983 年**：Paul Mockapetris 发出 RFC 882/883，第一次提出 DNS 概念，但部署不广。
- **1987 年**：Mockapetris 完全重写，发出 RFC 1034（概念）和 RFC 1035（实现），这一版成事实标准延续至今。
- **1988 年**：伯克利 BIND 作为参考实现发布，今天根服务器和大量 TLD 仍在跑它。
- **2005 年**：DNSSEC（RFC 4033）发布，给 DNS 加签名防篡改；但部署滞后，2024 年单域名启用率仍 < 30%。

之后 38 年，从浏览器到 Kubernetes 到智能家居，全部建在这棵树上。

## 学到什么

1. **层次命名 + 委派是分布式控制权的本质**——把全球命名切成树，每个子树委派出去，是后续所有分布式命名系统（LDAP / Consul / etcd / Kubernetes service）的概念原型
2. **TTL 是分布式弱一致性的一颗旋钮**——高了切换慢，低了缓存失效压垮上游，没有完美值，只有当下场景的取舍
3. **协议简单到一个 UDP 包就能跑**——1987 年的设计让 DNS 极快（1 RTT），但同时锁死了协议演进，38 年没法加大 header
4. **一切互联网协议的前置依赖**——HTTP / TLS / SMTP / CDN / Kubernetes 全靠 DNS 第一步解析，DNS 一倒满盘皆输

## 延伸阅读

- 视频教程：[Cloudflare — How DNS Works](https://www.youtube.com/watch?v=72snZctFFtA)（10 分钟动画讲清楚整棵查询树）
- 工具书：Cricket Liu & Paul Albitz, "DNS and BIND" O'Reilly 第 5 版（部署运维经典）
- 论文 PDF：[RFC 1034 + 1035 原文](https://www.rfc-editor.org/rfc/rfc1035)（1987 年的设计文档，今天读仍清晰）
- 博客：[Cloudflare — How 1.1.1.1 works](https://blog.cloudflare.com/dns-resolver-1-1-1-1/)（公共 resolver + anycast 的实战工程）
- 测量数据：[APNIC Geoff Huston DNS 博客](https://blog.apnic.net/category/tech-matters/dns/)（DNSSEC / DoH 部署率全球长期跟踪）

## 关联

- [[tcp]] —— DNS 大响应包超 512 字节会切到 TCP 53；TCP 建连前必须先 DNS 解析
- [[tls-1.3]] —— TLS 用 SNI 域名做证书匹配，Encrypted Client Hello 还要靠 DNS 的 SVCB 记录传配置
- [[quic]] —— QUIC 连接前必须 DNS 解析；DoQ（RFC 9250）把 DNS 直接跑在 QUIC 上提速
- [[http-2]] —— HTTPS 访问任何域名前都先 DNS；DoH 把 DNS 查询塞进 HTTP/2 帧多路复用
- [[paxos]] —— 共识协议 member 发现常走 DNS，DNS 一卡 leader election 就停
- [[spanner-2012]] —— 跨地域分布式数据库的 zone 路由依赖 DNS 解析到正确 region
- [[kubernetes]] —— CoreDNS 内嵌进集群，把 service 名字翻译成 ClusterIP，是微服务通信的隐形地基

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[akamai-2002]] —— Akamai 2002 — 把网站搬到离用户 10 毫秒的地方
- [[akamai-2010]] —— Akamai 2010 — 从内容分发网络长成全球应用平台
- [[attention]] —— Attention Is All You Need
- [[bert]] —— BERT — 双向 Transformer 预训练
- [[cerf-kahn-1974]] —— Cerf-Kahn 1974 — 用网关把异构网络拼成一个互联网
- [[chubby]] —— Chubby — 给凡人用的分布式锁服务
- [[clark-1988]] —— Clark 1988 — TCP/IP 七大目标的优先级，决定了 Internet 长成今天这样
- [[clickhouse]] —— ClickHouse — 列式 OLAP 数据库
- [[codons-2004]] —— CoDoNS — 用 P2P 哈希表替代分层 DNS 的实验
- [[crdt-json]] —— CRDT JSON — 协同编辑 JSON 数据结构
- [[dot-doh-perf-2020]] —— DoT/DoH 性能 — 给 DNS 加密之后网页变快还是变慢
- [[gao-2001-as-relations]] —— Gao 2001 — 用算法猜出互联网上 AS 之间谁给谁付钱
- [[http-2]] —— HTTP/2 — 把 HTTP 从文本协议改造成二进制多路复用
- [[kubernetes]] —— Kubernetes — 容器编排平台
- [[mills-ntp-1991]] —— NTP 1991 — 用四个时间戳和一棵服务器树，让全互联网的钟差几毫秒
- [[mockapetris-1988-dns]] —— Mockapetris 1988 DNS — 设计者亲口讲为什么 DNS 长这样
- [[mptcp-2012]] —— MPTCP 2012 — 把一根 TCP 管道变成多条并行水管
- [[paxos]] —— Paxos — 分布式共识算法
- [[quic]] —— QUIC — 把可靠传输从内核搬到用户空间
- [[raft]] —— Raft — 易理解的共识算法
- [[rfc-3833-dns-threats]] —— RFC 3833 — IETF 第一次正式承认 DNS 不安全
- [[spanner]] —— Spanner — 全球分布式 SQL 数据库
- [[spanner-2012]] —— Spanner 2012 — 用原子钟和 GPS 给全球数据库发时间戳
- [[tcp]] —— TCP — 在不可靠的 IP 上凿出一条 reliable 字节流

