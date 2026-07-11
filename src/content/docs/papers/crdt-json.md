---
title: CRDT JSON — 协同编辑 JSON 数据结构
来源: Kleppmann & Beresford, "A Conflict-Free Replicated JSON Datatype", IEEE TPDS 2017
日期: 2026-05-29
分类: 分布式系统
难度: 中级
---

## 是什么

CRDT JSON 是一套**让多人同时编辑同一份 JSON 文档、各自离线改完合起来不打架**的方法。日常类比：像几个人各改一份购物清单复印件，回家后按固定规则自动合成一份，而不是开会投票。Google Docs 也能多人同写，但它靠中央服务器做 OT；这篇论文要的是**没中央裁判也能合**。

举个直观例子。两个人各拿一份 `{title: "Hello"}`：

```
A 把 title 改成 "Hello A"
B 把 title 改成 "Hello B"
```

两人离线改完再交换改动——不需要"领导"决定听谁的。CRDT 的数学规则保证：**无论 A 先收到 B，还是 B 先收到 A，最终两边文档一模一样**。

CRDT 全称 Conflict-Free Replicated Data Type（无冲突可复制数据类型）：本质是一套有数学保证的合并规则。

## 为什么重要

不理解 CRDT，下面这些事都很难解释：

- 为什么 **Automerge / Yjs** 这类库能让普通开发者几小时内做出"离线也能合"的协同编辑
- 为什么 2019 年起 **local-first software** 运动把文档级 CRDT 当核心引擎
- 为什么协同白板 / 笔记产品常谈"无冲突合并"，而不只靠服务器锁行
- 为什么以前只能给 set / counter 做 CRDT，**嵌套 JSON** 要等到这篇才被严格讲清

简单说：有了文档级 CRDT，**离线 + 多副本 + 无中央协调**才第一次能同时兜住。

## 核心要点

CRDT 的数学保证靠**三件事**：

1. **操作可交换**：`A 操作 + B 操作` 和 `B 操作 + A 操作` 结果一致。类比：两人往同一购物车放苹果和香蕉，谁先放都行，最后都是"一苹果一香蕉"。

2. **并发写不靠弹窗裁决**：传统数据库改同一字段要你选版本。这篇对同一字段的并发赋值用 **multi-value register**（多值寄存器）——先**两个值都留着**，由应用层决定怎么显示；很多产品再退化成"取最新"。类比：两人同时改标题，先把两份草稿都夹进文件夹，而不是偷偷撕掉一份。

3. **任意嵌套仍收敛**：以前的 CRDT 多是平坦的（一个 set / list / register）。这篇证明 map 套 list、list 套 map，**套多深整体仍能收敛**。每个操作带 **Lamport 时间戳**（逻辑时钟：不看墙上时间，只保证"谁先发生"的因果序）和副本 ID，用来给操作排全序。

合起来：**每个 JSON 节点各自是 CRDT；合并按节点规则 + 操作 ID，不是简单全局重排一行日志。**

再补一句边界：list 并发插入的左右顺序由操作 ID 决定，但**双方一定看到同一顺序**——这叫收敛，不是"谁网速快谁说了算"。

读论文时先抓"节点类型 + 操作 ID + tombstone"三条线，再进 Isabelle 证明章节，会轻松很多。

## 实践案例

### 案例 1：并发改同一字段（multi-value）

```
初始：{title: "Hello"}
A 离线：title = "Hello A"   操作 ID = (5, A)
B 离线：title = "Hello B"   操作 ID = (5, B)
合并后：title 读出来是 {"Hello A", "Hello B"}
```

逐步看：两边都没"赢"；读时拿到集合。这比静默 LWW（last-writer-wins，只留一个）更安全，但 UI 要想清楚怎么展示两个标题。

### 案例 2：删除遇上并发插入

```
初始：["X"]
A 删除 X            → []
B 在 X 后插入 "c"   → ["X", "c"]
合并：["c"]
```

逐步看：X 变成 **tombstone**（墓碑：标记已删但留位置）。B 的"插在 X 后"还能找到锚点；若立刻物理删掉 X，c 会无家可归。显示时跳过墓碑，用户只看到 `["c"]`。

### 案例 3：用 Automerge 跟做（贴论文）

```js
import { from, change, merge, save, load } from '@automerge/automerge'

let docA = from({ title: 'Hello' })
let docB = load(save(docA))

docA = change(docA, d => { d.title = 'Hello A' })
docB = change(docB, d => { d.title = 'Hello B' })

const merged = merge(docA, docB)
console.log(merged.title) // 双方合并后读到同一确定结果（实现层会收敛）
```

Automerge 由论文作者维护，API 接近论文叙事。Yjs 更偏性能工程，对 Map 同一 key 常取 LWW，**不要用 Yjs 示例硬套 multi-value 故事**。

跟做时注意：两边 `change` 完必须 `merge`（或交换 sync message），只改本地文档看不到收敛。

## 踩过的坑

1. **multi-value 给 UI 负担**：两个 title 怎么显示？多数产品最后退化成取最新时间戳。
2. **tombstone 难真删**：P2P 若有节点长期不上线，GC 触发不了，文档体积只涨。
3. **元数据放大**：操作带逻辑时钟与因果信息，元数据/数据比可到数倍，频繁覆盖同一字段更明显。
4. **大文档性能**：操作到百万级时合并成本上升；Yjs 等用扁平结构做工程加速，那是论文之后的题。

## 适用 vs 不适用场景

**适用**：

- 协同文档 / 笔记 / 白板（需要并发编辑同一棵 JSON 树）
- 离线优先：飞行模式能改、落地自动同步
- P2P 或弱网多端（蓝牙、局域网、手机+电脑）

**不适用**：

- 银行余额等**强一致**计数（必须 ACID，不能靠 multi-value）
- 百万行电子表格级体量（元数据与合并成本顶不住）
- 无离线、无多副本的普通 CRUD（PostgreSQL 更简单）
- 需要"读己之写"强保证的结账/库存扣减链路

## 历史小故事（可跳过）

- **1989 年**：Ellis & Gibbs 提出 OT；Google Docs 一路走中央协调。离线友好性弱。
- **2007–2011 年**：Shapiro 等提出并整理 CRDT，但多为平坦类型。
- **2017 年**：Kleppmann（《DDIA》作者）与 Beresford 把 CRDT 推到嵌套 JSON，给算法与收敛论证（IEEE TPDS）。
- **2019 年至今**：Automerge / Yjs / Loro 工业化；Ink & Switch 的 local-first 宣言把文档 CRDT 推到产品层。

## 学到什么

1. **协调不一定靠中央服务器**——数据本身的代数性质也能收敛
2. **逻辑时钟是分布式标配**——CRDT 操作 ID 常建在 Lamport 思路上
3. **理论最优 ≠ 产品默认**：MV-Register 数学干净，LWW 更常进 UI
4. **嵌套组合才是难点**——单类型 CRDT 易，JSON 树收敛难

## 延伸阅读

- 论文 PDF：[Kleppmann & Beresford 2017](https://martin.kleppmann.com/papers/json-crdt.pdf)
- 视频：[CRDTs: The Hard Parts](https://www.youtube.com/watch?v=x7drE24geUw)
- 实现：[automerge/automerge](https://github.com/automerge/automerge)
- 性能对照：[5000x faster CRDTs](https://josephg.com/blog/crdts-go-brrr/)
- 产品哲学：[Local-First Software](https://www.inkandswitch.com/local-first/)
- 相关笔记：[[crdt-json-2017]]、[[crdt-shapiro-2011]]、[[yjs]]

## 关联

- [[crdt-json-2017]] —— 同文更偏证明与嵌套细节的笔记
- [[lamport-1978]] —— 逻辑时钟是操作 ID 的时间基础
- [[crdt-shapiro-2011]] —— 平坦 CRDT 综述，本文是嵌套扩展
- [[dynamo]] —— vector clock 工程先例
- [[raft]] —— 强一致对照面
- [[yjs]] —— 高性能文档 CRDT 工程实现
- [[ot-1989]] —— 中央协调路线的对照

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bernstein-1981-cc]] —— Bernstein 1981 并发控制综述 — 把分布式数据库的 20+ 算法整成两条主线
- [[crdt-json-2017]] —— CRDT JSON 2017 — 给嵌套 JSON 一套有数学证明的合并算法
- [[crdt-shapiro-2011]] —— CRDT — 让多副本各改各的，最终自动合一
- [[crdt-sss-2011]] —— CRDT 形式定义 — SSS 2011 八页浓缩版
- [[dynamo]] —— Dynamo — 让购物车永远能写入的分布式存储
- [[eswaran-1976]] —— Eswaran 1976 — 串行化与谓词锁的源头
- [[logoot-2010]] —— Logoot — 给每个字符发一张"永不过期的座位号"
- [[ot-1989]] —— OT — 多人同时改一份文档，操作随上下文自动改坐标
- [[affine]] —— AFFiNE — 文档和白板共用同一棵 block 树的开源知识库
- [[immer]] —— Immer — 用 Proxy 让你写"看起来可改"的代码却产出不可变状态
- [[yjs]] —— Yjs — 让任何编辑器都能接的协同编辑内核
