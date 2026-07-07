---
title: Akamai 2002 — 把网站搬到离用户 10 毫秒的地方
来源: Dilley et al., "Globally Distributed Content Delivery", IEEE Internet Computing, Sep/Oct 2002
日期: 2026-05-31
分类: 分布式系统
难度: 中级
---

## 是什么

Akamai 2002 年的这篇论文，是**第一次公开讲清楚"现代 CDN 长什么样"**的工程报告。日常类比：你想让全世界的人都能秒开你的网站，办法不是把机房盖得更大，而是**在每个城市放一个仓库**，提前把货搬过去。

论文里 Akamai 讲了自家的五件套：

- **边缘服务器**：散布在 1000 多家 ISP 里的 12000 多台机器（2002 年的数据）
- **映射系统**：决定"这个用户的请求该去哪台边缘机"
- **通信系统**：边缘机之间同步"哪些内容已经过期"
- **数据采集 + 分析**：实时收集每台机器的负载、延迟
- **监控告警**：哪台机器死了立刻把它从地图上抹掉

这套架构是 Cloudflare、Fastly、AWS CloudFront 至今仍在抄的模板。

## 为什么重要

不理解这篇，下面这些事都没法解释：

- 为什么打开 YouTube / Netflix 几乎从不"等服务器"——它们已经在你家附近
- 为什么有些网站被「Slashdot 效应」打挂，有些不会——后者把流量分散在了几千台机器上
- 为什么 DNS 这种 1980 年代的老协议成了现代 CDN 的核心——因为它**天然分布式 + 全网都信**
- 为什么"一致性哈希"（[[consistent-hashing-1997]]）从论文里冒出来后立刻被工业界接住——这篇就是它的第一个大规模工程出口

## 核心要点

CDN 解决的核心矛盾是：**用户分散在全球，内容只有一份原始拷贝**。Akamai 的回答可以拆成三层。

### 第一层：用 DNS 做请求路由

用户访问 `example.com/photo.jpg`，Akamai 把这个域名 CNAME 到自家域名（比如 `a123.akamai.net`）。然后两级 DNS：

1. **高层 DNS** —— 决定用户应该被发到哪个 region（地理 + 网络拓扑就近）。TTL 约 30 分钟。
2. **低层 DNS** —— region 内决定具体某台服务器。TTL 约 30 秒，让故障切换够快。

类比：你打 10086，先按区号路到本省客服中心（高层），再分到具体话务员（低层）。

### 第二层：用一致性哈希分摊内容

一个 region 内可能有几十台服务器。如果每台机器都缓存所有 URL，内存装不下。Akamai 用 [[consistent-hashing-1997]]：

- 把 URL 哈希到一个圆环
- 每台服务器也哈希到圆环
- URL 顺时针找到的第一台服务器就是它的"主缓存"

效果：`photo.jpg` 永远落在同一台机器上，那台机器的命中率最大化。某台机器宕机时，只有它负责的那部分 URL 需要重新分配，**其他 URL 不动**。

### 第三层：源站保护

边缘机器没缓存怎么办？不能让 12000 台边缘机同时回打源站——那等于自己 DDoS 自己。Akamai 加了一个**中间层**（origin shielding）：

```
用户 → 边缘机器（数千个 region）→ 中间层（数十个）→ 源站（1 个）
```

中间层做二次聚合，保证源站看到的 QPS 永远不会爆。

## 实践案例

### 案例 1：Slashdot 效应为什么打不死接 CDN 的网站

某博客被 Hacker News 推到首页，瞬间 100k QPS：

- 没接 CDN：所有流量打到博客的 1 台服务器 → 5 秒内 502
- 接 Akamai：流量被 DNS 散到全球数千个 region，每个 region 内一致性哈希再散到几十台机器
- 实际效果：**单台机器看到的 QPS 可能只有 30**，毫无压力

放大倍数 = region 数 × region 内机器数。这是 Akamai 论文里反复强调的"分散攻击面"思路。

### 案例 2：DNS TTL 短到 30 秒的代价

短 TTL 让故障切换快，但运营商递归 DNS 缓存命中率掉到很低。论文里 Akamai 自建了**全球递归 DNS 网络**承担这个开销。

读这段你能感受到一个工程哲学：**为了用户体验的"秒级故障切换"，愿意自己扛起额外的 DNS 流量**。代价显式可见，决策清晰。

### 案例 3：动态内容怎么办

不是所有页面都能缓存——比如新闻首页的"热门排行"每分钟变。Akamai 提出 **ESI（Edge Side Includes）**：

```html
<html>
  <body>
    <header>欢迎</header>
    <esi:include src="/hot-news" /> <!-- 边缘机自己拼 -->
    <esi:include src="/user-greeting" />
  </body>
</html>
```

页面骨架在边缘缓存，动态片段在边缘拼装，源站只需要返回小片段而不是整页。这是后来"边缘计算"概念的雏形。

## 踩过的坑

1. **DNS resolver 位置 ≠ 用户位置**：Akamai 早期靠用户递归 DNS 的 IP 推位置，但很多人用公司 DNS / 8.8.8.8，于是路由到的"就近"机器其实并不近。后来 IETF 加了 EDNS Client Subnet（ECS）才修这个。

2. **热门 URL 仍会打爆单机**：一致性哈希让 `viral.jpg` 永远落在同一台机器。论文里靠"二级哈希"在 region 内做兜底——单 URL 火到一定程度时，复制到多台机器分担。

3. **缓存失效是难题**：源站说"这张图换了"，怎么让 12000 台机器秒级作废旧版本？Akamai 不走 HTTP cache-control，而是自建一个内部协议主动 push 失效消息。论文里轻描淡写但工程量巨大。

4. **网络分区下的一致性**：论文回避了"如果某 region 与失效系统断联，会返回旧内容多久"。这是 CDN 的固有妥协——选了可用性而非强一致。

## 适用 vs 不适用场景

**适用**：

- 静态资源（图片、视频、JS、CSS）—— CDN 的本职
- 高读低写的动态内容 —— 配合 ESI / 边缘函数
- 全球化产品 —— 用户分布越广，边缘的价值越大

**不适用**：

- 强一致写场景（支付、库存）—— 必须回源，CDN 没用
- 高度个性化内容（每个用户都不同）—— 缓存命中率低，CDN 退化为反向代理
- 内网应用 —— 用户都在同一栋楼，没有"距离"可优化

## 历史小故事（可跳过）

- **1995 年**：MIT 教授 Tom Leighton 和博士生 Daniel Lewin 研究"互联网热点"问题。Tim Berners-Lee（万维网发明者，同在 MIT）告诉他们："Web 总有一天会因为 flash crowd 崩掉，你们要不要想想办法。"
- **1997 年**：Lewin 等人发表[[consistent-hashing-1997]]——后来 Akamai 的核心数学。
- **1998 年**：Akamai 成立。1999 年 4 月星战预告片在自家服务器被打爆，导演要 Akamai 救场，一战成名。
- **2001 年 9 月 11 日**：Daniel Lewin 在 AA11 航班上遇害，年仅 31 岁。同一天 CNN 等新闻站靠 Akamai 撑住了 100 倍流量峰值。
- **2002 年**：本论文发表，第一次系统讲清架构。

## 学到什么

1. **去中心化是抗压的本质**——不是机器更快，是流量被打散。这个思路后来在区块链、分布式数据库里反复出现。
2. **DNS 是被低估的控制平面**——它早于 HTTP，全网信任，TTL 给你旋钮调"切换速度 vs 缓存效率"。
3. **一致性哈希从论文到工程只用了 5 年**——理论 → 算法 → 工业落地的速度，比 [[hindley-milner]] 那种基础研究快得多，因为商业拉力强。
4. **工程文章也值得精读**——这篇没有数学定理，但每个设计决策都标了"为什么不是另一种"，是工业系统论文的范式。

## 延伸阅读

- 论文 PDF：[Globally Distributed Content Delivery](https://www.akamai.com/site/en/documents/research-paper/globally-distributed-content-delivery-technical-publication.pdf)（10 页，密度高但都是工程细节，零数学）
- Tom Leighton 2009 CACM 综述：[Improving Performance on the Internet](https://cacm.acm.org/research/improving-performance-on-the-internet/)（更新到 2009 年的视角）
- [[consistent-hashing-1997]] —— 同团队 5 年前的算法基础
- [[dns]] —— 请求路由的物理载体
- [[bigtable-2006]] —— 同时代的另一类分布式系统：中心化大表 vs 边缘缓存的对照

## 关联

- [[consistent-hashing-1997]] —— 这套架构的数学引擎，从同实验室出来
- [[dns]] —— Akamai 把 DNS 玩出了花，TTL + 两级查询是核心控制旋钮
- [[bigtable-2006]] —— 同时代 Google 的分布式存储，但走的是中心化路线，正好对照
- [[tcp]] —— 边缘节点离用户近，TCP 握手 + 拥塞窗口启动速度都更快，CDN 收益的物理基础

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[akamai-2010]] —— Akamai 2010 — 从内容分发网络长成全球应用平台
- [[amplification-hell-2014]] —— Amplification Hell 2014 — 把家用宽带放大成几百 Gbps 的反射攻击
- [[bigtable-2006]] —— Bigtable 2006 — Google 把行级随机读写做到 PB 级的存储系统
- [[bittorrent-2003]] —— BitTorrent — 用"以牙还牙"逼大家都上传
- [[caesar-rexford-2005]] —— Caesar-Rexford 2005 — 你的包为什么绕了大半个地球
- [[calder-2015-anycast-cdn]] —— Calder 2015 — Anycast CDN 在生产环境真的能用吗
- [[chord-2001]] —— Chord — 让上万台机器排成圈，查任何 key 都只走 log N 步
- [[codons-2004]] —— CoDoNS — 用 P2P 哈希表替代分层 DNS 的实验
- [[consistent-hashing-1997]] —— Consistent Hashing — 加机器只搬一小部分数据的哈希环
- [[dns]] —— DNS — 把全球域名解析切成一棵可分布维护的树
- [[donar-2010]] —— DONAR 2010 — 把 DNS 全球调度写成一道可解的优化题
- [[dot-doh-perf-2020]] —— DoT/DoH 性能 — 给 DNS 加密之后网页变快还是变慢
- [[fat-tree-2008]] —— Fat-Tree 2008 — 用一堆便宜交换机搭出现代数据中心
- [[gao-2001-as-relations]] —— Gao 2001 — 用算法猜出互联网上 AS 之间谁给谁付钱
- [[google-1998]] —— Google 1998 — 把整个网络爬下来、压扁、再用一秒查到
- [[heartbleed-2014]] —— Heartbleed — 一个忘了写边界检查的 bug 让全网 1/3 的 HTTPS 站点漏内存
- [[hindley-milner]] —— Hindley-Milner — 编译器自己猜变量类型
- [[jupiter-2015]] —— Jupiter Rising — Google 数据中心网络十年怎么做到带宽涨百倍
- [[karger-1997-consistent-hashing]] —— Karger 1997 一致性哈希 — 加机器不用全员搬家
- [[krishnamurthy-1999-http11]] —— Krishnamurthy 1999 — HTTP/1.0 到 1.1 究竟改了什么
- [[mahajan-2002-bgp-misconfig]] —— Mahajan 2002 — 三周看互联网，1% 的路由更新是手滑
- [[memcached-fb-2013]] —— Scaling Memcache at Facebook — 万台缓存怎么不被踩塌
- [[mockapetris-1988-dns]] —— Mockapetris 1988 DNS — 设计者亲口讲为什么 DNS 长这样
- [[mogul-1995-persistent-http]] —— Mogul 1995 — 为什么 HTTP 必须改成"一根连接复用多次请求"
- [[padmanabhan-1995-http-latency]] —— Padmanabhan-Mogul 1995 — 把 HTTP 三种提速方案放一起跑，看谁真的快
- [[pastry-2001]] —— Pastry — 用 nodeId 的前缀一位一位逼近目标
- [[r-bgp-2007]] —— R-BGP 2007 — 故障切换前先把备份路径塞进邻居口袋
- [[ron-2001]] —— RON 2001 — 让一小撮节点自己绕开 BGP 故障
- [[saltzer-1984-e2e]] —— End-to-End Arguments — 把功能尽量推到端上做
- [[simrank-2002]] —— SimRank — 两个节点相似当且仅当它们的邻居相似
- [[sparrow-2013]] —— Sparrow — 让毫秒级任务也能被精准调度的去中心化调度器
- [[subramanian-2002-internet-hierarchy]] —— Subramanian 2002 — 用多个观察点把互联网切成 5 层
- [[tcp]] —— TCP — 在不可靠的 IP 上凿出一条 reliable 字节流
- [[tor-2004]] —— Tor — 用三层洋葱皮让没人知道你在上网
- [[wang-2014-spdy]] —— How Speedy is SPDY — 换协议没让网页变快多少
- [[xtrace-2007]] —— X-Trace — 比 Dapper 早 3 年的跨层跨协议追踪框架

