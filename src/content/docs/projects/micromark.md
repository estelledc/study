---
title: micromark — 一个字一个字往前推的 CommonMark 状态机
description: micromark 用 construct 状态机发事件，再编译成默认消毒的 HTML。
来源: 'https://github.com/micromark/micromark'
日期: 2026-08-27
分类: Markdown / 解析
难度: 中级
difficulty: intermediate
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
  applicable_version: '4.0.2'
---

## 是什么

micromark 是一个 **JavaScript CommonMark 解析器**：输入 markdown 字符串或 `Uint8Array`，默认输出 HTML。日常类比：像收银员一个字符一个字符扫条形码——每扫到边界就记下“标题开始 / 段落结束”，最后再把这些事件编译成收据（HTML）。

你写：

```js
import { micromark } from "micromark";
const html = micromark("# Hello *world*");
```

固定 `4.0.2` 里，这一句实际是 `preprocess → parse().document().write → postprocess → compile`。它**不先建一棵业务 AST**；AST 是上层 `mdast-util-from-markdown` / [[unified]] 的事。GFM、MDX、math 也不在本仓，要另装 `micromark-extension-*`。

## 为什么重要

不理解这台状态机，下面这些事都解释不通：

- 为什么 [[unified]] / remark / MDX 的最底层不是正则切 token，而是 construct + enter/exit 事件
- 为什么 `micromark/stream` 看起来能 pipe，却不能指望第一个 `<h1>` 立刻流出来
- 为什么默认把 HTML 显示成文本、把危险协议丢掉——这是 compile 选项，不是“解析失败”
- 为什么旧印象里的“GB 级文件常数内存、流式边读边吐 HTML”对不上固定源码

## 核心要点

固定源码的主链可以拆成四步：

1. **预处理成码点块**：`preprocess()` 用 `TextDecoder` 解 `Uint8Array`，丢掉开头 BOM，并把 `\0` / tab / CR / LF 收成 tokenizer 能吞的 chunk。

2. **按字符码挂 construct**：`parse()` 把 `micromark-core-commonmark` 的默认 construct 和 `extensions` 合成一张表，再给出 `document` / `content` / `flow` / `string` / `text` 五套 tokenizer。`#` 走 ATX heading，`` ` `` 走 fenced / code text，`>` 走 block quote。

3. **effects 推进状态机**：`attempt` / `check` / `interrupt` 试一条 construct，`consume` 吃掉当前码点，`enter` / `exit` 往事件栈推具体 token。`postprocess()` 反复 `subtokenize`，直到事件列表稳定。

4. **compile 默认偏安全**：HTML 仍按 CommonMark 被 token 化，但 `allowDangerousHtml` 默认 false，所以会显示成文本。图片 `src` 默认只留 `http`/`https`，链接 `href` 默认只留 `http`/`https`/`irc`/`ircs`/`mailto`/`xmpp`。

## 实践示例

### 案例 1：一站式渲染，并看清默认消毒

```js
import { micromark } from "micromark";

micromark("# Hi\n\n<script>x</script>");
micromark("[x](javascript:alert(1))");
```

第一句仍会识别 HTML 块，但默认不会变成真标签；第二句的 `javascript:` 会被丢掉。信任内容时才显式传 `allowDangerousHtml` / `allowDangerousProtocol`。

### 案例 2：只要事件，不要 HTML

```js
import { parse, postprocess, preprocess } from "micromark";

const events = postprocess(
  parse().document().write(preprocess()("# Hi", undefined, true)),
);
for (const [kind, token] of events) {
  console.log(kind, token.type);
}
```

这是固定包的公开导出，不必再写已不存在的 `micromark/lib/parse`。业务代码若要树，应走 unified，而不是自己把事件拼 AST。

### 案例 3：`stream()` 是 duplex，不是边写边出 HTML

```js
import { stream } from "micromark/stream";

const s = stream();
s.on("data", (html) => console.log(html));
s.write("# Hello\n");
s.end();
```

`write()` 只做 preprocess + tokenize；`compile(postprocess(...))` 发生在 `end()`。`compile.js` 写明 markdown 不能真正流式，必须先缓冲事件。

## 踩过的坑

1. **把 stream 写成常数内存的真正流式渲染**：HTML 在 `end()` 一次性发出。大文件是否省内存，本轮未测，不能从 API 形状外推。
2. **从 `micromark/lib/parse` 深链内部文件**：固定 4.0.2 的公开入口是主包和 `micromark/stream`。
3. **以为本仓自带 GFM**：workspace 只有 CommonMark construct；表格、任务列表要另装扩展。
4. **把“解析到 HTML token”当成“会输出 HTML 元素”**：默认 `allowDangerousHtml: false`。
5. **把 README 的 100% CommonMark 写成已跑通的 0.30 / 742 条**：workspace 依赖是 `commonmark.json@^0.31.0`；本轮未跑 fixture。

## 适用 vs 不适用场景

**适用**：

- 需要 CommonMark 事件流或默认消毒 HTML 的工具链底层
- 要挂 syntax / html extension，而不是改核心状态机
- Node 16+ 的 ESM 项目，或浏览器里用 ESM 构建

**不适用**：

- 只要“字符串进、HTML 出”、并能接受 GitHub 风格默认旗标——看 [[markdown-wasm]]
- 直接要 mdast / 可组合 plugin——应走 [[unified]] + remark，而不是自己消费事件
- 需要已验证的流式常量内存或固定 bundle 数字——本页没有这类运行证据

## 固定版本边界

- 本文绑定 `micromark/micromark@3fae1552...`，即 GitHub tag / npm `micromark@4.0.2`，二者 `gitHead` 一致。
- 包是 ESM-only；readme 写 `micromark@4` 兼容 Node.js 16+。
- 核心依赖 `micromark-core-commonmark` 与一组 `micromark-util-*` / `micromark-factory-*`。
- 未安装依赖、未跑上游测试或测量体积，状态保持 `UNVERIFIED`。

## 学到什么

1. **解析和编译是两段合同**——token 存在，不代表 HTML 元素会被放行
2. **流式 API 可能只流式地吃输入**——输出仍可能在收尾时一次性出现
3. **扩展挂在字符码上，而不是挂在 AST visitor 上**
4. **合规率必须绑到具体 fixture 与一次真实运行**——依赖版本不是测试结果

## 应用型自测

1. `stream().write("# A")` 之后，监听 `data` 一定会立刻拿到 `<h1>` 吗？
2. 默认选项下，`micromark("<em>x</em>")` 会输出真正的 `<em>` 元素吗？
3. 固定 4.0.2 的 workspace 里，有没有 GFM table construct？

检查点：

1. 不会。HTML 在 `end()` 才 `compile`。
2. 不会。默认 `allowDangerousHtml` 为 false，HTML 显示成文本。
3. 没有。表格属于独立 extension 包。

## 延伸阅读

- 固定源码：[micromark/micromark](https://github.com/micromark/micromark) —— 本文绑定 `3fae15528f69dfaf2a8865a7f7d92bfb4abd7bc9`
- 审查记录：仓库内 `docs/markdown-parser-source-review-20260827-dv.md`
- CommonMark：[spec.commonmark.org](https://spec.commonmark.org/)
- [[unified]] —— 把 micromark 事件收成 mdast 的上层
- [[markdown-wasm]] —— 同期对照：WASM 里的 md4c，一次 `parse()` 出 HTML

## 关联

- [[unified]] —— remark / rehype 总入口，底层事件来自 micromark
- [[markdown-wasm]] —— 另一条“字符串 → HTML”路线，默认旗标更像 GitHub
- [[markdown-it]] —— token-stream 老派对手，本轮未绑定
- [[marked]] —— 正则 lexer 路线，本轮未绑定
- [[astro]] —— 站点 markdown 常走 unified → micromark
