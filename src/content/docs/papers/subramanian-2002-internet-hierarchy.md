---
title: Subramanian 2002 — 用多个观察点把互联网切成 5 层
来源: 'Subramanian, Agarwal, Rexford, Katz, "Characterizing the Internet Hierarchy from Multiple Vantage Points", IEEE INFOCOM 2002'
日期: 2026-06-01
分类: 网络协议
难度: 中级
---

## 是什么

互联网由几万个 **AS**（自治域，Autonomous System）组成。每个 AS 是一家运营商或大公司管理的一片网络——中国电信是一个 AS、Google 是一个 AS、你大学也是一个 AS。

但这几万个 AS 不是平等的——有的扛全球骨干，有的只是末端单宿主企业网。Subramanian 这篇论文做的事是：**从公开的 BGP 路由数据里，用算法把所有 AS 自动归到 5 层**——从最顶 dense core 到最底 stub 客户。

日常类比：像把全国快递公司分级——全国骨干（互相直连）、省级转运、市级网点、县级代理、最后一公里小卖部。作者没问任何运营商，只看包裹流向（BGP path），就能猜出谁在哪一层。

一句话：**公开路由表 + 多观察点 + rank/clique，把「谁在上层」从八卦变成可复现算法。**

## 为什么重要

不理解这篇，下面这些事都没法解释：

- 为什么 CAIDA 的 AS Rank 能给全球 AS 排序——它和本文同属「从 BGP 反推关系再量层级」谱系（主度量后来变成 customer cone，不是同一公式）
- 为什么常说「全球只有十几家 Tier-1」——本文第一次用算法画出 dense-core clique（约 20 个 AS），和商业名单近亲但不等同
- 为什么 BGP 收敛、故障传播、DDoS 抗性论文都先讲分层——分层基线从这篇出发
- 为什么「多 vantage point 测量」成了网络测量标配——这篇把单点观察偏差讲清楚

## 核心要点

1. **5 层骨架**：dense core → transit core → outer core → small regional → stub。类比快递：全国骨干 / 省分拨 / 市转运 / 县代理 / 小区驿站。层与层之间主要是 customer-provider（付钱买上游）或 peer（对等互连不付钱）。

2. **Rank 代替度数**：Gao 2001 用度数判大小，但 peer 边会虚高。本文定义：

```
rank(X) = 有多少不同 AS 把 X 当 c2p 上游
```

类比：看多少网点把你当总仓，而不是数你门口有几条路。叶子 stub 的 rank 接近 0；顶层几乎人人最终要走它。

3. **多观察点 + clique 定顶层**：单点 BGP 表有视角盲区。论文用约 **10 个 vantage point**（多家 ISP 表 + Looking Glass，即公开只读路由查询口）合并视角。对高 rank 候选找最大 **peer clique**（两两对等的完全图）当 dense core；其余按 rank 阈值切到 Tier-2~5。关系推断沿用 Gao 的 **valley-free**（路径先上坡后下坡、中间可平 peer，像山谷剖面）。

整体流水线：拉多点 BGP 表 → valley-free 标 c2p/p2p → 算 rank → top-K 上跑 clique → 阈值切下层。候选只有几十个，clique 虽 NP 但暴力可解。

## 实践案例

### 案例 1：迷你图上算 rank 并找 clique

```
# 边：c2p = customer→provider；p2p = 对等
# A--p2p--B--p2p--C--p2p--A   （三角 clique）
# D--c2p--A,  E--c2p--B,  F--c2p--D
rank = {A:2, B:1, C:0, D:1, E:0, F:0}  # 被多少 AS 当上游
dense_core = max_clique(p2p among top-rank)  # → {A,B,C}
```

**逐部分解释**：

- 先沿 c2p 边数「谁被当上游」→ 得到 rank
- 再在高 rank 集合里找 peer 完全图 → dense core
- 2002 年真实数据约 **20** 个 dense-core AS（AT&T、Sprint、UUNET、Level 3 等）
- 今天名单变了（UUNET 没了；Google 等大云在 customer cone 上接近骨干，但**不等于**商业 Tier-1 徽章）

### 案例 2：单 vantage point 会漏边

```
VP_US 看见:   AT&T --p2p-- Sprint
VP_US 看不见: CT --p2p-- CU      # 路径不经过该观察点
合并 VP_US+VP_EU+VP_AP → CT/CU 的 rank 才抬上来
```

**逐部分解释**：只看美国 RouteViews，dense core 偏欧美；加上 RIPE（欧洲）、APNIC（亚太）等观察点，亚洲骨干才不被低估。

类比：只在北京站数车，算不准沪穗干线——观察点决定你能看见哪些干线。

### 案例 3：度数高 ≠ 层级高

```
A: 100 条全是 p2p → degree=100, rank≈0
B: 30 条全是 c2p 客户 → degree=30, rank=30
degree 选 A；rank 选 B   # 分层该听 rank
```

**逐部分解释**：对等互连像「朋友很多」；被当上游像「仓库很大」。Gao 的度数法会抬高 A；Subramanian 的 rank 才把 B 放进更高层。

做分层时记住：**先问「谁靠你过路」，再问「你连了多少边」。**

## 踩过的坑

1. **BGP 看不到的 peering**——私有 peering / IXP partial route 不向全网 announce，rank 低估；多观察点只能减轻不能消掉。
2. **小 ISP 的 rank 挤在 0 附近**——Tier-3/4/5 靠阈值硬切，边界糊；后续更细的图算法（如 Battista 等 2003）再改进。
3. **拓扑 flatten**——CDN 与大云（Google/Meta 这类 hyperscaler，自建全球网的超大公司）直连末端 ISP，绕过中间层，「5 层」今天更像「3 层 + 直连」。
4. **clique ≠ 商业 Tier-1**——政治/历史原因可不 peer；算法给的是 BGP 行为上的顶层，不是商务合同名单。

## 适用 vs 不适用场景

**适用**：

- 给 AS 做全球「骨干 / 区域 / 末端」定位（输入：公开 BGP 表；粒度：AS，不是 IP）
- BGP 收敛、路由泄漏检测前的分层基线
- 测量论文画「骨干-区域-边缘」拓扑画像
- 需要可复现、可更新的层级快照（换一批 RouteViews/RIPE 表就能重跑）

**不适用**：

- 要两 AS **确切**私有 peering——公开表不全，需 traceroute / IXP
- CDN / anycast 流量结构——不在原 5 层模型里
- IP 级拓扑——本文是 AS 级；IP 级看 Skitter / iPlane
- 把算法 clique 直接当「商务合同上的 Tier-1 名单」——见踩坑第 4 条

## 历史小故事（可跳过）

- **2001**：Gao 的 valley-free 关系推断，让 BGP 表能反推谁给谁付钱
- **2002**：Subramanian 加 rank + 多观察点 + clique，画出全网分层图（INFOCOM）
- **2003–2010**：CAIDA 工程化 AS Rank（customer cone 等度量），并扩到 IPv6 / IXP
- **2010s 至今**：拓扑 flatten，Tier-1 概念部分失效，分层方法学仍用于 cloud / SDN 拓扑
- **旁注**：商业媒体说的「十几家 Tier-1」和本文 dense-core 数字常被混用——读论文时要分开看

## 学到什么

1. **BGP 是商业关系的化石**——合同不公开，路由行为可反推
2. **多观察点是测量第一原理**——单点必有盲区
3. **rank 比度数更贴层级**——度数会被 peer 边污染
4. **Clique 抓住「无上游」骨干**——顶层靠同辈互连达成全球可达
5. **算法分层 ≠ 商务徽章**——dense core 是行为定义，读数时别和「Tier-1 运营商」宣传混为一谈

## 延伸阅读

- 论文 PDF：[Subramanian 2002 INFOCOM](https://nms.csail.mit.edu/papers/internet-infocom02.pdf)（约 10 页，比 Gao 原文更好入口）
- CAIDA AS Rank：[as-rank.caida.org](https://as-rank.caida.org/) — 同谱系工业延续，至今仍在更新
- Stanford CS244 网络课 BGP 单元有这篇精读
- [[gao-2001-as-relations]] —— 前置：从 BGP 推 c2p/p2p/sibling
- [[akamai-2002]] —— 同年另一路：CDN 绕开层级直送边缘
- [[mahajan-2002-bgp-misconfig]] —— 同年 BGP 配置错误测量，同吃公开路由数据

## 关联

- [[gao-2001-as-relations]] —— 先有关系推断，才能算 rank
- [[akamai-2002]] —— 与其爬层级，不如把内容复制到边缘
- [[rest-fielding-2000]] —— 应用架构层 vs 网络拓扑层
- [[mahajan-2002-bgp-misconfig]] —— 分层画像读的也是这类 BGP 路径
- [[r-bgp-2007]] —— 后来用备份路径改善 BGP 收敛，仍依赖拓扑分层直觉
- [[calder-2015-anycast-cdn]] —— flatten 时代 anycast/CDN 如何改写中间层

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[akamai-2002]] —— Akamai 2002 — 把网站搬到离用户 10 毫秒的地方
- [[gao-2001-as-relations]] —— Gao 2001 — 用算法猜出互联网上 AS 之间谁给谁付钱
- [[rest-fielding-2000]] —— REST — Fielding 2000 给 Web API 写下的设计宪法
