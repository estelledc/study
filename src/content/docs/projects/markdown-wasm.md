---
title: markdown-wasm — 把 md4c 封进 WASM 房间的 Markdown 渲染器
description: markdown-wasm 用一份共享 WASM 缓冲把 markdown 编译成 HTML。
来源: 'https://github.com/rsms/markdown-wasm'
日期: 2026-08-27
分类: Markdown / 解析
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/rsms/markdown-wasm
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 0aa6c8ff6c717859599b32fb203166c1d73d838e
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: '1.2.0'
---

## 是什么

markdown-wasm 是一个 **WebAssembly Markdown 渲染器**：JavaScript 只负责把源码送进隔离内存，真正的解析器是 vendored 的 [md4c](https://github.com/mity/md4c)。日常类比：像把排版车间封进一间只能递纸条的房间——你从窗口塞进 UTF-8，窗口再递出 HTML；房间里怎么断行、怎么认表格，JS 看不见。

你写：

```js
const markdown = require("markdown-wasm");
console.log(markdown.parse("# hello\n*world*"));
```

ESM / 浏览器路径要先等模块就绪：

```js
import * as markdown from "markdown-wasm";
await markdown.ready;
markdown.parse("# hello");
```

固定 `1.2.0` 的公开面几乎只有 `parse`、`ParseFlags` 和 `ready`。它不暴露 AST，也不提供 micromark 那种 extension 表。

## 为什么重要

不理解这层 WASM 封装，下面这些事都解释不通：

- 为什么默认渲染更像 GitHub，而不是严格 CommonMark-only
- 为什么 `bytes: true` 拿回来的 `Uint8Array` 不能攒着下次再用
- 为什么 `allowJSURIs` 只管 `<a href>`，不管 `<img src>`
- 为什么 `onCodeBlock` 一回头插入的是“已经算 HTML 的字节”，回调必须自己转义

## 核心要点

固定源码的主链可以拆成四步：

1. **选旗标，再进 WASM**：`parseFlags` 默认是 `COLLAPSE_WHITESPACE | PERMISSIVE_ATX_HEADERS | PERMISSIVE_URL_AUTO_LINKS | STRIKETHROUGH | TABLES | TASK_LISTS`。`format` 只接受 `html` / `xhtml`。

2. **一份可复用输出缓冲**：C 侧 `parseUTF8` 重置静态 `outbuf`，按输入长度的两倍预留，再调用 `fmt_html → md_parse`。注释写明这块缓冲不能跨宿主调用重叠使用。

3. **HTML 回调直接写标签**：`fmt_html.c` 按 md4c 的 block/span 回调拼 `<h1>`、`<a>`、`<table>`。`javascript:` 只在 `<a href>` 上被跳过，除非 `allowJSURIs: true`。

4. **加载形态不同**：Node 的 `dist/markdown.node.js` 内嵌压缩 WASM；ESM / 浏览器要另载 `markdown.wasm`，并 `await ready`。`src/fmt_json.c` 存在，但 `md.c` 里被注释掉，不是公开 API。

## 实践示例

### 案例 1：Node 里最短路径

```js
const markdown = require("markdown-wasm");
console.log(markdown.parse("# hello\n*world*"));
```

CJS 入口已经把 WASM 打进同一个文件。不要把这条路径的“不用 await”抄到 ESM。

### 案例 2：默认旗标会认任务列表和表格

```js
import * as markdown from "markdown-wasm";
await markdown.ready;

markdown.parse("- [x] done\n\n| a | b |\n| - | - |\n| 1 | 2 |");
```

这是 `ParseFlags.DEFAULT` 的行为，不是“CommonMark 内核意外支持 GFM”。若只要更严的子集，必须自己组合旗标。

### 案例 3：共享缓冲与危险协议不是同一套合同

```js
const bytes = markdown.parse("# A", { bytes: true });
const copy = bytes.slice();
markdown.parse("# B", { bytes: true });
// `bytes` 现在指向下一次 parse 的内存；要保留先 slice

markdown.parse("[x](javascript:alert(1))");
markdown.parse("![](javascript:alert(1))");
```

第一句链接的 `javascript:` 默认被跳过；第二句图片 `src` 在固定 `fmt_html.c` 里没有同样检查。

## 踩过的坑

1. **ESM 里忘了 `await ready`**：浏览器 / `markdown.es.js` 必须等 WASM 实例化。
2. **把 `bytes` / 已弃用的 `asMemoryView` 结果存起来**：下一轮 `parse()` 会复用同一块堆。
3. **以为 `allowJSURIs` 等于 micromark 的协议 allowlist**：它只做 `javascript:` 前缀，而且只管锚点。
4. **`onCodeBlock` 返回值未转义**：非 null 返回会原样插入 HTML。
5. **把 master 当成 1.2.0**：`master` 比 tag 多一个 readme 提交；本文绑的是 tag / npm `gitHead`。

## 适用 vs 不适用场景

**适用**：

- 只要 markdown → HTML，并能接受 GitHub 风格默认旗标
- 浏览器或 Node 里想把解析器放进 WASM 隔离内存
- 用 `onCodeBlock` 自己高亮，且能保证转义

**不适用**：

- 需要事件流、mdast 或可组合 syntax extension——看 [[micromark]] / [[unified]]
- 需要图片和链接同一套协议 allowlist
- 要把 README 里的 benchmark 图当成当前环境结论——本轮未跑 `test/benchmark`

## 固定版本边界

- 本文绑定 `rsms/markdown-wasm@0aa6c8ff...`，即 GitHub tag `v1.2.0` 与 npm `markdown-wasm@1.2.0`，`gitHead` 一致。
- `package.json` 无 `engines` 字段；运行面取决于宿主的 WASM 能力。
- 解析器是 vendored md4c，不是运行时再去拉 `mity/md4c`。
- 未安装依赖、未编译 WASM、未跑 spec / benchmark，状态保持 `UNVERIFIED`。

## 学到什么

1. **默认旗标就是方言**——不写 options 时，你得到的是 GitHub 风格，不是“裸 CommonMark”
2. **WASM 封装会把缓冲策略泄漏到 JS API**——`bytes: true` 是性能开关，也是生命周期陷阱
3. **“禁 javascript:”不等于通用消毒**
4. **加载完成和 parse 成功是两件事**——ESM 先 `ready`，C 侧失败才变 `ERR_MD_PARSE`

## 应用型自测

1. 在 `dist/markdown.es.js` 路径上，第一次 `parse()` 之前必须做什么？
2. `parse(src, { bytes: true })` 得到的数组，能否在下一次 `parse()` 之后继续当稳定结果用？
3. 默认选项下，`![](javascript:alert(1))` 会像链接一样被丢掉 `javascript:` 吗？

检查点：

1. `await ready`（或 `markdown.ready`）。
2. 不能。共享 `outbuf` 会被下一轮覆盖，需要先 `slice()`。
3. 不会。固定实现只过滤锚点上的 `javascript:`。

## 延伸阅读

- 固定源码：[rsms/markdown-wasm](https://github.com/rsms/markdown-wasm) —— 本文绑定 `0aa6c8ff6c717859599b32fb203166c1d73d838e`
- 审查记录：仓库内 `docs/markdown-parser-source-review-20260827-dv.md`
- md4c 上游：[mity/md4c](https://github.com/mity/md4c)
- [[micromark]] —— 同期对照：JS 状态机 + 默认协议 allowlist
- [[unified]] —— 若还要把 HTML 再收成 AST

## 关联

- [[micromark]] —— JS construct 状态机，默认更严的协议/HTML 策略
- [[unified]] —— 需要 mdast / plugin 时的上层
- [[markdown-it]] —— 另一条 JS token-stream，本轮未绑定
- [[marked]] —— 正则 lexer，本轮未绑定
