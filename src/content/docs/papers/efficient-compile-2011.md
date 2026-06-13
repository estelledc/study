---
title: Efficiently Compiling Efficient Query Plans for Modern Hardware — 面向现代 CPU 的查询编译
来源: https://www.vldb.org/pvldb/vol4/p539-neumann.pdf
日期: 2026-06-13
分类: 数据库
子分类: 存储与查询
provenance: pipeline-v3
---

## 从日常类比开始：流水线 vs 现做现炒

想象一家大型**中央厨房**要处理成千上万份订单（SQL 查询）。

**老式 Volcano（火山/迭代器）模型**像每条产线都设一个「中转站管理员」：

- 每做好**一份菜**（一行 tuple），管理员就打电话问上游「下一道是什么？」——对应 `Next()` 虚函数调用；
- 电话要打**几百万次**，而且对方号码还经常变（函数指针），CPU 分支预测器猜不准；
- 每转一站，案板上的食材（寄存器里的列值）就被清空，下次还得重新从仓库（内存）搬——**局部性极差**。

**批处理 / 向量化**模型像改成「一次端出一托盘」：电话少打了，但托盘太大，放不进灶台（寄存器），只好先堆在临时货架上——**流水线（pipelining）断了**，内存带宽压力上来。

Neumann 在 VLDB 2011 这篇论文里提出第三条路：**把整张订单编译成一段「现做现炒」的专用机器码**——

- 食材在寄存器里一路传递，直到必须「装盘」（pipeline breaker 物化）才写内存；
- 数据**推（push）**向消费者，而不是算子**拉（pull）**；
- 用 **LLVM JIT** 在毫秒级生成接近手写 C++ 性能的本地代码。

这套思路集成在 TUM **HyPer** 内存数据库中，后来深刻影响了 Umbra、DuckDB、Hyper/Tableau 等系统的执行引擎设计。

---

## 这篇论文在解决什么问题

### 1. 内存够大了，瓶颈回到 CPU

当数据能放进主存，查询耗时不再由磁盘 I/O 主导，而是 **CPU 怎么算** 主导。Volcano 模型诞生于 I/O 时代，其「每行一次虚调用」的开销在内存数据库里变得不可接受。

### 2. 向量化仍输给手写代码

MonetDB/X100（后来的 VectorWise）用向量批处理大幅提速，但论文引用 Figure 1 表明：对 TPC-H Q1 这类简单聚合，**手写 C++ 仍明显更快**——说明现有执行模型在「把数据留在寄存器里」这件事上还有根本差距。

### 3. 查询编译不是新概念，但旧路有坑

| 方案 | 问题 |
|------|------|
| 编译成 JVM 字节码（IBM 等） | 仍用迭代器模型，收益有限 |
| 编译成 C 再调 gcc（HIQUE 等） | **编译秒级**，交互式查询不可接受 |
| HyPer 早期：拼接 C++ 代码片段 | 性能尚可，但 gcc 编译慢、代码生成易错 |

论文的核心主张：**代数计划仍然用于优化与推理，但执行时不应再暴露算子边界**——而应编译成 **data-centric（以数据为中心）** 的 imperative 程序。

---

## 核心概念

### 1. Volcano / Iterator 模型（对照组）

每个物理算子实现 `open` / `next` / `close`，上层反复 `next()` 拉取下一行：

- 优点：组合任意算子、逻辑清晰（System R 传统）。
- 缺点：每 tuple 跨函数边界；虚调用 / 函数指针；中间状态散落，**cache 与分支预测**双输。

### 2. Pipeline Breaker（流水线断点）

论文采用比常规定义**更严格**的 pipeline breaker：

> 若算子把传入 tuple **赶出 CPU 寄存器**（通常意味着物化到内存），则对该输入侧是 breaker；若**全部物化**后再继续，则是 **full pipeline breaker**。

目标：**在两个 breaker 之间，tuple 尽量只活在寄存器里**，热路径是纯 tight loop。

典型 breaker：Hash Join 的 build 侧、Sort、Group By 哈希表构建等。

### 3. Push vs Pull

| | Pull（Volcano） | Push（本文） |
|---|----------------|--------------|
| 控制流 | 父算子向下要数据 | 子算子向上**推**数据 |
| 寄存器 | 每次 `next()` 易 spill | 连续 push 直到 breaker |
| 代码形状 | 递归、多层调用 | **单段紧凑循环** |

### 4. Data-Centric 编译

算子边界在**生成代码里被抹平**。例如 `Scan(R1) → σ(x=7) → HashBuild` 编译成**同一段**循环：扫列、比 predicate、写 hash 表——不再有三个独立 `Next()`。

### 5. produce / consume 接口（仅存在于编译器内）

编译器视角下，每个算子提供两个概念方法：

- **`produce()`**：向下游算子要输入，启动数据流；
- **`consume(attributes, source)`**：收到上游推来的 tuple，执行本算子逻辑。

**关键点**：这两个函数**不会出现在运行时**——编译器根据它们**展开成 imperative 代码**。运行时只有 LLVM 生成的机器码。

### 6. LLVM + C++ 混合执行

```
┌─────────── LLVM 生成的「链条」：filter / hash / 内循环 ───────────┐
│  ○──○──○──○──○──○──○──○──○──○──○──○──○──○──○──○──○──○──○──○──○  │
└────┬───────────────────────────────┬─────────────────────────────┘
     │ 偶尔调用                       │ 复杂算子交还控制
     ▼                               ▼
  C++「齿轮」：索引结构、页分配、外排 merge、spill 到磁盘 …
```

- **热路径（99% tuple）**：纯 LLVM，寄存器常驻；
- **冷路径**：调预编译 C++（如 hash 表扩容、换页）——偶尔 spill 寄存器可接受，**每行都 spill 不行**。

LLVM 优势：JIT **毫秒级**、SSA「无限寄存器」简化代码生成、强类型抓 bug、自动受益于未来编译器/CPU 优化。

---

## 代码示例 1：Volcano vs 编译后的 Push 伪代码

下面用简化 SQL 说明两种执行形态的差异：

```sql
SELECT * FROM R1, R3,
  (SELECT R2.z, COUNT(*) FROM R2 WHERE R2.y = 3 GROUP BY R2.z) R2
WHERE R1.x = 7 AND R1.a = R3.b AND R2.z = R3.c;
```

**Volcano 风格（Pull，每行多次虚调用）：**

```python
def top_join_next():
    while True:
        t3 = scan_R3_next()          # 虚调用
        if t3 is None: return None
        for t2 in hash_probe_Bzc(t3.c):   # 又一次算子边界
            for t1 in hash_probe_Bab(t3.b):
                if t1.x == 7:          # 本可在 scan 时过滤
                    yield merge(t1, t2, t3)
```

**Data-centric 编译结果（Push，Figure 4 精神）：**

```python
# 片段 1：build Ba=b
for t in R1:
    if t.x == 7:
        hash_table_Bab.insert(t)

# 片段 2：build Γz on R2
for t in R2:
    if t.y == 3:
        agg_hash_Gz.add(t.z)

# 片段 3：materialize Γz → build Bz=c
for (z, cnt) in agg_hash_Gz:
    hash_table_Bzc.insert(z, cnt)

# 片段 4：probe 并输出（内层 tight loop，列值可驻寄存器）
for t3 in R3:
    for t2 in hash_table_Bzc.probe(t3.c):
        for t1 in hash_table_Bab.probe(t3.b):
            output(t1, t2, t3)
```

注意：`σ(x=7)` 与 R1 scan **融进片段 1**，不再单独成算子；片段 4 是性能关键路径。

---

## 代码示例 2：produce / consume 如何展开（Figure 5 简化）

编译器内部的翻译规则（示意）：

```text
# HashJoin B
B.produce():
    B.left.produce()
    B.right.produce()

B.consume(attrs, source):
    if source == B.left:
        emit LLVM: "materialize attrs into hash table slot"
    else:
        emit LLVM: "for each match in hashTable[attrs.joinKey]: ..."
        B.parent.consume(merged_attrs, B)

# Selection σ
σ.produce():
    σ.input.produce()

σ.consume(attrs, source):
    emit LLVM: "if (" + σ.condition + ") { parent.consume(attrs); }"

# TableScan
scan.produce():
    emit LLVM: "for each tuple t in relationFragment:"
    emit LLVM: "    parent.consume(t.columns, scan)"
```

对 Figure 3 的算子树应用上述规则，就得到 Figure 4 的四段 imperative 代码——**规则简单，但真实实现要跟踪属性依赖、相关子查询、多输入 join 左右差异等**（论文称 SQL-92 全套算子代码生成约 11,000 行）。

---

## 代码示例 3：分支布局对性能的影响

Hash 表冲突链遍历若写成「混合存在性与链表结束」的 while，分支预测约 50/50，**极慢**。论文建议拆成：

```cpp
// 不友好：while 混合两种分支语义
Entry* iter = hashTable[hash];
while (iter) {
    inspect(iter);
    iter = iter->next;
}

// 友好：先判断桶非空，再 do-while 短链
Entry* iter = hashTable[hash];
if (iter) {
    do {
        inspect(iter);
        iter = iter->next;
    } while (iter);
}
```

论文报告：**仅调整分支结构**即可让 hash lookup 快 **20%+**。LLVM 生成代码时同样遵守此布局原则。

---

## 与高级技术的结合

论文第 5 节说明框架可**自然扩展**，不必退回 Volcano：

| 技术 | 如何融入 |
|------|----------|
| **SIMD** | 在 push 路径上把多个 tuple 打包进向量寄存器；LLVM 原生支持 vector type |
| **块处理** | 以 **fragment**（连续 tuple 块）为单位循环——与存储布局对齐 |
| **多核** | 不同 fragment 可并行；merge 结果需额外逻辑（论文留作 future work，后续 morsel-driven 等工作接续） |

---

## 实验结果（HyPer，TPC-CH 基准）

### OLTP（TPC-C，12 warehouse，单线程）

| 后端 | 吞吐 (tps) | 总编译时间 |
|------|------------|------------|
| HyPer + C++ | 161,794 | **16.53 s** |
| HyPer + LLVM | 169,491 | **0.81 s** |

OLTP 查询简单、touch tuple 少，运行时差距不大；**编译时间差一个数量级**决定能否用于交互式场景。

### OLAP（TPC-H 改编 Q1–Q5，warm run）

| 查询 | HyPer C++ (ms) | HyPer LLVM (ms) | VectorWise | MonetDB |
|------|----------------|-----------------|------------|---------|
| Q1 | 142 | **35** | 98 | 72 |
| Q2 | 374 | **125** | — | 218 |
| Q3 | 141 | **80** | 257 | 112 |
| Q4 | 203 | **117** | 436 | 8168 |
| Q5 | 1416 | **1105** | 1107 | 12028 |

Q1（单 scan + 聚合）最能体现寄存器常驻优势；Q5 join 重时差距缩小。

### 代码质量（callgrind，相对 MonetDB）

- **分支总数**：LLVM 版通常少一个数量级（单段代码 vs BAT 多次触碰）；
- **分支误判**、**L1/L2 cache miss**：LLVM 版多数查询更低；
- **动态指令数**：LLVM 生成代码更紧凑。

---

## 与后续系统的关系

| 系统 / 工作 | 关联 |
|-------------|------|
| **HyPer + Morsel-Driven (2014)** | 同一数据库上的 **并行调度** 层；编译出快代码，morsel 负责多核 |
| **Umbra (Neumann 后续)** | 继承 data-centric + LLVM 路线 |
| **DuckDB** | 向量化 + 可选 **query pipeline 编译**；工程上吸收了「少物化、紧循环」思想 |
| **Velox / 各云引擎** | 物理计划执行层分离；Neumann 2011 解决的是「单节点内核如何贴近 CPU」 |

读 2011 论文时的一个心法：**优化器产出的是代数 DAG，但 CPU 想执行的是「for 循环 + 少分支 + 寄存器里算完」**——编译层的工作就是把前者变成后者。

---

## 实现与维护性

- SQL-92 代数算子 → LLVM 的代码生成器：**约 11,000 行**（论文结论：compact and maintainable）；
- 不必手写汇编：LLVM SSA + 类型检查降低 bug 率；
- 依赖 **主流编译器栈**，硬件升级时 DBMS 不必重写算子内核。

---

## 局限与未覆盖点

1. **并行划分策略**论文仅点到为止（2014 morsel 论文专门补这块）；
2. **磁盘 spill** 存在但与内存场景相比论述较少；
3. **编译计划缓存**：重复查询摊销编译成本，论文实验用 prepared query warm run；
4. **超宽表 / 超大 tuple**：「全部进寄存器」假设会破，需物化部分列。

---

## 零基础自检清单

读完后，你应该能回答：

1. **为什么 Volcano 在内存数据库里慢？**（每行虚调用、寄存器 spill、分支预测）
2. **Pipeline breaker 在本文里是什么意思？**（被迫离开寄存器的物化点）
3. **Push 和 Pull 的本质区别？**（控制流方向 + 能否生成单段 tight loop）
4. **produce/consume 何时存在？**（仅编译期；运行时是 LLVM 机器码）
5. **为何选 LLVM 而不是 runtime 拼 C++？**（JIT 快、代码质量、可移植、类型安全）
6. **Q1 为何是最佳 showcase？**（scan + agg，几乎无 join，寄存器策略收益最大）

---

## 延伸阅读

- Thomas Neumann, *Efficiently Compiling Efficient Query Plans for Modern Hardware*, PVLDB 4(9), 2011. [PDF](https://www.vldb.org/pvldb/vol4/p539-neumann.pdf)
- Kemper & Neumann, *HyPer: A hybrid OLTP&OLAP main memory database system*, ICDE 2011（同一系统的 OLTP/OLAP 混合架构）
- Leis et al., *Morsel-Driven Parallelism*, SIGMOD 2014（HyPer 并行执行，本仓库笔记：`morsel-driven-2014.md`）
- Boncz et al., *MonetDB/X100: Hyper-Pipelining Query Execution*, CIDR 2005（向量化对照组）

---

## 一句话总结

**不要把 SQL 计划当作运行时的一串算子对象去「拉」——在编译期把它展开成 push 式、breaker 之间寄存器友好的机器码；LLVM 让这种展开既快又便携，从而在现代 CPU 上逼近手写 C++ 的执行效率。**
