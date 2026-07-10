---
title: Amplification Hell 2014 — 把家用宽带放大成几百 Gbps 的反射攻击
来源: 'Christian Rossow, "Amplification Hell: Revisiting Network Protocols for DDoS Abuse", NDSS 2014'
日期: 2026-06-01
分类: 网络协议
难度: 中级
---

## 是什么

Amplification Hell 是 2014 年 Rossow 在 NDSS 发的一篇系统测量论文，把当时互联网上 14 种基于 UDP 的协议（DNS、NTP、SSDP、CharGen、SNMP、NetBIOS、Quake 3、BitTorrent 等）逐个测了一遍："攻击者发一个伪造源 IP 的小请求，能把多大的回包砸到受害者头上？" 结论是：**最狠的 NTP `monlist` 命令，能把 234 Byte 请求放大到 100 KB 回包，倍数 556 倍**；DNS、SSDP 也能做到几十倍。

日常类比：你给一家自助餐厅打电话订餐，但留的是仇人家的地址——餐厅照单做了 100 份外卖送到仇人门口。打电话只用一秒，仇人门口堆了一星期吃不完的饭。**反射** = 让别人代你打人；**放大** = 你出一拳变十拳。两个机制叠加，一根普通家用宽带（10 Mbps 上行）就能把几百 Gbps 的流量怼到任何受害者脸上。

这篇论文给整个 2010 年代后半段反射 DDoS 浪潮做了体检报告。它解释了为什么 2013 年 Spamhaus 会被 DNS 反射打到 300 Gbps、2014 年 NTP `monlist` 会把攻击量级推到数百 Gbps、2018 年 GitHub 又会被 memcached 反射打到 1.35 Tbps——不是攻击者突然有了核武器，而是互联网上摆着上百万台默认开放的 NTP / DNS / SSDP / memcached 服务器，谁都能征用。

## 为什么重要

不理解这篇论文，下面这些事都讲不清：

- 为什么 2014 年初所有运维同学突然要紧急升级 ntpd、关掉 `monlist`——不是 ntpd 本身有 bug，是它被当反射器
- 为什么 CDN（Cloudflare / Akamai）2014 后开始大规模卖 "DDoS 防护"——以前是奢侈品，之后成刚需
- 为什么 [[mockapetris-1988-dns]] 这种 1980 年代的协议设计选择（UDP + 大响应）在 2010 年代会成为系统级风险——当时根本没人考虑伪造源 IP 的滥用
- 为什么 RFC 2827（BCP 38，1998 年就写好的源 IP 入口过滤）部署率到 2014 年还不到 30%——技术早就存在，激励错配没人愿意先动
- 为什么 2018 年 memcached 反射放大能做到 51000 倍——是这套测量方法论换协议复用，不是新发明

## 核心要点

整篇论文的骨架是两个量化指标：

1. **BAF（Bandwidth Amplification Factor）= 响应 Byte 数 / 请求 Byte 数**。衡量你"省"了多少上行带宽。NTP monlist 是 556 倍，意味着 1 Mbps 攻击者可输出 556 Mbps 攻击流量。

2. **PAF（Packet Amplification Factor）= 响应包数 / 请求包数**。衡量受害者侧的包率压力——很多防火墙不是被 Byte 打爆，是被包率打爆。NTP monlist PAF 也有几十倍。

放大攻击成立的**三要素**缺一不可：

1. **协议基于 UDP（无握手）**：TCP 三次握手要求双方互发，源 IP 是假的就握不上，反射就废了。UDP 没这层验证，发个包就回。
2. **响应远大于请求**：协议设计时为了"一次问、多条返"省 RTT（DNS ANY、NTP monlist、SSDP M-SEARCH），但攻击者把"省 RTT"翻译成"放大武器"。
3. **公开服务器数量大**：互联网上有几百万开放 DNS resolver、几十万开放 NTP server、上千万 UPnP/SSDP 设备——分母够大，单台被屏蔽不疼。

第四个隐性前提是**源 IP 伪造在 ISP 出口没被过滤**——RFC 2827 BCP 38 早就写明 ISP 应该丢弃"源地址不属于本网段"的出向包，但部署激励错配（成本在 ISP A 出，收益在受害者 B），到 2014 年覆盖率仍不到 30%。

## 实践案例

### 案例 1：NTP monlist 是怎么变成核武器的

`monlist` 是 ntpd 的一个调试命令，"返回最近联系过我的 600 个客户端 IP"。设计意图是网络管理员排查谁在 sync 时间。1990 年代写 ntpd 的人没想过：

```text
攻击者 -> ntp-server (UDP 234 byte: "monlist?", src=victim_ip)
ntp-server -> victim   (UDP ~100 KB: 600 entries × ~170 byte)
```

伪造源 IP 让 NTP 服务器把 100 KB 回包砸给受害者。在 IPv4 互联网上扫一遍，**约 170 万台 NTP 服务器开了 monlist**。攻击者控制几千个肉鸡每秒发一个 monlist 请求，输出就是几百 Gbps。这个协议设计本身没有 bug——它**忠实地按规范工作**，只是规范没考虑被滥用。

### 案例 2：DNS ANY 查询的放大数学

DNS 协议（[[mockapetris-1988-dns]]）允许 `ANY` 查询——返回某个域名所有记录类型。攻击者注册一个域名，塞进去尽可能多的大 TXT 记录：

- 请求：64 Byte（一个 ANY 查询包）
- 响应：3000+ Byte（DNSSEC 加签后更大）
- BAF ≈ 50 倍

互联网上约 2800 万开放递归 resolver（家用路由器、配错的 DNS 服务器）都能被征用。Spamhaus 2013 年被打的就是这个套路。

### 案例 3：SSDP——把家里的智能音箱变成攻击工具

SSDP（M-SEARCH 服务发现协议，UPnP 的一部分）跑在每个智能电视、路由器、打印机上，端口 1900。一个 100 Byte 的 `M-SEARCH * HTTP/1.1` 请求会让设备返回 3-7 KB 的设备描述。家庭 IoT 设备数量在亿级，2014 年后 SSDP 反射成为 DDoS 主力之一。

```text
attacker -> home_router:1900   (100 byte M-SEARCH, src=victim)
home_router -> victim          (~3 KB device descriptor)
```

整片教训：**协议设计者在 1990s 想的是局域网，没考虑被公网征用**。

## 踩过的坑（论文揭示的反直觉点）

1. **以为 BCP 38 部署了就能解决——并没有**。BCP 38 是接入侧 ISP 过滤伪造源 IP，但**激励错配**：过滤的成本是 ISP A，受益是受害者 B 的 ISP，谁先动谁吃亏。论文里的全网测量显示，到 2014 年仍有大量 AS 不做出向 SAV（Source Address Validation）。

2. **响应包散播让追踪极难**。攻击者用了 100 万个 amplifier，受害者抓到的所有包源 IP 都是合法的 NTP/DNS 服务器。要溯源到攻击者本人，必须沿路 ISP 联手——实操中几乎不可能。

3. **临时关闭 amplifier 治标不治本**。2014 年大家紧急关 monlist 后，攻击者立刻换 SSDP、再换 CLDAP、再换 memcached——只要 UDP+大响应+开放服务器三要素还在，新协议总能找到。

4. **BAF 是均值不是上限**。论文给的 NTP=556 是平均值，最坏情况某些 monlist 命令能打到 5000+ 倍。memcached 2018 后被发现 BAF 可达 51000 倍，整套方法论被反复验证。

5. **关掉 monlist 不等于关掉 NTP 反射**。NTP 还有 `peers`、`sysstats` 等多个返回大数据的命令，攻击者会换。这种"打地鼠"困境说明：一旦协议设计允许"小请求大响应"，单点修补永远赶不上攻击面扩张。

6. **协议+IP 伪造的双向锁**。如果只解决"响应过大"或只解决"源 IP 伪造"任一项，攻击就废了。两件事同时存在的根本原因是不同标准、不同时代、不同利益方各自决策——没有一个统一的负责人来协调。

## 适用 vs 不适用场景

**适用**：

- 防御侧选型：判断哪些 UDP 服务**绝对不能直接暴露公网**（NTP monlist / DNS open resolver / SSDP / memcached）
- 协议设计：新协议默认应基于 TCP 或带 cookie 握手；UDP 协议响应不应远大于请求
- 运营商安全工程：BCP 38 部署优先级、出向流量异常检测

**不适用**：

- 解释**应用层** DDoS（HTTP flood、Slowloris）——那是 TCP 上的，机制完全不同
- 解释**容量型 + 反射型混合**攻击的细节——本文聚焦反射放大单一向量
- IoT 僵尸网络（Mirai）的传播机制——那是另一条故事线，本文只看"成网后如何放大"
- 加密协议本身的弱点（[[heartbleed-2014]]、[[lucky13-2013]] 是侧信道/实现 bug，不是放大）

## 历史小故事（可跳过）

- **1996 年**：Smurf 攻击出现——ICMP 广播反射，是反射 DDoS 思想的鼻祖。
- **2001 年**：Vern Paxson 在 ACM CCR 写《An Analysis of Using Reflectors for DDoS》，第一次系统化讨论"反射"概念。
- **2006-2010**：DNS 反射攻击零星出现，但量级在十 Gbps 级别，没引起广泛关注。
- **2013 年 3 月**：Spamhaus 被 300 Gbps DNS 反射打瘫——首次破历史纪录的 DDoS。
- **2013 年底**：NTP monlist 被攻击者发现可用——量级跳到 400 Gbps。
- **2014 年 2 月**：Rossow 在 NDSS 发本论文，把"反射放大"从轶事级别上升到系统化测量。同月 ntpd 4.2.7p26 默认关 monlist。
- **2016 年 10 月**：Mirai 僵尸网络打 Dyn DNS——这是 IoT 僵尸网络直接流量的代表，不是本文的反射机制，但说明容量型 DDoS 已进入 Tbps 时代。
- **2018 年 2 月**：GitHub 被 1.35 Tbps memcached 反射打中——本文方法论换协议再现。

整个 2010 年代 DDoS 量级从十 Gbps 到 Tbps 三个数量级的跃迁，重要原因不只是带宽变便宜，还包括**没人花一年去把"开放的反射器"扫出来登记**——这篇论文就是那张登记表。

## 学到什么

1. **协议设计选择会跨越几十年来收账**。UDP 无握手 + 大响应在 1980s 是为了省 RTT，到 2010s 就是放大武器。设计文档里"性能优化"四个字背后埋的是几十年后的安全债。

2. **激励错配是工程系统的真正瓶颈**。BCP 38 技术上 1998 年就解决了，部署到 2024 年仍不全——技术正确不等于工程落地。每一个"为什么这么明显的事没人做"问题背后都是激励错配。

3. **测量是安全研究的硬通货**。论文最大贡献不是发现某个新攻击，而是把"大家都隐约知道"的反射风险变成 BAF=556 这种**具体数字**——数字一出来，运维就有 SLO，标准制定者就有依据。

4. **防御要在"三要素"之一上斩断**。任何反射放大都需要 UDP+大响应+开放服务器+源伪造四件套。少一件就废一半——这是后来 QUIC 引入 source token、DNS over TLS 推广、BCP 38 复活的根本逻辑。

## 延伸阅读

- 论文 PDF：[Amplification Hell - NDSS 2014](https://www.ndss-symposium.org/wp-content/uploads/2017/09/01_5.pdf)（13 页，表格密度高，重点看 Table 2 的 BAF/PAF 矩阵）
- 攻击编年史：[Cloudflare DDoS Trends Reports](https://radar.cloudflare.com/reports)（每季度一份，能看到反射攻击占比逐年下降——说明本文影响力）
- BCP 38 RFC：[RFC 2827 — Network Ingress Filtering](https://datatracker.ietf.org/doc/html/rfc2827)（1998 年的解决方案，至今未完全部署）
- [[mockapetris-1988-dns]] —— 被滥用的协议本身，看设计初衷如何被时代超越
- [[ntp-mills-1991]] —— NTP monlist 命令的来源
- [[heartbleed-2014]] —— 同年另一种"标准缺陷"，对照看实现 bug vs 协议 bug 的区别

## 关联

- [[mockapetris-1988-dns]] —— DNS 是本文测的 14 个协议里被滥用最广的
- [[ntp-mills-1991]] —— NTP monlist BAF=556 是论文的标志性数字
- [[rfc-3833-dns-threats]] —— DNS 威胁模型扩展，2004 年就提到反射但没量化
- [[heartbleed-2014]] —— 同年的另一类标准级安全事件
- [[logjam-2015]] —— 同样揭示"标准 + 默认值"层面的系统性弱点
- [[akamai-2002]] —— CDN 是反射放大攻击的主要被害对象之一，也是主要防御者

## 一句话总结

UDP 协议想省 RTT，结果 30 年后被攻击者征用成放大武器；论文用 BAF/PAF 两个数字把"反射放大"从轶事变成可量化的工程问题，奠定了 2014 年后整个 DDoS 防御产业的语言体系。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[akamai-2002]] —— Akamai 2002 — 把网站搬到离用户 10 毫秒的地方
- [[debate-2018]] —— AI safety via debate — 让两个 AI 互辩，人类只当评委
- [[logjam-2015]] —— Logjam 2015 — 全世界共用一把锁，国家级窃听者一次撬完
- [[lucky13-2013]] —— Lucky 13 — 用毫秒级时间差把 TLS 加密看穿
- [[mockapetris-1988-dns]] —— Mockapetris 1988 DNS — 设计者亲口讲为什么 DNS 长这样
- [[ntp-mills-1991]] —— NTP 1991 — 用四个时间戳和一组滤波器，让全网服务器的钟差几毫秒
- [[rfc-3833-dns-threats]] —— RFC 3833 — IETF 第一次正式承认 DNS 不安全

