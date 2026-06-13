---
title: Velox — Meta 的统一执行引擎
来源: https://www.vldb.org/pvldb/vol15/p3372-pedreira.pdf
日期: 2026-06-13
分类: 数据库
子分类: 存储与查询
provenance: pipeline-v3
---

## 从日常类比开始：每家餐厅各备一套后厨

想象一家大型餐饮集团，旗下有十几家**不同风格的餐厅**：快餐（批处理 ETL）、商务午餐（交互式 SQL）、外卖档口（流处理）、甜品站（ML 特征工程）。每家店都自己招厨师、自己买灶具、自己写菜谱——`substr()` 在 A 店是 0-based 下标，在 B 店是 1-based；空值处理、类型转换也各有一套。

结果是：

- **维护成本爆炸**：SIMD 向量化、字典编码优化、哈希表布局——同样的性能技巧要在十几个代码库里重复实现。
- **食客体验不一致**：数据分析师写同一句 SQL，换引擎就可能得到不同结果（Meta 内部调查发现仅 `substr` 就有至少 12 种语义变体）。
- **硬件升级跟不上**：新加速器、NVRAM、Tensor 类型——每个引擎单独适配几乎不可能。

Velox（Pedreira 等，VLDB 2022）的解法像**集团中央厨房 + 标准化配菜线**：

- 各餐厅保留自己的**前台**（SQL 解析、DataFrame API、全局优化器、分布式调度）——这是**控制面（control-plane）**。
- 真正在灶台上炒菜的部分——表达式求值、过滤、聚合、Join、序列化——抽成共享的 **C++ 执行库**，即 **数据面（data-plane）**。
- Velox **不**提供 SQL 解析器，也**不**做全局查询优化；它接收**已经优化好的物理计划**，在**单节点**上高效执行。

类比总结：

| 餐厅集团 | 传统 Meta 数据栈 | Velox 之后 |
|----------|------------------|------------|
| 每家独立后厨 | Presto、Spark、XStream、F3… 各写一套执行引擎 | 共享 Velox「中央厨房」 |
| 菜谱不一致 | 同名函数语义不同 | Presto/Spark 函数包统一行为 |
| 扩容靠加店 | 每个引擎单独优化 | SIMD、自适应过滤等写一次、处处受益 |

---

## 这篇论文在解决什么问题

### 1. 专用引擎泛滥 → 孤岛生态

现代数据负载从 OLTP/OLAP 扩展到 ETL、流处理、日志时序、ML 预处理与特征工程。每种负载催生一个**专用引擎**，技术栈、语言、团队完全割裂，演进和优化成本按引擎数量线性放大。

### 2. 差异主要在「外壳」，内核惊人相似

论文指出：引擎之间的真正差异通常在**语言前端、优化器、分布式运行时、I/O 层**；而**执行内核**高度同质——都需要类型系统、列式内存布局、表达式引擎、Join/Agg/Sort 算子、序列化格式、内存与线程管理。

### 3. 用户被迫在多引擎间切换

ML 流水线常见路径：Spark 做大表 Join → Presto 交互调试 → 流处理实时特征 → PyTorch 训练。每一步可能遇到**不同的函数集、空值语义、类型行为**，摩擦巨大。论文估计 ML 预处理可占训练资源高达 **50%**，而 Meta 内部曾有约 **14 个**互不兼容的预处理库。

---

## Velox 的定位：做什么、不做什么

**做什么（数据面组件）：**

- 接收**物理查询计划**（算子 DAG），在本地 CPU/内存上执行。
- 提供可插拔、可扩展的高性能组件（见下文「核心概念」）。
- 运行时自适应：谓词重排、动态 filter pushdown、列预取等。

**不做什么：**

- 无 SQL/DataFrame 解析器。
- 无全局代价优化器（CBO）。
- 不直接面向终端数据用户——由 Presto Coordinator、Spark Driver 等上层系统调用。

CMU 15-721 课程幻灯片用一句话概括：**Velox = 可扩展的单节点高性能查询执行 C++ 库**。

---

## 核心概念

### 1. 模块化组件一览

| 组件 | 职责 |
|------|------|
| **Type** | 标量/复杂/嵌套类型（struct、map、array、tensor、lambda）；支持扩展类型如 HyperLogLog |
| **Vector** | Arrow 兼容的列式内存；Flat、Dictionary、Constant、RLE、Bias 等编码；Lazy 延迟物化 |
| **Expression Eval** | 向量化表达式树编译与执行；CSE、常量折叠、自适应 AND/OR 重排、字典 peeling |
| **Functions** | 标量/聚合函数 API；提供 Presto、Spark 语义函数包 |
| **Operators** | TableScan、Filter、Project、Aggregation、HashJoin、Exchange、OrderBy、Unnest… |
| **I/O** | 可插拔连接器；内置 ORC、Parquet、S3、HDFS |
| **Serializers** | 网络交换格式：PrestoPage、Spark UnsafeRow |
| **Resource Management** | Memory pool、Task/Driver/线程池、Spill、缓存 |

引擎可按需裁剪：只需序列化层就接 Type + Vector + Serializer；完整 SQL 引擎则用上全部算子与资源管理。

### 2. Vector：扩展版 Arrow 列存

Velox Vector 在 Apache Arrow 基础上为**数仓工作负载**做了三处关键扩展（论文 4.2.1）：

1. **StringView 字符串布局**：16 字节元数据 + 数据缓冲；≤12 字节短串完全内联，比较可短路前缀，部分操作可零拷贝。
2. **乱序写入（out-of-order write）**：支持 `IF`/`SWITCH` 类条件：先算分支掩码，再分路向量化写同一输出列，避免多次拷贝。
3. **更多编码**：RLE、Constant（整列同一字面量，如分区键）等。

**Lazy Vector**：Join、条件投影等**选择性高**的场景下，列直到被访问才从 S3/HDFS 读取，可跳过大量 I/O。

**DecodedVector**：函数开发者不必处理任意嵌套编码——解码为 flat + indices 的统一视图，单层字典零拷贝。

### 3. 表达式引擎：编译 + 执行两阶段

**编译期优化：**

- **公共子表达式消除（CSE）**：`strpos(upper(a),'FOO')>0 OR strpos(upper(a),'BAR')>0` 中 `upper(a)` 只算一次。
- **常量折叠**：`strpos('FOO','O')` → 字面量 `2`。
- **合取重排扁平化**：`AND(AND(a,b),c)` → `AND(a,b,c,d,e)`，便于运行时按选择性排序。

**执行期优化：**

- **自适应合取/谓词顺序**：按 `time / (1 + values_in - values_out)` 评分，优先执行「最快丢掉最多行」的条件（TableScan 过滤与表达式 AND/OR 同源思想）。
- **Peeling（字典剥离）**：字典列只对** distinct 值**求值，再按 indices 展开——千行颜色列若只有 3 种颜色，只对 3 个值调 `upper()`。
- **Memoization**：多 batch 共享同一字典 base 时，复用已算好的 inner 结果。

另有**实验性 Codegen**：把表达式树编成 C++ 源码再 `gcc/clang` 编译为 `.so`，适合小时级 ETL 或在线特征服务（高 QPS、小 batch）——编译可达 ~10s，不适合短查询。

### 4. Simple Function API：降低 UDF 开发门槛

向量化函数 API 功能完整但易错（空值位图、多种编码、嵌套类型）。Velox 提供 **Simple Function** 框架：开发者写**逐行** C++ 逻辑，框架用模板元编程批量应用到 Vector，并自动走 flat/null-free 快路径。

论文 Figure 1 显示：复杂类型函数用 Simple API 往往**更快**——不是因为框架魔法，而是手写 vectorized 函数常漏掉优化分支，框架自动补齐。

### 5. 执行模型：Task → Pipeline → Driver

- **Task**：分布式执行中的计划片段 + 算子树；以 Exchange 或 TableScan 为源/汇。
- **Pipeline**：算子树的线性子链（如 HashProbe 与 HashBuild 各一条 pipeline）。
- **Driver**：pipeline 上的可恢复执行状态线程，可随时挂起等待 shuffle/扫描——比经典 Volcano **拉取式迭代器**更易做异步与 spill。

**HashJoin / Aggregation** 共用基于 **F14** 思想的自适应哈希表：`VectorHasher` 识别键基数，能压成整数域就直接索引数组，否则归一化为 64-bit 键；哈希布局随新 batch **自适应调整**。

### 6. 内存与 Spill

- 大对象经 **mmap/madvise** 分配，减少碎片。
- 层次化 **Memory Pool** + 可插拔 **Memory Arbiter**：超限时选择哪个 Task spill 或取消。
- Operator 实现 spill 接口；Exchange 可在内存紧张时缩小缓冲。
- **RAM + SSD 分层缓存**：列级任意大小缓存；热列预取；Meta 实测 RAM 命中 ~8GB/s，本地 SSD ~2–3GB/s，远端 ~700MB/s。

---

## Meta 内部集成场景（论文第 3 节）

| 项目代号 | 宿主系统 | 要点 |
|----------|----------|------|
| **Prestissimo** | Presto Worker | C++ 替换 Java Worker；Coordinator 仍用 Java；消除 Worker 侧 JVM/GC |
| **Spruce / SparkCpp** | Spark | 经 Spark script transform 把计划片段交给外部 C++ 进程；UnsafeRow 序列化保持兼容 |
| **XStream** | 流处理 | 批到 500KB / 20s 窗口；复用 Presto 函数包；窗口聚合作为 Velox 扩展 |
| **Scribe Read** | 消息总线 | 列式 wire 格式；下推投影/过滤，减跨机房流量 |
| **FBETL** | 数据入仓 | 摄入时做投影/UDF/过滤，避免再建流处理应用 |
| **TorchArrow** | PyTorch | DataFrame → Velox 计划；统一 ML 预处理（「DI for AI」） |
| **F3** | 特征工程 | 离线 Spark + 实时 XStream 已接 Velox；在线 serving 小 batch 走 codegen |

---

## 代码示例 1：用 Simple Function API 注册标量函数

论文 4.4.1 展示乘法 UDF 的典型写法——业务逻辑只管「一行」，框架负责向量化与空值默认传播：

```cpp
#include "velox/functions/Registerer.h"

class MultiplyFunction {
 public:
  void call(int64_t& result, const int64_t& a, const int64_t& b) {
    result = a * b;
  }
};

// 注册为 SQL 可调用的 "multiply" 函数
registerFunction<MultiplyFunction, int64_t, int64_t, int64_t>({"multiply"});
```

要点：

- `call` 第一个参数是**输出引用**，其余为 `const` 输入。
- 返回 `void` 表示**从不产生 NULL**；若返回 `bool` 则可逐行标记 NULL。
- 默认 **default null behavior**：任一输入为 NULL 则跳过 `call`、输出 NULL。
- 若需自定义空值语义，把参数改成指针类型并实现 `callNullable`。

对比手写 vectorized 函数：你要自己遍历 `activeRows`、处理 `FlatVector`/`DictionaryVector`、分配输出 Buffer；Simple 框架通过 `DecodedVector` 隐藏编码细节，并让 clang/gcc 对算术类函数**自动向量化（SIMD）**。

---

## 代码示例 2：表达式求值最小闭环（官方 ExpressionEval 示例）

Velox 仓库 `velox/examples/ExpressionEval.cpp` 展示了**不经过完整 SQL 引擎**、只用表达式模块的路径：注册 UDF → 搭表达式树 → 对 `RowVector` batch 调用 `ExprSet::eval`。

```cpp
#include "velox/core/Expressions.h"
#include "velox/functions/Udf.h"
#include "velox/vector/BaseVector.h"

using namespace facebook::velox;

// 1) 注册 times_two(x) = x * 2
template <typename T>
struct TimesTwoFunction {
  FOLLY_ALWAYS_INLINE bool call(int64_t& out, const int64_t& a) {
    out = a * 2;
    return true;
  }
};

int main() {
  registerFunction<TimesTwoFunction, int64_t, int64_t>({"times_two"});

  auto queryCtx = core::QueryCtx::create();
  auto pool = memory::memoryManager()->addLeafPool();
  core::ExecCtx execCtx{pool.get(), queryCtx.get()};

  // 2) 表达式树：times_two(my_col)
  auto fieldNode = std::make_shared<core::FieldAccessTypedExpr>(
      BIGINT(), "my_col");
  auto exprTree = std::make_shared<core::CallTypedExpr>(
      BIGINT(), "times_two", fieldNode);
  exec::ExprSet exprSet({exprTree}, &execCtx);

  // 3) 输入 batch：10 行 my_col = 0,1,...,9
  const size_t n = 10;
  auto col = BaseVector::create<FlatVector<int64_t>>(
      BIGINT(), n, execCtx.pool());
  std::iota(col->mutableRawValues(), col->mutableRawValues() + n, 0);

  auto rowVector = std::make_shared<RowVector>(
      execCtx.pool(),
      ROW({{"my_col", BIGINT()}}),
      BufferPtr(nullptr),
      n,
      std::vector<VectorPtr>{col});

  // 4) 求值
  std::vector<VectorPtr> result{nullptr};
  SelectivityVector rows{n};
  exec::EvalCtx evalCtx(&execCtx, &exprSet, rowVector.get());
  exprSet.eval(rows, evalCtx, result);
  // 输出列应为 0, 2, 4, ..., 18
  return 0;
}
```

| 类型 | 角色 |
|------|------|
| `CallTypedExpr` / `FieldAccessTypedExpr` | 编译前的表达式 IR（Prestissimo 从 Presto 计划翻译而来） |
| `ExprSet` | 编译 IR 并做 CSE、常量折叠；可跨 batch 复用 |
| `RowVector` | 多列 batch 容器——表达式输入**总是** RowVector |
| `SelectivityVector` | 位图：哪些行参与本步计算 |
| `EvalCtx` | 每个 batch 一个；FilterProject 内部也是这套 API |

完整 SQL 路径中，Prestissimo 把 Coordinator 下发的 **PlanFragment** 转成 `core::PlanNode` 算子树（TableScan → FilterProject → HashJoin…），再创建 `exec::Task` 与多个 `Driver` 并行执行 pipeline。

---

## 代码示例 3：字典列上的表达式求值（理解 Peeling）

虽非完整可编译片段，但有助于理解论文 4.3.2 的 peeling 优化：

```text
输入：color 列，1000 行，Dictionary 编码
  indices: [0,1,2,0,1,0,2,...]  (1000 个，取值 0..2)
  base:    ["red", "green", "blue"]  (仅 3 个 distinct)

表达式：upper(color)

Peeling 后实际计算：
  upper(["red", "green", "blue"]) → ["RED", "GREEN", "BLUE"]  // 只算 3 次

再按 indices 展开回 1000 行的 Dictionary 结果 —— 避免对 1000 行各调一次 upper()
```

这对仓库里**高重复度**维度列（国家码、状态枚举）极其有效，也是 Velox 选择优化「复杂类型 + 字符串 + 嵌套」而非仅做 `int+int` 的原因——Meta 生产 CPU profile 显示这些操作占大头。

---

## 实验结果：Prestissimo vs Presto Java

论文在 80 节点集群、3TB TPC-H（ORC、warm cache）上对比 Worker 执行层：

| 查询 | 墙钟加速 | CPU 加速 | 瓶颈说明 |
|------|----------|----------|----------|
| Q1 | 8.4× | 6.5× | CPU 密集；C++ 侧反而等 Coordinator 派单 |
| Q6 | 9× | 3.7× | 高选择性扫描 + 聚合 |
| Q13 | 2× | 2.1× | Shuffle 成为新瓶颈 |
| Q19 | 2.1× | 2.5× | 同上 |

**生产流量回放**：平均加速约 **6–7×**，不少查询 **>10×**。

**容量**：影子集群实验表明，Velox 栈用 **20 台**服务器即可达到原 Java 栈 **60 台**的同等工作负载与用户感知延迟——不仅是省 CPU，更是省机架与电力。

---

## 与相关系统的对比（论文第 7 节）

| 系统 | 定位差异 |
|------|----------|
| **DuckDB** | 嵌入式完整 RDBMS（SQL 前端 + 存储）；Velox 是**模块化积木**，服务已有分布式引擎 |
| **Apache Arrow Compute / Gandiva** | 主要是函数 kernel + LLVM；无完整 Join/Agg 算子与资源管理 |
| **Photon (Databricks)** | 专有、深度绑定 Spark JVM；Velox 开源且**引擎无关** |
| **Intel OAP / Gazelle** | 同样加速 Spark，范围较窄 |

Velox 与 **Apache Arrow**、**Substrait**（跨语言计划 IR）同属「组件化数据栈」趋势——未来可能是多种前端 + 统一执行总线 + 可插拔硬件内核。

---

## 设计取舍与开放问题

**优势：**

- 优化**写一次、全栈受益**（SIMD 过滤、字典 memoization、F14 哈希…）。
- **语义统一**：Presto 函数包被 XStream、FBETL、TorchArrow 复用。
- **C++ 单节点极致性能** + 可选 codegen 覆盖小 batch 在线路径。

**挑战（论文第 6 节）：**

- **超低延迟 / 单行**场景：向量化解释开销大；F3 在线 serving 正探索 codegen。
- **Codegen vs LLVM JIT**：编译延迟、可调试性、运行时在 interpreted/compiled 间切换——仍待研究。
- **自治与自适应**：集群参数手工调优越来越难；论文指向 self-driving DB 方向。

---

## 零基础读者速记

1. **Velox 不是数据库**，是帮你**造/加速**数据库执行部分的 C++ 库。
2. 它吃**物理计划**，吐**列式结果**；SQL 从哪来、怎么分布式，上层说了算。
3. **Vector + Expression Eval** 是心脏：Arrow 列存 + 向量化 + 自适应 + 字典优化。
4. Meta 用它统一了 Presto Worker（Prestissimo）、Spark（Spruce/Gluten 生态）、流处理、入仓、PyTorch 预处理。
5. 生产上常见 **数倍到一个数量级**加速，并显著**减少机器台数**。

---

## 延伸阅读

- 论文：[Velox: Meta's Unified Execution Engine (VLDB 2022)](https://www.vldb.org/pvldb/vol15/p3372-pedreira.pdf) — doi:10.14778/3554821.3554829
- 开源仓库：[facebookincubator/velox](https://github.com/facebookincubator/velox)
- Meta 工程博客：[Introducing Velox (2023)](https://engineering.fb.com/2023/03/09/open-source/velox-open-source-execution-engine/)
- CMU 15-721 讲义：[Velox slides](https://15721.courses.cs.cmu.edu/spring2023/slides/23-velox.pdf)
- Spark 集成：[Apache Gluten](https://github.com/apache/incubator-gluten)（社区将 C++ 引擎接入 Spark 的 JNI + Substrait 方案）

---

## 自测题

1. Velox 属于控制面还是数据面？为什么故意不做 SQL 解析器？
2. Lazy Vector 在什么算子场景下能省 I/O？请结合选择性（selectivity）解释。
3. Prestissimo 为何能去掉 Worker 上的 JVM？Coordinator 为什么可以保留 Java？
4. 字典编码列上的 peeling 如何把 O(n) 次函数调用降到 O(distinct)？
5. 若 shuffle 成为瓶颈，仅靠 Velox 执行层优化是否足够？论文建议的后续方向是什么？

---

*笔记基于 VLDB 2022 论文与 Meta 公开材料整理；代码示例 1 摘自论文 Simple Function 片段；示例 2 改编自 Velox 官方 `ExpressionEval.cpp`；示例 3 为 peeling 数据流示意。*
