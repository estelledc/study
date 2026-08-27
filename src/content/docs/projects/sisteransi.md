---
title: sisteransi — 只返回 ANSI 字符串的光标积木
description: ESM 导出 cursor/scroll/erase/beep/clear，自己不写终端
来源: https://github.com/terkelg/sisteransi
日期: 2026-08-27
分类: projects / 终端
难度: 初级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/terkelg/sisteransi
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 305922fd6654df4c77d1e023aa6c55162958eccb
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.0.0
---

## 是什么

sisteransi 是一个 **只拼 ANSI 转义串、不碰 stdin/stdout** 的小库。日常类比：它给你一盒标签纸（“往上 2 行”“擦掉整行”），你自己决定贴到哪封信上；它不代你寄信，也不听你按键。

固定 2.0.0 是 ESM-only，`engines.node >=20`，零运行时依赖。公开导出五个名字：

```js
import { cursor, scroll, erase, beep, clear } from "sisteransi";

process.stdout.write(cursor.to(2, 1));
process.stdout.write(erase.line);
process.stdout.write(beep);
```

源码在 `src/index.ts`。npm 包的 `exports` 指向构建后的 `dist/`；本页读的是 TypeScript 源，不是发布 tarball 里的 JS。

## 为什么重要

终端问卷库看起来像“会问问题”，底下其实是在拼这些字符串。不拆这一层，就解释不了：

- 为什么 prompts 那条栈要把 ANSI 单独打成包，而 [[enquirer]] 把同类帮手写进自己的 `lib/ansi.js`
- 为什么 `cursor.to(2, 1)` 发出去的不是 `2;1`，而是 `3;2H`
- 为什么 2.0 和 lockfile 里常见的 `sisteransi@1.0.5` 不能当同一份 API 用

一句话：sisteransi 的合同是 **CSI 字符串积木**，不是 prompt 运行时。

## 核心要点

固定 `src/index.ts` 可以按五块读：

1. **常数**：`ESC = '\x1B'`，`CSI = ESC + '['`，`beep = '\u0007'`。`clear.screen` 是 `ESC + 'c'`（RIS 复位），不是 `CSI 2J`。

2. **光标**：`to` / `move` / `up` / `down` / `forward` / `backward` / `nextLine` / `prevLine`，外加字符串常量 `left` / `hide` / `show` / `save` / `restore`。坐标按 0-based 传入，发出去时 `+1`。

3. **`to` 的假值陷阱**：`if (!y) return CSI + (x + 1) + 'G'`。只传 `x`、或 `y === 0` / `y === ''`，都走“移到第 x+1 列”，**不会**发 `1;{x+1}H`。测试锁定 `to(0) === '\x1b[1G'`、`to(2, 2) === '\x1b[3;3H'`。

4. **重复次数**：`up(2)` 是 `CSI 2A`（参数进 CSI）。`nextLine` / `prevLine` / `scroll.up` / `scroll.down` 是把整段 `repeat(count)`，所以 `scroll.up(0)` 是空串，不是 `CSI 0S`。

5. **擦除**：`erase.lines(n)` 循环写 `2K`，中间行夹 `cursor.up()`，最后补 `cursor.left`（`CSI G`）。测试断言 `erase.lines(2) === '\x1b[2K\x1b[1A\x1b[2K\x1b[G'`。

`save` / `restore` 用的是 `ESC 7` / `ESC 8`，不是 CSI `s` / `u`。这和 [[enquirer]] 里按 `TERM_PROGRAM === Apple_Terminal` 在 `7/8` 与 `s/u` 之间切换的写法不同。

## 实践示例

### 案例 1：自己写 stdout，库只负责字符串

```js
import { cursor, erase } from "sisteransi";

const p = (s) => process.stdout.write(s);
p("Line 2");
p(erase.line);
p(cursor.left);
p("Line 3\n");
```

这是仓库 `example.js` 的形状：`erase.line` 清当前行，`cursor.left` 回到列 0，再写出新文本。库函数从不调用 `write`。

### 案例 2：相对移动是拼接，不是对象

```js
import { cursor } from "sisteransi";

cursor.move(1, 4);
// '\x1b[1C\x1b[4B'  —— 先右 1，再下 4
cursor.up(2) + cursor.down(1);
// '\x1b[2A\x1b[1B'
```

`move` 按符号选 `D/C` 与 `A/B`；`0` 那一轴不加码。你可以把多段直接 `+` 成一条再写出去。

### 案例 3：擦多行是循环，不是一条带参数的 CSI

```js
import { erase } from "sisteransi";

erase.lines(2);
// '\x1b[2K\x1b[1A\x1b[2K\x1b[G'
```

它没有发 `CSI 2M` 之类的“删 2 行”。问卷库重绘上一屏时，靠的就是这种“按行 2K + 上移”的循环。

## 踩过的坑

1. **把 sisteransi 当成 prompt 库**：它没有 raw mode、没有问题类型、没有 Promise 答案。问答在 terkelg/prompts 或 [[enquirer]] 那一层。
2. **`cursor.to(x, 0)` 不是第一行**：`!y` 为真，结果是 `CSI{x+1}G`。要第一行第一列得写 `cursor.to(0, 1)` 或接受这个假值语义。
3. **2.0 不能 `require` 到旧 Node**：README 写明 ESM-only、`>=20`；CJS `require(esm)` 要 20.19+。1.x 是另一条线，本页不讲。
4. **`clear.screen` 是 RIS**：`\x1Bc` 会复位终端状态，比 `erase.screen`（`CSI 2J`）猛。别在只想清滚动区时误用。
5. **不要抄本仓库 lockfile 里的 1.0.5 当 2.0.0**：那是传递依赖，API 与模块格式都不是这一页。

## 适用 vs 不适用场景

**适用**：

- 自己写 spinner / 重绘 / 光标跳转，只想要可测试的字符串
- 已经在 Node 20+ 的 ESM CLI 里，需要一份零依赖的 CSI 表
- 想对照 [[enquirer]] 自带 `lib/ansi.js`：同一类问题，两种打包方式

**不适用**：

- 需要问问题、校验、多选 → 用问卷库，不要在 sisteransi 上叠状态机
- 还在 Node 18 或必须纯 CJS → 那是 1.x 或别的 ANSI 包
- 要颜色 / 样式而不是光标 → [[chalk]] 那条赛道
- 要比较终端能力或查询光标位置 —— 本库不读 stdin，也没有 `6n` 解析

## 固定版本边界

- 本文绑定 `terkelg/sisteransi@305922fd...`。lightweight tag `v2.0.0` 与 npm `sisteransi@2.0.0` 的 `gitHead` 都指向该提交（2026-06-25）。
- `type: module`；`engines.node >=20`；无 `dependencies`。
- 测试用 Node 的 type stripping 直接跑 `src/index.ts`，README 写本地开发需要 Node >=22；本轮未执行测试。
- 本文不描述 1.0.5 CJS 导出，也不测 Windows conhost / 真实 TTY。状态保持 `UNVERIFIED`。

## 学到什么

1. **ANSI 库可以完全没有 I/O**——可测性来自“返回字符串”，副作用留给调用方
2. **0-based API 和 1-based CSI 要当翻译层看**——`to(2, 2)` 变成 `3;3H` 是约定，不是笔误
3. **假值分支是合同的一部分**：`to(x)` 与 `to(x, 0)` 塌缩到同一条 `G` 指令
4. **同题材可以有两种打包**：[[enquirer]] 内嵌 `lib/ansi.js`，sisteransi 独立成 ESM 包给 prompts 栈用

## 应用型自测

1. `cursor.to(2, 2)` 发出的字符串是什么？
2. `cursor.to(5, 0)` 会落到第 1 行第 6 列吗？
3. `erase.lines(2)` 的末尾为什么是 `CSI G`，而不是再发一次 `2K`？

检查点：

1. `'\x1b[3;3H'`。实现是 `y+1;x+1`。
2. 不会。`!y` 为真，结果是 `'\x1b[6G'`，只改列。
3. 循环里最后一行不再 `cursor.up()`，退出后补 `cursor.left` 把光标拽回行首。

## 延伸阅读

- 固定源码：[terkelg/sisteransi](https://github.com/terkelg/sisteransi) —— 本文绑定提交 `305922fd6654df4c77d1e023aa6c55162958eccb`
- 仓库测试：`test/index.ts`（`node:test` 锁住 to/move/erase.lines）
- [[enquirer]] —— 自带另一份 ANSI 帮手的问卷库
- [[ora]] —— 用擦行做 spinner 的对照

## 关联

- [[enquirer]] —— 问卷状态机；ANSI 写在自己仓库里
- [[ora]] —— 消费 ANSI 擦写，但是 spinner
- [[chalk]] —— 颜色/样式，不是光标寻址
- [[ink]] —— 用 React 抽象掉手写 CSI

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[enquirer]] —— enquirer — 用类继承把终端问答做成状态机
