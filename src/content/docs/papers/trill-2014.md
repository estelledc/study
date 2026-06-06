---
title: Trill — 一个引擎同时跑流、批、交互三种分析
来源: 'Chandramouli et al., "Trill: A High-Performance Incremental Query Processor for Diverse Analytics", VLDB 2014/2015'
日期: 2026-05-30
子分类: 存储与查询
分类: 数据库
难度: 中级
provenance: pipeline-v3
---

## 是什么

Trill 是 Microsoft Research 在 VLDB 2014 提出的一个**嵌入式查询引擎**，最大卖点是：**同一份代码、同一个 API，可以同时处理三种过去要装三套系统才能做的活**——

1. **实时流**（毫秒延迟，像监控告警）
2. **离线批**（吞吐至上，像跑昨天的报表）
3. **渐进式交互**（用户拖时间轴看曲线，结果一边走一边加细）

日常类比：以前你家有三种锅——煎锅炒鸡蛋（流）、汤锅炖排骨（批）、电饭煲焖饭（渐进）。Trill 像一个**多模电饭煲**，拨个旋钮就在三种火力之间切，菜谱（query）只写一遍。

它**不是 server，是一个 .NET 库**——直接 `using Microsoft.StreamProcessing;` 就嵌进你的应用，单进程内就能跑。这一点和 DuckDB 如出一辙：把"高性能查询引擎"做成可嵌入的依赖，用户不用搭 cluster 就能享用。

## 为什么重要

不理解 Trill，下面这些事都没法解释：

- 为什么 2014 年 Microsoft 的 Bing、Azure 监控都开始用同一个引擎——而不是 Storm + Hive + 交互式 BI 三套
- 为什么后来 Flink、Materialize 都把"批是流的特例"当成自己的设计口号——Trill 是这条路的早期实证
- 为什么 columnar 列式存储（OLAP 才用）能用到流处理上——传统流是"一条事件来一条处理"，怎么列得起来
- 为什么 Trill 的吞吐能比同期 StreamInsight、Storm 高 **2-4 个数量级**（论文实测数字）
- 为什么"嵌入式查询引擎"在工业界又火起来（DuckDB / Polars / Arrow Datafusion）——Trill 是这条思路在流处理上的早期范例

## 核心要点

> 一句话：把 OLAP 列存 + 向量化批处理 + 增量计算这三个本来分别住在 OLAP / 编译器 / 流处理三个领域的招式打包到一个引擎里。

Trill 的三块招牌技术：

1. **Columnar batched events（列式批处理事件）**：不是"一条事件来一条算"，而是**攒一批**（比如 80000 条）再算，且每个字段单独成列。例如 100 条点击事件的 `timestamp` 是一根连续 `long[]`，`url` 是一根连续 `string[]`。CPU 能 SIMD、cache 命中率暴涨。一批里还附一个 `bitvector` 标记哪些位置被 filter 干掉了，避免真删数据——后续算子直接跳过。

2. **可调 punctuation（标点）策略**：punctuation 是流里的"水位线"——告诉系统"在我之前的事件都到齐了，可以出结果"。Trill 让你自己调标点的频率：调密 → 延迟低（μs 级）但吞吐低；调疏 → 吞吐高（百万条/秒）但延迟高。**同一份 query，调旋钮就能在两端之间滑动**。这就是论文标题里"diverse analytics"的来源——一个引擎覆盖几个数量级的延迟谱。

3. **Tempo-relational 时间数据模型**：每个事件带一个时间区间 `[Vs, Ve)`（valid start / valid end）。所有算子既懂时间又懂关系——`Window` / `Join` / `GroupApply` 在时间维度上自动对齐。**事件是有"寿命"的关系元组**。一个 `Click(user=u, ts=10s, lifetime=∞)` 和一个 `Logout(user=u, ts=20s)` 做时间 join，就能算出"登出前最后一次点击"。

加成项：用 **Roslyn 动态代码生成**——根据 query 形状现场编译一份特化版的 operator，省掉所有运行时分发开销。这一招让 Trill 即便在 .NET 这种带 GC 的运行时上也能逼近手写 C 的吞吐。

## 实践案例

### 案例 1：同一份代码切流和批

```csharp
// 流模式：从 Kafka 拉，0.5 秒延迟出结果
var stream = source.ToStreamable(disorderPolicy: DisorderPolicy.Drop(),
                                 punctuationPolicy: PeriodicPunctuationPolicy.Time(500));
var result = stream.Where(e => e.value > 100)
                   .HoppingWindow(TimeSpan.FromSeconds(10), TimeSpan.FromSeconds(1))
                   .Sum(e => e.value);

// 离线模式：从历史日志读，等所有数据再出结果
var batch = histLog.ToStreamable(punctuationPolicy: PeriodicPunctuationPolicy.None());
// 同一段 .Where().HoppingWindow().Sum() 直接复用
```

切换只在 `ToStreamable` 那一行——punctuation 策略变了，**业务 query 一行不改**。这是工业界第一次用产品级的方式实现"批是流的特例"——你能用一份测试覆盖两种 deployment。

### 案例 2：列式批让你看见 CPU 在干什么

传统流处理（每条事件一个对象）：CPU cache miss 高，分发开销大，每条事件跑 200-500 ns。

Trill columnar batch：80000 条事件打包成一个 `Batch<TPayload>`，内部是 `long[] timestamps, double[] values, ...`。`Where` 退化成在 `double[]` 上跑紧凑循环，编译器能 SIMD 化。每条事件摊到 **5-10 ns**——快了 50 倍。

更妙的一点：filter 不真删数据，只在 batch 的 bitvector 上把对应位置 0。下游 join 时直接 mask-skip，省了内存复制。这种 "lazy deletion + bitvector mask" 是把 OLAP 列存的招式（如 [[cstore-2005]]、[[monetdb-x100-2005]]）原封搬到流上。

### 案例 3：渐进式交互（progressive）

用户在 BI 工具里拖时间窗看 7 天销售曲线。传统做法：每拖一次重跑全部聚合。Trill：把窗口的增量边界（左边滑出去的、右边滑进来的）单独算，未变区间复用上次结果——前端**每帧都看到结果在精化**，而不是等 5 秒看到最终值。这就是 progressive query。

底层机制是 retraction（撤回）：当一个事件"过期"，Trill 不是删它，而是发一条 retract record `(payload, -1)` 让下游算子做减法。聚合算子看见 `+1, +1, -1, +1` 就累加成 +2，整条链全程**只算 delta，不重算全集**。这是 Trill 比传统 GroupBy 快的另一关键。

注意 retraction 不是 Trill 独创——[[self-adjusting]] 这条研究线很早就在做"输入小变只重算变化部分"，Trill 把它工程化到了流引擎里。

## 踩过的坑

1. **punctuation 选不好直接翻车**：选太密 → CPU 大半时间在发标点而不是算数据，吞吐崩；选太疏 → 用户在前端看半小时还没出第一条结果以为系统挂了。**调参不是一次完事**，要分场景写不同 policy：实时告警走 100ms 一个标点，离线回放走"全程不发标点，最后一次性 flush"。

2. **把 Trill 当 Spark 用就错位了**：Trill 是**单进程嵌入式库**，不是 cluster 调度器。要跨机分布得自己拼（Stream Engine 论文系列里有讨论）。文档里反复强调"high-performance single-node"，超过一台机的吞吐瓶颈得换工具。Microsoft 内部用 Trill 时也是按 shard 拆到多机，每机各跑一个 Trill 实例。

3. **三个时间容易混**：`event time`（事件实际发生时间）、`application time`（业务定义的时间）、`processing time`（数据到达系统时间）——Trill API 里都暴露名字，写错就出 silent bug（结果数字看起来对其实窗口对错了）。建议刚上手统一只用 event time，等熟了再分。

4. **.NET LOH（大对象堆）压力**：batch size 调大命中率高，但 batch 数组一过 85KB 就掉进 LOH，GC 不压缩 → 内存碎片 → 长跑后吞吐缓慢下降。需要 batch size 调到刚好不破 85KB 那个点。这种"被 runtime 暗算"的细节是 Trill 的工程亮点，也提醒我们：高性能系统的最后一公里都在 runtime 层。

5. **代码生成出错难调试**：Roslyn 生成的特化 operator 代码用户看不到，出问题往往得 dump 出生成代码再读。论文提到团队提供了 `Config.GenerateCodeForUserCode = false` 的开关，关掉就退化成解释执行版本，便于排查——生产环境记得保留这个 fallback 开关。

6. **disorder（乱序）容忍要选好策略**：现实中事件可能迟到。Trill 提供 `DisorderPolicy.Drop()`（直接丢）/`Adjust()`（按 watermark 拉齐）/`Throw()`（异常）。选 Drop 数据少了你不知道；选 Adjust 时间语义被动；选 Throw 一旦真乱序整条流挂掉。开发期建议 Throw（暴露问题），生产期看业务容忍度切。

## 适用 vs 不适用场景

**适用**：

- 单机/少机的高吞吐流处理（Bing 遥测、Azure 监控这一类）
- 同一套 query 既要实时又要回放历史的场景——Trill 一份代码搞定
- 渐进式交互查询（BI、可视化）——按区间增量算
- .NET / C# 技术栈（原生集成）
- 离线分析想榨干单机性能：批量 + columnar + 代码生成三位一体

**不适用**：

- 跨机大规模分布式（→ Flink / Spark Streaming / Beam）
- JVM 生态（→ Flink）
- 超低延迟（μs 以下）—— Trill 在 ms 量级最甜，再低就要专用硬件
- 简单的"日志聚合一下"小活——上 Trill 太重，直接 SQL/awk 就够
- 强一致跨机事务流处理（→ Calvin / Spanner-like 系统）

## 历史小故事（可跳过）

- **2003 年**：Aurora（Stonebraker）首次给"流也是关系"的思路，提出时间区间事件
- **2008 年**：Microsoft Research 启动 CEDR（Complex Event Detection and Response）项目，奠定了"事件 = 时间区间元组"的语义
- **2010 年**：Microsoft 把 CEDR 研究产品化为 StreamInsight——能跑但单线程性能瓶颈大
- **2014 年**：Chandramouli 团队推 Trill：columnar batch + 可调 punctuation + 代码生成，吞吐比前辈高 2-4 个数量级。论文 VLDB 2014 投，2015 见刊
- **2017 年**：Trill 开源到 github.com/microsoft/Trill，至今仍是 .NET 流处理的事实标准
- **2020 年代**：Materialize、Risingwave、Decodable 等"流式数据库"产品几乎都借鉴 Trill 的"批是流的特例 + 增量物化视图"思路

后来 Flink（2015）、Materialize（2019）的增量执行思路里都能看见 Trill 的影子。

## 学到什么

1. **"流 vs 批" 是工程产物，不是物理事实**——给事件加上时间区间，两者就是同一个引擎的两种 punctuation 策略
2. **列式存储不是 OLAP 专利**——只要你愿意"批量化"流，列式 + SIMD 的好处一样能吃
3. **代码生成把抽象惩罚归零**——动态特化一次，编译器帮你做剩下的事
4. **嵌入式库 vs server 的取舍**——库简单部署但吞吐有上限，server 复杂但能横扩，Trill 选了前者并做到极致
5. **API 通用性 ≠ 引擎通用性**——光是 API 一致还不够，引擎本身能在几个数量级延迟谱上滑动才算真"diverse"

## 延伸阅读

- 论文 PDF：[Trill VLDB 2014 paper](http://www.vldb.org/pvldb/vol8/p401-chandramouli.pdf)（核心 12 页）
- 项目主页：[Microsoft Research Trill](https://www.microsoft.com/en-us/research/project/trill/)
- 开源仓库：[github.com/microsoft/Trill](https://github.com/microsoft/Trill)（C# 实现）
- 配套读：[[dataflow-model-2015]] —— Google 团队对"统一流批"的另一种回答
- 上游列存基础：[[monetdb-x100-2005]] —— vectorized batch 处理的 OLAP 起点
- 同期对比：[[dstreams-2013]] —— Spark Streaming 走"micro-batch"的另一条路

## 关联

- [[aurora]] —— Trill 时间区间模型的祖先，最早把"流也是关系"提出来
- [[dstreams-2013]] —— 同期另一条路：把流装作小批，micro-batch 流派代表
- [[flink-2015]] —— Trill 之后的开源选手，思路相近但跨机分布、JVM 生态
- [[dataflow-model-2015]] —— Google 统一流批语义的论文，思想与 Trill 互为印证
- [[millwheel-2013]] —— Google 内部低延迟流引擎，与 Trill 同时代不同侧重
- [[monetdb-x100-2005]] —— 列式 + 向量化批处理的 OLAP 起点，Trill 把它搬到流上
- [[cstore-2005]] —— 列存 OLAP 的另一支祖先，与 MonetDB-X100 共同启发了 Trill 的 batch 设计
- [[kafka]] —— Trill 上游常见的事件源，提供 at-least-once 投递
- [[clickhouse]] —— 列存 OLAP 的现代继承者，单机吞吐哲学与 Trill 一脉相承
