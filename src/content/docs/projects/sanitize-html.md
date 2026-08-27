---
title: sanitize-html — 用 htmlparser2 事件流做标签白名单清洗
description: 介绍 sanitize-html 2.17.7 如何用 htmlparser2 事件拼回字符串，以及默认 allowlist、scheme 检查和 SVG 动画整标签拒绝。
来源: https://github.com/apostrophecms/apostrophe
日期: 2026-08-27
分类: 解析
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/apostrophecms/apostrophe
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: ab4c660b4426fd8f27cf7955e7a3b4a120dc38b3
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.17.7
---

## 是什么

sanitize-html 是一个 Node 侧 HTML 清洗函数：输入一段可能脏的 HTML 字符串，按标签 / 属性 / URL scheme 白名单拼回一段字符串。日常类比：安检只认名单上的行李标签——没登记的箱子丢掉，箱子里的衣服（子节点）默认还能过；名单外的液体（`script` / `style` / `textarea` 这类 raw-text）连内容一起扣下。

```js
const sanitizeHtml = require('sanitize-html')

sanitizeHtml('<p>hi<script>alert(1)</script></p><img src=x onerror=alert(1)>')
// 默认留下 <p>hi</p>；img 不在默认 allowedTags
```

固定 2.17.7 住在 `apostrophecms/apostrophe` 的 `packages/sanitize-html`。发布物只有 `index.js`。它用 `htmlparser2` 的事件流，不建 DOM。

## 为什么重要

不读这条事件链，下面几件事会对不上：

- 为什么默认就能挡住 `script` 和 `img`，却挡不住你自己加进 `allowedTags` 的 `svg` / `textarea`
- 为什么「丢掉标签、留下文字」是默认，不是「整段抹掉」
- 为什么 SVG `<animate attributeName="href">` 即使标签被允许，也会被整段跳过
- 为什么 2.17.6 之后 Node 下限变成 `>=22.12.0`

## 核心要点

固定 2.17.7 的主链可以拆成五步：

1. **合并默认选项**：`Object.assign({}, sanitizeHtml.defaults, options)`。默认 `allowedTags` 是一截偏良性的 HTML 子集，没有 `img` / `svg` / `iframe` / `script` / `textarea`。`allowedAttributes` 只给 `a`（`href` / `name` / `target`）和一份预留的 `img` 属性表。

2. **事件解析**：`htmlparser.Parser` 监听 `onopentag` / `ontext` / `onclosetag`。每个开标签压一个 `Frame`，记下标签名、属性、在结果串里的位置和内部文本。

3. **先变换再决定去留**：`transformTags` 可以改名或改属性。然后若标签不在白名单、触到 `animatesUrlAttribute`、超出 `nestingLimit`，就标记 skip。默认 `disallowedTagsMode` 是 `discard`。

4. **属性与 URL**：属性名必须通过 `VALID_HTML_ATTRIBUTE_NAME`。出现在 `allowedSchemesAppliedToAttributes` 里的值要过 `naughtyHref`，后者调用 `launder.naughtyHref`。默认 scheme 是 `http` / `https` / `ftp` / `mailto` / `tel`。

5. **文本出口分标签**：普通文本走 `escapeHtml`。若你允许了 `textarea`，内容按 RCDATA 做完整转义；`xmp` 只把尖括号换成实体，避免二次编码已有实体。

## 实践示例

### 案例 1：默认白名单丢掉 img，留下段落文本

```js
sanitizeHtml('<p>ok<img src=x onerror=alert(1)></p>')
// → '<p>ok</p>'
```

`img` 不在默认 `allowedTags`，走 discard：标签消失，没有子文本可留。`onerror` 因此不会进入属性循环。

### 案例 2：自己放开 textarea 时，内容必须被转义

```js
sanitizeHtml(
  '<textarea></textarea/><img src=x onerror=alert(1)>',
  { allowedTags: sanitizeHtml.defaults.allowedTags.concat(['textarea']) }
)
```

2.17.6 起，`ontext` 对 `textarea` 不再原样回写。旧版 htmlparser2 会把 `</textarea/>` 这种带 solidus 的关闭认错，浏览器却当成合法关闭，后面的 `img` 就活了。现在输出里的 `<` 会被实体化。

### 案例 3：SVG 动画不能靠「检查 values 字符串」过关

```js
sanitizeHtml(
  '<svg><animate attributeName="href" values="#ok;javascript:alert(1)"></animate></svg>',
  { allowedTags: ['svg', 'animate'], allowedAttributes: { animate: ['attributeName', 'values'] } }
)
```

`animatesUrlAttribute` 看到 SMIL 动画把 `attributeName` 指到 `href`（或其它 scheme 检查槽）就整标签 skip。它不尝试解析 `values` 里用分号隔开的每一项。

## 踩过的坑

1. **把默认配置当成「允许常见富文本」**：默认没有 `img`。要图，必须同时改 `allowedTags` 和 `allowedAttributes`，并接受 `src` / `srcset` 的 scheme 检查。

2. **以为 discard 等于整段删除**：对普通标签，discard 丢掉壳、留下子孙。只有 `nonTextTags`（`script` / `style` / `textarea` / `option` / `xmp`）会连文本一起跳过。

3. **允许 `script` 还指望它安全**：源码把 `script` / `style` 标成 `vulnerableTags`，会 `console.warn`，除非你再开 `allowVulnerableTags`。允许它们等于放弃 XSS 合同。

4. **把独立 GitHub 仓当最新真相**：`apostrophecms/sanitize-html` 已在 2026-02-26 宣布迁入 Apostrophe monorepo。npm `2.17.7` 没有 `gitHead`。

5. **把 changelog 里的修复理解成默认配置也被打穿**：2.17.6 / 2.17.7 的 textarea 与 SVG 动画问题，前提都是调用方扩大了 `allowedTags`。默认名单不含这些标签。

## 适用 vs 不适用场景

**适用**：

- 服务端要把用户 HTML 收成字符串，并接受「白名单标签 + 事件解析」而不是浏览器 DOM
- 需要按标签改写（`transformTags`）或按 frame 丢标签（`exclusiveFilter` 返回 `'excludeTag'`）
- 已经能说清自己加进去的每一个标签会不会变成 raw-text 或 URL 槽

**不适用**：

- 浏览器里要对同一段 HTML 走 DOM 默认策略 → 看 [[isomorphic-dompurify]] 背后的 DOMPurify
- 还在 Node 18 / 20 上 `require` 这包——2.17.6 起因为 `htmlparser2` 12 只能 ESM，下限是 22.12.0
- 需要把 Markdown 先解析再清洗——先看 [[markdown-it]] / [[marked]]，再把 HTML 交给本库
- 想把「我跑过 mocha」或某个 CVE 复现写成当前事实——本页没有执行上游测试

## 固定版本边界

- 本文绑定 `apostrophecms/apostrophe@ab4c660b4426fd8f27cf7955e7a3b4a120dc38b3`，该提交里 `packages/sanitize-html/package.json` 为 `2.17.7`。
- npm `sanitize-html@2.17.7` 无 `gitHead`；上一个带 `gitHead` 的 `2.17.0` 仍指向已弃用独立仓 `86efc067...`。
- `naughtyHref` 委托 `launder`；`launder` 是 workspace 依赖，本轮未单独绑定它的 revision。
- 本文未安装依赖、解析真实 HTML 样例或测量吞吐，状态保持 `UNVERIFIED`。

## 学到什么

1. **清洗合同是「解析器 + 白名单」，不是「看起来像 HTML 就安全」**——htmlparser2 的标签分类和浏览器 HTML5 解析器会分叉。
2. **默认 discard 保的是文字，不是外壳**——加标签前先问它是不是 raw-text。
3. **URL 策略有两道门**：属性 scheme 检查，以及「动画事后改 href」这种根本不经过属性值的通道。
4. **包搬家会拆掉 npm `gitHead`**——要从 monorepo 路径对 revision，不能只搜旧仓 tag。

## 应用型自测

1. 默认配置下，`sanitizeHtml('<img src="https://example.com/a.png">')` 会留下 `<img>` 吗？
2. 把 `textarea` 加进 `allowedTags` 后，它的内部文本还会原样拼进结果吗？
3. 为什么 `<animate attributeName="href" values="#ok;javascript:alert(1)">` 不能只检查整段 `values` 字符串？

检查点：

1. 不会。默认 `allowedTags` 不含 `img`。
2. 不会。`ontext` 对 `textarea` 走 `escapeHtml`。
3. `values` 是分号列表，整段当一个 URL 只会验证第一项；源码选择按 `attributeName` 目标拒绝整标签。

## 延伸阅读

- 包说明：[apostrophe/packages/sanitize-html](https://github.com/apostrophecms/apostrophe/tree/main/packages/sanitize-html)
- 固定源码：`apostrophecms/apostrophe` 提交 `ab4c660b4426fd8f27cf7955e7a3b4a120dc38b3`
- 对照包装层：[[isomorphic-dompurify]]
- Markdown 先渲染再清洗：[[markdown-it]]、[[marked]]

## 关联

- [[isomorphic-dompurify]] —— 另一条「字符串进、字符串出」路线，但清洗发生在 DOM
- [[markdown-it]] —— 默认 `html: false`，用户 HTML 仍建议二次清洗
- [[marked]] —— 默认直通原始 HTML，必须外置 sanitizer
- [[unified]] —— rehype 树上手动接 sanitizer 的位置不同

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
