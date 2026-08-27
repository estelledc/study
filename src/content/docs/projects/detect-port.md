---
title: detect-port — 从首选端口往上试十次，再听随机口
description: 固定 v2：占用后往上试十格，waitPort 等的是被占而不是空闲
来源: https://github.com/node-modules/detect-port
日期: 2026-08-27
分类: 开发工具
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/node-modules/detect-port
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: a2cfe1daed83c8f93358aea8b281a91514c307c4
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.1.0
---

## 是什么

detect-port 是一份 **CJS / ESM 双出口** 的端口探测器：你给一个首选号，它先在多个本机地址上 `listen`；被占就 `port + 1`，最多往上走十格，再不行才听 `0`。日常类比：酒店先看你订的房间，隔壁十间轮流试，都满了才去前台要任意空房。

```js
import { detect } from 'detect-port'
const real = await detect(3000)
```

固定 `2.1.0` 用 `tshy` 同时出 `dist/esm` 与 `dist/commonjs`。`detect` 是 `detectPort` 的别名；默认导出也是同一函数。运行时依赖只有 `address`（取当前网卡 IP）。引擎 `node >= 16`。

## 为什么重要

不看固定源码，容易把“探测端口”和 [[get-port]] 的随机兜底混成一件事：

- 为什么 `23000` 被 `localhost` 占用时，返回值是 `23001` 而不是随机口
- 为什么连续十个号都被占，才会落到 `port === 0`
- 为什么 `waitPort(3000)` 在 3000 空闲时不会立刻成功
- 为什么指定了一个本机没有的 `hostname` 会抛 `IPAddressNotAvailableError`

一句话：它是 **短顺序窗口 + 多地址核验 + 等占用**，不是进程内锁。

## 核心要点

`detectPort` 的主链可以拆成四步：

1. **归一化入参**：对象可带 `port` / `hostname` / `callback`；函数参数当 callback；字符串先 `parseInt`，解析失败当 `0`。
2. **划窗口**：`maxPort = min(port + 10, 65535)`。调试日志写的是半开区间 `[port, maxPort)`。
3. **多地址试听**：没给 hostname 时依次听默认地址、`0.0.0.0`、`127.0.0.1`、`localhost`、`ip()`。任一处失败（`localhost` 的 `EADDRNOTAVAIL` 除外）就 `++port` 再来。给了 hostname 只听那一处；`EADDRNOTAVAIL` 改抛 `IPAddressNotAvailableError`。
4. **窗口用尽听 0**：`handleError` 发现 `port >= maxPort` 后把两端都置零，再 `tryListen`。

`listen` 自己 `createServer`，成功后立刻 `close`。`ENOTFOUND` 被当成“这个名字听不了，端口仍可用”并直接 `resolve`。

`waitPort` 是另一条合同：循环调用 `detectPort(port)`，**返回值仍等于入参说明端口空闲**，于是 `sleep` 再试；返回值变了才认为已被占用。默认 `retries = Infinity`、`retryInterval = 1000`。

## 实践示例

### 案例 1：首选被占就试下一个

```js
import { detectPort } from 'detect-port'
const real = await detectPort(23000)
```

测试里 `localhost:23000` 被占时，断言拿到的是 `23001`。这和 [[get-port]] 听 `0` 不是同一条路。

### 案例 2：Promise 与 callback 同一入口

```js
import { detect } from 'detect-port'
detect(80, (err, port) => {
  if (err) throw err
  console.log(port)
})
```

传入函数时走 callback；否则返回 Promise。对象形式可同时带 `hostname` 和 `callback`。

### 案例 3：等到端口被占

```js
import { waitPort } from 'detect-port'
await waitPort(9093, {retries: 3, retryInterval: 100})
```

`9093` 一直空闲时，`count` 超过 `retries` 会抛 `WaitPortRetryError`（测试里 `retries: 3` 时 `count === 4`）。它等的是“有人听上了”，不是“腾出来”。

## 踩过的坑

1. **`waitPort` 名字像“等空闲”**：实现是空闲就睡、被占才返回 `true`。
2. **窗口只有十格**：`27000–27009` 都被占时，测试断言返回值会落到窗口外（随机口）。
3. **指定 hostname 不再扫全家地址**：本机没有的 IP 直接 `IPAddressNotAvailableError`，不会默默换 `0.0.0.0`。
4. **CLI 无参数不是听 0**：`detect` 命令会先抽 `9000 + random*(65535-9000)`，再交给 `detectPort`。
5. **没有进程内锁**：同一进程连续两次要同一空闲号，两次都能拿到。防平行碰撞请看 [[get-port]] 的 `reserve`。

## 适用 vs 不适用场景

**适用**：

- 开发服务器希望尽量靠近用户给的端口，只愿意往上挪几格
- 需要 `detect` / `detect-port` 命令行
- 需要 `waitPort` 等到某个口被服务占住

**不适用**：

- 首选失败必须立刻换成 OS 随机口
- 平行测试需要 15–30 秒或终身进程锁
- 不能接受 `address` 依赖，或必须纯 ESM 无 CJS

## 固定版本边界

- 本文绑定 `node-modules/detect-port@a2cfe1da...`，即 lightweight tag `v2.1.0`；npm `detect-port@2.1.0` 的 `gitHead` 相同。
- 源码在 `src/`，发布物走 `tshy` 的 `dist/esm` 与 `dist/commonjs`；`bin` 指向 CommonJS 产物。
- 运行时依赖 `address@^2.0.1`。本文未安装依赖、未跑 `egg-bin` / CLI、未测真实 DNS，状态保持 `UNVERIFIED`。

## 学到什么

1. **占用后的默认动作是 `++port`**——十次以内不会听 `0`
2. **“空闲”要过五道地址**——只听 `127.0.0.1` 空着不够
3. **`waitPort` 等占用**——和探测空闲是反向谓词
4. **CLI 与库入口不是同一条随机策略**——无参 CLI 先自己抽 9000 以上的号

## 应用型自测

1. `detectPort(23000)` 在 `localhost:23000` 被占时，下一步听 `0` 吗？
2. `waitPort(3000)` 在 3000 空闲时会立刻 resolve 吗？
3. 给一个本机没有的 `hostname`，错误类型是普通 `Error` 吗？

检查点：

1. 不会。先 `23001`，窗口内继续 `++port`。
2. 不会。空闲就 `sleep(retryInterval)` 再探。
3. 不是。`EADDRNOTAVAIL` 被包成 `IPAddressNotAvailableError`。

## 延伸阅读

- 固定源码：[node-modules/detect-port](https://github.com/node-modules/detect-port) —— 本文绑定提交 `a2cfe1daed83c8f93358aea8b281a91514c307c4`
- [[get-port]] —— 首选失败听 `0`，并带进程内锁
- [[express]] —— 探测完成后真正挂请求的一方

## 关联

- [[get-port]] —— 随机兜底 + `reserve`，没有 `waitPort`
- [[express]] —— 常见的后续 `listen` 调用方
- [[vite]] —— 开发服务器也要面对“端口被占”

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[get-port]] —— get-port — 探测空闲 TCP 端口，占用则改给 OS 随机口
