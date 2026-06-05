---
title: 'CRDT JSON 2017 — 给嵌套 JSON 一套有数学证明的合并算法'
来源: 'Kleppmann & Beresford, "A Conflict-Free Replicated JSON Datatype", IEEE TPDS 2017'
日期: 2026-05-30
子分类: 共识与复制
分类: 分布式系统
难度: 中级
provenance: pipeline-v3
---

## 是什么

CRDT JSON 2017 论文做的事：**把"无冲突合并"从单个数据结构推广到任意嵌套的 JSON 文档**，并给出 Isabelle/HOL 机器证明的收敛性。日常类比：之前的 CRDT 论文只能教你"两人同时改一个购物车不会乱"；这篇教你"两人同时改一份套了 5 层的 JSON 文档不会乱"。

举个直观例子。一份文档：

```json
{ "title": "Hello", "tags": ["a", "b"] }
```

A 离线把 title 改成 "Hi"、同时往 tags 末尾插 "c"；B 离线把 title 改成 "Hey"、同时删除 tags[0]。两人重连后，**无论谁先收谁的改动**，最终两边看到完全一样的结构——这是论文证明的"强最终一致性"（strong eventual consistency）。

CRDT 全称 Conflict-Free Replicated Data Type。这篇是该家族第一次覆盖**任意深度的递归结构**。

## 为什么重要

不理解这篇 2017 论文，下面这些事都说不清：

- 为什么 **Automerge**（论文作者本人维护）能让"两个浏览器互发 patch"就达到 Google Doc 级协同
- 为什么 **Yjs / Loro / Diamond Types** 都把这篇当起点，再做工程优化
- 为什么 2019 年 Ink & Switch 的 **local-first software** 宣言把 JSON CRDT 当核心引擎
- 为什么"嵌套结构能合并"在 2017 年才被严格证明——前面 10 年都卡在平坦类型（单个 set / counter）

## 核心要点

论文的算法可拆成 **四件事**：

1. **每个节点独立是 CRDT**：map / list / register 各有自己的合并规则。map 用 LWW + tombstone；list 用 RGA 风格的有序链；register 用 multi-value。

2. **操作 ID = (Lamport 时钟, replica id)**：每个插入 / 赋值 / 删除都打一个全序 ID。合并时谁先到不重要，按 ID 重排即可——这就是"无冲突"的数学根。

3. **递归组合仍收敛**：论文最难的部分。证明只要每层都是 CRDT、嵌套规则一致，整体就是 CRDT。这一步用 Isabelle/HOL 写了 12 页机器证明。

4. **删除不真删**：删除变 tombstone（墓碑），保留位置标记。否则"在 X 后插入"就会找不到锚点。

合起来一句话：**把 JSON 拆成树，树的每个节点是 CRDT，节点间用 Lamport ID 当胶水**。

## 实践案例

### 案例 1：MV-Register（多值寄存器）

```
初始：{title: "Hello"}
A 离线改：title = "Hi"   操作 ID = (5, A)
B 离线改：title = "Hey"  操作 ID = (5, B)
合并后：title = {"Hi", "Hey"}（两值都在）
```

读 title 时返回**集合**，应用层决定怎么显示。这叫 multi-value register——不丢任何并发写。和 LWW（last-writer-wins，按时间戳取一个）形成对照。

### 案例 2：list 并发插入找锚点

```
初始 list：[X]
A 在 X 后插入 a  → 操作"insertAfter(X, a, ID=(3,A))"
B 删除 X         → 操作"delete(X, ID=(3,B))"
合并：[a]
```

X 物理上保留为 tombstone（标记已删但不真清），所以 A 的 "在 X 后" 还能定位。最终 list 显示时跳过 tombstone，用户只看到 `[a]`。

### 案例 3：嵌套修改

```json
A:  doc.tags[0].label = "x"
B:  doc.tags = ["new"]   // 整个数组被替换
```

并发：A 在改 tags 的子节点，B 在替换整个 tags。论文的递归规则保证：**B 的覆盖优先级取决于操作 ID**，且若 A 的子修改 ID 更大，A 的改动也不会丢——它会附着在 B 的新数组上。这种"嵌套层之间的协调"就是这篇相对 [[crdt-shapiro-2011]] 的核心新增。

### 案例 4：用 Automerge 跑论文原型

```js
import { from, change, merge, save, load } from '@automerge/automerge'

let docA = from({ title: 'Hello', tags: ['a'] })
let docB = load(save(docA))               // 复制一份给 B

docA = change(docA, d => { d.title = 'Hi' })
docB = change(docB, d => { d.tags.push('c') })

const merged = merge(docA, docB)
console.log(merged)  // { title: 'Hi', tags: ['a', 'c'] }
```

Automerge 的 API 几乎是论文伪代码的直译——这也是它为啥比 Yjs 慢但更"教科书"。

## 踩过的坑

1. **MV-Register 在 UI 层很难显示**：保留两个并发 title，前端渲染什么？多数产品最后退化成 LWW。论文给的"理论最优"在工程很少真正用。

2. **tombstone 永远不能真删**：P2P 场景如果有节点离线半年，全网都不能 GC。文档体积只涨不降。论文坦承这是 open problem。

3. **元数据放大 5-10x**：每个操作带 Lamport ts + causal predecessor + replica id。频繁覆盖同一字段（比如光标位置同步）会爆炸。Yjs 用列存压缩缓解，Automerge 一直没追上。

4. **算法和性能脱节**：论文算法直译实现（早期 Automerge）跑百万操作要分钟级。Yjs 用扁平双链表把同一思想跑出 5000x 提速（[[logoot-2010]] 的稠密标识符思路也类似）。

## 适用 vs 不适用场景

**适用**：

- 协同笔记 / 协同白板（Notion 思路、Excalidraw、tldraw）
- 离线优先应用（飞行模式能改、落地自动合）
- P2P 同步（蓝牙互传、局域网）
- 单人多设备账号同步

**不适用**：

- 银行账户、库存计数等强一致场景（multi-value 致命，必须 ACID）
- 100 万行电子表格（元数据放大撑不住）
- 不需要离线 / 不需要协同的传统 web 应用（直接用 PostgreSQL）

## 历史小故事（可跳过）

- **2007 年**：Shapiro 等人在 INRIA 提出 CRDT 概念，但限于平坦类型。
- **2011 年**：[[crdt-shapiro-2011]] 综述统一了 CvRDT/CmRDT 框架，但仍未覆盖嵌套。
- **2010 年**：[[logoot-2010]] 用稠密标识符解决 list 协同，但只针对线性序列。
- **2017 年**：剑桥的 Kleppmann（《Designing Data-Intensive Applications》作者）和 Beresford 把 CRDT 推广到任意嵌套 JSON，给 Isabelle/HOL 机器证明。
- **2017 年起**：Automerge（作者亲自写的 Rust+JS 实现）→ Yjs（性能优化版）→ Loro / Diamond Types（列存版）连续工业化。
- **2019 年**：Ink & Switch 发布 *Local-First Software* 宣言，把 JSON CRDT 当核心引擎，撬动一波协同应用浪潮。

从 2007 提概念到 2017 形式证明嵌套，整整 10 年。

## 学到什么

1. **形式证明是 CRDT 进入工业的临门一脚**——之前都"看起来对"，机器证明后才敢用在生产文档上
2. **递归组合是难点不是点缀**——CRDT 单类型简单，让 12 种 CRDT 嵌套后仍收敛要 10 年
3. **理论最优 ≠ 工程最优**：MV-Register 数学最干净，但 UI 难落地；LWW 数学不优雅，但产品都用它
4. **Lamport 时间戳是分布式系统的瑞士军刀**：CRDT、向量时钟、因果一致性、Spanner TrueTime，全靠它

## 延伸阅读

- 论文 PDF：[Kleppmann & Beresford 2017 — A Conflict-Free Replicated JSON Datatype](https://arxiv.org/abs/1608.03960)（30 页，前 8 页直觉，中间 12 页 Isabelle 证明，后 10 页性能）
- 视频教程：[Martin Kleppmann — CRDTs: The Hard Parts](https://www.youtube.com/watch?v=x7drE24geUw)（1 小时讲清 GC / 性能 / 元数据放大）
- 工业实现：[automerge/automerge](https://github.com/automerge/automerge)（Rust + JS，作者亲自维护，最贴论文）
- 性能对照：[Joseph Gentle — 5000x faster CRDTs](https://josephg.com/blog/crdts-go-brrr/)（讲列存 + 扁平结构怎么提速）
- 产品哲学：[Local-First Software 宣言](https://www.inkandswitch.com/local-first/)（CRDT 在产品层的延伸）

## 关联

- [[crdt-shapiro-2011]] —— 平坦 CRDT 综述，这篇 2017 论文是它在嵌套结构上的关键扩展
- [[logoot-2010]] —— 只解决 list 协同的前驱，给"稠密标识符"思路
- [[lamport-1978]] —— Lamport 时间戳是 CRDT 操作 ID 的基础
- [[dynamo]] —— vector clock 工程化先例，CRDT 借鉴了"逐 actor 计数"
- [[raft]] —— 强一致性的对照面，与 CRDT 的最终一致性是哲学反义词
