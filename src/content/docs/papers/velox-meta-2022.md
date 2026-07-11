---
title: Velox — Meta 统一执行引擎
来源: 'Pedro Pedreira et al. Velox: Meta Unified Execution Engine. PVLDB 2022'
日期: 2026-05-29
分类: databases
难度: 中级
---

## 是什么

日常类比：一家公司有十几个厨房，早餐、午餐、夜宵各自买锅、写菜单、训练厨师。
Velox 想做的事，是把真正炒菜的炉灶和刀具统一起来，让不同窗口只保留自己的菜单和排队方式。

放到数据系统里，它是一个 C++ 执行引擎库。
Presto、Spark、流处理、消息读取、数据入仓、机器学习预处理，都可以把已经优化好的计划交给它执行。

它不负责写 SQL 解析器，也不负责全局查询优化。
它专注在本机数据面：类型、列式向量、表达式、函数、算子、I/O、序列化、内存和线程。

最短的感觉可以写成这样：

```txt
SQL / DataFrame / DSL
  -> 各系统自己的解析和优化
  -> Velox 执行本机 plan fragment
  -> 输出一批批列式数据
```

这篇论文的核心不是发明一个新 SQL 数据库，而是证明“执行层可以被拆成公共积木”。

## 为什么重要

不理解 Velox，下面这些事很难解释：

- 为什么大公司会同时有 Presto、Spark、流处理、消息系统和机器学习预处理，却又不想每套都重写一遍执行代码
- 为什么同一个字符串函数在不同引擎里可能有不同下标规则、空值规则和异常规则
- 为什么 C++、列式、向量化、SIMD、缓存这些底层细节，会影响 SQL 查询和特征工程的体验
- 为什么“one size does not fit all”不等于每个系统都从零造一套执行器

## 核心要点

1. **把执行层做成公共零件**。
   类比：插线板不决定你插电脑还是台灯，但它提供稳定供电。
   Velox 不决定用户写 SQL 还是 DataFrame，却提供类型、向量、函数和算子。

2. **用向量化处理一批行**。
   类比：收银员不是每扫一件商品就跑一次仓库，而是一车商品一起结算。
   Velox 用列式 Vector 表示数据，让表达式和算子批量处理，方便 SIMD 和缓存命中。

3. **把适配点留给各个引擎**。
   类比：统一厨房也允许每个窗口保留自己的招牌菜。
   Presto 需要 Presto 函数包和 wire protocol，Spark 需要 UnsafeRow 序列化，流处理需要窗口聚合扩展。

## 实践案例

### 案例 1：Presto worker 变成 C++ 执行器

```txt
Presto coordinator
  -> plan fragment
  -> Prestissimo worker
  -> Velox plan
  -> Velox operators
```

**逐部分解释**：

- coordinator 仍然负责 SQL 解析、元数据、全局优化和调度
- Prestissimo 实现 Presto worker 需要的 HTTP 接口，所以可以像替换发动机一样替换 worker
- Velox 接手真正耗 CPU 的扫描、过滤、投影、聚合和 join
- 论文里 TPC-H CPU-bound 查询 Q1/Q6 的 wall time 接近一个数量级加速，但 shuffle-heavy 查询会转向网络瓶颈

### 案例 2：Spark 通过外部 C++ 进程接 Velox

```txt
Spark executor
  -> serialize Spark plan
  -> SparkCpp process
  -> convert to Velox plan
  -> return UnsafeRow
```

**逐部分解释**：

- Spark driver 和 executor 的容错、调度模型继续保留
- SparkCpp 借助 Spark script transform 接口，把某段执行卸到 C++ 进程
- Velox 插件补齐 Spark 语义需要的函数、聚合和序列化格式
- 这说明 Velox 不是“替代 Spark”，而是让 Spark 少维护一份底层执行代码

### 案例 3：表达式执行只算有必要的部分

```sql
SELECT expensive_json_parse(payload)
FROM events
WHERE country = 'US' AND is_bot = false;
```

**逐部分解释**：

- Velox 会先把过滤条件编译成表达式树
- 运行时统计哪个谓词更便宜、更能过滤行，再动态调整顺序
- 只有通过过滤的行才继续做投影，昂贵的 JSON 解析可以少跑很多次
- 如果输入是字典编码，Velox 还能只对少量 distinct value 求值，再把结果包回去

## 踩过的坑

1. **把 Velox 当成完整数据库**：它没有 SQL parser 和全局 optimizer，原因是论文刻意把控制面留给上层系统。
2. **以为统一执行层就能立刻统一语义**：Presto 和 Spark 仍有历史兼容包，原因是老查询不能因为底层替换而变行为。
3. **只看向量化，不看复杂类型**：论文反复强调 array、map、struct、string，原因是现代工作负载的 CPU 热点常在复杂表达式。
4. **以为 codegen 总更快**：Velox 的 codegen 还偏实验性，原因是编译延迟、调试成本和短查询收益之间有明显 trade-off。

## 适用 vs 不适用场景

**适用**：

- 已经有前端语言和优化器，只缺高性能本机执行层的数据系统
- 想让多个引擎共享函数、类型、ORC/Parquet 读写、hash join、聚合和内存管理
- 大量批处理、交互分析、流式微批、数据入仓、特征工程混在一起的组织
- 需要逐步替换旧 worker，而不是一次性推翻整套系统

**不适用**：

- 只想要开箱即用的单机 SQL 数据库，DuckDB 这类完整系统更直接
- 主要问题在查询优化、成本模型或元数据管理，Velox 不处理这些控制面问题
- 极低延迟、单行高 QPS 的服务路径，向量化解释执行的固定开销可能不划算
- 团队没有能力维护 C++ 扩展、函数包和上层引擎适配层

## 历史小故事（可跳过）

- **2013 年左右**：Presto 在 Meta 内部支撑大量交互式 SQL，worker 侧 CPU 成为重要成本。
- **2010s 后期**：Spark、流处理、入仓、特征工程和机器学习预处理各自长出执行逻辑，重复实现越来越多。
- **2022 年**：Velox 论文在 PVLDB 发表，把它描述为开放的 C++ 数据库加速库，而不是某个单一产品。
- **论文实验**：Prestissimo 在真实交互分析流量中平均约 6-7 倍加速，并用约三分之一服务器承载同等或更好体验。
- **后续方向**：作者希望把 AI 数据预处理、硬件专用化、Substrait 这类计划表示和更自治的执行策略接起来。

## 学到什么

- **统一不是抹平差异**：前端语言、优化器、调度和容错可以不同，但执行积木可以共享。
- **性能优化需要民主化**：SIMD、lazy materialization、谓词重排、缓存、spill，不该只存在于某一个明星引擎里。
- **语义一致性也是基础设施收益**：同一套函数和类型被多处复用，用户少踩“这个引擎和那个引擎不一样”的坑。
- **工业论文的价值在边界**：Velox 最值得学的是它清楚地说“我做本机执行，不做全局优化”。

## 延伸阅读

- 论文 PDF：[Velox: Meta's Unified Execution Engine](https://www.vldb.org/pvldb/vol15/p3372-pedreira.pdf)
- [[duckdb]] —— 对比一个完整嵌入式数据库，能看清 Velox 为什么只做执行库
- [[volcano]] —— Velox 的 pipeline/driver 模型是在经典 Volcano iterator 之外重新组织执行状态
- [[columnar-storage-formats-2023]] —— ORC、Parquet、列式布局是理解 Velox I/O 和 Vector 的前置知识
- [[fastlanes-compression-layout]] —— 图谱里相关的后续列式压缩工作，关注 SIMD 与未来硬件适配
- [[accelerating-presto-with-gpus]] —— 图谱里相关的后续 Presto/Velox GPU 加速方向

## 关联

- [[codd-1970]] —— 关系模型定义了 SQL 世界的抽象，Velox 处理其中一部分物理执行。
- [[cstore-2005]] —— 列存系统说明为什么按列处理能让分析查询更快。
- [[arrow]] —— Velox Vector 与 Arrow 列式格式相近，但为了执行效率做了扩展。
- [[duckdb]] —— 同样强调向量化执行，但 DuckDB 面向完整数据库，Velox 面向被集成。
- [[volcano]] —— 经典查询执行模型，论文用它解释为什么 Velox 的 Driver 状态更适合暂停和恢复。
- [[pandas]] —— TorchArrow 这类 DataFrame 前端可以把结构化预处理下沉给 Velox。
- [[vector]] —— 向量化批处理是 Velox 把 CPU 利用率拉上去的基本动作。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
