---
title: E-Path — 控制流图上的等价饱和
来源: https://arxiv.org/abs/2605.28694
日期: 2026-06-13
分类: 编程语言
子分类: 类型与 PL 理论
provenance: pipeline-v3
---

## 从日常类比开始：装修队 vs 平行宇宙样板间

想象你要装修一套老房子（**编译器要优化一段带循环的程序**）。

**传统 CFG 优化器**像一支**边干边砸墙的装修队**：先把客厅墙敲掉做开放式厨房（LICM 把常量提到循环外），原来的布局图纸就扔了；下一步想做「把两间小卧室合并」时，已经看不到「没敲墙之前」长什么样。而且**施工顺序**极其重要——先刷漆再铺地板，和先铺地板再刷漆，最后效果可能天差地别。这就是编译器里臭名昭著的 **phase-ordering problem（阶段排序问题）**。

**等价饱和（Equality Saturation）** 像**同时保留多套平行宇宙样板间**：原版、提常量版、融合分支版……都挂在同一张「等价关系网」上，最后按预算（成本模型）挑一套最划算的，而不是施工中途把别的方案销毁。

过去这类技术（**E-Graph / egg**）擅长在**表达式树**上做代数化简——相当于只装修**家具摆放**，对**户型结构（控制流）** 往往要先强行改成树状或结构化 IR，才能下手。

**E-Path**（Guillermo Garcia，2026 年 5 月，[arXiv:2605.28694](https://arxiv.org/abs/2605.28694)）提出：能不能**直接在 CFG 上**做等价饱和，把**基本块指令序列**当作等价单元，而不是单个表达式？论文在 Rust 编译器后端 **Crabstar** 上做了原型，IR 是受限的 **ANF（A-Normal Form）CFG**——每个基本块「一条指令 + 一个控制流终结符」，但作者强调模型本身可推广到其他 IR。

一句话：**E-Path = 在控制流图上做「只增不改」的等价饱和，用 E-Sequence 存多套等价 CFG 片段，最后用符号成本挑赢家。**

---

## 是什么

| 项目 | 内容 |
|------|------|
| 论文 | E-Path: Equality Saturation for Control-Flow Graphs |
| 作者 | Guillermo Garcia |
| 原型 | Crabstar 编译器后端（Rust） |
| 核心数据结构 | **E-Path** — 单调增长的等价 E-Sequence 集合 |
| 基本单元 | **E-Sequence** — 从 CFG 导出的基本块线性序列（可编码循环、分支等区域） |
| 与 E-Graph 的区别 | 等价类挂在**指令序列**上，而非表达式 e-class |

---

## 为什么重要

### 1. 阶段排序是真实痛点

LLVM、GCC 的 pass 流水线是**启发式排期**：LICM 在 GVN 前还是后？不同顺序可能得到不同机器码。E-Path 把「探索多种 CFG 组织」变成**在同一搜索空间里并行保留**，提取阶段再全局比较。

### 2. 经典优化可以写成「单调重写」

论文以 **LICM（循环不变量外提）** 为例：传统实现**原地改写** CFG；E-Path 则**新增**一条等价 E-Sequence，原版仍留在集合 \(P\) 里。形式化地：

\[
P_1 \in P \quad \text{其中 } P_1 \text{ 由 } P_0 \text{ 经 LICM 得到}
\]

\(P_0\) 与 \(P_1\) **同时有效**，提取器稍后决定用谁。

### 3. 补上了「CFG 原生」等价饱和的空白

| 路线 | 做法 | 局限 |
|------|------|------|
| **egg / E-Graph** | 表达式级 e-class + rewrite | 任意 CFG 常需先规范化 |
| **RVSDG** | 嵌套区域 + 显式依赖 | 仍要把任意控制流规范化 |
| **传统 SSA 编译器** | 直接改 CFG | 破坏性、顺序敏感 |
| **E-Path** | 在 CFG 嵌入的指令序列上饱和 | 原型仅支持可约循环等（见局限） |

---

## 核心概念

### 1. 控制流图（CFG）

\(G = (V, E)\)：\(V\) 为基本块集合，\(E\) 为有向控制边。在 Crabstar 受限 IR 中，每个块 \(b \in V\) 含**单条指令** + **参数化终结符**（分支、回边等）。

### 2. E-Sequence（等价序列）

\[
S = [b_1, b_2, \ldots, b_n], \quad b_i \in V
\]

表面是**线性基本块列表**，但通过终结符语义可表示**更高层控制结构**（条件分支引用后继区域、合并块界定序列边界），不必把每个分支局部块都枚举进序列。

**日常类比**：E-Sequence 像「户型说明书里的功能分区清单」——列的是客厅、主卧、厨房顺序，但说明书里用脚注标出「此处可开推拉门连阳台」，不必把每种门洞展开成独立房间。

### 3. E-Path（单调等价集）

\[
P = \{S_1, S_2, \ldots, S_n\}
\]

重写规则 \(r\) 产生新序列：

\[
S_i \xrightarrow{r} S_j \Rightarrow S_j \text{ 插入 } P
\]

**关键不变量：单调性**——已有序列**永不修改**，只**追加**。语义等价**不由 E-Path 内部证明**，而依赖**外部已验证的重写规则**（与 egg 相同哲学：正确性在规则，不在数据结构）。

### 4. LICM 作为重写规则

对含循环的 E-Sequence，流水线三步：

1. **环检测** — 在序列上识别对应 CFG 循环的区域  
2. **不变量判定** — 块的操作数与副作用是否依赖环内被修改的值  
3. **序列重构** — 构造新序列：不变块放到 **preheader**，环内只留变块  

非正式规则：

\[
\text{loop}(I,\, B_{\text{inv}} \cup B_{\text{var}})
\;\rightarrow\;
B_{\text{inv}};\, \text{loop}(I,\, B_{\text{var}})
\]

**不替换**原序列，只**加入**结构不同的等价序列。

### 5. 符号成本提取（Extraction）

多候选并存时，用**符号成本**选最优：

- 循环成本：\(C = N \cdot M\)（\(N\) 为符号迭代次数，\(M\) 为循环体代价）  
- 序列总成本：块代价求和 + 循环区域缩放  

\[
S^* = \arg\min_{S \in P} C(S)
\]

### 6. 两种模式匹配

| 模式 | 作用 |
|------|------|
| **表达式级** | ANF 使数据依赖显式，可像 E-Graph 一样匹配计算子图 |
| **控制流级** | 在 CFG 拓扑上匹配：无环指令序列、**可约**循环区域 |

### 7. 工程权衡：增长与去重

单调性意味着 E-Sequence 数量可能**无界增长**。实现用 **hash consing + 结构哈希去重**；饱和定义为**不动点**——不再有新序列产生。

---

## 代码示例 1：论文中的 LICM 运行例子

下面用接近论文 IR 的伪代码展示**传统破坏性 LICM** vs **E-Path 保留双版本**。

**优化前** — 循环头每次迭代都执行 `iconst 42`（与归纳变量 `i` 无关）：

```text
loop_header(i):
    c      = iconst 42      ; 循环不变
    one    = iconst 1
    next_i = add i, one
    loop_back(next_i)
```

**经典编译器 LICM 之后** — 原 CFG **被覆盖**，再也拿不到「未外提」版本：

```text
preheader:
    c = iconst 42

loop_header(i):
    one    = iconst 1
    next_i = add i, one
    loop_back(next_i)
```

**E-Path 视角** — 集合 \(P\) 同时包含两条 E-Sequence：

```text
; S0 — 原始序列（仍保留）
S0 = [ loop_header: iconst42 → iconst1 → add → loop_back ]

; S1 — LICM 重写新增（不删除 S0）
S1 = [ preheader: iconst42 ,
       loop_header: iconst1 → add → loop_back ]
```

提取器若发现外层循环迭代次数 \(N\) 很大，会倾向 \(S_1\)（每迭代少一条 `iconst`）；若 \(N\) 符号未知但 preheader 插入有额外开销，也可能保留 \(S_0\)。**决策推迟到全局成本比较**，而非 LICM pass 当场拍板。

---

## 代码示例 2：用 Rust 风格伪代码理解「单调插入」

这不是 Crabstar 源码，而是帮助理解 API 形状的**教学伪代码**：

```rust
/// E-Path：单调等价集（只 insert，不 mutate 已有 S）
struct EPath {
    sequences: HashMap<SequenceId, ESequence>, // hash cons 去重
}

struct ESequence {
    blocks: Vec<BlockId>,
    // 终结符编码分支/回边，线性列表可指代结构化区域
}

/// 重写规则：LICM — 返回新序列，旧序列仍在 path 里
fn licm_rewrite(path: &mut EPath, s: &ESequence, loop_region: LoopRegion) -> Option<SequenceId> {
    let (invariant, variable) = partition_blocks(&s.blocks, &loop_region)?;
    if invariant.is_empty() {
        return None;
    }
    let mut new_blocks = Vec::new();
    new_blocks.extend(build_preheader(&invariant));
    new_blocks.extend(rebuild_loop_header(&variable, &loop_region));
    let s_new = ESequence { blocks: new_blocks };
  // 结构哈希相同则跳过；否则插入 P（永不修改 s）
    path.insert_monotonic(s_new)
}

/// 饱和：反复应用规则直到不动点
fn saturate(path: &mut EPath, rules: &[RewriteRule], seed: ESequence) {
    path.insert_monotonic(seed);
    loop {
        let mut changed = false;
        for s in path.sequences.values().cloned().collect::<Vec<_>>() {
            for rule in rules {
                if let Some(id) = rule.apply(path, &s) {
                    changed |= path.contains(id);
                }
            }
        }
        if !changed { break; }
    }
}

/// 提取：符号成本最小化
fn extract(path: &EPath, cost_model: &SymbolicCost) -> ESequence {
    path.sequences
        .values()
        .min_by_key(|s| cost_model.evaluate(s))
        .cloned()
        .expect("non-empty E-Path")
}
```

要点：

- `insert_monotonic` 体现**只增不改**  
- `saturate` 外层对**当前所有** E-Sequence 试规则 — 与 egg 的「对 e-class 反复 rewrite」类似，但单位是 **CFG 片段**  
- `extract` 在**多套完整控制流组织**之间选，而非局部 peephole  

---

## 与 Equality Saturation / egg 的对比

```text
传统 Equality Saturation (egg):
  程序片段 → E-Graph (e-nodes / e-classes)
  重写：代数规则、表达式等价
  控制流：常借助 CFG skeleton 外挂，或先结构化

E-Path:
  程序片段 → CFG 上的 E-Sequence
  重写：LICM 等 CFG 变换 = 序列级规则
  控制流：一等公民，不必先压成树
```

若你读过 [[ssa]] 笔记：SSA 让**数据流**清晰；E-Path 则在**控制流 + 指令序列**层面做**多套等价布局的联合搜索**，两者可共存于同一后端 pipeline。

---

## 架构与实现要点

1. **IR 约束（原型）**：ANF CFG，每块单指令 + 终结符 — 简化匹配与规则构造，**非** E-Path 理论必需。  
2. **正确性边界**：规则需外部证明语义保持；E-Path **不**内建全程序验证器。  
3. **终止性**：依赖规则系统不动点 + 去重；复杂规则集可能不终止（与一般 EqSat 相同风险）。  
4. **并行前景**（论文 Future Work）：各 E-Sequence 可并行匹配/重写，同步点仅为等价集插入 — 适合探索大搜索空间。

---

## 当前局限（论文第 10 节）

| 局限 | 说明 |
|------|------|
| 控制流形状 | 仅**可约**循环；无条件分支、跳转表、不可约循环尚未支持 |
| 内存与副作用 | 未建模别名、内存效应、推测执行 |
| 语义证明 | 假定重写规则正确，无内部等价证明 |
| 规模 | 单调集增长需 hash cons；激进规则下空间仍可能爆炸 |

未来计划：分支分布、循环交换/分裂/融合、部分展开、向量化，以及常量传播、DCE、CSE 等**同样写成单调重写**。

---

## 相关工作速览

- **Tate et al. 2009 / egg (POPL 2021)**：表达式级等价饱和的奠基与工业级实现。  
- **RVSDG (Reissmann et al. 2020)**：用嵌套区域弱化显式 CFG，但仍需规范化。  
- **Cranelift / Julia IR 的 CFG skeleton**：控制流语句与 e-graph 分离存储 — 与 E-Path「序列即等价单元」形成对照。  
- **eqsat MLIR dialect** 等：把 e-graph **嵌入** IR；E-Path 则强调 **CFG 原生序列** 而非外挂表达式图。

---

## 学习路径建议

1. 先理解 **phase-ordering** 与 **destructive CFG pass**（可读 [[ssa]] 与传统 LICM 资料）。  
2. 读 **egg** 教程，建立 e-graph / rewrite / extract 心智模型。  
3. 用本文 **示例 1** 手画 \(P_0, P_1\) 两套序列，体会「为何不删旧版」。  
4. 若做编译器后端：思考你的 IR 能否切成「单指令基本块 + 显式终结符」以利匹配。  
5. 跟踪 Crabstar / E-Path 开源进展（论文称 Rust 原型已存在）。

---

## 自测题

1. E-Path 的「单调性」解决了传统优化器的什么痛点？  
2. E-Sequence 与 E-Graph 的 e-class 在「等价粒度」上有何不同？  
3. 为何 LICM 在 E-Path 里是「加新序列」而不是「改原序列」？  
4. 提取阶段 \(S^* = \arg\min C(S)\) 与传统 pass 链的决策点有何区别？  
5. 论文认为 E-Path 不适合立即替代 egg 的场景是什么？

<details>
<summary>参考答案（先自己想）</summary>

1. 避免破坏性改写导致**无法回溯**其他优化路径，缓解 **pass 顺序敏感**。  
2. e-class 合并**表达式**；E-Sequence 合并**基本块指令序列（含控制结构编码）**。  
3. 保留多版本才能在提取时**全局比较成本**；原地改写会丢失未外提布局。  
4. 传统 pass **每步局部提交**；E-Path **延迟提交**到饱和后一次性选全局最优 CFG 变体。  
5. 纯代数、无控制流改写的表达式优化仍更适合 **E-Graph**；E-Path 针对 **CFG 级**变换。

</details>

---

## 参考

- Guillermo Garcia, *E-Path: Equality Saturation for Control-Flow Graphs*, arXiv:2605.28694, 2026. [https://arxiv.org/abs/2605.28694](https://arxiv.org/abs/2605.28694)  
- Ross Tate et al., *Equality Saturation: A New Approach to Optimization*, POPL 2009.  
- Max Willsey et al., *egg: Fast and Extensible Equality Saturation*, POPL 2021.  
- Ron Cytron et al., *Efficiently Computing SSA…*, TOPLAS 1991 — 见本站 [[ssa]]。  
- Nico Reissmann et al., *RVSDG: An Intermediate Representation for Optimizing Compilers*, TECS 2020.
