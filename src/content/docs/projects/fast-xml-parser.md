---
title: fast-xml-parser — 默认同步、默认丢掉属性的纯 JS XML 解析器
description: 介绍 fast-xml-parser 5.11.1 如何用有序节点再压缩、默认忽略属性，并把 Builder / Validator 拆到独立包。
来源: https://github.com/NaturalIntelligence/fast-xml-parser
日期: 2026-08-27
分类: 解析
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/NaturalIntelligence/fast-xml-parser
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 3617550adfb280989f482d662b7e9ece55a32a34
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 5.11.1
---

## 是什么

fast-xml-parser 是一个不依赖 C/C++ 绑定的 JavaScript XML 库：同步 `parse()` 得到对象，也可以再导出 XML。日常类比：先按出现顺序把每道菜摆上托盘，再按名字归堆；默认不把调料碟（属性）端上来，除非你说要。

你写：

```js
const { XMLParser } = require('fast-xml-parser');
const parser = new XMLParser();
parser.parse('<root id="1"><n>42</n></root>');
// { root: { n: 42 } }  —— id 被丢掉，"42" 变成数字
```

固定 5.11.1 的公开入口是 `XMLParser` / `XMLValidator` / `XMLBuilder`。后两者在类型上已标成独立包的兼容包装。

## 为什么重要

不读固定 5.11.1 源码，下面这些合同很容易被旧教程或 xml2js 习惯带偏：

- 为什么默认结果里看不到属性
- 为什么 `<id>42</id>` 变成数字 `42`
- 为什么 `new XMLBuilder()` 并不等于“本仓库自己实现了一套 builder”
- 为什么仓库里有 `src/v6/`，`require("fast-xml-parser")` 却用不到

## 核心要点

固定 5.11.1 的主链可以拆成五步：

1. **条件导出**：`import` 走 `src/fxp.js`，`require` 走 `lib/fxp.cjs`。`src/fxp.js` 只导出三个名字；`src/v6/` 没有挂到这个入口。

2. **默认选项和 xml2js 相反**：`ignoreAttributes=true`、`parseTagValue=true`、`trimValues=true`、`preserveOrder=false`、`maxNestedTags=100`。`processEntities` 会被收成带限额的对象。

3. **两段式 parse**：`XMLParser.parse` 是同步的。先 `OrderedObjParser.parseXml` 扫字符、建有序节点；除非 `preserveOrder`，再交给 `prettify`/`compress` 压成普通对象。第二参数校验在类型上已 deprecated。

4. **值与安全边界**：标签值先认 `'true'` / `'false'`，其余交给 `strnum`。`__proto__` / `constructor` / `prototype` 直接抛错；`hasOwnProperty` 等默认改成 `__` 前缀。实体解码走 `@nodable/entities`，`is-unsafe` 对输入实体返回 `BLOCK`。

5. **Builder / Validator 已拆包**：`src/xmlbuilder/json2xml.js` 再导出 `fast-xml-builder`。内置 `XMLValidator.validate` 仍在，但 README 与 `.d.ts` 都指向 `fast-xml-validator`。

## 实践示例

### 案例 1：默认丢掉属性，并把数字文本收成 number

```js
const { XMLParser } = require('fast-xml-parser');
new XMLParser().parse('<item id="a">42</item>');
// { item: 42 }
new XMLParser({ ignoreAttributes: false }).parse('<item id="a">42</item>');
// { item: { '@_id': 'a', '#text': 42 } }
```

属性前缀默认是 `@_`，正文键默认是 `#text`。只有打开属性后，叶子才会留下对象。

### 案例 2：保留顺序就不再压缩

```js
const parser = new XMLParser({ preserveOrder: true });
parser.parse('<root><a>1</a><b>2</b></root>');
// 仍是按标签排列的节点数组，不会收成 { root: { a: 1, b: 2 } }
```

`parse()` 在 `preserveOrder` 为 true 时直接返回 `orderedResult`。

### 案例 3：Builder 是再导出，不是第二份实现

```js
const { XMLBuilder } = require('fast-xml-parser');
const xml = new XMLBuilder().build({ root: { n: 1 } });
```

`json2xml.js` 只有 `import XMLBuilder from 'fast-xml-builder'`。本轮未打开那个依赖仓。

## 踩过的坑

1. **按 xml2js 的习惯去读 `$.id`**：默认 `ignoreAttributes` 为 true，属性根本不会进对象。

2. **假定标签值永远是字符串**：`parseTagValue` 默认为 true；`"42"` 会变成 number，`"true"` 会变成 boolean。

3. **把 `XMLValidator` / `parse(xml, true)` 当成当前推荐入口**：类型文件写明改用 `fast-xml-validator`。

4. **把仓库里的 v6 当成已发布 API**：`src/v6/` 在固定提交里存在，但公开 `exports` 没有它。

5. **给 `addEntity` 传入带 `&` 的值**：实现会直接抛错；类型上也标成 deprecated，推荐 `entityDecoder`。

## 适用 vs 不适用场景

**适用**：

- 需要同步 `parse()`，并能接受“默认丢掉属性、默认解析数字”
- 打包器能消费 `sideEffects: false` 的 ESM / CJS 条件导出
- 明确打开 `ignoreAttributes: false` 后再处理属性

**不适用**：

- 需要 callback / EventEmitter，并且默认保留属性、子节点一律数组——先看 [[xml2js]]
- 要解析 Markdown——[[marked]] / [[markdown-it]]
- 必须把内置 Validator / Builder 当成第一等、未弃用的实现

## 固定版本边界

- 本文绑定 `NaturalIntelligence/fast-xml-parser@3617550adfb280989f482d662b7e9ece55a32a34`，tag `v5.11.1` 与 npm `fast-xml-parser@5.11.1` 的 `gitHead` 指向同一提交。
- 生产依赖包含 `@nodable/entities`、`fast-xml-builder`、`is-unsafe`、`path-expression-matcher`、`strnum`、`xml-naming`。
- 5.11.1 changelog 写的是 validator 属性扫描从正则改成单次扫描；本轮未跑性能对比。
- 本文未安装依赖、运行上游测试或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **默认忽略属性是产品选择，不是漏实现**——要属性必须显式关掉 `ignoreAttributes`。
2. **有序节点和压缩对象是两层**——`preserveOrder` 停在第一层。
3. **安全名字和实体限额写在解析器里**——危险属性名要么改名要么抛错，不是事后才想。
4. **拆出去的包不要再当成“本页实现”**——Builder / Validator 的当前合同在依赖仓。

## 应用型自测

1. `new XMLParser().parse('<a id="1">x</a>')` 里还能读到 `id` 吗？
2. `<n>42</n>` 默认得到字符串 `"42"` 还是数字 `42`？
3. 固定 5.11.1 的 `XMLBuilder` 是本仓库自己写的生成器吗？

检查点：

1. 不能。默认 `ignoreAttributes` 为 true。
2. 数字 `42`。`parseTagValue` 默认为 true，走 `strnum`。
3. 不是。它再导出 `fast-xml-builder`，类型标注为 deprecated。

## 延伸阅读

- 文档：[fast-xml-parser README](https://github.com/NaturalIntelligence/fast-xml-parser)
- 固定源码：[NaturalIntelligence/fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser) —— 本文绑定提交 `3617550adfb280989f482d662b7e9ece55a32a34`
- [[xml2js]] —— callback / sax / 默认保留属性的对照
- [[marked]] —— 另一条纯 JS 文本解析路线，但输出是 HTML

## 关联

- [[xml2js]] —— sax 事件栈、默认数组和 `$` 属性袋
- [[marked]] —— Markdown Lexer，默认会保留原始 HTML
- [[markdown-it]] —— 可插拔 token 流水线
- [[unified]] —— 文档 AST 插件链，不是 XML 对象压缩
- [[zod]] —— 解析之后如果要校验对象形状，走另一层

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
