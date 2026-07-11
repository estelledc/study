---
title: 'CRDT JSON 2017 — 给嵌套 JSON 一套有数学证明的合并算法'
来源: 'Kleppmann & Beresford, "A Conflict-Free Replicated JSON Datatype", IEEE TPDS 2017'
日期: 2026-05-30
分类: 分布式系统
难度: 中级
---

## 是什么

CRDT JSON 2017 论文做的事：**把"无冲突合并"从单个数据结构推广到任意嵌套的 JSON 文档**，并用 Isabelle/HOL（可做机器检查的证明助手）给出收敛性证明。日常类比：以前的 CRDT 像教你"两人同时改一个购物车不会乱"；这篇教你"两人同时改一份套了 5 层的 JSON 也不会乱"。

举个直观例子：

```json
{ "title": "Hello", "tags": ["a", "b"] }
```

A 离线改 title 为 "Hi" 并往 tags 末尾插 "c"；B 离线改 title 为 "Hey" 并删 tags[0]。重连后，**无论谁先收谁的改动**，两边最终结构一致——论文称 strong eventual consistency（强最终一致性：只要传达的操作集合相同，状态就相同）。

CRDT = Conflict-Free Replicated Data Type。这篇是该家族里较早把**任意深度递归结构**讲严的代表作。

## 为什么重要

不理解这篇，下面这些事说不清：

- 为什么 **Automerge**（作者维护）能让两个浏览器互发更新就收敛
- 为什么文档级 CRDT 工业化（Automerge / 后来的 Loro 等）常把嵌套 JSON 当目标形态
- 为什么 2019 年 Ink & Switch 的 **local-first** 宣言把 JSON CRDT 当引擎选项
- 为什么"嵌套也能证收敛"在 2017 年前后才被认真做完——此前多年卡在平坦类型

## 核心要点

算法可拆成四件事：

1. **每层节点各自是 CRDT**：map / list / register 规则不同。并发赋值更贴近 **multi-value register**（多值寄存器：先留齐并发值）；list 用类似 RGA 的有序链（用操作 ID 找前后邻居）；删除变 tombstone。工程上常再退化成 LWW（只留一个最新值）。

2. **操作 ID = (Lamport 时钟, replica id)**：Lamport 时钟是逻辑钟——不看手表，只保证因果先后。合并时"谁先到网络"不重要，按 ID 全序处理。

3. **递归组合仍收敛**：只要每层是 CRDT、嵌套规则一致，整棵 JSON 树仍是 CRDT。论文用 Isabelle/HOL 写了长篇机器可检证明。

4. **删除不真删**：tombstone 留锚点，否则"插在 X 后"会丢位置。

一句话：**JSON 是树；树的每个节点是 CRDT；节点间用操作 ID 当胶水。**

若你只记一件工程事实：可见文档可以看起来"删干净了"，元数据里仍可能留着墓碑与旧节点历史——这既是正确性来源，也是体积来源。

## 实践案例

### 案例 1：MV-Register

```
初始：{title: "Hello"}
A：title = "Hi"   ID=(5,A)
B：title = "Hey"  ID=(5,B)
合并：title 读作 {"Hi","Hey"}
```

逐步：两边赋值并发 → 读返回集合 → UI 再决定展示。对照 LWW：只按时间戳留一个，实现简单但会静默丢写。

### 案例 2：list 删除遇上插入

```
初始：[X]
A：insertAfter(X, a)  ID=(3,A)
B：delete(X)          ID=(3,B)
合并显示：[a]
```

逐步：X 留为 tombstone；A 仍能锚定"X 之后"；渲染跳过墓碑。这是 list CRDT 的经典坑与解法。

### 案例 3：嵌套路径 vs 整段替换

```
A：改 doc.tags[0].label = "x"   （改子节点）
B：整段赋值 doc.tags = ["new"] （替换整棵子树）
```

逐步对照：B 的赋值让旧 `tags` 子树进入"被替换"历史；A 的操作仍绑定**旧子树里的节点 ID**，不会魔法长到 B 的新数组 `["new"]` 上。最终两边一致，但常见结果是新数组生效、旧子树上的并发改动不再出现在当前可见文档里（细节以论文的路径/节点规则为准）。相对 [[crdt-shapiro-2011]]，这篇的新增正是把这类嵌套冲突说清楚。

### 案例 4：Automerge 最小合并

```js
import { from, change, merge, save, load } from '@automerge/automerge'

let docA = from({ title: 'Hello', tags: ['a'] })
let docB = load(save(docA))

docA = change(docA, d => { d.title = 'Hi' })
docB = change(docB, d => { d.tags.push('c') })

console.log(merge(docA, docB))
// → { title: 'Hi', tags: ['a', 'c'] }
```

Automerge 最贴这篇；Yjs 主线更近 YATA，同属文档 CRDT 赛道但不是这篇的逐行实现。

## 踩过的坑

1. **MV-Register 难进 UI**：两个 title 怎么渲染？产品常退化成 LWW。
2. **tombstone 难 GC**：有副本长期离线时，体积只涨；论文也当 open problem。
3. **元数据放大**：每个操作带逻辑钟与副本信息；高频覆盖同一字段（如光标）会很痛。
4. **直译实现慢**：早期贴近论文的实现在百万操作上很慢；后来的工程实现用扁平/列存提速——那是后话，不代表 2017 算法"错了"。

## 适用 vs 不适用场景

**适用**：

- 协同笔记 / 白板：文档通常 < 数万节点、副本数个到几十
- 离线优先、P2P、多设备同步，能接受最终一致与一定元数据开销
- 需要"嵌套 JSON 可证收敛"的库设计参考（读 Automerge 前先读这篇）

**不适用**：

- 强一致账户/库存（ACID）
- 百万行表格式体量，或副本极多且无法做 GC 的 P2P
- 无离线、无多写的普通 web CRUD

## 历史小故事（可跳过）

- **2007 年**：Shapiro 等提出 CRDT，偏平坦类型。
- **2010–2011 年**：[[logoot-2010]] 攻 list；[[crdt-shapiro-2011]] 统一框架，仍未覆盖任意嵌套 JSON。
- **2017 年**：Kleppmann & Beresford 给出嵌套 JSON CRDT + Isabelle/HOL 证明。
- **2017 年起**：Automerge 贴论文落地；同赛道还有 Yjs / Loro 等工程路线。
- **2019 年**：Local-First 宣言把文档 CRDT 推到产品讨论中心。

## 学到什么

1. **机器可检证明**让工业敢把 CRDT 放进文档内核
2. **递归组合是难点**——单类型易，嵌套树难
3. **理论最优 ≠ 产品默认**：MV 干净，LWW 好用
4. **逻辑时钟**贯穿 CRDT 操作 ID 设计

## 延伸阅读

- 论文：[arXiv:1608.03960](https://arxiv.org/abs/1608.03960)
- 视频：[CRDTs: The Hard Parts](https://www.youtube.com/watch?v=x7drE24geUw)
- 实现：[automerge/automerge](https://github.com/automerge/automerge)
- 性能：[5000x faster CRDTs](https://josephg.com/blog/crdts-go-brrr/)
- 宣言：[Local-First Software](https://www.inkandswitch.com/local-first/)

## 关联

- [[crdt-json]] —— 同主题更偏产品直觉的笔记
- [[crdt-shapiro-2011]] —— 平坦 CRDT 综述
- [[logoot-2010]] —— list 协同前驱
- [[lamport-1978]] —— 逻辑时钟基础
- [[dynamo]] —— vector clock 工程先例
- [[raft]] —— 强一致对照
- [[yjs]] —— 同赛道高性能实现（YATA 路线）

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
