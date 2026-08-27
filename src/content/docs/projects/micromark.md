---
title: micromark — 用状态机发 token 事件再编成 HTML
来源: https://github.com/micromark/micromark
日期: 2026-05-30
分类: Markdown / 解析
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/micromark/micromark
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 3fae15528f69dfaf2a8865a7f7d92bfb4abd7bc9
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 4.0.2
---

## 是什么

micromark 是一个 **CommonMark 取向的 Markdown tokenizer**：按字节推进状态机，发出带位置的 concrete token，再可选地编成 HTML。日常类比：收银扫描枪——每个字符都入账，先打出事件小票，需要时再打印收据（HTML）。它**不建 mdast**。

固定 `4.0.2` 的一站式入口把四步收成一行：

```js
import {micromark} from 'micromark'

micromark('# Hello *world*')
// '<h1>Hello <em>world</em></h1>'
```

源码展开是 `compile(options)(postprocess(parse(options).document().write(preprocess()(value, encoding, true))))`。

## 为什么重要

不读固定 4.0.2 源码，很容易把 micromark 讲成“无限流式 AST 引擎”：

- 为什么它能直接吐 HTML，却仍被 [[unified]] 当底层——HTML compiler 是内置便利层，事件才是主产品
- 为什么 `micromark('<x>')` 默认不是 `<x>`——原始 HTML 要 `allowDangerousHtml`
- 为什么 `javascript:` 图片默认进不了 `src`——协议白名单，需 `allowDangerousProtocol` 才关
- 为什么 `stream()` 看起来像管道，结束时仍要缓冲——注释写明 markdown 无法真正流式

## 核心要点

固定版本可以拆成四层：

1. **preprocess**：去掉 BOM，把 `\0` / `\t` / `\n` / `\r` 切成 chunk。字符串或 `Uint8Array` 都能进，编码默认按引擎的 UTF-8。

2. **parse + tokenizer**：`combineExtensions` 合并默认 CommonMark constructs 与 `options.extensions`。`document` / `flow` / `content` / `text` / `string` 是不同入口。construct 按首字符分发，例如 `#` 走 ATX heading。

3. **postprocess**：循环 `subtokenize` 直到不再产生新的内层 token。这是嵌套结构收口的地方。

4. **compile**：事件 → HTML。默认丢掉 raw HTML；`href` 只放行 `https?|ircs?|mailto|xmpp`，`src` 只放行 `https?`。GFM 不在本包，要另挂 syntax / html extension。

## 实践示例

### 案例 1：默认安全的 HTML，而不是“原样嵌 HTML”

```js
import {micromark} from 'micromark'

micromark('<x>')                    // 不是 '<x>'
micromark('<x>', {allowDangerousHtml: true}) // '<x>'
```

仓库测试把这条写成 unsafe 开关。默认关，不是漏实现。

### 案例 2：拆开四步，只拿事件

```js
import {parse, preprocess, postprocess} from 'micromark'

const events = postprocess(
  parse().document().write(preprocess()('# Hi', undefined, true))
)
```

公开导出就是这些函数，加上 `compile` 与 `micromark/stream`。旧文里的 `micromark/lib/parse` 不是 4.0.2 的导出合同。

### 案例 3：stream 在 `end` 才交出整段 HTML

```js
import {stream} from 'micromark/stream'

const s = stream()
s.on('data', (html) => { /* 一次完整结果 */ })
s.write('# Hi\n')
s.end()
```

`write` 只喂 tokenizer。`end` 才 `postprocess` + `compile` 并 `emit('data')` 一次。注释写明部分工作可流式，最终仍要缓冲；micromark 自己不处理、不发出 parse error。

## 踩过的坑

1. **把 stream 写成“GB 级常数内存、边读边出第一个 `<h1>`”**：结束前会缓冲事件。
2. **把 GFM 任务列表当成内置**：默认 constructs 是 CommonMark；GFM 是外部 extension。
3. **默认输出里找 raw HTML 或 `javascript:` 图片**：要显式打开危险开关。
4. **从事件直接当 AST 用**：事件是 enter/exit token，建树是 `mdast-util-from-markdown` 的事。
5. **把 readme 的“100% CommonMark / ±14kb”抄进结论**：本页未跑 `commonmark.json@0.31.0` 套件，也未测 bundle。

## 适用 vs 不适用场景

**适用**：

- 只要 Markdown → HTML，并接受默认 sanitize 边界
- 要自己消费 token 事件，或给 remark-parse 这类包装提供底层
- 需要按 constructs 挂语法扩展，而不是改核心

**不适用**：

- 需要一棵可变换的 mdast：走 [[unified]] + remark-parse，不要停在本包
- 假设 `stream()` 等于真正的逐 token 输出
- 把静态阅读写成已跑通 CommonMark 套件或性能数字

## 固定版本边界

- 本文绑定 `micromark/micromark@3fae15528f69dfaf2a8865a7f7d92bfb4abd7bc9`，tag / npm `micromark@4.0.2`，`gitHead` 一致。
- 4.0.2 发布说明是内部字段允许 trailing whitespace；未验证该字段的产品面行为。
- workspace 根版本号是占位 `0.0.1`；以 `packages/micromark` 的 `4.0.2` 为准。
- readme 写明 Node.js 16+。
- 未安装依赖、运行 `test-api` 或测量体积，状态保持 `UNVERIFIED`。

## 学到什么

1. **tokenizer 和 AST 是两份合同**——micromark 卖事件，mdast 是别人的活
2. **内置 HTML 编译是便利层**——存在是为了对照 CommonMark 用例，不是唯一出口
3. **默认安全是编译选项，不是解析失败**——危险 HTML/协议被丢掉或改写
4. **stream API 仍有缓冲点**——可写管道 ≠ 真正流式语义

## 应用型自测

1. `micromark('<em>x</em>')` 在默认选项下会原样留下 `<em>` 吗？
2. 调用 `stream()` 并 `write('# A')` 但还没 `end()`。会不会已经 `emit('data')`？
3. 本包的 `parse().document().write(...)` 返回的是 mdast `root` 吗？

检查点：

1. 不会。默认关掉 raw HTML，要 `allowDangerousHtml`。
2. 不会。`data` 在 `end` 里才发出。
3. 不是。那是 token 事件；mdast 在别的包。

## 延伸阅读

- 固定源码：[micromark/micromark](https://github.com/micromark/micromark) —— 本文绑定 `3fae15528f69dfaf2a8865a7f7d92bfb4abd7bc9`
- 审查记录：仓库内 `docs/markdown-pipeline-source-review-20260827-dj.md`
- CommonMark 规范：[spec.commonmark.org](https://spec.commonmark.org/)（本页未宣称某一版 100% 通过）
- [[unified]] —— 把事件翻成树、再跑 plugin 的上层核

## 关联

- [[unified]] —— 用 plugin 接 parse/run/stringify；micromark 常在 parser 底下
- [[markdown-it]] —— 另一条 token / renderer 模型，不是同一套 constructs
- [[marked]] —— 更偏“一锤子 HTML”的路径
- [[astro]] —— 站点 Markdown 管线常间接依赖这条链
- [[starlight]] —— 文档主题，扩展口在 remark/rehype，不直接调本包

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
