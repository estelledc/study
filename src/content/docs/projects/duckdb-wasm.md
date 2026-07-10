---
title: duckdb-wasm — 把分析数据库塞进浏览器标签页
来源: 'duckdb/duckdb-wasm v1.33.0, 2025-12 读, MIT'
日期: 2026-05-29
分类: 数据库
难度: 中级
---

## 是什么

duckdb-wasm 是**把 DuckDB（一个 C++ 写的列式分析数据库）编译成 WebAssembly，让浏览器里直接跑 SQL** 的项目。日常类比：你以前要去图书馆查资料（数据在 server 上），现在图书馆**搬进了你的桌子抽屉**（浏览器）——而且不需要把整个书架搬回来，只翻你要的那几页。

你写：

```javascript
const result = await conn.query(`
    SELECT region, sum(sales) FROM 'https://cdn.example.com/big.parquet'
    GROUP BY region
`)
```

浏览器在 Web Worker 里跑这个 SQL，按需通过 HTTP Range 请求只下载需要的字节范围。一个 100MB 的 parquet 文件，可能只下了 5MB 数据就给出结果。

## 为什么重要

不理解 duckdb-wasm，下面这些事都没法解释：

- 为什么 [shell.duckdb.org](https://shell.duckdb.org/) 一打开就能跑分析查询，不需要后端
- 为什么 BI dashboard 现在能做"无 server 部署"——把 parquet 放 CDN，前端直接查
- 为什么 sql.js（SQLite 编译进 WASM）跑分析型聚合常慢一个数量级，而 duckdb-wasm 用列存更合适
- 为什么"浏览器里的数据库"这件事在 2021 年前后才真正可用——WASM + 列存 + HTTP Range 三件齐全

## 核心要点

duckdb-wasm 的能力可以拆成 **三层**：

1. **WASM 把 C++ 数据库装进浏览器**：用 Emscripten 把 DuckDB 的 C++ 代码编译成 `.wasm` 文件（约 7MB 未压缩，2-3MB gzip）。类比：把整个图书馆压缩成一个文件，浏览器下载完就能用。

2. **Web Worker 让查询不卡主线程**：所有 SQL 在 Worker 里跑，主线程只负责发请求等结果。WASM 是同步执行的，重查询不放 Worker 会冻死页面。类比：让数据库管理员去后台干活，前台还能继续接待用户。

3. **HTTP Range 按需读 parquet**：parquet 是列式 + 分块 + 自带 metadata 的格式。duckdb-wasm 先用 HTTP Range 读 metadata（拿到每列每块的位置），根据 WHERE 条件 prune 掉不需要的块，只下载命中的字节。类比：去图书馆只翻目录页找到要的章节，再单独借那几页，不搬整本书。

## 实践案例

### 案例 1：浏览器里直接查 100MB 远程 parquet

```javascript
import * as duckdb from '@duckdb/duckdb-wasm'

const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles())
const worker = new Worker(bundle.mainWorker)
const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker)
await db.instantiate(bundle.mainModule, bundle.pthreadWorker)
const conn = await db.connect()

const result = await conn.query(`
    SELECT count(*) FROM 'https://shell.duckdb.org/data/tpch/0_01/parquet/lineitem.parquet'
`)
console.log(result.toArray())
```

打开 Network 面板会看到多个 `Range: bytes=L-R` 的请求，每个只下几 KB。

### 案例 2：用 OPFS 持久化一个本地数据库

```javascript
const conn = await db.connect()
await conn.query(`ATTACH 'opfs://my.db' AS local (READ_WRITE)`)
await conn.query(`CREATE TABLE notes(id INT, body VARCHAR)`)
await conn.query(`INSERT INTO notes VALUES (1, 'first note')`)
// 关掉 tab 再打开，数据还在
```

OPFS（Origin Private File System）是浏览器的"沙箱文件系统"。要求页面用 COOP+COEP 头开启跨源隔离，否则同步文件 API 不可用。

### 案例 3：注册一个 JS 标量 UDF

```javascript
import * as arrow from 'apache-arrow'
// 在同步连接 / Worker bindings 上注册（不是 CREATE FUNCTION SQL）
conn.createScalarFunction(
  'upper_js',
  new arrow.Utf8(),
  (s) => String(s ?? '').toUpperCase()
)
const result = conn.query(`SELECT upper_js('hello world') AS v`)
// → 'HELLO WORLD'
```

逐步解释：先声明返回类型（Arrow `Utf8`），再传入 JS 回调；之后 SQL 里就能当普通函数调用。适合日期解析、字符串清洗等 SQL 不好写的格式化。

## 踩过的坑

1. **Bundle 必须用 application/wasm MIME**：自托管时 server 配错 MIME 会让 `WebAssembly.instantiateStreaming` 失败、降级到 XHR、再失败成"无限 loading"。检查 `Content-Type: application/wasm`。

2. **Range request 要 server 真支持**：CDN 必须真实返回 206 Partial Content。某些反向代理会忽略 `Range` 头返回 200 全文件，duckdb-wasm 会退化为依赖浏览器缓存——首次查询会下载全文件。

3. **OPFS 持久化要 COOP+COEP 头**：跨源隔离需要 `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`。GitHub Pages / 公共 CDN demo 一般配不上，导致 reload 后数据丢失。

4. **Worker 才能同步 XHR**：所有底层 IO 走同步 XHR（WASM 同步语义硬约束）。主线程禁用同步 XHR 多年，所以 query 必须走 Worker。"我就想 5 行代码同步跑个 SELECT"做不到。

5. **大结果集走两次内存拷贝**：query 结果走 WASM heap → Worker Uint8Array → postMessage → 主线程，每段都是复制。100MB 结果 = 200MB 临时 RAM 消耗 + 几百 ms 延迟。`SELECT *` 大表是延迟杀手，应该用 `LIMIT` 或聚合后再回主线程。

## 适用 vs 不适用场景

**适用**：
- Dashboard / ad-hoc analytics / parquet 文件浏览（典型甜区：1MB-100MB OLAP）
- 替代手写 Papa Parse + d3.group 做前端数据聚合，让 SQL `GROUP BY` 跑掉
- Notebook-style 学习站、SQL playground、零 server demo
- 跨多数据源（csv + parquet + json）的 ad-hoc join

**不适用**：
- OLTP 场景（笔记 app / 购物车 / 本地待办）→ SQLite WASM 更合适，行存 + 1MB bundle
- GB+ 级数据 → WASM 寻址上限 ~2GB（32-bit 限制），超过必须 server
- 高并发事务 / 持续写入 → duckdb-wasm 单 Worker 模型不是为此设计
- 必须脱机但环境配不上 COOP+COEP → 用 IndexedDB + 业务 serialization 更稳

## 历史小故事（可跳过）

- **2014 年**：sql.js 把 SQLite 编译进 WASM，第一次让浏览器跑 SQL。但 SQLite 是行存，分析查询慢
- **2018–2020 年**：Emscripten 能稳定编译大型 C++；Web Worker / Fetch 流式能力够用，但浏览器本地持久化仍靠 IndexedDB 等旧方案
- **2021 年**：DuckDB 团队（CWI 衍生）启动 duckdb-wasm，André Kohn 主导；同年前后 OPFS 才进入 Chromium
- **2022-2024 年**：HTTP Range 读 parquet 成核心场景；shell.duckdb.org 上线；OPFS 持久化逐步可用
- **2025 年 12 月**：v1.33.0 发布，基于 DuckDB v1.5.3，每周持续 commit

项目至今活跃，2000+ star，三个主要 variant（mvp / eh / coi）让用户根据浏览器能力选最小 bundle。

## 学到什么

1. **数据库可以脱离 server**：浏览器 + WASM + HTTP Range 三件齐全后，"在客户端跑分析查询"第一次成立。这件事 5 年前是不可想象的
2. **同步 XHR 在 Worker 里仍然有用**：被主线程废弃多年的 API，因为 WASM 同步语义反而成为 duckdb-wasm 的核心机制
3. **列存 vs 行存的选择决定 OLAP 性能**：sql.js 慢不是因为 SQLite 写得不好，是因为 OLAP 本来就该用列存
4. **格式比代码更重要**：parquet 自带 metadata + 分块的设计，是 HTTP Range 部分读取能成立的前提；CSV 永远做不到这件事

## 延伸阅读

- 视频：[DuckDB-Wasm: Bringing OLAP to the Browser (CIDR 2022)](https://duckdb.org/2021/10/29/duckdb-wasm.html) — 项目 manifesto，30 分钟讲清整个设计动机
- 论文：[DuckDB-Wasm: Fast Analytical Processing for the Web](https://www.vldb.org/pvldb/vol15/p3574-kohn.pdf) — VLDB 2022，PDF 12 页
- 实践教程：[DuckDB-Wasm 官方文档](https://duckdb.org/docs/api/wasm/overview) — 各种 bundler（vite / webpack / esbuild）接入示例
- [[duckdb]] —— 同一个引擎的服务端版本
- [[sqlite]] —— 浏览器 SQL 的另一条路（OLTP 主场）
- [[clickhouse]] —— 服务端列存 OLAP 数据库

## 关联

- [[duckdb]] —— duckdb-wasm 的本体，C++ 主仓 submodule 进 WASM 编译
- [[sqlite]] —— 浏览器 SQL 的前辈和 OLTP 替代品，对比看出列存 vs 行存的设计差异
- [[clickhouse]] —— 同样是列存 OLAP，但只能 server 跑——对比凸显"浏览器内 OLAP"的稀有
- [[vite]] —— 接入 duckdb-wasm 最常用的 bundler，处理 worker / wasm 资源
- [[postgresql]] —— 传统关系型代表，行存 OLTP 标杆，与 duckdb 哲学相反

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[clickhouse]] —— ClickHouse — 列式 OLAP 数据库
- [[duckdb]] —— DuckDB — 嵌入式列存 OLAP
- [[evidence]] —— Evidence — 把 Markdown + SQL 编译成静态报告站
- [[kuzu]] —— Kùzu — 把图数据库做成 DuckDB
- [[postgresql]] —— PostgreSQL — 工业级关系数据库
- [[sqlite]] —— SQLite — 嵌入式 SQL 数据库
- [[vite]] —— Vite — 浏览器自己加载源码的构建工具

