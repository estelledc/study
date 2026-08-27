---
title: escape-goat — 可逆 HTML 转义与只转插值的模板标签
description: 介绍 escape-goat 4.0.0 如何用顺序 replace、unescape 与 tagged template 处理同一组 HTML 特殊字符。
来源: https://github.com/sindresorhus/escape-goat
日期: 2026-08-27
分类: 工具库
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/sindresorhus/escape-goat
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: d4a65160f9dfd2ca17b5e1c19811d1f6cb9c786f
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 4.0.0
---

## 是什么

escape-goat 是一个 ESM 小工具：正向把 `& < > " '` 写成实体，反向再解回来；同一个函数还能当 tagged template，只处理插值。日常类比：复印店提供“加密复印件”和“还原复印件”，套打表格时只改填空，不改印刷好的框线。

你写：

```js
import { htmlEscape, htmlUnescape } from 'escape-goat';

htmlEscape('🦄 & 🐐');
// => '🦄 &amp; 🐐'

htmlEscape`<a href="${url}">Unicorn</a>`;
```

固定 4.0.0 的 `package.json` 声明 `"type": "module"`，`exports` 指向 `./index.js`，要求 `node >= 12`。

## 为什么重要

不理解“替换顺序、双形态 API、模板字面量不转义”，就解释不了下面几件事：

- 为什么必须先换 `&`，解码时又必须最后才换 `&amp;`
- 为什么 `htmlEscape('<em>${name}</em>')` 和 `` htmlEscape`<em>${name}</em>` `` 不是一回事
- 为什么 `htmlUnescape(htmlEscape('&quot;'))` 仍是 `&quot;`
- 为什么普通函数调用只接受字符串，数字会掉进模板分支

## 核心要点

固定 4.0.0 的主链可以拆成五步：

1. **两个公开函数，一份内部表**：`htmlEscape` / `htmlUnescape` 各包一层；真正替换在 `_htmlEscape` 与 `_htmlUnescape`。

2. **正向必须先写 `&`**：`&` → `&amp;`，再 `"` → `&quot;`，`'` → `&#39;`，`<` → `&lt;`，`>` → `&gt;`。若先换 `<`，已生成的 `&lt;` 里的 `&` 会被再写成 `&amp;lt;`。

3. **反向按相反风险收尾**：先 `&gt;` / `&lt;` / `&#0?39;` / `&quot;`，最后才 `&amp;`。`&#0?39;` 同时认 `&#39;` 与 `&#039;`。`index.d.ts` 文档只写 `&#39;`，正则比文档宽一档。

4. **一种函数，两种调用**：第一个参数是字符串就走内部 replace；否则按 `TemplateStringsArray` 处理——静态片断原样拼接，插值先 `String(value)` 再转义或解码。

5. **模板只动填空**：`` htmlEscape`Hello <em>${'<>'}</em>` `` 得到 `Hello <em>&lt;&gt;</em>`。测试把这写成预期：字面量里的 `<em>` 不会被换成实体。

## 实践示例

### 案例 1：五个字符一次换完，也可以换回来

```js
htmlEscape('&<>"\'');
// => '&amp;&lt;&gt;&quot;&#39;'

htmlUnescape('&amp;&lt;&gt;&quot;&#39;');
// => '&<>"\''
```

`test.js` 还断言 `htmlUnescape(htmlEscape('&quot;')) === '&quot;'`：原文里的 `&` 先变成 `&amp;quot;`，解码只还原最外层 `&amp;`。

### 案例 2：tagged template 保留印刷好的标签

```js
const url = 'https://example.com?x="🦄"';
htmlEscape`<a href="${url}">Unicorn</a>`;
// => '<a href="https://example.com?x=&quot;🦄&quot;">Unicorn</a>'
```

`href="..."` 是静态字符串，不会被 `_htmlEscape` 碰到。readme 的 Tip 写明：属性仍要自己加引号，否则转义也挡不住 XSS 切分。

### 案例 3：插值里的非字符串会先 `String(...)`

```js
htmlEscape`id=${1}`;
// => 'id=1'

htmlEscape`x=${undefined}`;
// => 'x=undefined'
```

这只发生在模板路径。直接 `htmlEscape(1)` 时 `typeof` 不是 `'string'`，会把数字当成模板数组读 `[0]`，得不到与 [[escape-html]] 相同的 `'1'`。

## 踩过的坑

1. **把字符串字面量误当成模板标签**：`htmlEscape('<b>' + name + '</b>')` 会连 `<b>` 一起转义；只有 `` htmlEscape`<b>${name}</b>` `` 才保留标签。

2. **把 unescape 理解成“任意 HTML 实体解码器”**：它只认这五类（外加 `&#039;`）。`&apos;`、`&nbsp;`、数字码点都不在 `_htmlUnescape` 里。

3. **解码顺序反了就会读错嵌套实体**：若先把 `&amp;` 解开，`&amp;lt;` 会变成真正的 `<`。源码把 `&amp;` 放在最后，就是为了挡住这条路径。

4. **普通调用传入非字符串**：没有 `'' + value` 兜底。要稳定转义，先自己变成字符串，或走模板插值。

5. **关键词里的 sanitize / xss 不是实现范围**：`package.json` 的 keywords 写了这些词，源码仍只做五字符替换。本轮未跑 `xo` / `ava` / `tsd`。

## 适用 vs 不适用场景

**适用**：

- ESM 项目需要一对可逆、零依赖的 HTML 文本编解码
- 用模板字面量拼一小段 HTML，并只转用户值
- 要同时接受 `&#39;` 与 `&#039;` 的解码

**不适用**：

- 必须 CommonJS、只要单向 `require('escape-html')`——看 [[escape-html]]
- 整页 React 树——[[react]] 的 JSX 文本已经转义，不必再包一层
- 需要洗掉标签或协议处理器——去找 sanitizer，不要看 keywords
- 运行时低于 Node 12，或不能消费 `"type": "module"` 的纯 CJS 包

## 固定版本边界

- 本文绑定 `sindresorhus/escape-goat@d4a65160f9dfd2ca17b5e1c19811d1f6cb9c786f`，tag `v4.0.0` 与 npm `escape-goat@4.0.0` 的 `gitHead` 指向同一提交。
- `exports` 只有 `./index.js`；发布 `files` 为 `index.js` 与 `index.d.ts`。无 runtime 依赖。
- TypeScript 重载把字符串形式和 `TemplateStringsArray` 形式分成两条签名；运行时靠 `typeof strings === 'string'` 分流。
- 本文未安装依赖、运行 `ava`/`tsd` 或测量体积，状态保持 `UNVERIFIED`。

## 学到什么

1. **替换顺序就是正确性**——`&` 最先编码、最后解码，嵌套实体才不会塌。
2. **tagged template 把“作者写的 HTML”和“用户填的值”拆开**——静态片断默认受信任。
3. **可逆不等于无损于任意实体串**——`&quot;` 再走一轮仍是 `&quot;`。
4. **双形态 API 用 typeof 分流，不帮你把数字变成字符串**——和 [[escape-html]] 的 `'' + string` 正好相反。

## 应用型自测

1. `` htmlEscape`Hello <em>${'<>'}</em>` `` 里的 `<em>` 会被转成 `&lt;em&gt;` 吗？
2. `_htmlUnescape` 会不会把 `&#039;` 解成单引号？
3. 直接调用 `htmlEscape(1)`，会得到 `'1'` 吗？

检查点：

1. 不会。模板静态片断原样拼接；只有插值 `'<>'` 变成 `&lt;&gt;`。
2. 会。正则是 `/&#0?39;/g`，`0` 可有可无。
3. 不会按字符串路径处理。`typeof 1 !== 'string'`，会进入模板分支。

## 延伸阅读

- 固定源码：[sindresorhus/escape-goat](https://github.com/sindresorhus/escape-goat) —— 本文绑定提交 `d4a65160f9dfd2ca17b5e1c19811d1f6cb9c786f`
- [[escape-html]] —— 同一组五字符的 CJS、单向、逐码扫描对照
- [[react]] —— 组件树里的自动转义，不是 tagged template
- [[express]] —— 服务端输出仍要调用方选择转义函数

## 关联

- [[escape-html]] —— 单向 charCode 扫描对照组
- [[react]] —— JSX 文本转义对照
- [[express]] —— 常见 HTML 响应宿主
- [[koa]] —— 另一条需要调用方自己转义输出的 Node 管道

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
