---
title: throttle-debounce — debounce 只是 throttle 的一种模式
description: 同步 throttle/debounce 小库：debounce 是 debounceMode，参数顺序是 delay 在前，且 npm 5.0.2 与 GitHub tag 错位。
来源: https://github.com/niksy/throttle-debounce
日期: 2026-08-27
分类: 工具库
难度: 入门
difficulty: 入门
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/niksy/throttle-debounce
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: bb02ea22128987fdf41e5cc6a817ba2aeeb9f7a2
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 5.0.2
---

## 是什么

throttle-debounce 把“限频”和“合并”放进同一个包装函数。日常类比：闸机可以按固定节拍放人（throttle），也可以等队伍安静后再放一次（debounce）；这里 debounce 并不是另一套算法，只是给 throttle 打开了 `debounceMode`。

```js
import { throttle, debounce } from "throttle-debounce"

const onScroll = throttle(250, () => update())
const onType = debounce(300, (q) => search(q))
```

注意参数顺序是 **`(delay, callback, options)`**，和 [[perfect-debounce]] / lodash 的 `(fn, wait)` 相反。固定 `5.0.2` 是同步调用：`callback.apply(this, args)`，不返回 Promise。

## 为什么重要

不读这份实现，下面这些事会对不上：

- 为什么文档里的 debounce 只有几十行，却声称和 throttle 行为成对
- 为什么 `noLeading: true` 加上 `noTrailing: true` 会让回调一次都不跑
- 为什么 GitHub 上的 `v5.0.2` tag 不能直接当 npm `5.0.2` 的源码锚点
- 为什么 `cancel({ upcomingOnly: true })` 之后还能再触发，默认 `cancel()` 却把包装函数废掉

## 核心要点

固定版本可以拆成四层：

1. **debounce 是 throttle 的薄封装**：`debounce(delay, callback, { atBegin })` 等于 `throttle(delay, callback, { debounceMode: atBegin !== false })`。默认 `atBegin: false`，于是 `debounceMode` 是 `false`（结尾触发），不是 `undefined`。

2. **三种时钟，靠 `debounceMode` 分叉**：
   - `undefined`：throttle。用 `Date.now() - lastExec > delay` 决定是否立刻 `exec`。
   - `true`：开头 debounce。第一次立刻 `exec`，然后只安排 `clear`，窗口内不再跑。
   - `false`：结尾 debounce。每次调用都把 timer 重设为 `delay` 后的 `exec`。

3. **leading / trailing 是否定式命名**：选项叫 `noLeading`、`noTrailing`，默认都是 `false`（有头有尾）。源码注释写明：两个都为 `true` 时回调不会执行；仓库测试也按次数 0 断言。

4. **取消分两档**：`wrapper.cancel()` 默认把 `cancelled` 设为 true，之后任何调用直接 return。传入 `{ upcomingOnly: true }` 只 `clearTimeout`，不把函数标死，下一次调用仍可走完整逻辑。

## 实践示例

### 案例 1：默认 throttle 有头有尾

```js
const log = throttle(1000, (n) => console.log(n))
log(1) // 立刻执行
log(2) // 丢掉
log(3) // 丢掉
log(4) // 停手后还会再跑一次 4
```

`elapsed > delay` 时走 `exec()`；间隔内的调用若 `noTrailing !== true`，会按 `delay - elapsed` 再排一次尾随。

### 案例 2：debounce 默认等最后一次

```js
const log = debounce(1000, (n) => console.log(n))
log(1); log(2); log(3); log(4)
// 固定 README：约 1s 后只看到 4
```

因为 `debounceMode === false`，走的是“每次清 timer、再 `setTimeout(exec, delay)`”，不是 throttle 那条 `elapsed > delay` 分支。

### 案例 3：开头 debounce 与 upcoming-only 取消

```js
const log = debounce(300, (n) => console.log(n), { atBegin: true })
log(1) // 立刻 1
log.cancel({ upcomingOnly: true })
log(2) // 仍可调用；这是新的一轮开头
```

`atBegin: true` 把 `debounceMode` 设成 `true`。`upcomingOnly` 不清永久标志，所以包装函数还能继续用。

## 踩过的坑

1. **把 `(fn, 300)` 抄过来**：这里必须先写 delay。写反了会把函数当成 delay，`Number.isFinite` 都轮不到，timer 行为会 silently 错。
2. **把 GitHub tag `v5.0.2` 当成 npm 5.0.2**：该 lightweight tag 指向 `0cb020ff...`，`package.json` 仍是 `5.0.1`。npm `gitHead` 是其后一个只改版本号和 CHANGELOG 的提交 `bb02ea22...`。源码文件本身没有差。
3. **两个 no* 都打开还指望“至少跑一次”**：测试明确断言一次都没有。
4. **按 [[perfect-debounce]] 去想返回值**：这里没有 Promise 合并；调用方拿不到“这一趟的结果”。
5. **把 GitHub 的 `NOASSERTION` 许可字段写成“没有许可证”**：`LICENSE.md` 是 MIT，并保留 Cowboy Ben Alman 原作声明。仓库元数据与文件不一致，以文件为准并披露冲突。

## 适用 vs 不适用场景

**适用**：

- 同时需要 throttle 和 debounce，并且能接受同步回调
- 要 CJS / ESM / UMD 三套发布入口（源码是 ESM，发布物由 rollup 生成；本文未打开构建产物）
- 需要 `upcomingOnly` 这种“只取消这一次、不废掉包装器”的取消

**不适用**：

- 要把多次调用的返回值汇合到一个 Promise 上——那是 [[perfect-debounce]] 的合同
- 团队记不住参数顺序，又要和 lodash 混用
- 需要绑定 `v5.0.2` tag 却拒绝披露它和 npm 版本的错位
- 要把未实测的浏览器兼容或包体积写成结论

## 固定版本边界

- 本文绑定 `niksy/throttle-debounce@bb02ea22...`，包版本 `5.0.2`，与 npm `gitHead` 一致。
- GitHub tag `v5.0.2` → `0cb020ff...`（仍标 5.0.1），是上述提交的祖先；中间 diff 只有 `package.json` 版本和 CHANGELOG。
- `engines.node` 声明 `>=12.22`。GitHub license 元数据是 `NOASSERTION`，`LICENSE.md` 是 MIT。
- 发布包声明 `cjs/`、`esm/`、`umd/`；这些目录不在被绑定提交的 git 树里，本文只读了源文件。
- 本文未安装依赖、未跑 Karma/QUnit、未测 timer 或 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **一个包装器可以同时表达 throttle 和 debounce**——分叉点是 `debounceMode` 是 `undefined` 还是布尔值。
2. **否定式选项会组合成“什么都不做”**——要同时读 `noLeading` 和 `noTrailing`。
3. **tag 名等于版本号，不等于 npm 发布提交**——先对 `package.json` 再对 `gitHead`。
4. **取消要写清“这一次”还是“从此作废”**。

## 应用型自测

1. `debounce(300, fn)` 内部的 `debounceMode` 是 `undefined`、`true` 还是 `false`？
2. `throttle(100, fn, { noLeading: true, noTrailing: true })` 连点 50 次，回调会跑几次？
3. 要把笔记钉在 npm `5.0.2`，应该用 tag `v5.0.2` 的 SHA，还是 npm `gitHead`？

检查点：

1. `false`。默认 `atBegin: false`，于是 `atBegin !== false` 为 false。
2. 0 次。两个 no* 同时为 true 时 `exec` 进不去。
3. 用 npm `gitHead` `bb02ea22...`。tag 指向的是仍写着 5.0.1 的祖先提交。

## 延伸阅读

- 文档：[github.com/niksy/throttle-debounce](https://github.com/niksy/throttle-debounce)
- 固定源码：[niksy/throttle-debounce](https://github.com/niksy/throttle-debounce) —— 本文绑定提交 `bb02ea22128987fdf41e5cc6a817ba2aeeb9f7a2`
- 原作：[cowboy/jquery-throttle-debounce](https://github.com/cowboy/jquery-throttle-debounce)（本页不审查）
- [[perfect-debounce]] —— Promise 合并、参数顺序相反、没有 throttle

## 关联

- [[perfect-debounce]] —— UnJS 的 Promise debounce，合同互补
- [[ofetch]] —— 另一份 UnJS 小库，用来对照“小包也要钉 revision”

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
