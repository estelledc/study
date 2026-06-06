---
title: Caesar-Rexford 2005 — 你的包为什么绕了大半个地球
来源: Matthew Caesar & Jennifer Rexford, "BGP Routing Policies in ISP Networks", IEEE Network Magazine 19(6), 2005
日期: 2026-06-01
子分类: 网络协议
分类: 网络协议
难度: 中级
provenance: pipeline-v3
---

## 是什么

这篇论文回答一个看起来很傻的问题：**互联网的包，为什么经常不走最短路径？**

日常类比：你在北京寄快递到上海，按理走京沪高速 1200 公里就到。结果包裹先北上去了哈尔滨，再绕到广州，最后才送到上海。为什么？因为快递公司之间有合作和结算关系——某些路段免费、某些路段按公斤收钱、有些公司只跟特定伙伴换货。**包裹走的不是地理最短路径，是"按合同最划算"的路径**。

互联网就是这样。论文作者是 Matthew Caesar（伯克利）和 Jennifer Rexford（普林斯顿，BGP 研究权威）。他们把全球几千家 ISP（互联网服务商）背后的"路由策略"摊开讲清楚——这套策略决定了你点开网页时，数据包从北京到圣何塞到底走哪条物理光纤。

## 为什么重要

不理解 BGP 策略，下面这些事都没法解释：

- 为什么 youtube 在某些国家莫名其妙慢——可能是中间某家 ISP 主动把这条路设成"低优先"
- 为什么 2008 年巴基斯坦电信"误屏蔽 youtube" 反而让全球 youtube 挂了 2 小时——一条错误的 BGP 公告被全球接受
- 为什么 CDN（Akamai / Cloudflare）能赚钱——它们绕开了 BGP 选路的不确定性
- 为什么"快递包绕地球"是常态，不是 bug——这是 ISP 的钱袋子在投票

## 核心要点

每个 ISP 是一个 **AS**（Autonomous System，自治系统），有自己的编号。ISP 之间用 **BGP** 协议交换"我能到哪些 IP 段、走哪些 AS"。

一个 BGP 路由器收到多条到同一目的地的路由时，按 **7 步决策表**选一条：

| 步骤 | 比的属性 | 谁控制 |
|------|----------|--------|
| 1 | LocalPref 最高 | **本 ISP** |
| 2 | AS_PATH 最短 | 邻居 |
| 3 | origin 类型最低 | 协议 |
| 4 | MED 最低 | 邻居 |
| 5 | eBGP 优于 iBGP | 协议 |
| 6 | IGP 内部 cost 最低 | 本 ISP |
| 7 | router ID 最低（破平局） | 协议 |

**关键洞察**：第 1 步的 LocalPref 是本 ISP 自己设的整数，**它能覆盖路径长度**。也就是说，一条 AS_PATH 短的路由，可能因为 LocalPref 低被丢弃。这就是"绕地球"的根源——本 ISP 的钱包说了算。

## 实践案例

### 案例 1：客户 > peer > 上游（钱袋子排序）

ISP 跟邻居有三种关系：

- **客户**：邻居付钱给我，让我帮它转流量。我赚钱。
- **peer**：双方流量大致对等，互连不付钱。中性。
- **provider**（上游）：我付钱给邻居，让它帮我转。我亏钱。

ISP 的常见配置：把 LocalPref 划成区间——**客户 90-99 / peer 80-89 / provider 70-79 / backup 60-69**。同一个目的地有多条路时，先选客户（赚钱），再选 peer（省钱），最后才走 provider（亏钱）。

后果：你的包从北京到东京，理论上"经一个海底光缆"就到，但你的运营商可能没跟东京 ISP 直连（没 peer），只能从美国上游绕——**你的包先去了美国西海岸，再回日本**。这不是 bug，是经济规律。

### 案例 2：跨大西洋链路保护（LocalPref 做内部 TE）

某 ISP 同时在北美和欧洲有网络。它发现：跨大西洋光缆很贵，**不能让欧洲客户的流量从北美绕一圈再到欧洲**。

配置方法：把欧洲分公司的路由器配成"对欧洲学到的路由给更高 LocalPref"，北美分公司则相反。结果：欧洲流量留在欧洲解决，跨海链路只走"真正必须的"流量。

### 案例 3：peer 之间不互转（用 community 标记）

B 跟 A、C 都是 peer。A 学到的路由 B **不能**导出给 C——因为 B 帮 C 转去 A 的流量是亏钱的。

实现：B 的入口策略给从 A 学到的每条路由打一个 **community 标签** `Xpeer`（一种可附加在路由上的字符串）。然后 B 的出口策略在导给 C 之前过滤掉所有带 `Xpeer` 的路由。

community 是 BGP 最灵活的"加注释"机制，可以编码各种本地约定——但**没有跨 ISP 标准**，每家自定义，所以容易误配。

### 案例 4：让对方少给我发流量（MED 与 AS prepending）

如果某条入口链路过载，本 ISP 想让邻居"换条路给我发"，有两招：

- **MED**：在该链路上把 MED 调高（数字越大越不优先），邻居会去走它的另一条入口
- **AS prepending**：在 AS_PATH 里把自己的 AS 号重复几次（比如 `[A, A, A, B]`），让邻居觉得这条路"很长"，从而降优先

后者更野——AS_PATH 是对方决策第 2 步看的，AS prepending 利用了"第 2 步：路径越短越好"。但 prepending 可能被对方用 LocalPref（第 1 步）覆盖，所以**不一定有效**。

### 案例 5：BGP 路由器的三阶段过滤

每个路由器收到一条路由通告时，跑三步：

1. **入口策略**（import policy）：先决定要不要这条路由。可以丢弃、可以改属性。
2. **决策过程**：上面的 7 步决策表，从所有候选里挑一条作为最优。
3. **出口策略**（export policy）：决定这条路由要不要告诉哪些邻居。

ISP 在这三步里都能做手脚：入口加 community 标签、改 LocalPref；出口按 community 过滤、改 MED 影响下游。BGP 的"策略"不是单一动作，是这三道闸门的组合。

## 踩过的坑

1. **MED 不能跨 AS 比较**：MED 只对同一对 AS 之间的多条链路有意义。两个不同邻居 AS 给的 MED 数字不能直接比——但有的运营商会误配置成"全局比较"，造成路由抖动。

2. **community 没标准**：community 编码各家自定义。两家 ISP 互联时，A 的 `100:200` 跟 B 的 `100:200` 含义可能完全不同。误配后果可能是路由泄漏（leak）——A 把 provider 学到的路由错误地导给了 B。

3. **LocalPref 覆盖路径长度**：新人调试 BGP 看到"路径明明更短为什么没选"——多半是 LocalPref 在作怪。要先看 LocalPref，再看 AS_PATH。

4. **policy 冲突导致路由震荡**：两个 ISP 各自的 LocalPref 设置可能形成环——A 偏好走 B，B 偏好走 A，导致路由反复变化。这种"配置不可判定"问题至今没彻底解决。

5. **AS prepending 没用**：你以为多几个 AS 号能让对方绕路，但对方可能用 LocalPref 强行覆盖。要降流量更可靠的办法是直接跟邻居谈、改商务合同。

6. **BGP 没安全机制**：协议本身没人验证"这个 AS 真的能到这个 prefix 吗"。2008 年巴基斯坦电信误把 youtube 的 prefix 公告成自己的，几分钟内全球流量被吸进去。后来才有 RPKI 加密签名机制。

## 适用 vs 不适用场景

**这套策略框架适合**：
- 商业互联网骨干——经济关系决定一切
- 企业多归属（multi-homing）——一家公司接多个上游做 backup
- 大型 ISP 内部 TE（Traffic Engineering）——避免热点链路过载

**不适用 / 该用别的**：
- 同 AS 内部 → 用 IGP（OSPF / IS-IS），不用 BGP
- 数据中心内部 → 用 spine-leaf + ECMP，BGP 只做 underlay
- "我要 SLA 保证延迟 < 50ms" → BGP 给不了，用专线 / SD-WAN
- 端到端可靠性 → 在应用层用 CDN / anycast 绕开 BGP 不确定性

## 历史小故事（可跳过）

- **1989 年**：BGP-1（RFC 1105）发布，最初只是简单的 path-vector，没有 LocalPref / MED / community。
- **1990s**：互联网从学术网（NSFNET）变成商业网。ISP 开始有"客户 / peer / provider"区分，需要表达策略，于是 BGP 不停加属性——LocalPref、MED、community 都是这十年里逐步加上去的。
- **2005 年**：Caesar 和 Rexford 写本论文，把 15 年里"边打补丁边演化"的策略生态系统化讲清楚。论文重点不是 BGP 协议本身，**是协议背后的运营经济学**。

之后的研究方向：自动检测策略冲突（policy verification）、安全（RPKI 防 BGP 劫持）、可预测的 TE 工具。

## 学到什么

1. **路由不是几何问题，是经济问题**——最短路径让位于"按合同最划算"
2. **LocalPref 第一**——本 ISP 的钱包决定一切，路径长度只是次要因素
3. **三类邻居关系**——客户付我（爱）、peer 互连（中立）、上游收我钱（少用）
4. **community 是黑魔法**——灵活但无标准，是误配重灾区
5. **网络协议长期演化的代价**——BGP 的复杂度大半在 1989 之后边打补丁加上去的策略层

## 延伸阅读

- 论文 PDF：[Caesar-Rexford 2005](https://www.cs.princeton.edu/~jrex/papers/policies.pdf)（11 页，密度适中）
- 进阶：Gao-Rexford 2001 《Stable Internet Routing without Global Coordination》——证明在客户/peer/provider 三类关系下，全球路由最终能稳定收敛
- 实战：BGPlay / RIPEstat 可视化工具——能看到一条 prefix 实际走了哪些 AS
- [[metcalfe-boggs-1976]] —— AS 内部链路层基础（以太网）
- [[akamai-2002]] —— CDN 用 anycast 绕开 BGP 不确定性，把内容推近用户
- [[rest-fielding-2000]] —— BGP 之上的应用层语义

## 关联

- [[metcalfe-boggs-1976]] —— 以太网为 AS 内部网络提供基础
- [[akamai-2002]] —— CDN 在应用层缓解 BGP 选路问题
- [[rest-fielding-2000]] —— 应用层 API 设计，BGP 是其下面的传输基础
- [[google-1998]] —— 大型互联网公司内部需要自建专线绕开公网 BGP

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[akamai-2002]] —— Akamai 2002 — 把网站搬到离用户 10 毫秒的地方
- [[dwork-dp-icalp-2006]] —— 差分隐私 — ε 与邻接数据集不可区分
- [[mahajan-2002-bgp-misconfig]] —— Mahajan 2002 — 三周看互联网，1% 的路由更新是手滑
- [[metcalfe-boggs-1976]] —— Metcalfe-Boggs 1976 — 一根线上几百台电脑怎么不打架
- [[rest-fielding-2000]] —— REST — Fielding 2000 给 Web API 写下的设计宪法

