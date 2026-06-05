---
title: CRDT JSON — 协同编辑 JSON 数据结构
来源: Kleppmann & Beresford, "A Conflict-Free Replicated JSON Datatype", IEEE TPDS 2017
日期: 2026-05-29
子分类: 分布式系统
分类: 分布式系统
难度: 中级
provenance: pipeline-v3
---

## 是什么

CRDT JSON 是一套**让多人同时编辑同一份 JSON 文档、各自离线改完合起来不打架**的方法。日常类比：Google Doc 你能离线在飞机上写、落地一连网就自动合进去。这篇论文把这套思想推广到任意 JSON 结构——map 套 list、list 套 map，递归任意深度。

举个直观例子。两个人各拿一份 `{title: "Hello"}`：

```
A 把 title 改成 "Hello A"
B 把 title 改成 "Hello B"
```

两人各自离线改完，对照时合并——不需要"领导"决定听谁的。CRDT 的数学规则保证：**无论 A 先收到 B 的改动，还是 B 先收到 A 的，最终两边看到的文档一模一样**。

CRDT 全称 Conflict-Free Replicated Data Type——"无冲突可复制数据类型"。听起来玄，本质是一套有数学保证的合并规则。

## 为什么重要

不理解 CRDT，下面这些产品都没法解释：

- 为什么 **Figma** 多人画图无锁，每人改不同节点不互踩
- 为什么 **Linear** / **Notion** 离线写笔记联网后自动合并，不会冒出"冲突副本"
- 为什么 **Yjs** / **Automerge** 这些库能让普通开发者两小时上手"协同编辑"
- 为什么 2019 年起兴起的"**local-first software**"运动把 CRDT 当核心引擎

简单说：**没有 CRDT，离线 + 协同 + 无服务器三选其二**。CRDT 是同时兜住三个的数学工具。

## 核心要点

CRDT 的数学保证靠**三件事**：

1. **操作可交换**：`A 操作 + B 操作` 和 `B 操作 + A 操作` 结果一致。类比：两个人往同一个购物车里放苹果和香蕉，谁先放谁后放，最后都是"一苹果一香蕉"。

2. **不需要冲突解决**：传统数据库遇到并发改同一字段要弹窗"你选哪个"。CRDT 用数学规则**当场拍板**——比如 map 的 key 用 Lamport 时间戳大者赢，list 的并发插入按字典序排。

3. **任意嵌套**：之前的 CRDT 论文都是平坦的（一个 set / 一个 list / 一个 register）。这篇第一次证明**嵌套组合后整体仍然收敛**——map 的 value 可以是 list，list 的元素可以是 map，套多深都行。

合起来一句话：**每个 JSON 节点都是独立 CRDT，每个操作都带 Lamport 时间戳，合并就是按时间戳重排所有操作**。

## 实践案例

### 案例 1：两个人并发改同一个字段

```
初始：{title: "Hello"}
A 离线改：{title: "Hello A"}
B 离线改：{title: "Hello B"}
合并后：两个值都保留，应用层决定怎么显示
```

这叫 **multi-value register**——并发写不丢任何一个，读时返回值的集合。比"最后写的赢"更安全，因为不会无声丢数据。

### 案例 2：list 并发插入

```
初始：["X"]
A 在 X 后插入 "a"  → ["X", "a"]
B 在 X 后插入 "b"  → ["X", "b"]
合并：["X", "a", "b"] 或 ["X", "b", "a"]
```

具体顺序由 Lamport 时间戳决定，但**双方一定看到同一个顺序**——这就是收敛性。

### 案例 3：删除 + 并发插入

```
初始：["X"]
A 删除 X       → []
B 在 X 后插入 c → ["X", "c"]
合并：["c"]
```

X 没有真删——它变成 **tombstone**（墓碑），保留位置标记。这样 B 的"插在 X 后面"还能找到锚点。如果立即真删，c 就会"无家可归"。

### 案例 4：用 Yjs 跑个真协同

Yjs 是这篇论文思想的工业化 JS 实现，几行就能跑：

```js
import * as Y from 'yjs'

const docA = new Y.Doc()
const docB = new Y.Doc()

docA.getMap('root').set('title', 'Hello A')
docB.getMap('root').set('title', 'Hello B')

// 模拟同步
const updateA = Y.encodeStateAsUpdate(docA)
Y.applyUpdate(docB, updateA)
const updateB = Y.encodeStateAsUpdate(docB)
Y.applyUpdate(docA, updateB)

// 双方现在看到同一个值
console.log(docA.getMap('root').get('title'))
console.log(docB.getMap('root').get('title'))
```

不需要服务器，浏览器和浏览器互相 P2P 也能跑。

## 踩过的坑

1. **multi-value 给应用层负担**：保留所有并发写听起来优雅，但 UI 怎么显示两个 title？多数产品最后还是退化成"取最新时间戳"——multi-value 变成理论好看、生产没人用。

2. **tombstone 永远不真删**：每次 delete 只是打标记，list 长度只增不减。P2P 场景下如果有节点长期不上线，垃圾回收永远不能触发，文档体积只涨不降。

3. **元数据放大**：每个操作都带 Lamport 时间戳 + 因果前驱信息，元数据 / 实际数据比例可到 5-10 倍。频繁覆盖同一字段的应用尤其浪费。

4. **大文档性能下滑**：当操作数到百万级，合并 / 插入成本随文档大小增长。Yjs 用扁平双链表 + 字节级优化，大文档场景性能远好过 Automerge。这是论文没解决、留给后人的工程难题。

## 适用 vs 不适用场景

**适用**：

- 协同文档 / 协同笔记 / 协同白板（Notion / Figma / Excalidraw）
- 离线优先应用（飞行模式能改、落地自动同步）
- P2P 同步（蓝牙互传备忘录、局域网共享文档）
- 单设备多端（手机 + 平板 + 电脑同一账号同一文档）

**不适用**：

- 银行账户余额这类**强一致性**场景（multi-value 直接致命，必须 ACID 事务）
- 100 万行的电子表格（CRDT 元数据放大顶不住）
- 完全不需要离线 / 多端的传统 web 应用（直接用 PostgreSQL 更简单）

## 历史小故事（可跳过）

- **1989 年**：Ellis & Gibbs 提出 OT（Operational Transformation），让多人同步编辑成为可能。Google Docs 至今用的就是 OT。但 OT 必须有中央服务器维护"操作的全局序"，离线场景几乎不能跑。
- **2007 年**：Shapiro 等人提出 CRDT 概念——把"协调"从中央协议变成数据本身的代数性质，无中央服务器也能保证收敛。但当时 CRDT 都是平坦类型，不能描述 JSON 这种嵌套结构。
- **2017 年**：剑桥的 Kleppmann（《Designing Data-Intensive Applications》作者）和 Beresford 把 CRDT 推广到任意嵌套 JSON，给出算法 + 收敛性证明 + 工程压缩格式。这就是这篇 IEEE TPDS 论文。
- **2020 年至今**：Yjs / Automerge / Loro / Diamond Types 工业化爆发；Notion / Linear / Figma 把 CRDT 当协同核心；"local-first software"运动兴起。

从理论到工业化，整整 30 年。

## 学到什么

1. **协调不一定靠中央服务器**——靠数据本身的代数性质（交换律、结合律、幂等性）也能收敛
2. **Lamport 时间戳是分布式系统的瑞士军刀**——CRDT、向量时钟、因果一致性都靠它
3. **离线优先 vs 中央协调**是产品哲学选择，不是纯技术问题——CRDT 让前者第一次工程化可行
4. **嵌套组合是难点**——给单个数据类型设计 CRDT 简单，让 12 种 CRDT 嵌套后仍收敛要 30 年才被人证明

## 延伸阅读

- 论文 PDF：[Kleppmann & Beresford 2017 — A Conflict-Free Replicated JSON Datatype](https://martin.kleppmann.com/papers/json-crdt.pdf)（30 页，前 8 页是数学，后面是工程）
- 视频教程：[Martin Kleppmann — CRDTs: The Hard Parts](https://www.youtube.com/watch?v=x7drE24geUw)（1 小时讲清 CRDT 工程难题）
- 工业实现：[automerge/automerge](https://github.com/automerge/automerge)（Rust + JS 绑定，作者本人 maintainer）
- 性能对照：[Joseph Gentle — 5000x faster CRDTs](https://josephg.com/blog/crdts-go-brrr/)（讲列存 + 扁平结构怎么把 CRDT 提速）
- 产品哲学：[Local-First Software 宣言](https://www.inkandswitch.com/local-first/)（CRDT 在产品层的延伸）

## 关联

- [[lamport-1978]] —— Lamport 时间戳是 CRDT 的时间基础
- [[dynamo]] —— vector clock 工程化先例，CRDT 借鉴了它的"逐 actor 计数"思路
- [[raft]] —— 强一致性的对照面，和 CRDT 的最终一致性是一对哲学反义词
- [[paxos]] —— 中央协调的代表，与 CRDT 的"无协调"形成对比

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[affine]] —— AFFiNE — 文档和白板共用同一棵 block 树的开源知识库
- [[bernstein-1981-cc]] —— Bernstein 1981 并发控制综述 — 把分布式数据库的 20+ 算法整成两条主线
- [[crdt-shapiro-2011]] —— CRDT — 让多副本各改各的，最终自动合一
- [[crdt-sss-2011]] —— CRDT 形式定义 — SSS 2011 八页浓缩版
- [[dynamo]] —— Dynamo — 让购物车永远能写入的分布式存储
- [[eswaran-1976]] —— Eswaran 1976 — 串行化与谓词锁的源头
- [[immer]] —— Immer — 用 Proxy 让你写"看起来可改"的代码却产出不可变状态
- [[lamport-1978]] —— Lamport 1978 — 分布式系统里没有"绝对的同时"
- [[logoot-2010]] —— Logoot — 给每个字符发一张"永不过期的座位号"
- [[ot-1989]] —— OT — 多人同时改一份文档，操作随上下文自动改坐标
- [[paxos]] —— Paxos — 分布式共识算法
- [[raft]] —— Raft — 易理解的共识算法
- [[yjs]] —— Yjs — 让任何编辑器都能接的协同编辑内核

