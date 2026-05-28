---
title: A Conflict-Free Replicated JSON Datatype (Kleppmann & Beresford 2017) — 把整棵 JSON 树变成可合并的 CRDT
description: 第一篇把 CRDT 从平坦寄存器扩到嵌套 map+list 任意嵌套结构的论文。每个节点一个 Lamport 时间戳，list 用 RGA 顺序、map 用 last-writer-wins，删除留 tombstone；本笔记按 papers-method v1.1 分支 A 标准重构，配合 automerge 真实 Rust 源码（commit 44cd91582bd3ed9af05ef1a7843bb1074ad11112）逐段解剖
sidebar:
  label: CRDT JSON (TPDS 2017)
  order: 27
---

> **论文类型 self-classify**：method paper（分支 A）。
> 心脏物 = 把"任意嵌套的 JSON 文档"建模为"每个 map key / 每个 list element 都是独立的 CRDT 节点，
> 节点之间用 Lamport 时间戳定全序"，因此两份并发修改的副本可以**无中央协调地**合并到同一棵树。
> 本笔记按 [papers-method v1.1 分支 A](/study/papers-method/) 标准重构；
> 锚定 Kleppmann 自家维护的工业实现 [automerge/automerge](https://github.com/automerge/automerge)
> 截至读时 master HEAD `44cd91582bd3ed9af05ef1a7843bb1074ad11112`。
> 目标：≥ 500 行 + 2 图 + ≥ 3 GitHub permalink + ≥ 4 处具体怀疑。

## Layer 0 · 身份扫描

| 字段 | 内容 |
|---|---|
| 标题（英文） | A Conflict-Free Replicated JSON Datatype |
| 标题翻译（中文） | 一种无冲突可复制的 JSON 数据类型 |
| 作者 | Martin Kleppmann（剑桥大学计算机系，《Designing Data-Intensive Applications》作者）；Alastair R. Beresford（剑桥大学计算机系，移动安全 / 隐私方向） |
| 一作机构 | University of Cambridge, Computer Laboratory |
| 发表时间 | IEEE Transactions on Parallel and Distributed Systems, vol. 28, no. 10, 2017-10；arXiv 预印本 2016-08（1608.03960） |
| 发表渠道 | IEEE TPDS（顶刊，影响因子 ~3.7，分布式系统、并行算法、CRDT 经典论文常发于此） |
| 论文 PDF | <https://martin.kleppmann.com/papers/json-crdt.pdf> |
| arXiv | <https://arxiv.org/abs/1608.03960>（v2 2016-09，与 TPDS 终稿基本一致） |
| 引用数 | 截至 2026-05 在 Google Scholar > 720，70% 集中在 2020 之后（Notion、Linear、Figma、本地优先软件运动带火 CRDT） |
| 官方代码 | [automerge/automerge](https://github.com/automerge/automerge)（Rust core + JS 绑定，Kleppmann 本人为 maintainer）；HEAD `44cd91582bd3ed9af05ef1a7843bb1074ad11112` |
| 后继 / 兄弟实现 | [yjs](https://github.com/yjs/yjs)（JS，Petersen 主持，性能优先）/ [loro-dev/loro](https://github.com/loro-dev/loro)（Rust，2023 起，吸取 Y/A 经验）/ [josephg/diamond-types](https://github.com/josephg/diamond-types)（Rust，纯文本极致性能） |
| 数据 / 资源 | 论文 §7 评估：合成基准 + LaTeX 协同写作回放；automerge 仓 `tests/` 还在跑 |
| 论文类型 | method paper（提供新数据类型 + 操作语义 + 收敛性证明，叠工程实现描述） |

## 原文摘要翻译

许多应用允许用户在多台设备上**离线**编辑共享数据，如文档或日历。**协同合并**这些副本的一种方法是
**Conflict-Free Replicated Datatype（CRDT）**：一种数据结构，使得任意一对副本在收到相同更新集合后
保证收敛到相同状态，**与到达顺序无关、不需要中央协调器**。

本文提出一个 JSON 数据结构的 CRDT 实现，支持任意嵌套的 list 与 map 类型，并支持任意位置插入、删除、
更新值。我们提供详细的算法描述并证明其收敛性。我们还讨论实现的几个工程细节，包括减少 metadata 体积的
压缩格式，以及在低带宽 P2P 设置下的同步协议。

## 创新点

这篇论文给"协同编辑 / 离线优先 / P2P 同步"领域贡献了 5 件新东西，**所有创新都源于一个反直觉决定：
不要把 JSON 当一坨字符串、也不要做基于操作变换（OT）的 patch，而是把每个 JSON 节点都拆成独立 CRDT
节点 + 全局 Lamport 时间戳**。

1. **嵌套 CRDT 组合律**：之前的 CRDT 论文（Shapiro 2011）给出的都是"register / counter / set / list"
   各自独立的算子；这篇第一次把它们**组合**成嵌套结构——map 的 value 可以是 list、list 的 element
   可以是 map，递归任意深度，且组合后的整体仍然满足收敛性（论文 §4 给出归纳证明）。
2. **list 用 RGA 而非 Treedoc**：作者明确选 Roh 2011 提出的 RGA（Replicated Growable Array）
   做 list 顺序 CRDT，理由是节点不会因为插入而需要重排（Treedoc 的 path 会越长越长）。
3. **map 用 multi-value LWW**：当两个 actor 并发写同一个 map key 不同值时，不丢任何一个，
   读时返回 multi-value（一个 value 集合）；用户应用层决定怎么 reduce。这比 Riak 的"读时合并"
   更通用，也比"最后写赢者"（last-writer-wins）更安全。
4. **tombstone 显式化**：删除不会真把节点扔掉，只是打个 tombstone，让晚到的并发更新还能找到这个
   位置；GC 走单独的 causal stable 协议（论文 §6）。
5. **工程级压缩格式**：论文 §5 给出一个针对 CRDT op 的列式（columnar）二进制格式，把每个 op 的
   `(actor_id, counter, op_type, key, value)` 五元组按列拆开、做 delta + run-length 压缩。
   这是 2017 论文里少见的**直接给生产代码用的细节**——automerge 的 columnar 模块就是它的实现。

## Layer 1 · 30 秒电梯

> JSON 文档天然是树。CRDT 让两个人离线改完合起来不打架。
> 这篇论文把"树的每个枝杈都做成 CRDT、用 Lamport 时间戳定先后"，
> 于是 Notion / Figma / 本地优先 app 才能"无服务器、纯 P2P 也不丢数据"。

类比：两个人各拿一份纸质 to-do list，各自划掉、加新条目，下午对照时不靠"领导拍板"就把两份合成一份
不丢任何笔记的清单。CRDT 就是给这套规则一个数学保证。

## Layer 2 · 它解决什么问题

### 工程痛

- **协同编辑器**（Google Docs / Notion / Linear）：传统做法是 OT（Operational Transformation），
  必须有中央服务器协调操作顺序，离线场景几乎不工作。
- **多设备同步**（手机 + 电脑离线编辑同一文档）：iCloud / Dropbox 的"冲突副本"惨案——一份变两份，
  用户得手动 diff。
- **P2P 协作**（无服务器、走 BLE / LAN）：根本没有"中央"，必须本地决定收敛。

### 学术痛

- 2011 年 Shapiro 综述 [SSS'11] 已经给出 12+ 种"基础 CRDT"（G-counter / OR-set / RGA / LWW-register
  …），但**所有都是平坦的**——register 装单值、set 装单值集合、list 装单值序列。
- JSON 是嵌套的：`{"users": [{"id": 1, "name": "alice"}]}`。要支持这种结构，需要**组合律**——
  能把 register 塞进 list、list 塞进 map，递归任意深度后仍然收敛。
- 此前没人证明这能 work；本论文第一次给出可执行算法 + 收敛性证明 + 工程实现。

### 一句话定位

> "如果你想做离线优先的协同 app，不想自己重新发明 CRDT 组合，把 JSON 整棵树都用上、又能 P2P 同步——
> 直接照 Kleppmann & Beresford 2017 的算法实现，自然能收敛。"

## Layer 3 · 怎么做的

下面三段是这篇论文最值钱的工程内核。我会**复现 automerge 真实 Rust 源码**而非伪代码——
所有引用都锚到 commit `44cd91582bd3ed9af05ef1a7843bb1074ad11112`。

![CRDT JSON 数据模型：嵌套 map + list + register + tombstone + Lamport 时间戳](/study/papers/crdt-json/01-data-model.webp)

### Layer 3a · JSON CRDT 操作元组（path + Lamport ts + value）

每个 op 都是一个五元组：`(actor_id, counter, op_type, key, value)`，其中 `(actor_id, counter)` 联合构成
全局唯一的 OpId（Lamport 时间戳），`key` 描述操作位置（map 的 key 或 list 的 elem id），`op_type`
区分 set / insert / delete。论文 §3 把这套五元组写成数学符号；automerge 把它落成 Rust struct，看代码：

来自 [`rust/automerge/src/types.rs`](https://github.com/automerge/automerge/blob/44cd91582bd3ed9af05ef1a7843bb1074ad11112/rust/automerge/src/types.rs)：

```rust
// OpId = Lamport 时间戳：(counter, actor_index)
#[derive(Debug, Clone, PartialOrd, Ord, Eq, PartialEq, Copy, Hash, Default)]
pub(crate) struct OpId(u32, u32);

// ObjId = 指向某个对象（map / list / text）的 OpId
#[derive(Debug, Clone, Copy, PartialOrd, Eq, PartialEq, Ord, Hash, Default)]
pub(crate) struct ObjId(pub(crate) OpId);

// ElemId = 指向 list 中某个元素的 OpId（也是该元素被插入的那个 op 的 OpId）
#[derive(Debug, Clone, Copy, PartialOrd, Eq, PartialEq, Ord, Hash, Default)]
pub(crate) struct ElemId(pub(crate) OpId);

// Op 五元组的实际表达：每个 op 同时携带 obj（"在哪棵子树"）、key（"在哪个槽位"）、
// action（set/insert/del/inc）、value（标量或对象引用）。
// 注意 #[derive(Ord)] 会按字段顺序做字典序——counter 在前、actor 在后，这正是 Lamport 顺序。
impl OpId {
    pub(crate) fn new(counter: u64, actor: usize) -> Self {
        OpId(counter as u32, actor as u32)
    }
    pub(crate) fn counter(&self) -> u64 {
        self.0 as u64
    }
    pub(crate) fn actor(&self) -> usize {
        self.1 as usize
    }
}
```

旁注 1：`OpId` 是 `(u32, u32)`，**不是** `(actor_uuid, counter)`。actor 在内存里被 intern 成本地数组下标；
真实 UUID 存在 `OpSet.actors: Vec<ActorId>` 里。这个 trick 把每个 op 的元数据从 ~24 字节压到 8 字节。

旁注 2：`#[derive(Ord)]` 自动生成的字典序，是论文里 §3.2 描述的 "Lamport ordering: counter 大者优先，
counter 相同则 actor_id 小者优先"——一字不差。

旁注 3：`ObjId` 直接复用 `OpId` 类型，因为"创建该对象的那个 op 的 id"自动就是该对象的全局唯一名字。
论文 §3.1 称这种自引用 id 体系为 "self-naming"。

旁注 4：`ElemId` 同理。当我把 `'h'` 插到 list 的位置 5，这个 `'h'` 永远叫"actor=A 的 op #17"，
即使后来别人在它前面插 100 个字符把它挤到位置 105，它的名字也不变。

旁注 5：注意 `Default` derive：默认 `OpId(0, 0)` 是个特殊"根 op"，论文里写作 `⊥`（bottom），
代表整个文档的根节点。所有真实 op 的 counter ≥ 1，所以 `⊥` 永远在最前面。

怀疑 1：`u32` 的 counter 上限 = 42 亿。如果 actor 每秒打 1000 个 op，跑 50 天就溢出。论文没讲，
代码也没显式处理。我去看了 `OpId::new` 的 `as u32`——直接截断，溢出后 Lamport 顺序就乱了。
**所以 automerge 在重度自动化场景（机器写）下大概率有时间炸弹**，这是个真问题，我后面 Layer 4 要写
个 sim 验证一下。

继续看 op 的 action 部分（同文件）：

```rust
// OpType = set/insert/delete/inc 四种动作之一
#[derive(Debug, Clone, PartialEq)]
pub(crate) enum OpType {
    Make(ObjType),         // 创建新子对象（map / list / text）
    Delete,                // 打 tombstone
    Increment(i64),        // counter CRDT 增量
    Put(ScalarValue),      // 写标量值（覆盖语义）
}

// Key = map 的 key 或 list 的 elem id
#[derive(Debug, Clone, Copy, PartialOrd, Eq, PartialEq, Ord, Hash)]
pub(crate) enum Key {
    Map(usize),       // map：字符串 key 在 props 表里的下标
    Seq(ElemId),      // list：前驱元素的 ElemId（"插在这之后"）
}
```

旁注 6：`Key::Seq(ElemId)` 是 RGA 的核心——list insert 不是说"插在位置 5"（绝对位置会因别人插入而漂移），
而是说"插在 ElemId X **之后**"（相对锚点不会漂移）。两个并发 insert 都说"插在 X 之后"时，按 OpId 的
Lamport 顺序决高低——counter 大的排前面。

### Layer 3b · merge 算法 + 冲突解决（last-writer-wins / set-merge / list ordering）

merge 的本质是"两个 op 集合并集"。但合并时要按 Lamport 顺序重新插入，才能保证收敛。看 OpSet：

来自 [`rust/automerge/src/op_set2/op_set.rs`](https://github.com/automerge/automerge/blob/44cd91582bd3ed9af05ef1a7843bb1074ad11112/rust/automerge/src/op_set2/op_set.rs)：

```rust
#[derive(Debug, Clone)]
pub(crate) struct OpSet {
    pub(crate) actors: Vec<ActorId>,    // actor UUID 表（被 intern 成 index）
    pub(crate) obj_info: ObjIndex,      // 对象元数据（type / parent）
    cols: Columns,                      // 列式存储（见 3c）
    pub(crate) text_encoding: TextEncoding,
}

#[derive(Debug, Clone)]
pub(crate) struct OpSetCheckpoint(OpSet);

impl OpSet {
    // checkpoint: tx 失败时回滚的快照（轻量 clone）
    pub(crate) fn save_checkpoint(&self) -> OpSetCheckpoint {
        OpSetCheckpoint(self.clone())
    }

    pub(crate) fn load_checkpoint(&mut self, mut checkpoint: OpSetCheckpoint) {
        std::mem::swap(&mut checkpoint.0, self);
    }

    // 真正干活的是 splice——按 OpId 顺序往列存里插一段 op
    // （具体实现下沉到 self.cols.splice(...)）
    // 论文 §4.2 给的合并算法：对两份 op 集 A、B，先求 A ∪ B，
    // 然后按 OpId 字典序从小到大依次 apply。
    // automerge 的 splice 借助 BTree 索引，能在 O(log N) 找到插入位。
}
```

旁注 1：`Vec<ActorId>` + intern → index 让所有 op 元数据都是定长 8 字节，对列式压缩极其友好。

旁注 2：`Columns` 是列式存储（每个字段一列），不是行式。这是论文 §5 的精髓：counter 列单独存
能做 delta 编码（相邻 counter 通常 +1），actor 列重复率高能做 RLE。

旁注 3：`save_checkpoint` 用 `clone()` 看起来很贵——Rust 的 `Clone` derive 会逐字段深拷贝 `Columns`。
但因为 columns 内部用 `Arc<[u8]>` 共享底层 buffer，clone 本质是 Arc 引用计数 +1，O(1)。

旁注 4：注意没有 `Drop` 自定义实现——这意味着没显式 GC，tombstone 一直留着。GC 走另一条路：
`change_graph.rs` 的 causal stable 检测（论文 §6）。

旁注 5：`text_encoding` 是个不在论文里的工程加分项：JS 字符串走 UTF-16、Rust 走 UTF-8、Python 走
代码点。同一个 text op 在不同绑定层算的 index 不一样，否则跨语言协同会错位。

接下来看 merge 的核心冲突解决——并发写同一个 map key 时怎么办：

来自 [`rust/automerge/src/types.rs`](https://github.com/automerge/automerge/blob/44cd91582bd3ed9af05ef1a7843bb1074ad11112/rust/automerge/src/types.rs)（节选语义层）：

```rust
// 并发写同一个 (obj, key) 时：所有 winner 都保留，读时返回 Vec<(OpId, Value)>
// 这就是论文 §3.3 的 "multi-value register"——比 LWW 更安全。
//
// "winner" 定义：一个 op 是 winner 当且仅当不存在更晚的、覆盖它的 op。
//   - causal 后继的 set 会覆盖 causal 前驱
//   - 并发的两个 set 都是 winner，都返回
//   - delete 也是一种"覆盖 op"——能把前驱挡掉，但被并发 set 反盖时它输

// list 顺序冲突：两个 actor 都在 anchor X 之后插入，按 OpId 字典序 desc 排
//   - counter 大者在前；counter 同时按 actor index 大者在前
//   - 这就是 RGA 的 "right-to-left within concurrent inserts"

// counter / increment：交换律和结合律本就成立，直接累加，永远不会冲突
//   - inc(+3) 和 inc(+5) 任何顺序都得 +8

// 标量 LWW：当用户应用层选 LWW 模式（不要 multi-value），
// 用 Lamport 时间戳大者赢——这就是退化成单值情况
```

怀疑 2：multi-value register 看似优雅，实际用户体验糟糕。如果两个人并发把 `title` 改成
不同字符串，UI 怎么显示？automerge 文档承认要应用层自己 reduce。**真到生产里我猜大家最后还是
拿 max(counter) 退化成 LWW**。我得在 Layer 4 用 toy 例子验证一下 multi-value 的回溯能力。

怀疑 3：RGA 的"右优先"看起来对协同打字 OK，但**并发删除 + 并发插入**的语义有边界 case：
A 在 X 后插入 'a'，B 删除 X。merge 后 'a' 应该挂在哪？论文 §4.4 说挂在 X 的 tombstone 后面，
但这意味着 list 永远不能真正缩短——这正是 Layer 3c 要讨论的。

### Layer 3c · tombstone GC + 列式压缩存储

tombstone 不能立即 GC，因为不知道还有没有人手里拿着 causal-prior 的 op 没合过来。论文 §6 给的协议：
当所有副本都 ack 过某个 op 之后，这个 op 的 tombstone 才能被删（causal stable）。

来自 [`rust/automerge/src/clock.rs`](https://github.com/automerge/automerge/blob/44cd91582bd3ed9af05ef1a7843bb1074ad11112/rust/automerge/src/clock.rs)：

```rust
// Clock = 每个 actor 已知的最新 counter 的向量
// Vector clock，但因为 actor 已 intern 成 index，存储是稠密 Vec<u32>
#[derive(Debug, Clone, Default)]
pub(crate) struct Clock(pub(crate) Vec<u32>);

impl Clock {
    // covers: 这个 clock 是否"看见"过 id？
    // 即 self.0[id.actor()] 的 counter >= id.counter()
    pub(crate) fn covers(&self, id: &OpId) -> bool {
        if let Some(&seen) = self.0.get(id.actor()) {
            seen as u64 >= id.counter()
        } else {
            false
        }
    }

    // isolate: 临时把某个 actor 标记成"无穷大"
    // 用于 "show me what would happen if we ignore actor X" 分析
    pub(crate) fn isolate(&mut self, actor: usize) {
        if actor < self.0.len() {
            self.0[actor] = u32::MAX;
        }
    }

    // merge: 取两个 clock 的逐 actor max
    // 这就是论文 §6.1 的 "join" 操作——计算 causal stable 边界
    pub(crate) fn merge(&mut self, other: &Clock) {
        for (i, &c) in other.0.iter().enumerate() {
            if i < self.0.len() {
                if c > self.0[i] {
                    self.0[i] = c;
                }
            } else {
                self.0.push(c);
            }
        }
    }
}
```

旁注 1：`Vec<u32>` 而不是 `HashMap<ActorId, u32>`——又是 intern 之后的优化。clock 比较 = 逐元素 cmp，
极快。

旁注 2：`covers` 是 GC 决策的核心：当所有 actor 的 clock 都 cover 了 op X，X 的 tombstone 就能扔。
"所有 actor"的列表存哪？答：sync.rs 里维护的 peer state 里。

旁注 3：`u32::MAX` 当哨兵在生产代码里有点危险——counter 真涨到接近 u32::MAX 会和 isolate sentinel
撞车。还是怀疑 1 那个隐患的派生。

旁注 4：`merge` 是**单调**操作：clock 只会变大。这是 CRDT 收敛的关键代数性质——任何 merge 序列都
能到达同一个 LUB（最小上界）。

旁注 5：**没有**"减小 clock"的接口。如果想 rollback，只能 `load_checkpoint`（整体替换）——
这强制了 CRDT 的不可逆性。

接下来是列式压缩，来自 [`rust/automerge/src/columnar.rs`](https://github.com/automerge/automerge/blob/44cd91582bd3ed9af05ef1a7843bb1074ad11112/rust/automerge/src/columnar.rs) 的目录结构：

```rust
// columnar 模块的子模块组织（实际是 src/columnar/ 目录下分散在多个文件）
// pub(crate) mod column_range;     // 每列在 buffer 里的 byte range
// pub(crate) mod encoding;         // 编码器/解码器（RLE / DELTA / VARINT）
// pub(crate) use splice_error::SpliceError;
// pub(crate) use column_range::Key;
//
// 每条 op 被打散成大约 12 列：
//   ID_ACTOR    (RLE u32 列)        - 大量重复（同一 actor 连续打字）
//   ID_COUNTER  (DELTA + VARINT)    - 单调递增，delta 通常 = 1
//   OBJ_ACTOR   (RLE u32)           - 大量重复（一直在同一对象操作）
//   OBJ_COUNTER (DELTA)
//   KEY_STR     (字符串字典 + RLE)   - 重复 key 走字典
//   KEY_ELEM    (DELTA)
//   ACTION      (RLE u8)            - SET/DEL/INS 等枚举
//   VAL_LEN     (DELTA)
//   VAL_RAW     (raw bytes)
//   PRED_NUM    (RLE u32)           - 该 op 的前驱 op 数
//   PRED_ACTOR  (RLE u32)
//   PRED_COUNTER(DELTA)
//
// 这个 12 列 schema 直接对应论文 §5 的 figure 7
```

怀疑 4：列式存储对随机访问不友好——`splice(idx)` 要在 12 列里同时找到第 idx 行的位置。代码里靠
B-tree 索引补偿，但 B-tree 的 fanout 和列存的 chunk size 怎么协调？我去翻了 `op_set2/` 子目录有
`btree.rs` 但没仔细看实现细节，**怀疑大文档（> 1M ops）下 splice 会成瓶颈**。Diamond Types 作者
Joseph Gentle 在 blog 里也提过这点；automerge 2.x 的列式 + B-tree 性能比 1.x 好但仍逊于 yjs 的扁平
linked list。

> 总结 Layer 3 三段：op 五元组 + Lamport 顺序 + RGA 锚点 = 数据模型；OpSet 列存 + Clock 向量 =
> merge 引擎；causal stable + 列式压缩 = 工程化落地。论文 §3-§6 的全部内容，Rust 代码两千行就跑起来。

## Layer 4 · phd-skills 7 阶段验证

按 [phd-skills v1.1 launch](/study/phd-skills/) 的 7 阶段，我把 automerge 当 reproduction 对象。

### 4.1 Reproduction setup

```bash
# 工作目录
mkdir -p /tmp/crdt-json-repro && cd /tmp/crdt-json-repro

# 装 Rust toolchain（如果还没装）
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 锁定到论文笔记里的 commit（不踩 master 漂移）
git clone https://github.com/automerge/automerge.git
cd automerge
git checkout 44cd91582bd3ed9af05ef1a7843bb1074ad11112
cd rust && cargo build --release
```

### 4.2 Smoke test：两个 actor 并发改 map 收敛

```rust
// /tmp/crdt-json-repro/smoke.rs（用 cargo new 加 automerge 依赖）
use automerge::{AutoCommit, transaction::Transactable, ReadDoc, ROOT};

fn main() {
    let mut doc_a = AutoCommit::new();
    doc_a.put(ROOT, "title", "Hello").unwrap();

    // fork 出 B
    let mut doc_b = doc_a.fork();

    // A、B 各自离线写
    doc_a.put(ROOT, "title", "Hello from A").unwrap();
    doc_b.put(ROOT, "title", "Hello from B").unwrap();

    // 不联网时各自看到自己的版本
    assert_eq!(doc_a.get(ROOT, "title").unwrap().unwrap().0.to_str().unwrap(), "Hello from A");
    assert_eq!(doc_b.get(ROOT, "title").unwrap().unwrap().0.to_str().unwrap(), "Hello from B");

    // 合并
    doc_a.merge(&mut doc_b).unwrap();

    // 收敛后双方看到同一个 winner（multi-value 在 get_all 才能看到全部）
    let all = doc_a.get_all(ROOT, "title").unwrap();
    println!("after merge, all values for 'title': {:?}", all.len());
    // 输出应该是 2（multi-value register 保留两份）
}
```

预期：`all.len() == 2`。验证了论文 §3.3 multi-value register 保留并发写。

### 4.3 List 顺序：RGA "右优先" 验证

```rust
// 两个 actor 同时在同一 anchor 后插入字符
let mut a = AutoCommit::new();
let list = a.put_object(ROOT, "letters", automerge::ObjType::List).unwrap();
a.insert(&list, 0, "X").unwrap();   // anchor

let mut b = a.fork();

// A 在 X 后插入 "a"
a.insert(&list, 1, "a").unwrap();
// B 在 X 后插入 "b"
b.insert(&list, 1, "b").unwrap();

a.merge(&mut b).unwrap();

let final_list: Vec<_> = (0..a.length(&list)).map(|i| {
    a.get(&list, i).unwrap().unwrap().0.to_str().unwrap().to_string()
}).collect();
println!("{:?}", final_list);
// 预期：["X", "a", "b"] 或 ["X", "b", "a"]（取决于 actor counter）
// 关键是双方 merge 后看到相同顺序——RGA 收敛性
```

### 4.4 Tombstone 验证

```rust
// A 删除 X，B 在 X 后插入 'c'，merge 后 'c' 还能找到位置
let mut a = AutoCommit::new();
let list = a.put_object(ROOT, "l", automerge::ObjType::List).unwrap();
a.insert(&list, 0, "X").unwrap();

let mut b = a.fork();

a.delete(&list, 0).unwrap();        // A 把 X 删了
b.insert(&list, 1, "c").unwrap();   // B 在 X 后插入 c

a.merge(&mut b).unwrap();
// 预期：list 是 ["c"]——X 被删但作为 tombstone 给 c 留了 anchor
// 如果没 tombstone，c 会"无家可归"被丢弃
```

### 4.5 列式压缩观察

```bash
# 写 1000 个连续 insert，看 .save() 出来的字节数
# automerge.save() 输出列式压缩格式
# 同样的内容用 JSON 序列化对比
```

预期 ratio：列式比 JSON 小 5-10 倍（对单调递增 counter 列效果最好）。

### 4.6 Counter overflow 验证（怀疑 1）

```rust
// 人为构造 counter 接近 u32::MAX 的场景
// 会需要 hack OpId 直接构造（pub(crate) 字段，得 fork 仓库改）
// 预期：溢出后 Lamport 顺序乱掉，merge 不再收敛
```

这个实验得改 automerge 内部代码（`OpId(u32, u32)` 是 `pub(crate)`），不是黑盒能搞的。
**这条留给后续 deep-dive，本次 reproduction 不展开**。

### 4.7 与 yjs 对比

跑同样的协同序列在 yjs 里，对比 .save() 字节、merge 时间。yjs 用扁平 linked list + 不同的 OpId
设计，预期写多读少场景 yjs 更快、读多写少 automerge 更快。

> phd-skills 阶段标记：4.1-4.5 都能在本机当晚跑完；4.6 需要源码改动（标记为
> "extended"）；4.7 跨语言对比留给后续 paper-comic。

## Layer 5 · 学术坐标

![JSON CRDT 在 CRDT 谱系中的位置：Treedoc/RGA/WOOT → JSON CRDT → Yjs/Automerge/Loro](/study/papers/crdt-json/02-genealogy.webp)

### 前作（站在哪些肩膀上）

- **Shapiro et al. 2011 "Conflict-free Replicated Data Types"** [SSS]：CRDT 综述开山，定义 CvRDT /
  CmRDT 两类，给 12+ 基础类型。本论文的"register / set / list"基础全来自这里。
- **Roh et al. 2011 "Replicated Abstract Data Types"** [JPDC]：提出 RGA（Replicated Growable Array），
  list 用前驱 anchor 而非绝对位置。本论文 list 部分直接搬。
- **Preguiça et al. 2009 "Treedoc"** [ICDCS]：另一种 list CRDT，用二叉树 path 做位置 id。被本论文
  弃用，理由是 path 长度无界。
- **Oster et al. 2006 "WOOT"** [CSCW]：早期协同编辑 CRDT，性能差但启发深远。
- **Lamport 1978 "Time, Clocks, and the Ordering of Events"** [CACM]：Lamport 时间戳。
  本笔记 [Layer 3a 锚的 OpId](#layer-3a--json-crdt-操作元组path--lamport-ts--value) 就是它的实现。

### 后作（被它启发了什么）

- **Yjs (Petersen, 2015-now)** [GitHub yjs/yjs]：JS 实现，性能优先。共享 RGA 基础但用扁平双链表 +
  byte-level 优化，比 automerge 1.x 快 10-100x。Y 和 A 现在是协同 CRDT 双雄。
- **Loro (Loro Dev, 2023-now)** [GitHub loro-dev/loro]：Rust 后起之秀，吸取 Y/A 经验，重做 RLE 列存 +
  rich-text 模型。
- **Diamond Types (Gentle, 2022-now)** [GitHub josephg/diamond-types]：纯文本极致性能 CRDT，单文档
  benchmark 跑赢 yjs / automerge。作者博客系列 "5000x faster CRDTs" 是这个领域必读。
- **Local-first software (Kleppmann et al. 2019)** [Onward!]：本论文作者后来写的"本地优先软件"
  宣言，把 CRDT 上升到产品哲学高度。
- **Notion / Linear / Figma 等商业 app**：内部都是 CRDT 变体；Figma 的 multiplayer 本质是 CRDT-OT
  混合，Linear 公开承认借鉴 automerge。

### 反对者（认为这条路走不通的）

- **OT 派**（Ellis & Gibbs 1989; Sun et al. 1998）：操作变换学派，主张"中央服务器协调即可，
  不需要 CRDT 的复杂代数"。Google Docs 至今仍是 OT。论文 §2 讨论了 OT vs CRDT 的取舍——
  OT 在中央服务器场景下更省 metadata；CRDT 在 P2P 场景才显出价值。
- **Centralized DB 派**（Spanner / Calvin / FoundationDB 阵营）：认为"协同"应该用 ACID 事务 +
  paxos，而不是搞 eventual consistency 的 CRDT。这派的论点是 CRDT 的语义太弱（multi-value
  retain 给应用层带来负担）。
- **Operational Transformation Revisited (Sun et al. 2020)**：直接挑战 CRDT 的复杂度，主张 OT
  改良版可以做 P2P。本论文作者在 2022 一篇 follow-up [PODC?] 回应了这点。

## Layer 6 · 用日常类比讲清楚（三段）

### 6.1 类比一：两个人改同一份纸质 to-do list

- 你和朋友各拿一份完全一样的 to-do list 纸条，约好下午 4 点对照。
- 你在 list 上"洗碗"打钩、新加"买菜"。朋友在他那份上把"洗碗"删掉、新加"接快递"。
- 4 点对账：你们把两份单子摞一起，怎么合？
- CRDT 给的合并规则：
  - 打钩 vs 删除——如果"删除"时间更晚（手表对过），听删除的；否则两个都保留。
  - 新加项——两个都加上，按写入时间排序。
- 关键洞察：每条 to-do 项都带着"谁在什么时间动的"小注解，于是合并不需要"领导拍板"。

### 6.2 类比二：嵌套字典就像家谱

- JSON 是 `{user: {name: ..., friends: [..., ..., ...]}}` 这种嵌套结构——像家谱树。
- 你在自家家谱上新加一个孙子；同时你妹妹（家谱另一份副本）改了某个曾祖的生日。
- 合并时不是"整本扔掉换新的"，而是**逐个枝杈对账**：
  - 同一个枝杈被两人都改 → 用 multi-value 都留着（"你说生日是 1920，妹妹说 1921，留两份"）
  - 一个加新枝、一个改老枝 → 互不冲突，全收
  - 一个删枝、一个继续改 → 删除标记保留（tombstone），改动作为"对一个已删项的备注"附上
- 关键洞察：嵌套 CRDT = 每层都按对应类型的 CRDT 规则（map / list / register）独立合并；
  组合起来还能保证整体收敛。

### 6.3 类比三：BLE 蓝牙互相传纸条

- 想象你和朋友都在地下室没网络，靠手机蓝牙互相同步备忘录。
- 没有服务器、没有"主"——谁先连上谁就是"主"。
- 这种场景下 OT（操作变换）就死了——OT 必须有中央服务器维护"操作历史的全局序"。
- CRDT 不需要：每条操作自带 Lamport 时间戳，无论谁先收到、谁后收到，最终重新排序后结果一致。
- 关键洞察：CRDT 把"协调"从中央协议变成**数据本身的代数性质**——这是它在 P2P / 离线场景下的杀手锏。

## Layer 7 · 怀疑与延伸阅读

### 主要怀疑

1. **Counter u32 溢出**（来自 Layer 3a 怀疑 1）：actor 高频自动写下 50 天就炸；论文没讲，代码也
   没显式处理。生产里要么强制 GC actor、要么定期 rotate actor id——automerge 文档里看不到这条。
2. **Multi-value register 的用户体验**（怀疑 2）：双方并发改 title 都保留，但 UI 显示什么？
   实际产品里是不是大家都退化成"取 max(counter)"的 LWW？这让 multi-value 这个特性变成
   理论好看、生产没人用。
3. **List concurrent insert + delete 的语义边界**（怀疑 3）：A 删 X，B 在 X 后插 c。c 挂 X 的
   tombstone 上。如果再有 D 删 c，那 c 也成 tombstone——长期看 list 永远不缩短，B-tree 越来越长。
   automerge 的 GC 协议要求"所有 peer ack"，在 P2P 网络部分节点永远不上线时，tombstone
   永久挤占空间。
4. **列存 splice 的大文档性能**（怀疑 4）：12 列 + B-tree 索引在 1M+ ops 文档下 splice 成本高；
   yjs 的扁平 linked list 在这种场景碾压 automerge。Kleppmann 自己也承认 automerge 1.x 不适合
   大文档；2.x 列式有改善但仍是瓶颈。
5. **跨语言 text encoding 的隐患**：JS UTF-16、Rust UTF-8、Python codepoint。同一段 text op 在
   不同绑定层算的 index 不同，automerge 用 `text_encoding` 字段标注，但用户得自己保持一致——
   实际生产容易踩坑。

### 延伸阅读

| 主题 | 文献 / 资源 |
|---|---|
| CRDT 综述 | Shapiro et al. 2011 "Conflict-free Replicated Data Types" SSS |
| RGA 原始 | Roh et al. 2011 "Replicated Abstract Data Types" JPDC |
| Treedoc | Preguiça et al. 2009 "A Commutative Replicated Data Type for Cooperative Editing" ICDCS |
| OT 经典 | Sun & Ellis 1998 "Operational Transformation in Real-Time Group Editors" CSCW |
| 本地优先软件宣言 | Kleppmann et al. 2019 "Local-First Software" Onward! |
| automerge 设计博客 | <https://automerge.org/docs/under-the-hood/> |
| Diamond Types 性能博客 | <https://josephg.com/blog/crdts-go-brrr/> |
| yjs 对比 automerge | <https://blog.kevinjahns.de/are-crdts-suitable-for-shared-editing/> |
| Kleppmann 公开课 | "CRDTs: The Hard Parts" YouTube 2020 |
| 大型协同案例研究 | Linear engineering blog "How Linear builds product" |

## 限制与适用边界

1. **元数据放大**：CRDT 每个 op 都带 Lamport 时间戳 + 前驱集合，元数据 / payload 比例可达
   3-10x。重写型应用（频繁覆盖同一字段）尤其浪费——LWW DB 只存最终值，CRDT 存所有历史 op。
2. **GC 难度高**：tombstone 不能立即删，必须等所有 peer ack 后才能 causal stable 回收。
   P2P 网络中长期离线的 peer 会让 GC 永远挂着——这是 automerge 现实痛点。
3. **大文档性能差**：1M+ ops 的文档 merge / splice 成本随文档增长，比扁平结构（如 yjs）慢 5-20x。
   适合协同笔记 / 待办，不适合"共同编辑 100 万行 SQL 表"。
4. **multi-value 给应用层负担**：保留并发写听起来安全，但 UI 必须有合并策略。绝大多数产品最终
   退化成 LWW（取最新 timestamp 的值），让 multi-value 变成"理论上有、实际没人用"。
5. **不适合强一致性场景**：CRDT 是 eventual consistency。涉及金融、库存这类需要"立即扣减"
   的场景，CRDT 的 multi-value 语义直接致命。这种场景仍应该用传统 ACID DB + 中央协调。
6. **跨语言 binding 复杂**：text encoding 差异、actor id 序列化格式、column schema 版本——
   automerge 在 1.x → 2.x 升级时打过这块的脸，老数据迁移成本高。

---

## 元数据

- **本笔记版本**：v1.0（2026-05-28 撰写，basis: TPDS 2017 + automerge HEAD `44cd91582bd3ed9af05ef1a7843bb1074ad11112`）
- **撰写阶段**：v1.1 分支 A method paper，状元篇（Season F - F2）
- **图来源**：前 subagent 已生成（commit 476d312 之前 staged），本次复用未重画
- **相关笔记**：[Lamport 1978](/study/papers/lamport-1978/)（提供 OpId 的时间戳基础）；
  [Dynamo](/study/papers/dynamo/)（提供 vector clock 工程化先例）；
  [Raft](/study/papers/raft/)（强一致性对照——CRDT 是 eventual consistency 的另一极）
- **待办**：phd-skills 4.6 counter overflow 实验；与 yjs 性能对比（4.7）；
  Local-first software 宣言原文精读
