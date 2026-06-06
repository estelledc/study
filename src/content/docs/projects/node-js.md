---
title: Node.js — 服务端 JS 运行时之父
description: V8 上的 JavaScript 服务端运行时，事件循环 + libuv
来源: 'https://github.com/nodejs/node'
日期: 2026-06-06
分类: 编译器
子分类: 语言运行时
难度: 中级
provenance: pipeline-v3
---

## 是什么

**Node.js** V8 上的 JavaScript 服务端运行时，事件循环 + libuv。

日常类比：像单线程超级服务员：同时招呼很多桌，但厨房活委托给帮手。

典型用法：克隆仓库读 README，跑官方最小示例，再对照源码目录理解模块边界。

## 为什么重要

- 学事件循环与异步 I/O
- npm 生态与工具链
- 对照 [[deno]] 安全模型
- 全栈与 CLI 工具

## 核心要点

1. **架构分层**：先分清 UI/核心库/IO 边界，再读入口 main。
2. **数据流**：跟踪一份输入如何变成输出（帧、包、tensor）。
3. **依赖**：看清系统库与第三方，避免装错环境。
4. **扩展点**：插件、配置、钩子在哪里暴露。
5. **运维**：日志、指标、崩溃复现路径。

## 核心架构

Node.js 的核心由三层构成，层层协作支撑非阻塞 I/O：

**V8 JavaScript 引擎**：Google 开源的 JIT 编译 JS 引擎，将 JS 代码编译成机器码执行。Node.js 内嵌 V8 并通过 C++ 层（node_binding）暴露文件系统、网络等系统 API 给 JS 层。V8 提供垃圾回收（Scavenger + Mark-Compact）、内联缓存（IC）和隐藏类优化（Hidden Class）。

**libuv 事件循环**：libuv 是跨平台异步 I/O 库，实现 Node 的事件循环（Event Loop）核心：

- 六个阶段依次执行：timers → pending callbacks → idle/prepare → poll → check → close callbacks
- I/O 操作（磁盘读写）委托给线程池（默认 4 线程，UV_THREADPOOL_SIZE 可调）
- 网络操作在 Linux 使用 epoll，macOS 使用 kqueue，Windows 使用 IOCP
- `process.nextTick` 队列和 Promise microtask 队列在每个阶段切换时优先清空

**Node API（N-API）**：稳定的 C/C++ 原生扩展接口，使 native addon 跨 Node 版本兼容，无需重新编译。

**关键并发模式**：

- **EventEmitter**：发布/订阅模式基础，`events.EventEmitter` 贯穿 Stream、HTTP、fs 等核心模块。
- **Stream API**：基于 EventEmitter 的流式数据处理抽象（Readable/Writable/Duplex/Transform），内置背压（backpressure）控制，防止快速生产者压垮慢速消费者。
- **Worker Threads**：Node v10.5+ 引入，通过 SharedArrayBuffer 和 MessageChannel 实现多线程共享内存，适合 CPU 密集型任务（图像处理、加解密）。
- **Cluster**：多进程 Fork 模式，每个 Worker 监听同一端口，内核轮询分配连接，利用多核 CPU。

## 性能与规格

**HTTP 吞吐量对比**（4 核机器，wrk 基准，Keep-Alive 连接）：

| 框架 | QPS（参考值） | 延迟 P99 |
|------|------------|---------|
| 原生 http 模块 | ~65,000 | ~8ms |
| Fastify | ~75,000 | ~7ms |
| Express | ~40,000 | ~12ms |
| Hono（v4） | ~80,000 | ~6ms |

- **内存**：典型空 Node 进程启动约 35~50MB RSS；每个活跃 HTTP 连接约增加 1~2KB。
- **冷启动时间**：`node index.js` 冷启动约 30~80ms（视模块数量），适合长驻进程，不适合高频冷启动（参考 Deno 或 Bun）。

## 代码示例

**事件循环阶段演示**：

```js
// macrotask（setTimeout）vs microtask（Promise）优先级
setTimeout(() => console.log('setTimeout'), 0);
Promise.resolve().then(() => console.log('Promise microtask'));
process.nextTick(() => console.log('nextTick'));
// 输出顺序: nextTick → Promise microtask → setTimeout
```

**Stream pipe 示例（文件压缩）**：

```js
import { createReadStream, createWriteStream } from 'fs';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';

// pipeline 自动处理背压与错误传播，替代手动 .pipe()
await pipeline(
  createReadStream('input.log'),
  createGzip(),
  createWriteStream('output.log.gz')
);
```

## 实践案例

### 案例 1：最小可运行

```bash
git clone <repo-url>
cd node-js
# 按官方文档安装依赖后运行 demo
```

对照 README 的参数表，改一个选项观察输出变化。

### 案例 2：读源码入口

从 `main` / `CMakeLists.txt` / `package.json` 找模块图；画一张三框数据流草图。

### 案例 3：与邻居项目对照

对照 [[deno]] 的实现差异：协议、语言、部署形态各写一条笔记。

### 案例 4：接入自己的管线

把输出接到下游（播放器、训练 DataLoader、会议客户端），记录延迟与格式约束。

### 案例 5：Worker Threads 加速 CPU 密集任务

将大文件 MD5 计算从主线程移到 Worker Threads：

```js
// worker.js
import { workerData, parentPort } from 'worker_threads';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
const hash = createHash('md5').update(readFileSync(workerData.path)).digest('hex');
parentPort.postMessage(hash);
```

对比单线程与 4 Worker 并行处理 100 个大文件的耗时差异，理解线程通信开销与并行收益的平衡点。

### 案例 6：与双千 atlas 交叉阅读

写完本篇后，在 `projects-atlas` 打开同子类邻居 1 篇，检查实践案例是否覆盖安装/命令/排障。

## 踩过的坑

1. **依赖版本漂移**：按文档锁版本，否则编译失败难定位。
2. **硬编解码路径**：GPU/驱动差异导致黑屏或崩溃，准备软解回退。
3. **权限与端口**：服务器组件忘开端口或 HTTPS 证书，客户端连不上。
4. **路径写死**：示例用绝对路径，换机器必挂。
5. **行数与模板**：交付前用 quality-gate 扫一遍，避免关联链到未写 slug。
6. **事件循环阻塞**：在主线程执行大量同步 CPU 运算（如 JSON 解析超大文件）会阻塞所有 I/O，应移至 Worker Threads 或使用流式解析器。
7. **内存泄漏排查**：EventEmitter 未移除监听器、全局缓存无界增长是常见泄漏来源；使用 --inspect 加 Chrome DevTools 的 Heap Snapshot 定位根因。

## 适用 vs 不适用场景

**适用**：
- 学习该领域开源架构与模块边界
- 做原型验证或自建服务
- 与专题内邻居对照读

**不适用**：
- 闭源 SaaS 一键替代（若需合规审计）
- 超大规模不经优化的默认配置
- 不看文档直接改内核 fork

## 历史小故事（可跳过）

- 项目源于社区/公司开源贡献，Stars 随场景周期性上涨。
- 近年多与云原生、GPU、WebRTC 生态交叉。
- 文档与 issue 常比论文更新快，读 release note 很重要。
- 与 study 站邻居项目常构成「编码-传输-播放」全链。

## 学到什么

- 先跑通再读码，效率高于反过来。
- 开源多媒体/系统栈多为「薄壳 + 厚库」。
- 配置即架构，改一个 flag 可能换一条数据路径。
- 关联笔记要优先链到 `written.txt` 已有 slug。

## 延伸阅读

- 官方仓库：https://github.com/nodejs/node
- [[deno]]
- [[quickjs]]
- [[v8]]
- [[wasmtime]]

## 关联

- [[deno]] —— 同专题对照阅读
- [[quickjs]] —— 同专题对照阅读
- [[v8]] —— 同专题对照阅读
- [[wasmtime]] —— 同专题对照阅读

## 维护备注

- 合并后运行 `npm run atlas` 刷新反向链接。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[cordova]] —— Apache Cordova — 用网页技术写手机 App 的 WebView 桥
- [[volta]] —— Volta — cd 进项目就自动换 Node 版本的工具链管理器
- [[wasmtime]] —— Wasmtime — Bytecode Alliance 标准 wasm runtime

