---
title: duckdb-wasm — 把分析数据库塞进浏览器标签页
来源: https://github.com/duckdb/duckdb-wasm
日期: 2026-05-29
分类: 数据库
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/duckdb/duckdb-wasm
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: fa1d47b38ed0821cecab0bdc331c48abd0f2cc65
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: v1.33.0
---

## 是什么

duckdb-wasm 把 DuckDB 的分析引擎编译成 WebAssembly，让浏览器或 Node 在进程内跑 SQL。日常类比：以前要请远端仓库管理员查账，现在把账本和计算器一起放进标签页——而且读远程 Parquet 时可以只抽需要的字节范围。

你写：

```js
const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), new Worker(bundle.mainWorker));
await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
const conn = await db.connect();
const table = await conn.query("select 1 as one");
```

固定源码里，查询在 Worker 中执行，结果以 Arrow IPC 缓冲回到主线程，再被收成 `arrow.Table`。运行时依赖 `apache-arrow`。

## 为什么重要

不理解 duckdb-wasm，下面这些事都没法解释：

- 为什么同一套 JS API 要准备 mvp / eh / coi 三份 WASM
- 为什么远程文件打开会先发带 `Range` 的同步 XHR
- 为什么 OPFS 持久化走 `db.open({ path: 'opfs://...' })`，而不是只靠一条 `ATTACH`
- 为什么 JS 标量 UDF 挂在同步 `DuckDBConnection` 上，异步连接没有同名方法

## 核心要点

主链可以拆成五步：

1. **选 bundle**：`selectBundle()` 探测 WASM exception / SIMD / threads 与 `crossOriginIsolated`。有异常处理就优先 eh；同时满足线程和跨源隔离且调用方提供了 coi 才用 coi。`getJsDelivrBundles()` 只给出 mvp 与 eh，注释写明 coi 仍需显式 opt-in。

2. **Worker 实例化**：`AsyncDuckDB.instantiate(mainModule, pthreadWorker)` 把模块 URL 发给 Worker；浏览器绑定优先 `WebAssembly.instantiateStreaming`，失败再退到数组缓冲。

3. **异步消息**：主线程用递增 `messageId` 把 `CONNECT` / `RUN_QUERY` 等任务 `postMessage` 到 Worker，再用 `pendingRequests` 对回包。查询结果先从 WASM heap `copyBuffer` 拷出，再传回主线程。

4. **HTTP / S3 文件**：`BROWSER_RUNTIME` 用同步 XHR 探活与读区。注释写明 BLOB/HTTP 读取必须走 Range；`allow_full_http_reads` 默认 `true`，服务器不支持 206 时可以整文件回退。

5. **OPFS**：`open({ path: 'opfs://...' })` 时 Worker 先 `prepareDBFileHandle`，给库文件和 `.wal` 创建 `FileSystemSyncAccessHandle`，并打开 `useDirectIO`。SQL 文本里的 `opfs://` 还可按 `opfs.fileHandling` 自动登记。

## 实践示例

### 案例 1：按平台选 bundle 再查远程 Parquet

```js
import * as duckdb from "@duckdb/duckdb-wasm";

const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
const worker = new Worker(bundle.mainWorker);
const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker);
await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
const conn = await db.connect();
const table = await conn.query(
  "select count(*) as n from 'https://example.com/lineitem.parquet'"
);
console.log(table.toArray());
```

这条路径会走 HTTP 协议与 Range 探测。示例 URL 只说明 API，本文没有实际下载该文件。

### 案例 2：用 OPFS 打开可写库

```js
await db.open({
  path: "opfs://notes.db",
  accessMode: duckdb.DuckDBAccessMode.READ_WRITE
});
const conn = await db.connect();
await conn.query("create table notes(id integer, body varchar)");
await conn.query("insert into notes values (1, 'first note')");
await conn.query("checkpoint");
```

固定测试用的是 `open({ path: 'opfs://test.db' })`，关连接后再次 `open` 同一路径可以读回表。`createSyncAccessHandle` 依赖当前浏览器对 OPFS 同步句柄的限制，不能把任意静态托管环境都写成“关掉标签页数据一定还在”。

### 案例 3：同步连接上的标量 UDF

```js
import * as arrow from "apache-arrow";

conn.createScalarFunction("upper_js", new arrow.Utf8(), (s) =>
  String(s ?? "").toUpperCase()
);
const table = conn.query("select upper_js('hello') as v");
```

`createScalarFunction` 只出现在同步 `DuckDBConnection`。`AsyncDuckDBConnection` 提供 `query` / `send` / `prepare` / Arrow 插入，没有同名 UDF 方法。

## 踩过的坑

1. **jsDelivr helper 不含 coi**：需要 pthread 时必须自己提供 `bundles.coi`，并满足跨源隔离。`maximumThreads` 也注明依赖 `SharedArrayBuffer`。

2. **WASM MIME 与 streaming**：浏览器绑定先走 `instantiateStreaming`。自托管若没返回 `application/wasm`，会落到 XHR 回退；回退失败才是“一直 loading”。

3. **Range 失败不等于立刻放弃**：默认允许 full HTTP read。代理若忽略 `Range` 回 200，打开阶段可能把整文件读进 WASM heap。

4. **异步 API 不是同步 API 的薄包装**：`query()` 把完整 IPC 文件式缓冲收成 Table；`send()` 才是流式 `AsyncRecordBatchStreamReader`。大结果会经过 heap 拷贝和 `postMessage`。

5. **包版本 provenance 分裂**：GitHub release `v1.33.0` 指向本提交，但仓内 `packages/duckdb-wasm/package.json` 仍写 `1.11.0`；npm 把同一 `gitHead` 发成 `1.32.1-dev1.0`，没有 `1.33.0` 包。后继 `1.33.1-dev*` 不在本文范围内。

## 适用 vs 不适用场景

**适用**：

- 浏览器里对 Parquet / CSV / JSON 做 ad-hoc 聚合，结果用 Arrow 交给图表
- 需要按平台能力换 wasm 变体，而不是手写一套 SQL 引擎
- 用 OPFS 做可恢复的本地分析库，并且能接受同步文件句柄的环境约束

**不适用**：

- 高并发写入或多标签页抢同一 OPFS 句柄
- 必须在 `AsyncDuckDBConnection` 上注册 JS UDF
- 把未发布的 npm `latest`（本稿检索时是 `1.33.1-dev*`）当成 GitHub release
- OLTP 记事本 / 购物车 → [[sqlite]] 的行存嵌入式模型更贴

## 固定版本边界

- 本文绑定 `duckdb/duckdb-wasm@fa1d47b38...`，对应 GitHub release `v1.33.0`。
- 该提交的 npm 映射是 `@duckdb/duckdb-wasm@1.32.1-dev1.0`，不是 `1.33.0`；仓内 package version 仍为 `1.11.0`。
- 浏览器默认入口是 `dist/duckdb-browser.mjs`；Node 入口是 `dist/duckdb-node.cjs`。同步 API 在 `./blocking`。
- 核心依赖 `apache-arrow@^17.0.0`。C++ 侧通过 submodule 编进 DuckDB，并默认带 `json` 与 `core_functions` 扩展。
- 本文未实例化 WASM、未发 Range 请求、未跑 karma/jasmine，状态保持 `UNVERIFIED`。

## 学到什么

1. **浏览器分析库的合同在 Worker 边界**——主线程看到的是消息和 Arrow 表，不是 C++ 执行器本身。
2. **能力探测决定下载哪份机器码**——eh / coi 不是别名，缺特征就回落到 mvp。
3. **远程列存能成立，是因为运行时先问 Range**——格式和 HTTP 语义绑在一起。
4. **发布标签、仓内 version 与 npm dist-tag 可能对不齐**——只能绑 commit，不能猜包名。

## 应用型自测

1. `getJsDelivrBundles()` 在支持线程的浏览器里会自动返回 coi 吗？
2. `AsyncDuckDBConnection` 上能否调用 `createScalarFunction`？
3. 远程文件的服务器忽略 `Range` 并回 200 时，默认会失败还是整文件回退？

检查点：

1. 不会。helper 只提供 mvp/eh；coi 必须调用方显式传入。
2. 不能。该方法只在同步 `DuckDBConnection` 上。
3. 默认 `allow_full_http_reads` 为 true，打开阶段可以整文件回退。

## 延伸阅读

- 启动说明：[DuckDB-Wasm launch post](https://duckdb.org/2021/10/29/duckdb-wasm.html)
- 固定源码：[duckdb/duckdb-wasm](https://github.com/duckdb/duckdb-wasm) —— 本文绑定提交 `fa1d47b38ed0821cecab0bdc331c48abd0f2cc65`
- 论文：[DuckDB-Wasm: Fast Analytical Processing for the Web](https://www.vldb.org/pvldb/vol15/p3574-kohn.pdf)
- [[duckdb]] —— 同一引擎的本地/服务端形态
- [[sqlite]] —— 浏览器 SQL 的行存对照

## 关联

- [[duckdb]] —— WASM 包装的本体引擎
- [[sqlite]] —— OLTP / 行存嵌入式对照
- [[clickhouse]] —— 只能在 server 跑的列存对照
- [[vite]] —— 文档给出的 worker / wasm URL 接入方式之一
- [[postgresql]] —— 行存客户端协议对照，见 [[postgres-js]]

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[evidence]] —— Evidence — 把 Markdown + SQL 编译成静态报告站
- [[kuzu]] —— Kùzu — 把图数据库做成 DuckDB
- [[sqlite]] —— SQLite — 嵌入式 SQL 数据库
- [[wasmer]] —— Wasmer — 把 wasm 当成轻量容器到处跑
