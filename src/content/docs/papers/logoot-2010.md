---
title: 'Logoot — 给每个字符发一张"永不过期的座位号"'
来源: 'Weiss, Urso, Molli, ''Logoot: A Scalable Optimistic Replication Algorithm for Collaborative Editing on P2P Networks'', IEEE TPDS 2010'
日期: 2026-05-30
分类: 分布式系统
难度: 中级
---

## 是什么

Logoot 是一套**协同编辑算法**：多人同时改一段文字，不用先锁、不用中央服务器、不用把操作一条条转换坐标，最后还能自动收敛到完全一致。

日常类比：电影院给每个座位印一张**永不过期的座位号**。即使中间临时塞进 30 个加座，原来的"第 5 排第 8 座"还是它原来那个位置——因为座位号本身就是它的身份，不是"从前往后数第几个"这种相对坐标。

Logoot 把这个想法搬到文字编辑上。每输入一个字符，本地立刻给它生成一个**全局唯一、永不变动的位置 ID**。同步时只需要把"哪些 ID 加进来、哪些删掉"广播给别人；所有副本按 ID 排序就是正确的文档顺序。

这是后来 [[crdt-shapiro-2011]] 论文里 **CmRDT 序列**这一类的代表算法之一，也是 Yjs 的 YArray、Automerge 文本类型背后那种"dense ID"思路的近亲。

## 为什么重要

不理解 Logoot 这套思路，下面这些事讲不清楚：

- 为什么 Yjs / Automerge 这类协同库不用 [[ot-1989]] 那一套 `transform()` 函数也能多人协同
- 为什么 fractional indexing（小数索引）这两年在前端火起来——它就是 Logoot 思路的简化版
- 为什么 P2P 协同编辑（没有中心服务器）能做：操作完全交换、不依赖谁先到
- 为什么"每个字符一个 ID"听起来浪费内存，工业界还是真用了

它和 [[ot-1989]] 是协同编辑两大流派：OT 让**操作**变形适应上下文，Logoot 让**位置**本身就不变。

## 核心要点

Logoot 的三层设计，从下往上拆：

1. **位置 ID（position identifier, PID）**：每个字符配一个 ID，结构是一串三元组 `[(d1, s1, c1), (d2, s2, c2), ...]`。`d` 是数字段，`s` 是副本 ID，`c` 是该副本的逻辑时钟。两个 PID 按字典序比较——先比第一对，再比第二对，依次类推。

2. **稠密生成（dense generation）**：在两个已有 PID `P` 和 `Q` 之间永远能造出一个新 PID `R`，使得 `P < R < Q`。靠的是数字段可以"再加一层"：`P = [(3,A,1)]`、`Q = [(5,A,1)]` → `R = [(4,A,2)]`；如果 P、Q 紧挨着 `[(3,A,1)]` 和 `[(4,A,1)]`，就在后面加一层 `R = [(3,A,1),(7,A,2)]`。永远塞得下。

3. **两种操作**：
   - `insert(P, Q, c)`：在 PID 为 P 的字符和 PID 为 Q 的字符之间插入字符 c，本地生成 R，广播 `(R, c)`
   - `delete(R)`：广播"删除 PID 为 R 的字符"，所有副本直接从有序集合里抠掉

**为什么能交换**：所有操作都用绝对 ID 寻址，不依赖"第几个字符"这种相对坐标。两条 insert 同时到，按 ID 排进有序集合即可；delete 同样按 ID 操作。**没有先后依赖**，自动满足 CmRDT 要求。

**没有 tombstone**：删除直接从集合里移除 PID。这是 Logoot 相对 RGA / WOOT 这类老 CRDT 的卖点——长期删除留下的"墓碑"问题在 Logoot 里不存在。

## 实践案例

### 案例 1：两人同时插字符

文档 `"AC"`，A 的 PID = `[(2,X,1)]`，C 的 PID = `[(8,X,1)]`。

- 用户 X 在 A、C 之间插 `B` → 生成 PID `[(5,X,2)]`，广播
- 同时用户 Y 也在 A、C 之间插 `b` → 生成 PID `[(5,Y,3)]`，广播

两个 PID 都是 `5` 开头，按 (siteId, clock) 这一层继续比：X < Y → X 的 `B` 排前面。两边收敛到 `"ABbC"`。**两条 insert 完全交换**，不需要 transform。

### 案例 2：稠密生成永不卡死

连续在两个紧邻 PID `[(3,A,1)]` 和 `[(4,A,1)]` 之间插字符：

- 第一次插：生成 `[(3,A,1),(5,A,2)]`（在 3 后面再加一层）
- 第二次插（在上面的结果和 `[(4,A,1)]` 之间）：生成 `[(3,A,1),(7,A,3)]`
- 第三次插（在前两个之间）：再加一层

ID 长度会增长，但**永远能生成**。代价是：连续在同一区间插入，ID 越来越长，存储和比较都变贵。

### 案例 3：交换字符如何排序

PID 排序是按字典序逐层比较。对应到代码大致是：

```text
def cmp(p, q):
    for (d1, s1, c1), (d2, s2, c2) in zip(p, q):
        if (d1, s1, c1) != (d2, s2, c2):
            return (d1, s1, c1) < (d2, s2, c2)
    return len(p) < len(q)  # 短的排前面
```

整个文档 = 一个按 PID 排序的有序映射 `PID → char`。读出文档 = 按 PID 顺序遍历。

### 案例 4：和 Yjs YArray 的近亲关系

Yjs 的 YArray / YText 不直接用 Logoot 的多层数字 ID，而是用"前驱字符的 ID + 当前 client 的 clock"作为身份。看起来不一样，但本质都是同一思路：**用一个全局唯一、永不过期的标识符代替"第几个"这种相对坐标**。差别在于：

- Logoot：ID 自带稠密序（任意两 ID 间能再生成 ID），全局排序就是文档顺序
- Yjs：ID 是单点身份，顺序由"插入时记录前驱"的链式结构决定

工程上 Yjs 的链式结构对 interleaving 友好一点；Logoot 的稠密 ID 更适合 P2P 无中心场景。

## 踩过的坑

1. **interleaving 异常**：两个用户同时在同一个空隙打字（比如 A 打 "Hello"、B 打 "World"），生成的 PID 会**交错穿插**——最后看到的可能是 "HWeolrllod"。所有 dense-ID 类 CRDT（包括 Yjs YArray、Logoot、LSEQ）都有这个问题。后来的 RGA 通过"插入位置由前驱决定"在某种程度上缓解。

2. **ID 长度无界增长**：每次在拥挤区间插字符，ID 都可能多一层。极端情况下，长文档单字符的 ID 可能膨胀到几百字节。LSEQ（2013）通过自适应分配策略压缩这个问题，但没彻底消灭。

3. **删除竞争**：A 删字符 X、B 同时在 X 后面插 Y——B 的 insert 用 X 的 PID 作为前驱，但 X 已经被删了。Logoot 假设系统能保留"已删除的 PID 用过"的信息一段时间，否则 Y 的位置可能漂移。

4. **不能用整数 ID**：初学者常想"为什么不直接用浮点数当 PID？"——浮点精度有限，反复在同一区间插入很快就用完精度。必须用任意精度的串状结构。

## 适用 vs 不适用场景

**适用**：

- P2P / 离线优先 / 端到端加密的协同编辑（没有中心服务器协调）
- 写入分散、删除较多的场景（无 tombstone 是优势）
- 字符级粒度的编辑（每字符一个 ID，能做精细 undo / 可视化）

**不适用**：

- 大段连续粘贴（每个字符独立 ID 浪费明显，工业实现一般用块化优化）
- 需要严格保留作者意图的场景（interleaving 异常会让两段文字混在一起）
- 极端紧凑的存储要求（ID 体积通常是字符本身的几倍到几十倍）

## 历史小故事（可跳过）

- **2006 年**：WOOT（Oster 等）提出"每个字符给 ID + 前驱后继约束"，是序列 CRDT 的开山之作，但要保留所有 tombstone。
- **2009 年**：Stéphane Weiss 等在洛林大学（INRIA Lorraine）做 P2P 协同编辑研究，先发了 ICDCS 2009 短版本，提出去掉 tombstone 的稠密 ID 方案。
- **2010 年**：扩展版发表在 IEEE TPDS，正式定型 Logoot 算法、给出收敛性证明、做了大规模 P2P 实验。
- **2011 年**：Shapiro 等的 [[crdt-shapiro-2011]] 报告把 Logoot 收编为 CmRDT 序列家族的代表。
- **2013 年**：同实验室的 LSEQ（Nédelec 等）改进 Logoot 的 ID 增长问题，自适应选分配策略。
- **2020 年代**：Yjs（Kevin Jahns）和 Automerge（Martin Kleppmann）把这套思路工程化，进入 Notion、Linear、Figma 等产品。

## 学到什么

1. **位置不变 vs 操作变形**：协同编辑的本质矛盾是"坐标会过期"。Logoot 选择把坐标做成绝对 ID（坐标永远不变），OT 选择让操作变形适应坐标——两条路都能通。
2. **稠密序的力量**：能在任意两点间塞新点的有序结构，是分布式协同的关键基础设施。fractional indexing、Logoot、LSEQ 都是同一思想的不同实现。
3. **没有银弹**：去掉 tombstone 换来 ID 膨胀，去掉转换换来 interleaving。每个 CRDT 设计都在做权衡。
4. **CRDT vs OT 不是非此即彼**：现代库（Yjs / Automerge）借了 Logoot 的 ID 思路，又借了 RGA 的前驱链思路，工程上是混合的。
5. **理论 → 算法 → 工业**：从 1989 OT 到 2006 WOOT 到 2010 Logoot 再到 2020 Yjs 工业落地，三十多年才把"多人同时改一份文档"做成今天 Google Docs / Notion 那种"看起来天经地义"的体验。

## 延伸阅读

- 论文 PDF：[Weiss, Urso, Molli — Logoot 2010](https://hal.inria.fr/inria-00432368/document)
- 工程视角：[Yjs 文档 — Internals](https://docs.yjs.dev/api/internals)（YArray 的 ID 设计与 Logoot 的关系）
- 改进算法：[Nédelec et al. — LSEQ 2013](https://hal.archives-ouvertes.fr/hal-00921633/document)（缓解 ID 膨胀）
- fractional indexing 工程文章：[David Greenspan — Implementing Fractional Indexing](https://observablehq.com/@dgreensp/implementing-fractional-indexing)（Logoot 的最简版）
- [[crdt-shapiro-2011]] —— CRDT 综述，Logoot 在序列 CRDT 章节
- [[ot-1989]] —— 协同编辑的另一条路线

## 关联

- [[crdt-shapiro-2011]] —— Logoot 是其中"序列 CmRDT"的代表实现
- [[ot-1989]] —— 同一问题的另一种解法：操作变形而不是位置不变
- [[crdt-json]] —— 把 CRDT 思想推广到嵌套 JSON 结构
- [[crdt-sss-2011]] —— CRDT 早期形式化的姊妹工作
- [[lamport-tla-1994]] —— 收敛性证明的形式化背景

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[crdt-json-2017]] —— CRDT JSON 2017 — 给嵌套 JSON 一套有数学证明的合并算法
- [[automerge]] —— Automerge — 让两份 JSON 自动合并的 CRDT 库
