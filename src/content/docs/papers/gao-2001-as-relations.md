---
title: Gao 2001 — 用算法猜出互联网上 AS 之间谁给谁付钱
来源: Lixin Gao, "On Inferring Autonomous System Relationships in the Internet", IEEE/ACM Transactions on Networking, Dec 2001
日期: 2026-06-01
分类: 网络协议
难度: 中级
---

## 是什么

互联网不是一张随机大网。它由几千个**自治域 (Autonomous System, AS)** 组成——每个 AS 是一家运营商或大公司管理的一片 IP 地址，比如中国电信是一个 AS、Google 是一个 AS。AS 之间用 **BGP 协议**互相告诉对方"我能到达哪些地方"。

但 BGP 协议只规定**怎么交换路由**，不规定"为什么这条不走那条"。**真正的决定背后是钱**。Gao 这篇论文第一次用算法，从公开的 BGP 数据里反推出 AS 之间的商业关系。

日常类比：AS 像快递公司——有的是甲方付钱给乙方代发（**customer-provider**），有的是两家在机场互换包裹（**peer**），有的是同集团子公司（**sibling**）。Gao 的算法只看快递包裹流向（BGP 路由表），就能猜出哪两家在付钱、哪两家在互换。

## 为什么重要

不理解这篇，下面这些事都没法解释：

- 为什么 CAIDA（互联网测量数据集权威）能告诉你"全球 Tier-1 骨干网有 18 个"——靠的就是 Gao 算法的衍生版
- 为什么 BGP 路由泄漏 (route leak) 能被检测——因为正常路径必须 **valley-free**，泄漏会破坏这个形状
- 为什么互联网拓扑论文几乎都引这篇——后续 20 年的 AS 关系研究都建在它之上
- 为什么 BGP 是技术协议但底下跑的是商业合同——这篇论文是把这层挖出来的鼻祖

## 核心要点

### 三种关系

| 关系 | 含义 | 类比 |
|---|---|---|
| **c2p** (customer-provider) | 客户付钱给上游 | 小公司租中国电信的带宽 |
| **p2p** (peer-to-peer) | 平等互换流量 | FedEx 和 UPS 互换包裹 |
| **s2s** (sibling) | 同公司的兄弟 AS | 集团下两个子公司 |

### Valley-Free 性质（这篇论文最大的洞见）

合法的 BGP 路径**必须**是这个形状：

```
上坡 (c->p)*  +  0 或 1 个 peer  +  下坡 (p->c)*
```

像爬山：你先一路上山（小 AS 通过 provider 往上走），最多在山顶横跨一段（peer），再一路下山（通过 provider 往下到目标 AS）。

**不能下山再上山**——那等于中间那个 AS 替别人免费扛包，亏钱，没人愿意干。

### 度数启发式（Algorithm）

怎么从一堆 BGP 路径推出谁是谁的 provider？Gao 的招数：**看 AS 的度数（连接数）**。

1. 拿到一条 AS path，比如 `[A, B, C, D, E]`
2. 找度数最高的 AS（设为 C）作为路径**顶点**
3. 顶点之前的边（A→B, B→C）判为**上坡** c→p
4. 顶点之后的边（C→D, D→E）判为**下坡** p→c
5. 如果顶点和邻居度数差不多（落在比率 R 内）→ 判为 **peer**
6. 多条 path 投票一致性检查

**直觉**：度数越大的 AS 越可能是大骨干网（Tier-1 / Tier-2），度数小的更可能是叶子客户。

## 实践案例

### 案例 1：一条 BGP 路径怎么被解析

假设观察到一条路径 `[小公司 A → 区域 ISP B → 中国电信 → 区域 ISP D → 小公司 E]`。

度数对照：A=2，B=50，**电信=2000**，D=40，E=3。

算法判断：
- 电信是顶点
- A→B, B→电信 都是上坡：A 付 B，B 付电信
- 电信→D, D→E 都是下坡：电信卖给 D，D 卖给 E
- 整条路径 **valley-free**，合法

### 案例 2：valley-free 被破坏意味着什么

假设观察到 `[A → B → C → D → E]`，但度数是 `2, 500, 50, 600, 3`——中间凹下去了。

这条路径**不可能**正常出现，因为它要求 C（小 ISP）替 B 和 D 这两个大网做免费 transit。如果真观察到了，几乎一定是：
- **路由泄漏**：C 配置错了，把 B 学到的路由广播给了 D
- **路由劫持**：有人故意伪造 AS path

这就是为什么后人用 Gao 的 valley-free 性质做**异常检测**——形状不对就报警。

### 案例 3：CAIDA AS-Rank 怎么用

CAIDA 每周从 RouteViews 拉一份 BGP 数据，跑 Gao 衍生算法，得出：

- 每个 AS 的 customer cone 大小（你能到达多少下游）
- 每个 AS 的 transit degree（你给多少别人当 provider）
- 全球 AS 排名（按客户锥大小）

排名前 18 的、互相全部 peer、不向任何人付钱的，就是 **Tier-1 骨干网**——这是 Gao 算法的直接产物。

## 踩过的坑

1. **度数 ≠ 商业地位**：有些区域 ISP 接了一大堆小客户，度数比真正的 Tier-1 还高，会被误判为顶点。后续算法（Subramanian 2002 / Dimitropoulos 2007）用更复杂的特征修正。

2. **Sibling 检测不可靠**：算法只能识别明显的双向 transit。集团内复杂结构（比如电信旗下十几个 ASN）经常识别不全，需要外部 WHOIS 数据补。

3. **BGP table 只看 best path**：每个 AS 只把它选定的最佳路径传出去，备份路径完全看不见，所以推出的关系图不完整——这是结构性局限，到今天也没完全解决。

4. **paid peering 破坏假设**：少数 AS 之间签私下合同，明面上"对等"实际上一方付钱。Gao 把它们误判为纯 peer。这种情况在 Hyperscaler（Google / Meta / Cloudflare）兴起后越来越多。

## 适用 vs 不适用场景

**适用**：

- AS 拓扑研究、Tier 分级、骨干网识别
- BGP 异常检测（route leak / hijack 报警）
- 网络弹性分析、DDoS 流量溯源
- 任何需要"AS 之间谁是谁上游"的研究

**不适用**：

- AS 内部结构（IGP 域内路由）——这篇只看 AS 之间
- 实时路径选择——这是 BGP 协议本身的事
- 准确判断 paid peering / 复杂 sibling——需要更多外部数据

## 历史小故事（可跳过）

- **1995 年**：BGP-4 (RFC 1771) 标准化，规定协议格式但不管商业关系
- **1998 年前后**：互联网商业化加速，AS 数量从几百涨到几千，研究者开始追问"它们之间到底什么关系"
- **2000 年**：Gao 在 IEEE Global Internet Symposium 首次发表算法
- **2001 年**：TON 期刊版本，被引超过 2000 次
- **2002 年**：Subramanian 把它形式化为 **Type-of-Relationship (ToR) 问题**
- **2007 年起**：Dimitropoulos 用机器学习改进；CAIDA AS-Rank 把它落地为公开数据集，至今仍在更新

## 学到什么

1. **协议层之下是商业层**——BGP 看起来纯技术，但每条路径背后都是付费合同
2. **度数 + 简单规则**也能从公开数据挖出深结构，不需要拿到内部表
3. **Valley-Free 是经济驱动的几何性质**——商业理性会在路径形状上留下指纹
4. 一篇方法论清晰、数据公开、能验证的论文，能成为一个领域 20 年的基石

## 延伸阅读

- 论文 PDF：[Gao 2001 (UMass mirror)](https://people.cs.umass.edu/~lgao/) 或在 IEEE Xplore 搜 TON 9(6)
- [CAIDA AS-Rank](https://asrank.caida.org/) — Gao 算法的现代落地数据集
- Subramanian et al. INFOCOM 2002 — Type-of-Relationship 形式化
- Dimitropoulos et al. SIGCOMM 2007 — 用机器学习改进 AS 关系推断

## 关联

- [[akamai-2002]] —— Akamai CDN 的 BGP-aware anycast 也依赖 AS 关系图
- [[dns]] —— DNS 的 anycast 选址同样要懂 AS 拓扑
- [[tcp]] —— TCP 跑在 IP 之上，IP 跑在 AS 之间的 BGP 路由之上
- [[rest-fielding-2000]] —— 同期 Internet 架构论文，自上而下 vs 自下而上

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[akamai-2002]] —— Akamai 2002 — 把网站搬到离用户 10 毫秒的地方
- [[dns]] —— DNS — 把全球域名解析切成一棵可分布维护的树
- [[mahajan-2002-bgp-misconfig]] —— Mahajan 2002 — 三周看互联网，1% 的路由更新是手滑
- [[rest-fielding-2000]] —— REST — Fielding 2000 给 Web API 写下的设计宪法
- [[subramanian-2002-internet-hierarchy]] —— Subramanian 2002 — 用多个观察点把互联网切成 5 层
- [[tcp]] —— TCP — 在不可靠的 IP 上凿出一条 reliable 字节流

