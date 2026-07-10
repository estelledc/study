---
title: Calder 2015 — Anycast CDN 在生产环境真的能用吗
来源: Calder et al., "Analyzing the Performance of an Anycast CDN", IMC 2015
日期: 2026-06-01
分类: 网络协议
难度: 中级
---

## 是什么

这篇论文是**第一次大规模实测**——把 Microsoft Bing 用的 anycast CDN 拿来量一量，看看它到底好不好用。

日常类比：你有 22 家分店遍布全国，每家挂同一个电话号码（这就是 anycast——多个机房共用同一个 IP）。客户拨打这个号码，**电话公司**（运营商的 BGP 路由）自动把电话接到"最近"的分店。问题是——电话公司说的"最近"，是真的最近吗？

作者花了几个月，收集 **10 亿次** 真实客户端请求的路由数据，给出了答案：90% 用户接到了最近或接近最近的分店；10% 用户被接到了奇怪的地方；1% 极端病态——人在欧洲，电话被接到了北美。

这是把 anycast 这个老技术从"听说能用"推到"知道哪里能用、哪里不能用"的关键论文。

## 为什么重要

不读这篇，下面这些事都没法解释：

- 为什么 Cloudflare、Fastly 敢押注 anycast，不像 [[akamai-2002]] 那样建庞大 DNS 测量基础设施
- 为什么 Microsoft / Facebook 2015 前后集体从 DNS-based 转向 anycast
- 为什么"BGP 选最短路径"在 90% 时候够用、10% 时候坑人——根因在哪
- 为什么后续论文（FastRoute、Footprint、Edge Fabric）都在折腾"anycast + 一点点纠偏"

简单说：这篇是 anycast CDN 工程化的**定量基线**。

## 核心要点

### 1. 实验设置

- **22 个 anycast site**，分布在全球（北美、欧洲、亚太）
- **同一个 IP 前缀** 在所有 site 通过 BGP 宣告
- **客户端**：Bing 搜索的真实用户，按 ISP 和地理分桶
- **测量信号**：JavaScript 在浏览器里 ping 多个 site 的 unicast IP，把 anycast 实际命中的 site 与"理论最优 site"对比

### 2. 三档结果

| 客户端比例 | 命中情况 | 含义 |
|----------|---------|------|
| ~90% | RTT ≈ 最优（差距 < 25ms） | anycast 表现良好 |
| ~9% | RTT 比最优差 25-100ms | 次优——可感知的延迟 |
| ~1% | RTT 差 100ms+，跨洲跑 | 病态——完全错配 |

### 3. 病态原因（重点）

BGP 选路看的是 **AS-path 长度** 和 **运营商策略**，不是地理距离：

- 某 ISP 跟北美 site 直连（peering），跟欧洲 site 要绕第三方——**就算欧洲用户离欧洲 site 物理上更近，BGP 也把他送去北美**
- 某些大型 ISP 的 hot-potato 路由：流量一进它的网络就立刻交给最近的出口，但这个出口可能在另一个国家
- 极个别情况是 **路由泄漏 / 误配**——参考 [[mahajan-2002-bgp-misconfig]]，BGP 误配导致流量绕地球
- **AS 之间 peering 关系不对称**：你能从 A 收到的最佳路径，未必是 A 收到你的最佳路径——anycast 双向都受影响

### 4. 与 DNS-based 的对比

[[akamai-2002]] 走 DNS：客户端查 `cdn.example.com`，DNS 服务器**实时算**最近 site 返回 IP。优势是能纠偏（看到 RTT 不对就换答案）；代价是要建全球测量基础设施 + 维护客户端 IP 到地理位置的映射。

anycast 走 BGP：**部署极简**，不需要 DNS 智能调度。代价是失去精细控制——BGP 不听你的，听运营商策略的。

工程权衡：

- **追求简单 + 90% 体验** → anycast
- **追求 99 分位 + 愿意养基础设施** → DNS-based
- **两者结合** → 后续论文的方向（anycast 兜底 + 测量纠偏）

## 实践案例

### 案例 1：BGP 把欧洲用户路由到美国

某德国 ISP 与 Microsoft 在法兰克福、阿姆斯特丹、北弗吉尼亚都有 peering。BGP 看 AS-path——发现去北弗吉尼亚的 path 只有 2 跳（直连 + Microsoft 主干），去法兰克福的 path 有 3 跳（要走第三方）。**结论**：把欧洲用户的流量送到美国。RTT 从理想的 15ms 变成 110ms。

可以把修复想成一条很小的路由策略：

```text
if customer_region == "DE" and peer == "frankfurt":
  set local_pref = 200
else if peer == "north-virginia":
  set local_pref = 100
announce anycast_prefix
```

逐部分看：

- `local_pref` 是 ISP 内部的"优先级分数"，分数高就优先从法兰克福出口走。
- `announce anycast_prefix` 仍然宣告同一个 IP 前缀，只是把德国用户更偏向欧洲 site。
- 现实修复还可能用 BGP community 标签、和 ISP 协商策略，或干脆在该 ISP 网内加一个 site。**但这些都是手工活，没法自动化**。

### 案例 2：anycast 翻车的真实尾巴

论文里有一张图：把所有客户端按"实际 RTT - 最优 RTT"排序，画 CDF。

- 50% 分位：差距 < 5ms
- 90% 分位：差距 ≈ 20ms
- 99% 分位：差距 ≈ 100ms
- 99.9% 分位：差距 > 200ms（跨洲）

意思：你看平均数会觉得 anycast 完美，但**长尾用户体验崩塌**。如果业务对 99 分位敏感，必须额外做点什么。

### 案例 3：路由稳定性意外的好

一个担心：anycast 万一路由变化，TCP 连接会被切到另一个 site，连接断掉。论文测了——路由变化频率极低（大多数客户端几小时甚至几天才换一次 site），TCP 长连接几乎不受影响。这是 anycast **能商用**的关键支撑事实。

具体数字：超过 95% 的客户端在测量周期（几周）内只命中一个 site；只有 1% 的客户端会在小时级别频繁漂移——这部分多半是用了多 ISP 多线接入的客户。

### 案例 4：DNS-based CDN 也有自己的 10%

不要以为 DNS-based 就完美。LDNS（客户端的本地 DNS）IP 与真实客户端 IP 经常错配——比如用了 Google Public DNS（8.8.8.8），LDNS 在硅谷而客户端在巴黎。EDNS Client Subnet 扩展能缓解，但落地不齐。所以 DNS-based 的"99 分位"也不是免费的。

## 踩过的坑

1. **不要假设 BGP 等于地理就近**：路径选择由策略主导，物理距离只是次要因素
2. **anycast 的"最优"是 BGP 的最优，不是 RTT 的最优**：两者经常差很多
3. **测量必须从客户端做**：服务端看不到客户端到 site 的真实 RTT，要靠浏览器 JS / RUM 数据
4. **路由变化不可怕，频率低**：但要监控，万一 ISP 调策略导致大面积漂移要能发现
5. **混合模式才是终极方案**：纯 anycast 解决 90%，DNS / HTTP redirect 救剩下 10%

## 适用 vs 不适用场景

**适用**：

- 全球内容分发、静态资源缓存——能容忍 10% 用户多 25ms 延迟
- DNS 服务自身（根域名服务器就是 anycast 部署的典型）
- DDoS 缓解——多个 site 一起吃流量
- 起步阶段的 CDN——避开 DNS-based 的基础设施投入

**不适用**：

- 长连接 + 强一致状态（路由切换会让 TCP/TLS 中断）
- 对 99 分位延迟敏感的业务（金融行情、实时游戏）
- 需要按用户精细分流的场景（A/B 测试、地域合规）

## 历史小故事（可跳过）

- **2002 年**：[[akamai-2002]] 论文树立 DNS-based CDN 的工业标杆
- **2006-2014 年**：Cloudflare、Microsoft、Google 陆续在边缘节点试 anycast，但缺乏公开实测数据
- **2015 年 IMC**：这篇论文给出第一份大规模实测，**90/10 这个数字成为后续讨论的锚点**
- **2015-2017 年**：FastRoute (NSDI 2015)、Edge Fabric (SIGCOMM 2017)、Footprint (NSDI 2018) 一系列工作在 anycast 之上加测量纠偏
- **今天**：Cloudflare 全球 300+ 节点全是 anycast；Akamai 自己也开始混用

## 学到什么

1. **生产实测 > 仿真**——这种"拿真实流量测一遍"的论文，比纯仿真有 10 倍说服力
2. **90/10 法则贯穿系统设计**——简单方案解决大头，复杂方案救尾巴。先看尾巴有多长再决定值不值
3. **协议的"最优"未必是用户的"最优"**：BGP 优化 AS-path，用户要 RTT，两者错位
4. **工程权衡常常没有最优解**：anycast vs DNS-based 各有 trade-off，看业务对尾延迟的敏感度

## 延伸阅读

- 论文 PDF：[Calder et al., IMC 2015](https://www.cs.princeton.edu/courses/archive/fall17/cos561/papers/Anycast15.pdf)
- [[akamai-2002]] —— DNS-based CDN 的开山之作
- [[mahajan-2002-bgp-misconfig]] —— BGP 误配的经典分析
- [[r-bgp-2007]] —— BGP 安全扩展的早期讨论
- [[mockapetris-1988-dns]] —— DNS 协议本身（anycast 大规模用在根服务器上）

## 关联

- [[akamai-2002]] —— 对照组：DNS-based CDN 的另一条路
- [[mahajan-2002-bgp-misconfig]] —— 病态尾巴的根源之一就是 BGP 误配
- [[r-bgp-2007]] —— BGP 路由稳定性的扩展讨论
- [[mockapetris-1988-dns]] —— DNS 自身就是 anycast 最大的用户

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[akamai-2002]] —— Akamai 2002 — 把网站搬到离用户 10 毫秒的地方
- [[mahajan-2002-bgp-misconfig]] —— Mahajan 2002 — 三周看互联网，1% 的路由更新是手滑
- [[mockapetris-1988-dns]] —— Mockapetris 1988 DNS — 设计者亲口讲为什么 DNS 长这样

