---
title: Jupiter — 把 OT 简化成 client-server，让协同编辑能上工业
来源: Nichols, Curtis, Dixon, Lamping, "High-Latency, Low-Bandwidth Windowing in the Jupiter Collaboration System", UIST 1995
日期: 2026-05-30
子分类: 共识与复制
分类: 分布式系统
难度: 中级
---

## 是什么

Jupiter 是 1995 年 Xerox PARC 做的一套**跨办公室、跨大陆的实时协作系统**——共享白板、聊天、共享应用窗口都揉在里面。这篇 UIST 论文里最有价值的不是产品本身，而是一套被后人反复抄的协同编辑算法，叫做 **Jupiter 模型**。

日常类比：你和大洋彼岸的同事打卫星电话。每说一句话要 300 毫秒对方才听到。Jupiter 让你说完不用等回声——**本地立刻显示自己说的内容**，对方那边收到时再自动把"我刚才在哪个时间点说的"对齐一下。

技术定义：把 [[ot-1989]]（Ellis-Gibbs 的 dOPT 算法）从对等网络的 N×N 变换简化成 **client-server** 形式，每个 client 只和 server 之间做变换，client 互相不通信。

代价是 server 故障全停；好处是**实现复杂度从 O(N²) 降到 O(N)**，工业上能跑了。

## 为什么重要

不理解 Jupiter，下面这些产品都没法解释：

- **Google Wave**（2009）的 OT 引擎白皮书明确写"based on Jupiter"
- **Google Docs / Office 365 / Quip / Etherpad** 全部是 Jupiter 派 OT 的衍生
- **ShareJS / ot.js** 等开源协同编辑库的代码骨架直接照抄 Jupiter

dOPT 1989 提出后 6 年没人能让它真正跑起来——两两 transform 复杂度爆炸、TP2 性质难满足。Jupiter 一刀砍掉对等网络，让 OT 第一次具备工业可行性。

它和 [[crdt-shapiro-2011]]（CRDT）并列为协同编辑两条路线，但**所有用 OT 的工业产品本质上用的都是 Jupiter，不是原版 dOPT**。

## 核心要点

Jupiter 解决的核心痛点：dOPT 让 N 个 client 两两做 transform，每条操作要算 O(N²) 次变换，且要维护 N 维状态向量——工程上几乎不可能调对。

Jupiter 的三板斧：

1. **中心化 server**：所有 client 只和 server 通信，client 之间互相看不见。server 维护文档的"权威序列"。
2. **每端两个数**：每个 client 只记两件事——"我发出去几条"、"我从 server 收到几条"。**不再需要 N 维向量**。
3. **server 串行化变换**：server 收到 client 的操作时，把它和"自己已经应用、但 client 还没看到的操作"做 transform，再广播给其他 client。

举个具体的：

- 文档初始 `"abcde"`，client A、B 各自连到 server
- A 在位置 1 前插 X，发给 server；几乎同时 B 在位置 5 前插 Y，发给 server
- server 先收到 A：直接应用 → `"aXbcde"`，广播给 B
- server 后收到 B 的 `insert(5, Y)`：发现 B 是基于 `"abcde"` 发的，但 server 现在已经是 `"aXbcde"` → 把 `insert(5, Y)` 变换成 `insert(6, Y)`，应用 → `"aXbcdYe"`，广播给 A
- A 那边：本地早已是 `"aXbcde"`；收到 server 的 `insert(6, Y)` → `"aXbcdYe"`
- B 那边：本地是 `"abcdYe"`；收到 server 广播的 A 的 `insert(1, X)` → 因为 B 已经在位置 5 插了 Y，server 也帮 B 把 A 的操作变换好了 → 收敛到 `"aXbcdYe"`

整个过程**没有任何 client 直接和另一个 client 对话**。这就是 Jupiter 的工程胜利。

## 实践案例

### 案例 1：Jupiter 协议的最简实现

server 端伪代码：

```python
class JupiterServer:
    def __init__(self):
        self.doc = ""
        self.history = []  # 已应用的所有操作

    def on_client_op(self, op, client_seen_count):
        # client_seen_count: 该 client 收到 server 的几条操作
        # 取出 client 没看到的那段，逐条 transform
        unseen = self.history[client_seen_count:]
        for past_op in unseen:
            op = transform(op, past_op)
        self.doc = apply(self.doc, op)
        self.history.append(op)
        broadcast(op)  # 给其他 client
```

每个 client 只需要镜像维护"我发了几条 / 收了几条"，server 那一段循环替代了 dOPT 的 N 维向量比较。

### 案例 2：Google Wave 怎么继承 Jupiter

Google Wave 2009 上线时的协议白皮书几乎逐字照抄 Jupiter：

- 中心 server（Google 机房）替代 PARC server
- client 是浏览器 JS
- 每条编辑带 `version` 字段（client 看到 server 的第几个版本）
- server 收到后做 transform 再广播

Google Wave 后来失败是因为产品定位混乱（不是技术问题），但它把 Jupiter 协议带到了开源世界——Apache Wave 项目把这套 OT 引擎完整开源。

### 案例 3：高延迟 UX 设计——本地预测 + 后台 reconcile

Jupiter 论文除了讲算法，还讲了一套高延迟下的 UI 哲学：

- 用户输入后**本地立刻显示**，不等 server 答复（不然 300ms 延迟下打字像 1990 年代的 telnet）
- 后台与 server 协调；如果 server 那边发生冲突，**悄悄修改本地显示**而不弹错误
- 把"在网络上"这件事对用户透明

这套思路后来被 Google Docs / Wave 全盘继承。今天你在 Docs 里打字流畅得像本地软件，背后就是 Jupiter 这套预测 + 修正模型。

## 踩过的坑

1. **server 是单点**：server 一挂全停。Google Docs 靠多机房 + 复制规避；纯 P2P 协作不能用 Jupiter，得用 CRDT。

2. **不能完全信任 client**：client 发的 `version` 字段如果伪造，server 的 transform 会算错。生产环境必须 server 端校验。

3. **大文档历史无限增长**：server 的 `history` 数组永远在加。实际系统会做 checkpoint——所有 client 都确认看过某条操作后，那条之前的可以回收。

4. **transform 函数仍要写对**：Jupiter 简化的是网络拓扑，不是 transform 本身。insert vs delete、delete vs delete 等四种组合还是要写、要测。富文本属性、嵌套表格出现时仍会爆炸。

## 适用 vs 不适用场景

**适用**：

- 中心化协同编辑（Google Docs / Office 365 / Etherpad / Wave / Quip）
- 高延迟链路（跨大陆、卫星、移动网络）下的实时协作
- server 可信、可投资多机房复制的场景

**不适用**：

- 完全 P2P / 去中心化协作 → 用 [[crdt-shapiro-2011]]
- 长时间离线后合并 → CRDT 更稳
- 操作类型种类极多 → transform 函数表会组合爆炸

## 历史小故事（可跳过）

- **1989 年**：Ellis & Gibbs 在 SIGMOD 提 dOPT + GROVE。算法漂亮但**两两 transform 复杂度太高**，工程没法用。
- **1995 年**：Xerox PARC 的 Nichols / Curtis / Dixon / Lamping 在 UIST 发 Jupiter 论文。砍掉 P2P 拓扑，加 client-server，OT 第一次工业化可行。
- **1996 年**：Ressel 提 adOPTed 算法 + TP1/TP2 形式化，给 OT 一个数学根基。Jupiter 因为限定 server 串行化，**天然回避 TP2**。
- **2009 年**：Google Wave 上线，OT 引擎是 Jupiter 的直系后裔。
- **2010 年代**：Google Docs / Office 365 / Quip / Etherpad / ShareJS 等几乎所有 OT 工业实现都用 Jupiter 拓扑。

dOPT 1989 → Jupiter 1995 → Wave 2009 → Docs 主流——OT 走了 20 年才从论文 bug 变成 10 亿人每天用的工具，**简化拓扑这一步才是关键**。

## 学到什么

1. **算法的工业化不靠"更聪明"，靠"砍掉某一类一般性"**——Jupiter 砍掉 P2P，换来可调试性。
2. **复杂度对工程友好度的影响是非线性的**：O(N²) → O(N) 不是快 N 倍，是从"调不出来"变成"能上线"。
3. **server 单点未必是劣势**——10 亿用户的 Google Docs 证明，多机房 + 复制比 P2P 简单很多。
4. **UI 哲学和算法同等重要**：本地预测 + 后台 reconcile 才让 300ms 延迟感觉像 0ms。

## 延伸阅读

- 论文 PDF：[Nichols et al. 1995](https://dl.acm.org/doi/10.1145/215585.215706)（UIST，10 页，Jupiter 系统全貌 + 协同算法）
- 工程文档：[Google Wave Operational Transformation](https://svn.apache.org/repos/asf/incubator/wave/whitepapers/operational-transform/operational-transform.html)（Wave 团队自己写的 OT 工程文档，与 Jupiter 一脉相承）
- 综述：[Sun & Ellis, "Operational Transformation in Real-Time Group Editors", CSCW 1998](https://dl.acm.org/doi/10.1145/289444.289469)（OT 第一篇完整综述，含 Jupiter 章节）
- [[ot-1989]] —— Jupiter 简化的对象
- Google Wave 2009 工程白皮书 —— Jupiter 协议第一次推到大众产品

## 关联

- [[ot-1989]] —— Jupiter 是它的工程化简化版
- Google Wave（2009）—— Wave 的 OT 引擎直接继承 Jupiter
- [[crdt-shapiro-2011]] —— 协同编辑另一流派，与 Jupiter/OT 并列
- [[lamport-1978]] —— 因果序基础，Jupiter 的"两个数"是其退化形式
- [[paxos-1998]] —— 强一致协议，与 Jupiter 的"最终一致"对照
