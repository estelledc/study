---
title: figlet — 把字符串编成 FIGfont ASCII 画
description: "介绍 figlet.js 如何解析 FIGfont、按规格 smush，并在 Node 与浏览器用不同方式加载字体。"
来源: https://github.com/patorjk/figlet.js
日期: 2026-08-27
分类: 终端工具
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/patorjk/figlet.js
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: b95c2f03ccbc7e2a23e9fd030e8378c2d3b9dd0e
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.11.4
---

## 是什么

npm 包 `figlet` 是 `patorjk/figlet.js`：一份 TypeScript FIGfont 驱动，把普通字符串编成多行 ASCII 画。日常类比：它像一台只认图章盒的活字印刷机——盒子是 `.flf` 字体，每个字符是一块等高铅字，排版时相邻铅字可以按规则挤在一起（smush）。

```js
import figlet from "figlet"

const banner = await figlet.text("Hello")
console.log(banner)
```

它不是 Unix 上的 C `figlet(6)`。固定 `1.11.4` 声明 MIT、`"type": "module"`、`node >= 17`；浏览器走 `fetch` 读字体，Node 走 `fs` 读打包进包里的 `fonts/`。

## 为什么重要

不理解这层驱动，下面这些事会对不上：

- 为什么 `textSync("Hi")` 在浏览器里可能直接抛错，在 Node 里却能同步出画
- 为什么 CLI 默认宽度是 80，库调用默认却是 `-1`（不换行）
- 为什么换行后的两行 ASCII 画会在垂直方向再挤一次，而不是简单叠两块
- 为什么 `ANSI-Compact` 这个名字要先被改写成 `ANSI Compact` 才能找到文件

## 核心要点

固定版本可以拆成五步：

1. **选入口**：`package.json` 的 `exports` 在 Node 条件里指向 `node-figlet`，浏览器指向 `figlet`。两者共用解析与排版，只换字体 I/O。

2. **解析 `.flf`**：`parseFont` 读首行 `flf2a` 头（hardBlank、height、oldLayout / fullLayout 等），再吃掉注释行。每种字体至少要带码位 32–126，外加 196 / 214 / 220 / 228 / 246 / 252 / 223。额外码位可用十进制、八进制或十六进制，但不能是 `-1`。

3. **水平拼接**：`generateFigTextLines` 按 `charCode` 取出等高行数组，用 `getHorizontalSmushLength` 算重叠，再 `horizontalSmush`。`LAYOUT` 是 `FULL_WIDTH=0`、`FITTING=1`、`SMUSHING=2`、`CONTROLLED_SMUSHING=3`。

4. **垂直拼接**：输入里的 `\n` 先各自生成一块，再 `smushVerticalFigLines`。所以 `"A\nB"` 不是两幅画中间空一行那么简单。

5. **默认与覆盖**：默认字体 `Standard`。`width` 默认 `-1`。`printDirection === 1` 会先把输入反转。hardblank 默认替换成空格，除非 `showHardBlanks`。

## 实践示例

### 案例 1：Node 里异步出画

```js
import figlet from "figlet"

const art = await figlet.text("Boo!", {
  font: "Ghost",
  width: 80,
  whitespaceBreak: true,
})
```

`figlet(...)` 是 `text(...)` 的别名，返回 Promise。第二个参数可以是字体名字符串，也可以是 options。`textSync` 在 Node 里会 `readFileSync` 对应 `.flf`。

### 案例 2：浏览器必须先把字体装进缓存

```js
import figlet from "figlet"

await figlet.preloadFonts(["Standard", "Ghost"])
const art = figlet.textSync("Hi", "Ghost")
```

浏览器 `loadFont` 默认 `fetch(\`./fonts/${name}.flf\`)`。`textSync` 发现缓存没有该字体就抛 `Synchronous font loading is not implemented for the browser...`。`defaults({ fetchFontIfMissing: false })` 后，连异步 `loadFont` 也会拒绝去网络取。

### 案例 3：CLI 与库的宽度合同不同

```bash
npx figlet -f Standard -w 80 "Hello"
```

`bin/index.js` 用 commander：默认字体 `Standard`，默认宽度 `80`，先 `loadFont` 再 `textSync`。库路径如果不传 `width`，`_reworkFontOpts` 写成 `-1`，不会按终端列宽折行。

## 踩过的坑

1. **把 `textSync` 当成跨环境 API**：Node 有磁盘字体；浏览器只有已经 `parseFont` / `preloadFonts` 过的缓存。
2. **按文件名猜 `ANSI-Compact`**：`getFontName` 只映射这一处：`ANSI-Compact` → `ANSI Compact`。
3. **以为 CLI 的 80 列就是库默认**：库默认不换行；要折行必须自己传 `width`，长单词还要 `whitespaceBreak`。
4. **把垂直换行当成普通 `\n` 拼接**：行与行之间会再跑垂直 smush。
5. **把下载量或 taag 网站截图写成包保证**：本页只绑定提交，未测渲染宽度或性能。

## 适用 vs 不适用场景

**适用**：

- CLI 启动 banner、帮助头、一次性海报式输出
- 需要完整 FIGfont 头规则，而不是手写几行大字
- Node 服务或脚本能接受异步读字体，或浏览器能预加载 `.flf`

**不适用**：

- 要在浏览器里同步、无预加载地出画
- 需要交互式重绘或真图形——应看 [[ink]] / 终端 UI，而不是每次重跑 FIGdriver
- 想跟 C figlet 的每一个历史开关逐字节对齐
- 要把未实测的“很好看 / 很快”写成选型结论

## 固定版本边界

- 本文绑定 `patorjk/figlet.js@b95c2f03...`，包版本 `1.11.4`；npm `gitHead`、tag `v1.11.4` 与该提交一致。
- 运行时依赖只有 CLI 用的 `commander@^14.0.0`；字体文件随包装在 `fonts/` 与 `importable-fonts/`。
- 本文未安装依赖、未跑 vitest / CLI、未在真实终端量宽度，状态保持 `UNVERIFIED`。

## 学到什么

1. **同名包不是 Unix 二进制**——JS 驱动实现的是 FIGfont 规格，入口按运行时分叉。
2. **同步 API 依赖字体已经在内存里**——Node 用磁盘掩盖了这一点，浏览器不会。
3. **smush 是规格，不是装饰**——横竖两套规则决定相邻铅字怎么挤。
4. **CLI 默认值和库默认值要分开读**——宽度 80 只写在 commander 选项里。

## 应用型自测

1. 浏览器里直接 `figlet.textSync("Hi")`，字体从未加载，会怎样？
2. 不传 `width` 时，库会按 80 列折行吗？
3. `"A\nB"` 是两幅画中间空一行，还是会再做垂直 smush？

检查点：

1. 抛错。同步加载在浏览器未实现，只对已缓存字体有效。
2. 不会。库默认 `width: -1`；80 是 CLI 的默认。
3. 后者。`generateText` 对每行生成后再 `smushVerticalFigLines`。

## 延伸阅读

- 固定源码：[patorjk/figlet.js](https://github.com/patorjk/figlet.js) —— 本文绑定提交 `b95c2f03ccbc7e2a23e9fd030e8378c2d3b9dd0e`
- FIGfont 规格说明：仓库 `doc/figfont.txt`；作者站点 [taag](http://patorjk.com/software/taag/)
- 对照入口：`src/figlet.ts`、`src/node-figlet.ts`、`bin/index.js`
- [[gradient-string]] —— 给多行 ASCII 上水平渐变时要用 `multiline`，否则空格会跳色
- [[chalk]] —— 单色 ANSI；渐变是在它上面逐字符 `hex`

## 关联

- [[gradient-string]] —— 常见的“大字 + 渐变”CLI banner 另一半
- [[boxen]] —— 给已渲染文本套框，不再做 FIGfont
- [[chalk]] —— 终端上色基础设施
- [[ora]] —— 同行重绘，不是一次性 banner
- [[ink]] —— 需要布局和 diff 时的替代路线

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[gradient-string]] —— gradient-string — 给终端字符串铺一条渐变
