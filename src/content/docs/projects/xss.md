---
title: xss — 用白名单决定转义还是留下 HTML
description: 介绍 xss 1.0.15 如何用白名单、转义默认值和 href/src 前缀规则过滤不可信 HTML。
来源: https://github.com/leizongmin/js-xss
日期: 2026-08-27
分类: 工具库
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/leizongmin/js-xss
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 9c92272047390671b9771a0fb439793f07521d8c
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.0.15
---

## 是什么

`xss`（仓库名 js-xss）是一个按白名单过滤 HTML 的 JavaScript 库。日常类比：门口保安拿着访客名单。名单上的人可以进，但外套口袋要检查；名单外的人不是赶走，而是把工牌改成纯文字，让浏览器不再把它当标签执行。

你写：

```js
var xss = require('xss');

xss('<script>alert("xss");</script>');
// => '&lt;script&gt;alert("xss");&lt;/script&gt;'
```

默认不会删掉 `script` 的字，只把 `<` / `>` 转成实体。固定 1.0.15 的入口是 `lib/index.js`：一次调用走 `filterXSS`，重复过滤可先 `new FilterXSS(options)` 再 `process()`。

## 为什么重要

不理解它的“默认转义、可选剥离、属性空值仍留名”，就解释不了下面几件事：

- 为什么滤完还能在页面上看到 `&lt;script&gt;`
- 为什么 `stripIgnoreTag` 会把脚本正文留在输出里
- 为什么非法 `href` 常常变成没有等号的 `href` 属性，而不是整属性消失
- 为什么自定义 `whiteList` 不会和默认表自动合并

## 核心要点

固定 1.0.15 的主链可以拆成五步：

1. **先准备 options，再扫字符串**：`FilterXSS` 浅拷贝配置。`whiteList` 与 `allowList` 等价，并先把键和属性名转成小写；两者都缺时才用默认表。`stripIgnoreTag` 会强行换成“忽略标签输出空串”，不能和自定义 `onIgnoreTag` 一起用。

2. **可选预处理**：`stripBlankChar` 去掉大部分控制字符（保留换行）。默认 `allowCommentTag` 为假，先跑 `stripCommentTag` 删 `<!-- ... -->`。

3. **按字符找标签**：`parseTag` 自己扫 `<` / `>` 和引号，不是浏览器 HTML5 解析器。标签名取小写后交给回调。

4. **白名单内重建标签**：开口标签用 `getAttrs` + `parseAttr` 拆属性。`onTagAttr` 可改写；否则白名单属性走 `safeAttrValue`。返回空字符串时，输出里仍留下属性名。非白名单标签默认 `escapeHtml`。

5. **可选再切掉忽略标签的正文**：`stripIgnoreTagBody` 先插入 `[removed]` / `[/removed]`，再按记录的输出位置把中间切掉。

## 实践示例

### 案例 1：默认转义，不是默认删除

```js
var xss = require('xss');
xss('<p>hi<script>alert(1)</script></p>');
// => '<p>hi&lt;script&gt;alert(1)&lt;/script&gt;</p>'
```

`p` 在默认白名单里，原样重建。`script` 不在名单里，整段标签被转义后夹在段落里。页面上看得到字，脚本不会跑。

### 案例 2：三种“忽略标签”合同

```js
xss('<script>alert(1)</script>');
xss('<script>alert(1)</script>', { stripIgnoreTag: true });
xss('<script>alert(1)</script>', { stripIgnoreTagBody: true });
```

第一种得到转义后的标签文本。第二种得到 `alert(1)`——标签没了，正文还在。第三种先打上 `[removed]` 标记再切片，脚本正文不会出现在最终字符串里。

### 案例 3：`href` / `src` 看前缀，不看浏览器会不会执行

```js
xss('<a href="https://example.com">ok</a>');
xss('<a href="javascript:alert(1)">no</a>');
xss('<img src="data:image/png;base64,AAA">');
```

`safeAttrValue` 只认 `http://`、`https://`、`mailto:`、`tel:`、`data:image/`、`ftp://`、`./`、`../`、`#`、`/`。`javascript:` 会得到空值，但属性名还在，输出接近 `<a href>no</a>`。`data:image/` 对 `src` 是放行前缀；`data:text/html` 不是。

## 踩过的坑

1. **把默认行为理解成“删掉危险标签”**：默认是转义。用户提交的脚本字面量仍会出现在 HTML 里，只是不再当标签解析。

2. **`stripIgnoreTag` 当消毒完成**：它只剥标签，正文留下。攻击载荷若写在文本里，仍可能进到后续不转义的 sink。

3. **自定义 `whiteList` 当增量补丁**：传入对象会整表替换。只写 `{ a: ['href'] }` 时，默认的 `p` / `img` / `kbd` 全部消失。

4. **把空 `href` 当成属性已删除**：`safeAttrValue` 拒绝后仍输出属性名。需要“属性消失”得在 `onTagAttr` / `onIgnoreTagAttr` 里自己返回空。

5. **把 README 的 MB/s 当成本轮测量**：文档写过吞吐对比，本轮未跑 benchmark，也未打开 `cssfilter` 源码仓。

## 适用 vs 不适用场景

**适用**：

- 需要一份可配置白名单，并接受“名单外默认转义”
- 想在 Node 或浏览器里复用同一套 `FilterXSS` 实例
- 要处理 `style` 时，能接受再走一层 `cssfilter`（`css=false` 可关）

**不适用**：

- 必须把不允许的标签连同子孙一起丢掉——看 [[insane]]
- Markdown 渲染本身的 HTML 开关——[[markdown-it]] 默认 `html: false`，[[marked]] 没有对等开关
- 不能接受 `engines.node >= 0.10.0` 与自定义字符扫描器相对浏览器 DOM 的差异
- 需要本轮未核验的 CSS 属性白名单细节——应回到 `cssfilter` 自己的源码

## 固定版本边界

- 本文绑定 `leizongmin/js-xss@9c92272047390671b9771a0fb439793f07521d8c`，tag `v1.0.15` 与 npm `xss@1.0.15` 的 `gitHead` 指向同一提交。
- 生产依赖是 `commander` 与 `cssfilter@0.0.10`；本轮未安装它们，也未运行 `mocha` / CLI。
- 默认白名单在 1.0.15 增加 `kbd`；属性默认用双引号，`singleQuotedAttributeValue: true` 才改成单引号。
- 本文未测量体积或吞吐，状态保持 `UNVERIFIED`。

## 学到什么

1. **白名单决定“重建还是转义”**——默认不是删除，转义后的标签文本仍在输出里。
2. **忽略标签有三条合同**——转义、剥标签留正文、连正文一起切掉，名字相近，结果差很远。
3. **URL 规则是前缀表，不是浏览器解析**——`javascript:` 被拒，但属性名可能还在。
4. **自定义白名单是替换不是合并**——漏写一个常用标签，输出形状会整页变掉。

## 应用型自测

1. 不传 options 时，`xss('<script>alert(1)</script>')` 还会不会包含 `alert(1)` 这几个字符？
2. `{ stripIgnoreTag: true }` 会不会把 `alert(1)` 一起删掉？
3. `href="javascript:alert(1)"` 经过默认 `safeAttrValue` 后，输出里还会不会出现属性名 `href`？

检查点：

1. 会。默认只转义标签，正文留在 `&lt;script&gt;...` 里。
2. 不会。`stripIgnoreTag` 只让忽略标签输出空串，正文还在。
3. 会。空值走 `return name`，不是删除该属性。

## 延伸阅读

- 文档与在线试验：[jsxss.com](http://jsxss.com)
- 固定源码：[leizongmin/js-xss](https://github.com/leizongmin/js-xss) —— 本文绑定提交 `9c92272047390671b9771a0fb439793f07521d8c`
- [[insane]] —— 默认丢掉不允许标签的整棵子树
- [[markdown-it]] —— 先关 HTML，再决定要不要外接 sanitizer

## 关联

- [[insane]] —— 同样是白名单 HTML 过滤，默认删除而不是转义
- [[marked]] —— 渲染器会把 HTML token 直通，需要外接过滤
- [[markdown-it]] —— 默认 `html: false`，开 HTML 后仍要外接过滤
- [[unified]] —— AST 管线上常见的后置 sanitize 位置

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
