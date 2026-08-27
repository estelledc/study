---
title: insane — 丢掉不在名单里的整棵 HTML 子树
description: 介绍 insane 2.6.2 如何用浅合并白名单、子树忽略和 URL scheme 前缀过滤 HTML。
来源: https://github.com/bevacqua/insane
日期: 2026-08-27
分类: 工具库
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/bevacqua/insane
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 641ad8e9e1e9894eddd24806f1d81acb3550dc1d
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.6.2
---

## 是什么

insane 是一个面向白名单的小型 HTML 过滤器。日常类比：安检不是把违禁品贴封条继续往里送，而是把整件行李连同里面的东西一起拿掉。标签不在名单里，它的子孙文本也不会出现在输出中。

你写：

```js
var insane = require('insane');

insane('<div>foo<span>bar</span></div>', { allowedTags: ['div'] });
// => '<div>foo</div>'
```

`span` 不在这次名单里，`bar` 跟着消失。固定 2.6.2 的入口是 `insane.js`：先决定配置，再让 `parser` 回调 `sanitizer`，最后把 buffer 拼成字符串。

## 为什么重要

不理解它的浅合并、子树忽略和“class 两种合同”，就解释不了下面几件事：

- 为什么只传 `{ allowedTags: ['span'] }` 时，默认的 `href` 规则还在
- 为什么丢掉一个包装标签会连里面的字一起没
- 为什么 `iframe` 写在默认属性表里，默认却滤不出来
- 为什么 `class` 有时按名单筛，有时整串放行

## 核心要点

固定 2.6.2 的主链可以拆成五步：

1. **先合并配置**：第三个参数 `strict === true` 时只用你给的 options。否则 `assign({}, defaults, options)` 浅合并。数组字段整表替换，没写的字段继续用 defaults。

2. **正则切标签**：`parser.js` 用 `rstart` / `rend` / `rattrs` 吃字符串。注释有 handler 才保留；默认 sanitizer 没有 `comment`，所以注释直接丢。属性值先 `he.decode`。

3. **决定是否忽略整棵子树**：标签不在 `allowedTags`，或 `filter({ tag, attrs })` 返回假值，就进入 `ignore`。void 标签忽略后立刻返回；普通标签记下名字和深度，子孙 `chars` 不再输出。

4. **写出留下的标签**：小写标签名，逐个属性检查。URI 属性还要过 `testUrl`。通过的属性名按原文写出，值走 `he.encode`。布尔属性（值为 `undefined`）只写名字。

5. **文本默认不编码**：`chars` 把文本原样推进 buffer，除非提供 `transformText`。浏览器构建用 `she.js` 替换 npm 上的 `he`。

## 实践示例

### 案例 1：不允许的标签带走子孙

```js
insane('<p>safe<script>alert(1)</script></p>');
// => '<p>safe</p>'
```

`p` 在默认 `allowedTags` 里。`script` 不在，`ignore('script')` 之后 `alert(1)` 不会进 buffer，结束标签再 `unignore`。这和 [[xss]] 默认把 `<script>` 转成实体留在原文里不同。

### 案例 2：浅合并让你只改名单、不改 URL 规则

```js
insane('<a href="https://example.com">ok</a><a href="javascript:alert(1)">no</a>', {
  allowedTags: ['a']
});
```

`allowedTags` 被整表换成只有 `a`，但 `allowedAttributes` 与 `allowedSchemes` 仍来自 defaults。`https:` 留下；`javascript:` 因为是 URI 属性且不在 `http` / `https` / `mailto` 前缀里，属性被丢掉，标签还在。

### 案例 3：`class` 的两条路

```js
insane('<span class="super mean">x</span>', {
  allowedTags: ['span'],
  allowedClasses: { span: ['super'] }
});
// => '<span class="super">x</span>'

insane('<span class="super mean">x</span>', {
  allowedTags: ['span'],
  allowedAttributes: { span: ['class'] }
});
// => '<span class="super mean">x</span>'
```

`class` 不在该标签属性白名单时，才按 `allowedClasses` 逐个 token 过滤。一旦把 `class` 写进 `allowedAttributes`，整串 class 都会留下。

## 踩过的坑

1. **以为 `strict` 只是“更严的默认名单”**：它关闭与 defaults 的合并。`strict: true` 且只给 `allowedTags` 时，属性表是空的，连 `href` 也不会过。

2. **按 readme 里的 JSON 背默认名单**：`defaults.js` 另有 `abbr`、`mark`，以及 `a`/`img` 的 `title`、`aria-label`、`alt`。以源码文件为准。

3. **看见 `iframe` 的属性表就以为默认能输出 iframe**：默认 `allowedTags` 不含 `iframe`。要输出它，必须自己把标签加进名单，`src` 仍受 scheme 检查。

4. **把文本节点当成已经 HTML escape**：`chars` 默认原样输出。标签过滤不等于文本编码；需要改文本得自己写 `transformText`。

5. **把 readme 的 gzip 体积当成本轮测量**：文档写过约 2kb，本轮未打包、未安装 `he` / `assignment`。

## 适用 vs 不适用场景

**适用**：

- 想让不在名单里的标签连同内部文本一起消失
- 需要按标签配置属性，并接受默认 `http` / `https` / `mailto`
- 打包器能消费无 CSS 解析器的小型入口

**不适用**：

- 希望名单外的标签变成可见转义文本——看 [[xss]]
- 需要默认放行 `tel:`、`data:image/`、`ftp://` 这类前缀——xss 的 `safeAttrValue` 更宽，insane 默认没有
- 要把浏览器 HTML5 容错（自动补全、表格修复）当成解析结果——这里是正则扫描
- 不能接受浅合并把“只改 tags”理解成“只改 tags 且清空属性表”

## 固定版本边界

- 本文绑定 `bevacqua/insane@641ad8e9e1e9894eddd24806f1d81acb3550dc1d`，tag `v2.6.2` 与 npm `insane@2.6.2` 的 `gitHead` 指向同一提交。
- `package.json` 的 `browser.he` 指向 `./she.js`；Node 路径仍 `require('he')`。
- URI 属性集合写在 `attributes.js`：`background`、`base`、`cite`、`href`、`longdesc`、`src`、`usemap`。
- 本文未安装依赖或运行 `tape`，状态保持 `UNVERIFIED`。

## 学到什么

1. **删除是子树操作**——忽略一个标签时，深度计数决定子孙文本出不了局。
2. **浅合并会留下你没写的默认表**——改 tags 不等于清空 attributes / schemes。
3. **URL 检查只看开头和冒号位置**——相对路径可以没有 scheme；`javascript:` 过不了默认 scheme 表。
4. **class 白名单和 class 属性白名单互斥**——把 `class` 放进属性表，就不再按类名过滤。

## 应用型自测

1. `insane('<div>foo<span>bar</span></div>', { allowedTags: ['div'] })` 里还会不会出现 `bar`？
2. 只传 `{ allowedTags: ['a'] }` 且 `strict` 不是 `true` 时，`https` 链接还会不会按默认 scheme 检查？
3. 默认配置下，单独一个 `<iframe src="https://example.com"></iframe>` 会不会因为属性表里有 `iframe` 而留下？

检查点：

1. 不会。`span` 被 ignore 后，子孙文本不进 buffer。
2. 会。浅合并保留 defaults 的 `allowedSchemes` 与 `a` 的 `href`。
3. 不会。默认 `allowedTags` 没有 `iframe`，属性表用不上。

## 延伸阅读

- 固定源码：[bevacqua/insane](https://github.com/bevacqua/insane) —— 本文绑定提交 `641ad8e9e1e9894eddd24806f1d81acb3550dc1d`
- [[xss]] —— 默认转义名单外标签，而不是丢掉子树
- [[markdown-it]] —— 常见的“先渲染再外接 sanitizer”上游

## 关联

- [[xss]] —— 白名单 HTML 过滤的转义对照组
- [[marked]] —— HTML token 直通，渲染后仍要过滤
- [[markdown-it]] —— 默认关 HTML；打开后仍要外接过滤
- [[unified]] —— 用 plugin 接 sanitize，而不是一个函数吃完整字符串

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
