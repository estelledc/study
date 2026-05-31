---
title: Subramanian 2002 — 用多个观察点把互联网切成 5 层
来源: Subramanian, Agarwal, Rexford, Katz, "Characterizing the Internet Hierarchy from Multiple Vantage Points", IEEE INFOCOM 2002
日期: 2026-06-01
分类: 网络协议
难度: 中级
---

## 是什么

互联网由几万个 **AS**（自治域，Autonomous System）组成。每个 AS 是一家运营商或大公司管理的一片网络——中国电信是一个 AS、Google 是一个 AS、你大学也是一个 AS。

但这几万个 AS 不是平等的——有的扛全球骨干（每天过几百 Tb 流量），有的就是末端单宿主企业网（流量小、只接一家上游）。Subramanian 这篇论文做的事是：**从公开的 BGP 路由数据里，用算法把所有 AS 自动归到 5 层**——从最顶 dense core 到最底 stub 客户。

日常类比：像把全国快递公司分级——顺丰/菜鸟级（全国骨干，互相直连）、省级转运商（区域级）、市级网点（中型）、县级代理（小型）、最后一公里小卖部（末端）。Subramanian 没问任何运营商，只看包裹流向（BGP path），就能猜出谁在哪一层。

## 为什么重要

不理解这篇，下面这些事都没法解释：

- 为什么 CAIDA 的 AS Rank 工具能给全球每个 AS 排名——核心思想就是这篇的 rank 度量
- 为什么常说"全球只有十几家 Tier-1"——这个数字第一次被算法化定义就是这里
- 为什么 BGP 路由收敛、故障传播、DDoS 抗性的论文都先讲分层——分层基线是从这篇出发
- 为什么"多 vantage point 测量"成了网络测量的标配——这篇是把单点观察的偏差讲清楚的开山作之一

## 核心要点

### 5 层骨架

| Tier | 名字 | 角色 | 类比 |
|---|---|---|---|
| **1** | dense core | 全球骨干，互相 peer 成 clique | 顺丰、菜鸟全网 |
| **2** | transit core | 大型区域 transit | 各省总分拨 |
| **3** | outer core | 中型区域 ISP | 市级转运 |
| **4** | small regional ISP | 小型接入商 | 县级代理 |
| **5** | customer / stub | 末端企业 / 学校 | 小区驿站 |

### Rank 度量（这篇的招数）

Gao 2001 用**度数**判 AS 大小——但度数会被 peering 关系污染（peer 不代表你大）。Subramanian 改用 **rank**：

```
rank(X) = 在所有 vantage point 看到的 BGP path 里，
         有多少不同的 AS 把 X 当 customer-provider 上行
```

**直觉**：你被多少人当上游来用——这才真反映"你处在层级里多高"。叶子 stub 没人把它当上游（rank 极低）；Tier-1 几乎所有人最终都要走它（rank 极高）。

### 多 Vantage Point（标题的关键词）

为什么"多观察点"重要？因为单点 BGP 表（比如只看 RouteViews 一台）有视角偏差——某些 peering 你那里看不到。论文同时用 **10 个 vantage point**（多家 ISP 的 BGP 表 + Looking Glass），把不同视角并起来。

类比：你只在北京站看快递车流量，永远算不准上海到广州走的路线；要在多个枢纽同时看才行。

### Clique 启发式定层

最难的是定 Tier-1——没人挂牌子说"我是 Tier-1"。Subramanian 的招数：

1. 拿到所有候选高 rank AS
2. 看它们之间是不是**两两都 peer**（不付钱、对等互连）
3. 找出最大的 clique（完全图）→ 这就是 dense core / Tier-1

**直觉**：Tier-1 的定义就是"它不需要给任何人付钱当 customer"——只能靠互相 peer 才能让全球可达。所以它们必然在 BGP 数据里形成 clique。

剩下的层用 rank 阈值切分。

### 算法整体流程

把上面四块拼起来：

1. 从 10 个 vantage point 拉 BGP 表
2. 对每条 AS path 用 Gao 风格的 valley-free 推断 c2p / p2p / s2s
3. 算每个 AS 的 rank（多少 AS 把它当上游引用）
4. 按 rank 排序取 top-K 候选 → 跑 clique 算法找 dense core（Tier-1）
5. 剩下的 AS 按 rank 阈值切到 Tier-2~5

**复杂度**：clique 是 NP，但这里规模小（候选只有几十个），暴力搜可解。

## 实践案例

### 案例 1：当年算出来的 Tier-1 长这样

论文在 2002 年的数据里识别出约 **20 个 dense core AS**——AT&T、Sprint、UUNET（被 MCI 买过）、Level 3、Cable & Wireless、Genuity 这些名字。它们彼此 peer 形成 clique。

**今天对比**：CAIDA 的 AS Rank 还在跑类似算法，只是数据持续更新。Tier-1 名单变了（UUNET 不在了、阿里云 Google 这种 hyperscaler 加进来），但**方法学没变**。

### 案例 2：为什么单 vantage point 不够

假设你只看 RouteViews 一个点。RouteViews 主要从美国 ISP 收 BGP——你能看到 AT&T peer Sprint，但**看不到** China Telecom 和 China Unicom 之间的 peering（那条路不经过 RouteViews）。

结果：你算出来的 dense core 全是欧美 AS，亚洲骨干被低估。Subramanian 加进 RIPE（欧洲）、APNIC（亚太）等多 vantage point，rank 才平衡。

### 案例 3：rank vs 度数的差异

A：度数 100，但都是 peer（小公司对等互连）→ 度数高、rank 低
B：度数 30，但 30 个全是 customer 把它当上游 → 度数低、rank 高

按 Gao 的度数法 A 更"大"；按 Subramanian 的 rank 法 B 更"高层"。**rank 才是反映层级的正确量**。

## 踩过的坑

1. **BGP 看不到的 peering**——私有 peering / IXP 的 partial route 不会向所有人 announce，rank 低估真实关系。论文承认这点，靠"多 vantage point + bias 校正"减轻不能消除。

2. **rank 对小 ISP 区分度差**——Tier-3 / Tier-4 / Tier-5 的 rank 都接近 0，靠阈值硬切，边界含糊。后续工作（Battista 2003）用更细的图算法改进。

3. **互联网今天 flatten 了**——2002 年的 5 层在 2020 年代部分塌缩。CDN（Akamai/Cloudflare）和 hyperscaler（Google/Meta）直接和末端 ISP peer，绕过 Tier-2/3。所以"5 层"今天更像"3 层 + 直连大动脉"。

4. **clique 不严格等于商业 Tier-1**——可能两家因为政治/历史原因不 peer 但都是骨干。算法判到的 clique 是"BGP 行为意义上"的 Tier-1，不一定等于商业定义。

## 适用 vs 不适用场景

**适用**：

- 给某个 AS 在全球互联网里"定位"——它是骨干、区域还是末端
- 路由分析的分层基线——做 BGP 收敛、路由泄漏检测，先定层
- 互联网测量论文的拓扑画像——画出"骨干-区域-边缘"三色图

**不适用**：

- 想知道两 AS 之间**确切**走了什么 peering——BGP 表看不全私有 peering，要用 traceroute / IXP 数据
- 想分析 CDN 流量结构——CDN 不在原 5 层模型里，要用专门的 anycast 分析
- 想看 IP 级（不是 AS 级）的拓扑——这篇粒度是 AS，IP 级要 Skitter / iPlane

## 历史小故事（可跳过）

- **2001 年**：Gao 写了 c2p/p2p/sibling 推断算法（valley-free），第一次让 BGP 表能反推商业关系
- **2002 年**：Subramanian 在 Gao 之上加 rank + 多 vantage point + clique，做出第一份"全互联网分层图"
- **2003-2010 年**：CAIDA 把这套方法工程化成 AS Rank 服务（仍在跑），后来扩展到 IPv6 + IXP 数据
- **2010s 至今**：互联网 flatten，超大公司直接 peer 末端 → Tier-1 概念部分失效，但分层方法学被用到 cloud / SDN 拓扑研究里

## 学到什么

1. **BGP 数据是商业关系的化石**——商业合同不公开，但路由行为留下痕迹，能反推
2. **多 vantage point 比单点准**——所有大规模测量的第一原理，不只 BGP
3. **rank（被引为上游次数）比度数更能反映层级**——度数被 peer 关系污染
4. **Clique 是判定"无上游"骨干的关键**——Tier-1 的定义本质就是"和同辈互连构成全球可达"

## 延伸阅读

- 论文 PDF：[Subramanian 2002 INFOCOM](https://nms.csail.mit.edu/papers/internet-infocom02.pdf)（10 页，比 Gao 容易读）
- CAIDA AS Rank 工具：[as-rank.caida.org](https://as-rank.caida.org/) — 这篇方法学的工业延续，至今还在跑
- 教学：Stanford CS244 网络课程的 BGP 单元有这篇的精读
- [[gao-2001-as-relations]] —— 前置：怎么从 BGP 推 c2p/p2p/sibling 关系
- [[akamai-2002]] —— 同年另一思路：CDN 绕开层级，把内容直送末端

## 关联

- [[gao-2001-as-relations]] —— 这篇直接建在 Gao 的关系推断之上，先有 c2p/p2p 才能算 rank
- [[akamai-2002]] —— 同时代另一答案：与其爬层级，不如把内容复制到边缘
- [[rest-fielding-2000]] —— 一个谈架构层（应用），一个谈拓扑层（网络），互联网两条主线

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

