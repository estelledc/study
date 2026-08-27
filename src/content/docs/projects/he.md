---
title: he — 按 HTML 词法规则编解码字符引用的独立工具
description: 介绍 he 1.2.0 如何用默认十六进制引用、escape 六字符表和 decode 遗留无分号规则处理 HTML 实体。
来源: https://github.com/mathiasbynens/he
日期: 2026-08-27
分类: 解析 / HTML 实体
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/mathiasbynens/he
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 36afe179392226cf1b6ccdb16ebbb7a5a844d93a
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.2.0
---

## 是什么

he（HTML entities）是一个只做字符引用编解码的 JavaScript 库。日常类比：它像一本对照表加一台校对机——默认把不该原样出现的符号换成 `&#x…;`，读回来时再按 HTML 词法把命名引用、数字引用和历史遗留写法还原。

```js
var he = require('he');

he.encode('foo © bar ≠ baz 𝌆 qux');
// → 'foo &#xA9; bar &#x2260; baz &#x1D306; qux'

he.decode('&copy; &#x1D306;');
he.escape('<img src=\'x\'>');
he.unescape('&amp;');
```

固定 1.2.0 的入口是构建产物 `he.js`。`src/he.js` 是 Grunt 模板，正则和 map 由 `scripts/` 注入后再发布。`he.unescape` 不是另一套实现，它就是 `decode`。

## 为什么重要

不读固定 1.2.0 源码，下面这些合同很容易被“实体库都差不多”带偏：

- 为什么默认 `encode` 几乎不写 `&copy;`，而是十六进制数字引用
- 为什么 `escape` 和 `encode` 不是同一条路径
- 为什么 `&amp` 这种没分号的遗留写法，在文本和属性里处理不同
- 为什么 `strict: true` 会把非法码点变成异常，而不是默默替换

## 核心要点

固定版本的主链可以拆成五步：

1. **UMD 单文件**：`package.json` 的 `main` 是 `he.js`，另有 `bin/he`。构建后对象挂 `version`、`encode`、`decode`、`escape`、`unescape`。

2. **默认 encode 走数字引用**：`encode.options` 默认 `useNamedReferences=false`、`decimal=false`、`encodeEverything=false`、`allowUnsafeSymbols=false`、`strict=false`。未开命名引用时，`regexEscape` 匹配的 `"&'<>`` 以及非可打印 ASCII / 非 ASCII 都变成 `&#x…;`。

3. **escape 是更窄的六字符表**：只替换 `"&'<>``。映射是 `&quot;`、`&amp;`、`&#x27;`、`&lt;`、`&gt;`、`&#x60;`。反引号是为旧 IE 属性/注释逃逸留下的，不是完整 encode。

4. **decode 按 HTML 词法分支**：带分号的命名引用查 `decodeMap`；无分号遗留引用查 `decodeMapLegacy`；`&#…;` / `&#x…;` 走 `codePointToSymbol`。ambiguous ampersand 默认原样留下。

5. **属性和 strict 改变失败方式**：`isAttributeValue` 且下一字符是 `=` 时，无分号命名引用不解码。代理区和 `> 0x10FFFF` 默认变成 `U+FFFD`；`strict` 则抛 `Parse error`。

## 实践示例

### 案例 1：默认 encode 与命名引用是两条开关

```js
he.encode('foo © bar');
he.encode('foo © bar', { useNamedReferences: true });
he.encode('foo © bar', { decimal: true });
```

第一行是 `foo &#xA9; bar`。打开 `useNamedReferences` 才会尽量写成 `&copy;`；`decimal` 则改用 `&#169;`。两者都写在 `encode.options` 上，调用时传入的对象会和这份默认值 merge。

### 案例 2：escape 不会处理版权符号

```js
he.escape('a < b & c ©');
he.encode('a < b & c ©');
```

`escape` 只处理六字符，`©` 原样留下。`encode` 会继续把 `©` 编成数字引用。需要“只防标签破坏、保留可读 Unicode”时，才该看 `escape`。

### 案例 3：无分号命名引用在属性里可能不解码

```js
he.decode('&amp copy');
he.decode('&amp=1', { isAttributeValue: true });
```

文本上下文里，遗留 `&amp` 会按 `decodeMapLegacy` 还原，并把后续字符拼回去。属性上下文遇到 `&amp=` 时，源码直接返回原匹配，避免把查询串里的 `&amp=` 误判成实体。

## 踩过的坑

1. **把 `unescape` 理解成“只反转 escape”**：它指向 `decode`，会处理命名引用和数字引用，范围比 `escape` 的六字符表大。

2. **默认以为会输出 `&nbsp;` / `&copy;`**：`useNamedReferences` 默认关闭。需要命名实体时必须显式打开，或改全局 `he.encode.options`。

3. **把 `strict` 当成静默校验**：它会 `throw Error('Parse error: …')`。默认路径用 `U+FFFD` 或保留 ambiguous ampersand，不会抛。

4. **把仓库活跃度当成当前发布合同**：固定 tag 停在 2021 的 v1.2.0，npm `gitHead` 与该提交一致，但本轮没有验证后续未打 tag 的 master 提交。

5. **把 README 或他人 benchmark 的速度写成结论**：本轮未跑 `tests/tests.js`，也未测体积。

## 适用 vs 不适用场景

**适用**：

- 需要一套与 HTML 字符引用词法对齐的独立编解码器，并接受默认十六进制输出
- 只要转义 `"&'<>``，明确调用 `escape` 而不是 `encode`
- 仍在用 CJS / UMD，并能接受没有 `engines` 声明的旧发布

**不适用**：

- 默认就要 HTML/XML 分层、流式解码或 tree-shake 子路径——看 [[entities]]
- 需要把 Markdown 编成 HTML——那是 [[markdown-it]] / [[marked]] 的主链，he 只处理实体
- 必须跟踪 2026 年仍活跃的维护节奏；固定 1.2.0 之后没有更新的 tag
- 不能接受 `strict` 以抛异常表达非法码点

## 固定版本边界

- 本文绑定 `mathiasbynens/he@36afe179392226cf1b6ccdb16ebbb7a5a844d93a`，tag `v1.2.0`，构建后 `he.version` 与 npm `he@1.2.0` 的 `gitHead` 同指此提交。
- `encode.options` / `decode.options` 可被全局改写；后续调用若不传 options，会吃到被改过的默认值。
- `codePointToSymbol` 对 HTML 覆盖表 `decodeMapNumeric` 做替换；`strict` 时非法码点走 `parseError`。
- 本文未安装依赖、运行测试、调用 CLI 或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **encode 和 escape 不是详略关系**——默认 encode 面向“合法 HTML 文本”，escape 只保六字符。
2. **遗留无分号引用取决于上下文**——属性里的 `=` 会阻止解码。
3. **strict 改变的是失败形态**——替换成 `U+FFFD` 和抛错是两条合同。
4. **构建产物才是运行入口**——读 `src/he.js` 时要意识到正则和 map 是注入的。

## 应用型自测

1. 不传 options 的 `he.encode('©')` 会不会写成 `&copy;`？
2. `he.unescape` 是否等于 `he.decode`？
3. `he.decode('&amp=1', { isAttributeValue: true })` 会不会把 `&amp` 解成 `&`？

检查点：

1. 不会。默认 `useNamedReferences` 为 false，结果是 `&#xA9;`。
2. 是。导出对象里 `unescape` 直接指向 `decode`。
3. 不会。属性上下文且下一字符为 `=` 时，源码返回原匹配。

## 延伸阅读

- 文档：[mths.be/he](https://mths.be/he)
- 固定源码：[mathiasbynens/he](https://github.com/mathiasbynens/he) —— 本文绑定提交 `36afe179392226cf1b6ccdb16ebbb7a5a844d93a`
- [[entities]] —— 默认 XML、HTML trie 与 WHATWG attribute/text escape 的对照
- [[markdown-it]] —— 生产依赖里有 `entities`，不是 he

## 关联

- [[entities]] —— 同源问题的新实现：默认层级、流式 decoder 与子路径导出都不同
- [[markdown-it]] —— 把 Markdown token 渲染成 HTML 时会碰到实体，但主链不是 he
- [[marked]] —— 另一条 Markdown → HTML 路径，不把 he 当作运行时核心

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
