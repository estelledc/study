---
title: Node.js — 服务端 JS 运行时之父
来源: 'https://github.com/nodejs/node'
日期: 2026-07-08
分类: runtimes
难度: 初级
---

## 是什么

Node.js 是一个**把 JavaScript 从浏览器里搬到电脑和服务器上的运行时**。日常类比：浏览器像商场里的游乐区，只能在固定围栏里玩；Node.js 像把同一套积木带回家，让你能用它开文件、连数据库、起服务器、写命令行工具。

你写：

```js
console.log('hello from node')
```

再运行：

```bash
node hello.js
```

这段代码不需要浏览器就能执行。Node.js 里面有 V8 负责执行 JavaScript，有 libuv 负责跟操作系统打交道，所以它不是"一个框架"，而是 JavaScript 程序真正跑起来的那台小发动机。

最小 HTTP 服务也很直观：

```js
const { createServer } = require('node:http')

createServer((req, res) => {
  res.end('Hello Node')
}).listen(3000)
```

## 为什么重要

不理解 Node.js，下面这些事都没法解释：

- 为什么前端工程师能用同一种语言写网页、服务端接口、脚本和构建工具
- 为什么 [[express]]、[[fastify]]、[[koa]] 这些框架都围着 `req` / `res` / 事件循环转
- 为什么一个 Node 服务能同时挂很多连接，却又会被一段慢 CPU 代码拖死
- 为什么 npm 生态、构建工具、测试工具和后端服务会长成同一片 JavaScript 森林

## 核心要点

Node.js 的核心可以拆成 **三件事**：

1. **V8 执行 JS**：V8 像翻译员，把 JavaScript 翻译成机器能跑的指令。浏览器用它跑网页脚本，Node.js 把它嵌进服务器进程里，让 JS 能离开浏览器工作。

2. **libuv 做异步 I/O**：libuv 像前台取号机，读文件、等网络、等数据库时先把任务登记出去，完成后再叫你回来处理结果。这样主线程不用傻等，能继续招呼别的请求。

3. **标准库 + npm 生态**：Node 自带 `http`、`fs`、`stream`、`test` 等模块，npm 再补上无数第三方包。类比：厨房有基础锅铲，外面还有整条食材市场。

## 实践案例

### 案例 1：起一个最小 Web 服务

官方入门文档用 `node:http` 展示了最常见的 Hello World：保存为 `server.js`，再用 `node server.js` 运行。

```js
const { createServer } = require('node:http')

const server = createServer((req, res) => {
  res.statusCode = 200
  res.setHeader('Content-Type', 'text/plain')
  res.end('Hello World')
})

server.listen(3000, '127.0.0.1', () => {
  console.log('server on http://127.0.0.1:3000')
})
```

**逐部分解释**：

- `createServer` 创建一个 HTTP 服务器，像开一家只接网络请求的小店
- `(req, res)` 里 `req` 是客人递来的订单，`res` 是你要交回去的回复
- `listen(3000)` 表示在 3000 号端口等客人，命令行运行 `node server.js` 后就开始营业

### 案例 2：读文件，但别堵住事件循环

Node 官方文件读写教程给了 `fs.readFile` 和 `fs/promises` 两种写法。真实脚本里更推荐把错误处理写清楚：

```js
const fs = require('node:fs/promises')

async function main() {
  try {
    const text = await fs.readFile('./notes.txt', 'utf8')
    console.log(text)
  } catch (err) {
    console.error('read failed:', err.message)
  }
}

main()
```

**逐部分解释**：

- `node:fs/promises` 是 Node 标准库，不需要额外安装
- `await fs.readFile` 把"等磁盘把文件读完"交给底层，不让主逻辑写成层层回调
- 如果文件很大，官方也提醒不要一次全读进内存，要改用 stream 一块一块处理

### 案例 3：用内置能力跑任务和测试

Node 现在自带测试运行器和任务运行入口，很多小项目不用先装一堆工具。`package.json` 可以这样写：

```json
{
  "type": "module",
  "scripts": {
    "start": "node app.js",
    "test": "node --test"
  }
}
```

然后运行：

```bash
node --run test
```

**逐部分解释**：

- `node --test` 调用内置测试运行器，适合先写小而直接的单元测试
- `node --run test` 读取 `package.json` 里的脚本名，比再套一层包管理器更轻
- 如果开发时想自动重启，官方文档还给了 `node --watch app.js` 这种常用命令

## 踩过的坑

1. **把 Node 当多线程魔法**：默认只有一个 JavaScript 主线程，I/O 可以异步，CPU 重活仍会卡住整条事件循环。

2. **滥用 `Sync` 方法**：`readFileSync` 写起来短，但在服务端请求处理中会让别的请求一起等，适合启动脚本，不适合热路径。

3. **忘记处理异步错误**：Promise 没有 `catch`、回调里忽略 `err`，小脚本可能只打印 warning，线上服务可能直接漏掉关键失败。

4. **混淆 CommonJS 和 ESM**：`require` 与 `import` 不是同一套模块系统，`package.json` 里的 `"type": "module"` 会影响文件解释方式。

## 适用 vs 不适用场景

**适用**：

- Web API、BFF、实时服务、内部管理后台，尤其是大量时间花在网络和数据库等待上的系统
- CLI、小脚本、构建工具、代码生成器，因为启动简单，标准库够用，npm 包很多
- 前后端都用 JavaScript / TypeScript 的团队，沟通成本和模型切换成本低
- 需要 WebSocket、流式数据、代理层、轻量任务编排的场景

**不适用**：

- 大量 CPU 密集计算，例如视频编码、复杂科学计算、超大规模图片处理
- 强实时或硬件近身场景，需要可预测延迟和更底层内存控制
- 极端高吞吐且团队愿意承担更复杂语言成本的核心网关
- 完全不能接受依赖生态波动的环境，npm 依赖树需要额外治理

## 历史小故事（可跳过）

- **2009 年**：Ryan Dahl 发布 Node.js，把 Chrome 的 V8 和事件驱动 I/O 组合起来，让 JavaScript 可以写服务器。
- **2010 年前后**：npm、[[express]] 等生态出现，Node 从"能跑 JS"变成"能快速写 Web 服务"。
- **2015 年**：Node.js 与 io.js 社区重新合流，项目进入基金会治理，发布节奏逐渐稳定。
- **后来十年**：LTS、标准库、诊断工具、测试运行器持续补齐；仓库已经是 10 万星以上的大型基础设施项目。
- **今天**：[[bun]]、Deno 等新运行时不断挑战它，但 Node.js 仍是 JavaScript 服务端生态的默认地基。

## 学到什么

1. **运行时不是框架**：框架解决"怎么组织应用"，运行时解决"代码怎么真的跑起来、怎么碰操作系统"。
2. **Node 的王牌是 I/O 等待多的场景**：它擅长在等待网络和磁盘时继续处理别的事，不擅长在主线程里死算。
3. **生态是技术的一部分**：npm、LTS、文档、框架、运维经验共同构成了 Node.js 的护城河。
4. **新工具常常是在重答 Node 的问题**：[[bun]] 想把运行时和工具链合一，[[fastify]] 想让 Node Web 服务更快，[[pnpm]] 想让包安装更可控。

## 延伸阅读

- 官方入门：[Introduction to Node.js](https://nodejs.org/learn/getting-started/introduction-to-nodejs)
- 官方机制：[The Node.js Event Loop](https://nodejs.org/learn/asynchronous-work/event-loop-timers-and-nexttick)
- 官方避坑：[Don't Block the Event Loop](https://nodejs.org/learn/asynchronous-work/dont-block-the-event-loop)
- 源码仓库：[nodejs/node](https://github.com/nodejs/node)
- [[express]] —— Node.js 最经典的 Web 框架
- [[bun]] —— 新一代 JS 运行时，把工具链也塞进一个二进制

## 关联

- [[bun]] —— 直接挑战 Node.js 的新运行时，强调启动速度和一体化工具链
- [[express]] —— Node.js Web 生态的经典入口，展示原生 `http` 之上的框架抽象
- [[fastify]] —— 继续在 Node 运行时上追求更高吞吐和 schema 驱动
- [[koa]] —— 用 async/await 重新设计 Node Web 中间件体验
- [[socket-io]] —— 利用 Node 长连接能力做实时通信
- [[nodemailer]] —— 典型 Node 后端工具包，用来发送邮件
- [[vitest]] —— 前端测试工具链的一员，也依赖 Node 生态运行

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[electron]] —— Electron — 用网页技术做跨平台桌面应用
- [[electron-builder]] —— electron-builder — Electron 打包发布事实标准
- [[engine262]] —— engine262 — 用 JavaScript 实现的 ECMA-262 参考引擎
- [[nodegui]] —— nodegui — 用 Node.js 写原生桌面窗口
- [[quickjs]] —— QuickJS — 口袋里的 JavaScript 引擎
- [[volta]] —— Volta — cd 进项目就自动换 Node 版本的工具链管理器
