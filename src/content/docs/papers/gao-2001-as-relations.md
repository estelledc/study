---
title: Gao 2001 — 用算法猜出互联网上 AS 之间谁给谁付钱
来源: 'Lixin Gao, "On Inferring Autonomous System Relationships in the Internet", IEEE/ACM Transactions on Networking, Dec 2001'
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

- 为什么 CAIDA（互联网测量数据集权威）能给出全球 Tier-1 骨干名单——靠的就是 Gao 算法的衍生版
- 为什么 BGP 路由泄漏 (route leak) 能被检测——因为正常路径必须 **valley-free**，泄漏会破坏这个形状
- 为什么互联网拓扑论文几乎都引这篇——后续 20 年的 AS 关系研究都建在它之上
- 为什么 BGP 是技术协议但底下跑的是商业合同——这篇论文是把这层挖出来的鼻祖

## 核心要点

算法可以拆成 **三步**：

1. **先认三种关系**：c2p（客户付钱给上游，像小公司租电信带宽）、p2p（平等互换，像两家快递在机场换包）、s2s（同集团兄弟 AS）。类比：先分清谁付钱、谁互换、谁是一家人。

2. **Valley-free 形状**：合法路径必须是 `上坡 (c→p)* + 至多 1 个 peer + 下坡 (p→c)*`。像爬山——先上山、山顶最多横跨一次、再下山；**不能下山再上山**，否则中间 AS 在替别人免费扛包。

3. **度数启发式**：在一条 AS path 里找度数最高的 AS 当顶点；顶点左侧标上坡 c→p，右侧标下坡 p→c；若顶点与邻居度数落在比率 R 内则标 peer；多条 path 投票一致性。类比：连接数越大越像骨干，叶子更像客户。

## 实践案例

### 案例 1：一条 BGP 路径怎么被解析

```text
path  = [A, B, Telecom, D, E]
deg   = {A:2, B:50, Telecom:2000, D:40, E:3}
apex  = argmax(deg)                 # → Telecom
ups   = edges left of apex          # A→B, B→Telecom  ⇒ c→p
downs = edges right of apex         # Telecom→D, D→E  ⇒ p→c
# 整条 valley-free，合法
```

**逐部分解释**：

- `argmax(deg)` 把度数最大的 AS 当路径顶点（这里是电信）
- 顶点左侧一律判上坡：A 付 B，B 付电信
- 顶点右侧一律判下坡：电信卖给 D，D 卖给 E

### 案例 2：valley-free 被破坏意味着什么

```text
path = [A, B, C, D, E]
deg  = {A:2, B:500, C:50, D:600, E:3}
# 形状：高 → 低 → 高，出现"山谷"
# 经济含义：C 在给 B、D 做免费 transit → 正常商业不会出现
```

**逐部分解释**：

- 度数序列先升后降再升，顶点不唯一，valley-free 被破坏
- 若硬解释，等于要求小 ISP C 免费给两大网做 transit
- 实网里这通常对应 **路由泄漏** 或 **路由劫持**；检测器就是盯这种非法形状

### 案例 3：CAIDA AS-Rank 怎么用

CAIDA 每周从 RouteViews 拉 BGP 数据，跑 Gao 衍生算法，大致做三件事：

1. 估每个 AS 的 **customer cone**（下游能覆盖多少客户）
2. 算 **transit degree**（给多少别人当 provider）
3. 按锥大小排出公开 AS 排名

名单会随测量窗口更新。其中互相 peer、不向任何人付钱的那一小撮，就是常说的 **Tier-1**——这是 Gao 思路的直接产物，不是写死的固定个数。

## 踩过的坑

1. **度数 ≠ 商业地位**：有些区域 ISP 接了一大堆小客户，度数比真正的 Tier-1 还高，会被误判为顶点。后续算法（Subramanian 2002 / Dimitropoulos 2007）用更复杂的特征修正。

2. **Sibling 检测不可靠**：算法只能识别明显的双向 transit。集团内复杂结构（比如电信旗下十几个 ASN）经常识别不全，需要外部 WHOIS 数据补。

3. **BGP table 只看 best path**：每个 AS 只把它选定的最佳路径传出去，备份路径完全看不见，所以推出的关系图不完整——这是结构性局限，到今天也没完全解决。

4. **paid peering 破坏假设**：少数 AS 之间签私下合同，明面上"对等"实际上一方付钱。Gao 把它们误判为纯 peer。这种情况在 Hyperscaler（Google / Meta / Cloudflare）兴起后越来越多。

## 适用 vs 不适用场景

**适用**：

- AS 拓扑研究、Tier 分级、骨干网识别（离线分析公开 BGP 表）
- BGP 异常检测（route leak / hijack 报警，按 valley-free 形状过滤）
- 网络弹性分析、DDoS 流量溯源时需要"谁是上游"
- 任何需要"AS 之间谁付钱给谁"的研究原型

**不适用**：

- AS 内部结构（IGP 域内路由）——这篇只看 AS 之间
- 实时路径选择——那是 BGP 决策过程本身，不是事后推断
- 准确判断 paid peering / 复杂 sibling——需要合同或 WHOIS 等外部数据
- 把推断结果当 100% 真相写进生产策略——公开表有偏差，只能当强先验

## 历史小故事（可跳过）

- **1995 年**：BGP-4 (RFC 1771) 标准化，规定协议格式但不管商业关系
- **1998 年前后**：互联网商业化加速，AS 数量从几百涨到几千，研究者开始追问"它们之间到底什么关系"
- **2000 年**：Gao 在 IEEE Global Internet Symposium 首次发表算法
- **2001 年**：TON 期刊版本，成为后续 AS 关系研究的高频引用基石
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
- [[mahajan-2002-bgp-misconfig]] —— 同期 BGP 误配置测量，和 valley-free 异常检测互补

## 关联

- [[akamai-2002]] —— Akamai CDN 的 BGP-aware anycast 也依赖 AS 关系图
- [[subramanian-2002-internet-hierarchy]] —— 把 ToR 问题形式化并切出互联网层级
- [[mahajan-2002-bgp-misconfig]] —— 用测量看 BGP 手滑，和关系推断共用公开表
- [[r-bgp-2007]] —— 后续 BGP 可靠性工作，仍要先懂 AS 商业关系
- [[dns]] —— DNS 的 anycast 选址同样要懂 AS 拓扑
- [[tcp]] —— TCP 跑在 IP 之上，IP 跑在 AS 之间的 BGP 路由之上

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[mahajan-2002-bgp-misconfig]] —— Mahajan 2002 — 三周看互联网，近四分之三新通告是手滑
- [[subramanian-2002-internet-hierarchy]] —— Subramanian 2002 — 用多个观察点把互联网切成 5 层
