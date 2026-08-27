---
title: sugar-high — 零依赖、按 canonical 语言名返回 HTML 的轻量高亮器
description: 介绍 sugar-high 2.1.0 如何用启发式 tokenizer、canonical 语言表和 CSS 变量把代码变成 HTML。
来源: https://github.com/huozhi/sugar-high
日期: 2026-08-27
分类: 语法高亮
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/huozhi/sugar-high
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 6f528911d683004a3c8013781e771d1404a79d81
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.1.0
---

## 是什么

sugar-high 是一个零生产依赖的 JavaScript 语法高亮库。日常类比：不用搬整本编辑器词典，只带一套「关键词 / 字符串 / 注释」的小型切词器；切完直接吐出带 class 的 HTML，浏览器靠 CSS 变量上色。

你写：

```js
import {highlight} from 'sugar-high'

const html = highlight('const ready = true')
const py = highlight('print("hi")', {lang: 'python'})
```

默认按 JavaScript（含 JSX）处理。固定 2.1.0 的源码在 monorepo 的 `packages/sugar-high`，不依赖 TextMate，也不加载 WASM。

## 为什么重要

不理解它的语言名、parse/render 分层和 JS/TS 启发式，就解释不了下面几件事：

- 为什么 `lang: 'py'` 不会走 Python 关键词表
- 为什么主包只导出 `highlight`，别名映射却在 `sugar-high/lang`
- 为什么同一段带 `interface` 的代码，默认 JS 模式可能突然换一套 TS 关键词
- 为什么换主题常常只改 `--sh-keyword`，不必重跑库

## 核心要点

固定 2.1.0 的主链可以拆成五步：

1. **按入口分层**：`sugar-high` 只导出 `highlight`；`sugar-high/core` 给出 `parse` / `render` / `tokenize`；`sugar-high/lang` 给出 `lang()` 和 25 个内置语言。
2. **只认 canonical id**：`highlight` 用 `id === (name || 'javascript')` 取 config。`js` / `py` / `bash` 要先 `lang()` 译成 `javascript` / `python` / `shell`。
3. **通用 lexer + 可选定制**：多数语言走关键词 / 字符串 / 注释扫描；复杂语言可提供自己的 `tokenize`。JS/TS 走 `javascript-runtime`。
4. **JS 默认识别 TS**：未传 `typescript` 布尔时，`isLikelyTypeScript` 分数 ≥ 2 就改用 TS 关键词。`lang: 'typescript'` 则强制 `typescript: true`。
5. **行 + token 再序列化**：`assemble` 按换行切行；`generate` 加上 `sh__line` / `sh__token--*` 和 `var(--sh-*)`；`toHtml` 转义 `& < > " '`。

## 实践示例

### 案例 1：默认 JS，或显式 canonical 名

```js
import {highlight} from 'sugar-high'

highlight('const ready = true')
highlight('print("hi")', {lang: 'python'})
highlight('{"ready": true}', {lang: 'json'})
```

省略 `lang` 时按 `javascript` 取 config。`python` / `json` 是表里的 id，不是文件扩展名。

### 案例 2：别名必须先 `lang()`

```js
import {highlight} from 'sugar-high'
import {lang} from 'sugar-high/lang'

lang('py')     // 'python'
lang('bash')   // 'shell'
lang('.yml')   // 'yaml'

highlight('print("hi")', {lang: lang('py')})
```

`lang()` 会去点、转小写，再查 id / extension / aliases。`highlight` 本身不做这一步。

### 案例 3：core 只带自己需要的语言

```js
import {parse, render} from 'sugar-high/core'
import * as python from 'sugar-high/lang/python'

const html = render(parse('print("hi")', python))
```

`core` 不带内置注册表。`cx` 先合并 class，再调用 `mark`；`markLine` 的 `index` 从 0 起。

## 踩过的坑

1. **把 `lang: 'js'` 传给 `highlight`**：查找只比 `id`。`js` 对不上 `javascript`，于是 config 变成 `undefined`，退回没有关键词表的通用 lexer。
2. **以为默认永远是「纯 JS」**：JS tokenizer 会按启发式切换 TS 关键词；要稳定 JS 语义得自己传选项，或改用明确的 TypeScript 入口。
3. **把 `markLine` 的行号当成 1-based**：对象上的 `index` 从 0 起。React 包装的 `highlightLines` 才是从 1 起，本页未运行该包装。
4. **把 npm 的 `gitHead` 当成绑定依据**：`sugar-high@2.1.0` 没有 `gitHead`。本页绑定的是 package tag 剥皮提交。
5. **把「轻量」理解成本轮测过的体积**：未安装依赖、未打包、未测 bundle。

## 适用 vs 不适用场景

**适用**：

- 只要常见语言的 HTML + CSS 变量主题，不能接受 WASM
- 打包器能按 `sugar-high/lang/python` 只收几种语言
- 输入侧已经能给出 canonical 名，或愿意先调用 `lang()`

**不适用**：

- 需要 GitHub / VS Code 同款 TextMate 着色——看 [[starry-night]] 或 [[shiki]]
- 必须覆盖 600+ 语言或嵌套 grammar 依赖
- 不能接受未知 `lang` 静默退化成无关键词扫描

## 固定版本边界

- 本文绑定 `huozhi/sugar-high@6f528911d683004a3c8013781e771d1404a79d81`，即 annotated tag `sugar-high@2.1.0` 的剥皮提交；`packages/sugar-high/package.json` 的 version 为 `2.1.0`。
- npm `sugar-high@2.1.0` 未提供 `gitHead`，因此不把它当成同一提交的证明。
- 根仓 `package.json` 名为 `sugar-high-monorepo` 且 `private: true`；发布物在 `packages/sugar-high`，无生产依赖。
- `lib/lang.js` 在该提交登记 25 个 language id。
- 本文未安装依赖、运行上游测试或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **canonical 名和别名是两个入口**——`highlight` 认 id；围栏别名走 `lang()`。
2. **默认 JS 带启发式**——同一 tokenizer 可能按源码形态切换 TS 关键词。
3. **HTML 是 render 的结果，不是 parse 的结果**——`core` 允许先拿行/token，再自己画。
4. **未知语言不会报错**——对不上 id 就按通用 lexer 走，颜色会「看起来能用但关键词不对」。

## 应用型自测

1. `highlight('print("hi")', {lang: 'py'})` 会不会使用 Python 关键词表？
2. 不传 `lang` 时，`highlight` 按哪一个 language id 取 config？
3. `markLine` 回调里第一行的 `line.index` 是 `0` 还是 `1`？

检查点：

1. 不会。`py` 对不上 id，config 为空，走通用 lexer。
2. `javascript`。`name || 'javascript'`。
3. `0`。行号在 `assemble` 里从 0 累加。

## 延伸阅读

- 文档：[sugar-high.vercel.app](https://sugar-high.vercel.app)
- 固定源码：[huozhi/sugar-high](https://github.com/huozhi/sugar-high) —— 本文绑定提交 `6f528911d683004a3c8013781e771d1404a79d81`
- [[starry-night]] —— TextMate + WASM + hast 的对照
- [[shiki]] —— 另一条重型、编辑器对齐的路线

## 关联

- [[starry-night]] —— 需要 GitHub 级 grammar 与 hast 时的对照
- [[shiki]] —— 同样面向文档站，但依赖 VS Code 主题和引擎
- [[unified]] —— Remark 插件可把 sugar-high 接进 Markdown 管线；本页未运行该插件
- [[vite]] —— 可按 `sugar-high/lang/*` 做按语言引用
- [[starlight]] —— 文档站消费方；本站默认高亮栈不是 sugar-high

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[starry-night]] —— starry-night — 用 TextMate grammar 产出 GitHub 风格 hast 的高亮器
