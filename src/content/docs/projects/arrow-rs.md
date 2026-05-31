---
title: arrow-rs — Apache Arrow / Parquet 的 Rust 参考实现
来源: 'https://github.com/apache/arrow-rs'
日期: 2026-06-01
分类: 数据库
难度: 中级
---

## 是什么

`apache/arrow-rs` 是 Apache Arrow 列式格式与 Parquet 文件格式的 **Rust 官方实现**——把 [[arrow]] 那份"内存里一张表长什么样"的标准，用 Rust 写成一套可直接 `cargo add` 的 crate 集合。

日常类比：[[arrow]] 是国际标准（公制螺纹规范），arrow-rs 是某国按这份规范造的全套螺丝、扳手、车床。其他 Rust 项目要用列存就直接拿这套工具，不用自己再造。

它在 Rust 数据生态的位置可以一句话概括：**底层的底层**——

```
DataFusion / InfluxDB 3.0 / Lance / Polars   ← 应用层（查询引擎、时序库、向量库）
            ↓ 全部依赖
        arrow-rs                              ← 列存内存 + Parquet IO
            ↓
       Rust std + tokio                       ← 语言运行时
```

仓库本身按"小而专"拆分，主要 crate：

- `arrow-array` —— 列数据数组类型（Int32Array、StringArray 等）
- `arrow-buffer` —— 底层连续内存 buffer + null 位图
- `arrow-schema` —— DataType / Field / Schema 定义
- `arrow-cast` / `arrow-arith` / `arrow-string` —— compute kernel
- `parquet` —— Parquet 列式文件读写（含异步 IO）
- `arrow-flight` —— gRPC 流式传输

## 为什么重要

不理解 arrow-rs，下面几件事都解释不了：

- 为什么 [[datafusion]] 能写几千行 Rust 就追上 C++ 引擎的性能——它把内存模型、kernel、IO 全外包给 arrow-rs
- 为什么 InfluxDB 3.0 整组重写选 Rust：核心赌的是 arrow-rs + DataFusion 这一栈
- 为什么 Lance / LanceDB 这种 AI 向量库不用 protobuf 而直接落 Parquet：因为 arrow-rs 的 `parquet` crate 异步、零拷贝、扩展友好
- 为什么 [[polars]] 早期用 `arrow2`（社区分叉），近年又有项目回流到 arrow-rs：官方实现的 schema 演进与 ecosystem 收敛

## 核心要点

arrow-rs 的设计哲学三条：

1. **零开销抽象 + 类型安全**：每种 Arrow 数据类型对应一个 `*Array` Rust 结构，编译期决定 layout。读 `Int32Array[i]` 不走虚函数，直接 `unsafe { *ptr.add(i) }`，但接口安全。

2. **Buffer 即 Bytes**：所有列数据都建在 `Buffer`（一段引用计数的连续内存）之上。零拷贝克隆、可与 `bytes::Bytes` 互转，方便走网络或 mmap。

3. **小 crate + 公开接口**：避免单巨型 crate。下游可以只引 `arrow-schema` 写 schema 工具、不用拖整个 compute 模块。这跟 C++ 单 monolithic `libarrow.so` 的风格相反。

代码示意：

```rust
use arrow_array::{Int32Array, RecordBatch};
use arrow_schema::{DataType, Field, Schema};
use std::sync::Arc;

let schema = Arc::new(Schema::new(vec![
    Field::new("id", DataType::Int32, false),
]));
let id = Int32Array::from(vec![1, 2, 3]);
let batch = RecordBatch::try_new(schema, vec![Arc::new(id)]).unwrap();
```

## 实践案例

### 案例 1：[[datafusion]] 用它当内存模型

DataFusion 是 Rust 写的 SQL 查询引擎（Apache 顶级项目）。它的 `RecordBatch` 直接是 arrow-rs 的类型，physical operator 全部对 `Vec<ArrayRef>` 操作。**没有自定义内存格式**——因为 Arrow 已经够好。

这意味着 DataFusion 输出的结果可以**零拷贝**喂给 PyArrow、Polars 或者通过 Flight 发往别的进程。

### 案例 2：InfluxDB 3.0 用它落盘 Parquet

InfluxDB 团队 2023 年宣布重写为 Rust，核心栈是 `arrow-rs` + DataFusion。时序数据按时间分块写成 Parquet 文件，查询时 `parquet` crate 的 async API 流式读取，filter pushdown 由 DataFusion 完成。

为什么不自己造文件格式？答：Parquet 已经在 Spark / Trino / Snowflake 生态里跑了十年，arrow-rs 把它的 Rust 实现做到了 production-grade。

### 案例 3：Lance —— AI 向量数据库的 Parquet 替代

Lance 的存储格式是 Parquet 的近亲，但加了"向量列"和"行级随机读"。Lance 团队最早用 arrow-rs 的 `parquet` crate 做对照基线，再 fork 出自己的 Lance 文件格式。如今依旧依赖 `arrow-array` / `arrow-schema` 当通用列容器。

## 踩过的坑

1. **版本节奏快，破坏性变更频繁**——arrow-rs 大约每月一版，DataType / array 接口偶尔重排。生产项目锁版本（如 `arrow = "53.0"`）并集中升级，不要散在各 Cargo.toml。

2. **`Array` 和 `ArrayRef` 类型层次复杂**——`dyn Array` / `Arc<dyn Array>` / 各 `*Array` 具体类型来回 cast 是新人最大的卡点。学会 `as_any().downcast_ref::<Int32Array>()` 是必经一步。

3. **`unsafe` 用得不少**——为了零开销，arrow-rs 内部大量 `unsafe { ptr_offset }`。普通用户不会碰，但读源码要有心理准备：它不是那种"零 unsafe 才纯 Rust"的项目。

4. **Parquet 的 schema 演进很微妙**——同一个逻辑列在 Arrow / Parquet / Spark 三个世界 type 名字不同（如 timestamp 时区、decimal 精度）。arrow-rs 提供 `parquet_to_arrow_schema` 等转换，但仍要 case-by-case 验证。

5. **编译时间偏长**——一次完整 build `arrow` + `parquet` + `arrow-flight` 在普通笔记本能要 3-5 分钟。
   开发期建议用 `cargo check` 做主要反馈循环，`--release` 留给最后 benchmark。

## 适用 vs 不适用场景

**适用**：

- 写 Rust 的 OLAP 引擎、时序库、向量库——直接用，不要重造 RecordBatch
- 需要在 Rust 进程里读写 Parquet / Arrow IPC / Flight 流
- 想跟 PyArrow / Polars / DuckDB 零拷贝交换数据
- 需要 SIMD 加速的数值计算 kernel（`arrow-arith` 已封装好）

**不适用**：

- 行级 OLTP 更新——列存先天不擅长，arrow-rs 也不会救你
- 嵌入式 / no_std 环境——arrow-rs 依赖 alloc 与多线程
- 想要"零依赖、最小化"——它带来一长串 transitive crate
- 要做 schemaless JSON 流——Arrow 必须先有 schema

## 历史小故事（可跳过）

- **2018 年**：Apache Arrow 首版含 Rust 实现，但在 `apache/arrow` 单仓库里和 C++ / Java / Go 共存。
- **2021 年**：Rust 实现迭代节奏与其他语言不同步，独立成 `apache/arrow-rs` 仓库。同年 DataFusion 也独立成 `apache/arrow-datafusion`。
- **2022 年**：[[polars]] 选择 `arrow2`（社区分叉，Jorge Leitao 主导）追求更激进的 API。生态出现两套 Arrow Rust 实现并存。
- **2023 年**：InfluxDB 3.0 重写公告，把 arrow-rs + DataFusion 推到 production 主舞台。
- **2024-2025 年**：arrow2 维护放缓，多个项目（含部分 Polars 模块）回流到 arrow-rs。官方实现成事实标准。

## 学到什么

1. **格式 vs 实现要分层**——[[arrow]] 是规范（多语言），arrow-rs 是其中 Rust 一支；理解了这层关系才看得懂为什么有 `arrow2` 这种平行实现
2. **Rust 在数据系统的合法性**——arrow-rs + DataFusion 这一栈让"用 Rust 重写 OLAP 引擎"从口号变成可行路径
3. **小 crate 主义**——把 buffer / array / schema / compute / parquet 拆开，下游按需引入；这是 Rust 生态的典型做法，也是它能比 C++ 库轻量的原因
4. **官方实现胜在生态**——arrow2 性能不弱，但版本对齐、CVE 响应、跨语言互操作上输给官方版

## 延伸阅读

- 官方仓库：[apache/arrow-rs](https://github.com/apache/arrow-rs) —— 含完整 crate 列表与 release note
- 官方 docs.rs：[arrow](https://docs.rs/arrow/) / [parquet](https://docs.rs/parquet/) —— API 参考
- DataFusion 文档：[Architecture](https://datafusion.apache.org/contributor-guide/architecture.html) —— 看 arrow-rs 在查询引擎里如何被用
- 视频：[Andrew Lamb — DataFusion: An Embeddable Query Engine](https://www.youtube.com/watch?v=Z_lV1xJ6iaU) —— InfluxData 主导者讲全栈
- [[arrow]] —— 上游格式规范，本笔记的母概念

## 关联

- [[arrow]] —— Apache Arrow 列式格式标准，本仓库的语义来源
- [[pyarrow]] —— Arrow 的 Python 绑定，与 arrow-rs 通过 IPC / FFI 零拷贝互通
- [[datafusion]] —— Rust SQL 查询引擎，arrow-rs 最重要的下游
- [[polars]] —— Rust 列存 DataFrame，早期用 arrow2，部分模块回流到 arrow-rs
- [[duckdb]] —— C++ OLAP 引擎，通过 Arrow C Data Interface 与 arrow-rs 互通
- [[parquet-format]] —— Parquet 文件格式，arrow-rs 的 `parquet` crate 实现它

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
