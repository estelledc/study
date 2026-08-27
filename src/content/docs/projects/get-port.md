---
title: get-port — 探测空闲 TCP 端口，占用则改给 OS 随机口
description: 固定 v7：首选端口失败后听 0，进程内锁 15–30 秒，reserve 锁到进程结束
来源: https://github.com/sindresorhus/get-port
日期: 2026-08-27
分类: 开发工具
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/sindresorhus/get-port
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: efbebfb0a2904b55d5ce9ab0badb52b3fbab99fe
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 7.2.0
---

## 是什么

get-port 是一个 **ESM 默认导出** 的 Node 小库：先 `net.createServer().listen`，听得上就把端口号还你。日常类比：你报一个座位号；有人坐了，它不帮你挨个试邻座，而是让检票口随便再发一个空位。

```js
import getPort from 'get-port'
const port = await getPort({port: 3000})
```

固定 `7.2.0` 零运行时依赖、`"type": "module"`、`node >= 16`。首选端口被占或没权限时，生成器最后 `yield 0`，把选择权交给操作系统。

## 为什么重要

不看固定入口，容易把“找空闲端口”写成“从 3000 往上加一”：

- 为什么 `{port: 3000}` 被占用后得到的不是 `3001`
- 为什么同一进程连续两次要 `3000`，第二次会换号——年轻/年老锁还没过期
- 为什么 `reserve: true` 能挡住后面的 IPv6 查询
- 为什么清缓存会拆掉进程内防撞

一句话：它是 **首选列表 + OS 随机兜底 + 进程内锁**，不是顺序扫描器。对照见 [[detect-port]]。

## 核心要点

固定 7.2.0 的主链可以拆成五步：

1. **拆选项**：`port` 可以是数字或可迭代；`exclude` 必须是安全整数迭代器。`reserve` 从其余 `ListenOptions` 里剥出来。
2. **起 15 秒转盘**：第一次调用才 `setTimeout`。到期后 `old = young`、`young = new Set()`。超时对象会 `unref`（Electron / Jest jsdom 没有这个方法就跳过）。
3. **选探测面**：没给 `host` 且端口不是 `0` 时，对 `os.networkInterfaces()` 里所有地址再加 `undefined` 和 `0.0.0.0` 各听一次。给了 `host` 或端口是 `0`，只听这一处。
4. **锁住再返回**：得到的号若在 `old` / `young` / `reservedPorts` 里，首选端口抛内部 `Locked`，随机口则再听一次。`reserve` 进终身集合，否则进 `young`。
5. **穷尽才报错**：`EADDRINUSE` / `EACCES` / `Locked` 换下一个候选；别的错误直接抛。候选用完抛 `No available ports found`。

`portNumbers(from, to)` 只是 `1024…65535` 的生成器，自己不探测。

## 实践示例

### 案例 1：首选端口，被占就换随机口

```js
import getPort from 'get-port'
const port = await getPort({port: 3000})
```

`3000` 空闲就用它。被占或 `EACCES` 时不会试 `3001`，而是听 `0`。

### 案例 2：区间候选 + 排除

```js
import getPort, {portNumbers} from 'get-port'
const port = await getPort({
  port: portNumbers(3000, 3002),
  exclude: [3001],
})
```

生成器交出 `3000, 3001, 3002`；`exclude` 跳过 `3001`。三段都不可用才落到随机口。

### 案例 3：长间隔用 reserve

```js
import getPort, {clearLockedPorts} from 'get-port'
const port = await getPort({port: 8089, reserve: true})
// 同进程再查 8089 会换号，直到 clearLockedPorts()
```

`reserve` 按端口号全局记账，不区分当时用的 `host` 或 `ipv6Only`。`clearLockedPorts()` 会同时清掉年轻、年老和终身集合。

## 踩过的坑

1. **把失败路径写成 +1**：源码在首选列表后只 `yield 0`。要顺序窗口请看 [[detect-port]]。
2. **默认锁只有 15–30 秒**：拿到号到真正 `listen` 的间隔更长时，平行测试可能领到同一号。用 `reserve`。
3. **`clearLockedPorts()` 拆掉防撞**：文档自己写了，清缓存等于取消进程内保护。
4. **锁是端口号，不是 (host, port)**：`127.0.0.1` 上 `reserve` 的 `8091`，随后查 `::1` 上的同一号也会被挡。
5. **本包没有 CLI**：命令行是另一个仓库 `get-port-cli`，不在这个 tag 的 `files` 里。

## 适用 vs 不适用场景

**适用**：

- 测试或脚本需要一个立刻能 `listen` 的号，首选失败可以换随机口
- 同一进程里短间隔连续取号，需要年轻/年老锁
- 取号和绑定之间隔得很久，愿意用 `reserve`

**不适用**：

- 必须从首选端口往上连续试十个——那是 [[detect-port]] 的 `port + 10` 窗口
- 需要 `waitPort` 等到某端口被占
- 需要 CJS `require` 或自带 `detect` 命令

## 固定版本边界

- 本文绑定 `sindresorhus/get-port@efbebfb0...`，即 annotated tag `v7.2.0` 的解引用提交；npm `get-port@7.2.0` 的 `gitHead` 相同。
- 引擎 `node >= 16`，`"type": "module"`，`sideEffects: false`，运行时无依赖。
- 本文未安装依赖、未跑 `xo` / `ava` / `tsd`、未测跨进程竞争，状态保持 `UNVERIFIED`。

## 学到什么

1. **首选失败的默认动作是听 0**——不是邻座扫描
2. **进程内锁和系统占用是两层**——`EADDRINUSE` 之外还有 `Locked`
3. **`reserve` 按端口号记账**——跨 host 查询也会撞锁
4. **`portNumbers` 只产号**——探测仍走 `getPort`

## 应用型自测

1. `{port: 3000}` 已被别的进程占用时，下一步是试 `3001` 吗？
2. 默认情况下，刚返回的端口多久后可以再被同一进程领走？
3. `clearLockedPorts()` 会不会清掉 `reserve: true` 记下的号？

检查点：

1. 不是。候选序列在首选之后只 `yield 0`。
2. 大约 15–30 秒：先在 `young`，15 秒后进 `old`，再 15 秒丢掉。
3. 会。三个集合一起 `clear`。

## 延伸阅读

- 固定源码：[sindresorhus/get-port](https://github.com/sindresorhus/get-port) —— 本文绑定提交 `efbebfb0a2904b55d5ce9ab0badb52b3fbab99fe`
- [[detect-port]] —— 占用后试 `+1…+10`，并带 CLI / `waitPort`
- [[vitest]] —— 平行测试里更常碰到取号到绑定的时间窗

## 关联

- [[detect-port]] —— 另一份空闲端口合同：顺序窗口，没有进程内锁
- [[vitest]] —— 常见的平行测试宿主
- [[express]] —— 拿到号之后真正 `listen` 的一方

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[detect-port]] —— detect-port — 从首选端口往上试十次，再听随机口
