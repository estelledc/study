---
title: xml2js — 用 sax 事件把 XML 叠成 JS 对象
description: 介绍 xml2js 0.6.2 如何用 sax 事件栈、0.2 默认值和 xmlbuilder 把 XML 与对象来回转换。
来源: https://github.com/Leonidas-from-XIV/node-xml2js
日期: 2026-08-27
分类: 解析
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/Leonidas-from-XIV/node-xml2js
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: cf3e061e22e98152b88068c2345bc02581f4d6c7
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 0.6.2
---

## 是什么

xml2js 是一个把 XML 转成 JavaScript 对象、也能反向拼回 XML 的库。日常类比：像听人念菜单再往托盘上叠碟子——`sax` 每报一个开标签就压一层，关标签再取下来；属性默认放进 `$`，正文放进 `_`。

你写：

```js
var parseString = require('xml2js').parseString;
parseString('<root id="1">hi</root>', function (err, result) {
  // result.root[0].$ .id === '1'
  // result.root[0]._ === 'hi'
});
```

固定 0.6.2 的作者源是 CoffeeScript，npm 只发布编译后的 `lib/`。解析靠 `sax`，生成靠 `xmlbuilder`。

## 为什么重要

不理解 0.2 默认值和事件栈，就解释不了下面几件事：

- 为什么 `result.root` 是数组，不是单个对象
- 为什么属性不在根上，而在 `$`
- 为什么空字符串解析结果是 `null`，不是 `{}`
- 为什么 `async: true` 看起来像异步，实际仍是同一套 sax

## 核心要点

固定 0.6.2 的主链可以拆成五步：

1. **默认合同来自 `defaults["0.2"]`**：`explicitArray=true`、`explicitRoot=true`、`attrkey="$"`、`charkey="_"`、`trim=false`、`ignoreAttrs=false`、`async=false`。0.1 那套（`attrkey="@"`、`explicitArray=false`）还在文件里，但构造函数不再用它。

2. **入口是 callback 或 Promise**：`parseString(xml, cb)` 或 `parseString(xml, options, cb)`。`Parser` 忘记 `new` 也会自己补。`parseStringPromise` 只是把同一条 callback 包成 Promise。

3. **sax 事件栈**：`onopentag` 新建对象并压栈；`ontext` / `oncdata` 往当前层的 `_` 追加；`onclosetag` 弹栈，再 `assignOrPush` 挂到父节点。属性描述符先 `Object.create(null)` 再 `defineProperty`。

4. **空输入和 BOM**：`trim()` 后为空则 `emit("end", null)`。非空输入先 `bom.stripBOM`。`async:true` 只按 `chunkSize`（默认 10000）用 `setImmediate` 分块 `write`，不是另一套解析器。

5. **Builder 委托 xmlbuilder**：对象只有一个键且 `rootName` 仍是默认 `root` 时，用那个键当根；否则包一层 `<root>`。默认 `renderOpts.pretty=true`。

## 实践示例

### 案例 1：默认把子节点收成数组，属性进 `$`

```js
var xml2js = require('xml2js');
xml2js.parseString('<item id="a">x</item>', function (err, result) {
  result.item[0].$.id; // 'a'
  result.item[0]._;    // 'x'
});
```

`explicitRoot` 用根标签名再包一层；`explicitArray` 让即便只有一个 `item` 也是数组。

### 案例 2：空文档不是空对象

```js
xml2js.parseString('   ', function (err, result) {
  result; // null
});
```

`parseString` 在 `str.trim() === ''` 时直接结束，不会走进 sax。

### 案例 3：Builder 用唯一键当根

```js
var builder = new xml2js.Builder();
builder.buildObject({ name: 'Ada', age: 23 });
// 根是 <root>，因为对象有两个键
builder.buildObject({ person: { name: 'Ada' } });
// 根是 <person>
```

单根判断只在 `rootName` 仍等于默认 `'root'` 时生效。

## 踩过的坑

1. **把结果当成“一个对象一个标签”**：默认 `explicitArray` 为 true，重复或单个子节点都先变成数组。

2. **去对象上找属性**：属性默认在 `$`，正文在 `_`。只有叶子且没有其它键时，才会把节点收成纯字符串。

3. **把 `async: true` 理解成非阻塞网络 I/O**：它只是把字符串切片后 `setImmediate` 续写 sax。

4. **给 `emptyTag` 传共享的 `{}`**：源码和 README 都提醒应传工厂函数 `() => ({})`，否则空节点会共用同一引用。

5. **把 `processors.stripPrefix` 当成剥掉所有命名空间**：正则是 `/(?!xmlns)^.*:/`，`xmlns:` 不会被去掉。

## 适用 vs 不适用场景

**适用**：

- 需要 callback / EventEmitter 风格，并且接受默认数组包装
- 想保留属性，且能按 `$` / `_` 读取
- 同时要往回生成 XML，并能接受 `xmlbuilder` 的 pretty 默认值

**不适用**：

- 默认就要丢掉属性、同步返回、并把 `"42"` 收成数字——应看 [[fast-xml-parser]]
- 要解析 Markdown 而不是 XML——[[marked]] / [[markdown-it]]
- 不能接受 `engines.node >= 4` 以及运行时依赖 `sax` / `xmlbuilder`

## 固定版本边界

- 本文绑定 `Leonidas-from-XIV/node-xml2js@cf3e061e22e98152b88068c2345bc02581f4d6c7`，tag `0.6.2` 与 npm `xml2js@0.6.2` 的 `gitHead` 指向同一提交。
- 仓库名是 `node-xml2js`，npm 包名是 `xml2js`。
- 作者源是 CoffeeScript；发布物只有 `lib/`。
- `ValidationError` 被导出，但 Parser 主链用的是 `emit("error")`。
- 本文未安装依赖、运行上游测试或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **默认对象形状是合同，不是实现细节**——数组包装、`$` / `_`、显式根节点一起决定你怎么读结果。
2. **sax 事件栈解释了顺序和嵌套**——开标签压栈，关标签挂到父节点，不是先建完整 DOM。
3. **Builder 的“单根”有前提**——只有一个键，且没改过默认 `rootName`。
4. **Promise API 没有第二条解析路径**——它只是包住原来的 callback。

## 应用型自测

1. 默认 `parseString('<a>1</a><a>2</a>', cb)` 里，`result.a` 是不是数组？
2. `parseString('', cb)` 的 `result` 是 `{}` 还是 `null`？
3. 默认会不会把 XML 属性丢掉？

检查点：

1. 是数组。`explicitArray` 默认为 true；就算只有一个 `<a>` 也会先收成数组。
2. `null`。空字符串在进 sax 之前就 `emit("end", null)`。
3. 不会。`ignoreAttrs` 默认为 false，属性在 `$` 下。

## 延伸阅读

- 文档：[node-xml2js README](https://github.com/Leonidas-from-XIV/node-xml2js)
- 固定源码：[Leonidas-from-XIV/node-xml2js](https://github.com/Leonidas-from-XIV/node-xml2js) —— 本文绑定提交 `cf3e061e22e98152b88068c2345bc02581f4d6c7`
- [[fast-xml-parser]] —— 默认同步、默认忽略属性的对照
- [[marked]] —— 另一条“文本进、结构出”的解析路线，但领域是 Markdown

## 关联

- [[fast-xml-parser]] —— 同步 parse、默认丢属性、标签值会走数字解析
- [[marked]] —— Markdown 正则 Lexer，不是 XML 事件栈
- [[markdown-it]] —— 可插拔 Markdown token 流水线
- [[zod]] —— 校验对象形状，不负责把 XML 拆开

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
