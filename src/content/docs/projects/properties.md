---
title: properties — Java .properties 解析器，顺便能扮 INI
description: 介绍 properties 1.2.1 如何用可选 sections、variables 和 include 扩展 Java .properties。
来源: https://github.com/gagle/node-properties
日期: 2026-08-27
分类: 工具库
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/gagle/node-properties
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: bb04b570d2216d75ca5631eb1d095f443b5f6a40
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.2.1
---

## 是什么

`properties` 是 Gabriel Llamas 的 Java `.properties` 解析 / 写出库。日常类比：默认它按 Java 说明书读 `key=value` 小纸条；打开开关后，又能认 INI section、`${变量}` 和 `include` 拼文件。

你写：

```js
var properties = require('properties');

properties.parse('a = 1\nb: 2', function (error, obj) {
  // { a: 1, b: 2 }
});

properties.parse('file', { path: true }, function (error, obj) {
  // 从磁盘读
});
```

入口在 `lib/index.js`：`parse` 指向 `lib/read.js`，`stringify` 指向 `lib/write.js`，另外导出 `createStringifier()`。固定 1.2.1 声明 `engines.node >= 0.10`。

## 为什么重要

不理解“默认 Java 语义、INI 只是选项”，就解释不了下面几件事：

- 为什么 `a = 1` 会得到数字 `1`，而 [[ini]] 得到字符串 `'1'`
- 为什么 `:` 和行里的空白也能当分隔符
- 为什么打开 `path` 或 `include` 却不传 callback 会直接抛错
- 为什么 `stringify({ db: { host: 'x' } })` 会写出 `db = [object Object]`

## 核心要点

固定 1.2.1 的主链可以拆成五步：

1. **真正干活的是 `read` / `write`**：`parse(data, options, cb)` 先规范化 comments / separators，再进 `build()`。`options.path` 为真时改走 `fs.readFile`；目录则拼 `index.properties`。

2. **逐字符状态机，不是一行正则**：`lib/parse.js` 认注释、section、`=` / `:` / 空白分隔、`\` 续行和 `\uXXXX`。默认注释是 `#` 与 `!`。`strict` 加上自定 token 后，才只认你列出的符号；空白分隔仍在。

3. **先展开变量，再 `cast`**：`${key}` / `${section|key}` 做字符替换。随后 `cast` 把 `null` / `undefined` / `true` / `false` 和能过 `Number` 的值换成对应类型。

4. **组织方式全是开关**：`sections` 把 `[web]` 收成嵌套对象；`namespaces` 把 `a.b` 拆成 `{ a: { b } }`；`include` 只允许出现在全局，合并已读对象，并靠 `_included` 去重。

5. **写出分两条路**：普通对象走 `stringifyObject`，嵌套对象 / 数组没有 JSON 那种结构保留。要 section 或注释，必须先 `createStringifier()` 再 `.section()` / `.property()` / `.header()`。

## 实践示例

### 案例 1：默认就会转型，分隔符也不止等号

```js
var obj = properties.parse('a = 1\nb: 2\nc true');
// { a: 1, b: 2, c: true }
```

`1` / `2` 能过 `Number`；`true` 走布尔分支。`:` 是默认分隔符。空白本身也能切开 key / value，所以 `c true` 成立。

### 案例 2：variables 在 cast 之前复制字符

```js
var text = [
  'a = 1',
  '[section]',
  'a = 2',
  'b = ${section|a}'
].join('\n');

properties.parse(text, { sections: true, variables: true }, function (err, obj) {
  // obj.section.b === 2  （先替换成字符 "2"，再 cast）
});
```

`expand` 不看类型。跨 section 取值用 `section|key`。缺键或缺 section 会回调错误。

### 案例 3：include 只能写在全局，而且必须异步

```js
properties.parse('index.properties', {
  path: true,
  include: true
}, function (err, obj) {
  // include other.properties
});
```

`include` 出现在 section 里会报 `Cannot include files from inside a section`。没有 callback 时，`path` / `include` 直接 throw。目录 include 固定找 `index.properties`。

## 踩过的坑

1. **把 `parse` 当成纯同步字符串 API**：字符串 + 默认选项可以同步返回；`path` 和 `include` 强制 callback。函数名来自 `read.js`，不是“永远 parse 内存字符串”。

2. **用普通对象 `stringify` 保存嵌套配置**：`value + ""` 会把 `{ host: 'x' }` 变成 `[object Object]`，数组变成 `1,2,3`。要保留 `[section]` 得用 `Stringifier`。

3. **以为默认就能当 [[ini]] 用**：README 写明要自己打开 `sections`，并建议 `comments: ';'`, `separators: '='`, `strict: true` 才接近常见 INI。不设 `strict` 时，`#` / `!` / `:` 仍然生效。

4. **当它有原型防护**：`read.js` / `parse.js` 没有丢掉 `__proto__`。这和 [[ini]] 7.0.0 的黑名单不同。

5. **把 npm 包的 `gitHead` 当 revision**：`properties@1.2.1` 没有 `gitHead`，仓库也没有 tag。本页绑定的是版本提交 `bb04b57`；master 之后还有两笔文档 / 注释改动，未纳入。

## 适用 vs 不适用场景

**适用**：

- 要读 Java `.properties`，或接受 `#` / `!` / `=` / `:` / 空白这套默认 token
- 需要 `${}`、点号命名空间、多文件 `include` 或环境相关 `vars`
- 能接受 Node `>=0.10` 的旧引擎声明，以及 callback 式文件读取

**不适用**：

- 只要同步、无 I/O、section 默认嵌套、数字保持字符串——[[ini]] 更窄也更接近 npm 工具链
- 要在 shell 里查询或改多种文档——[[yq]] / [[dasel]] 是命令，不是这份 JS API
- 必须把嵌套对象完整往返成 `.properties`——普通 `stringify(object)` 做不到
- 需要官方 tag / npm `gitHead` 三方对齐——此包当前对不上

## 固定版本边界

- 本文绑定 `gagle/node-properties@bb04b570d2216d75ca5631eb1d095f443b5f6a40`，该提交信息为 `v1.2.1`，`package.json` version 同为 `1.2.1`。
- 仓库无 tag；npm `properties@1.2.1` 未提供 `gitHead`。master 后续 `caa17aa`、`684477e` 只改 README 与 `lib/read.js` 注释，本页未绑定。
- `parse` / `stringify` 在源码里分别是 `read` / `write` 的再导出。
- 本文未安装依赖、运行上游测试或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **`.properties` 默认比 INI 更“Java”**——注释、分隔符、续行和 `\uXXXX` 先按规范走，section 是后来加上的开关。
2. **类型转换是库自己做的**——和 [[ini]] 只认三个字面量正好相反。
3. **文件、include、变量都把 API 从纯函数拉成带控制块的读流程**——`pause` / `resume` 就是为 include 准备的。
4. **写出不是解析的逆运算**——没有 `Stringifier` 就保不住 section 和嵌套对象。

## 应用型自测

1. `properties.parse('port = 8080')` 得到的 `port` 是 number 还是 string？
2. 打开 `include` 但不传 callback，会返回对象还是抛错？
3. `stringify({ db: { host: 'localhost' } })` 会写出 `[db]` section 吗？

检查点：

1. number。`cast` 对能过 `Number` 的值会转型。
2. 抛错。`include` 与 `path` 都要求 callback。
3. 不会。普通对象路径会写成 `db = [object Object]`。

## 延伸阅读

- 文档：[github.com/gagle/node-properties](https://github.com/gagle/node-properties)
- Java 规范入口：[Properties.load](http://docs.oracle.com/javase/7/docs/api/java/util/Properties.html#load%28java.io.Reader%29)
- 固定源码：[gagle/node-properties](https://github.com/gagle/node-properties) —— 本文绑定提交 `bb04b570d2216d75ca5631eb1d095f443b5f6a40`
- [[ini]] —— npm 工具链里更窄的 INI 往返
- [[yq]] —— 命令行侧也声明吃 properties

## 关联

- [[ini]] —— 默认同步、section 总开、几乎不转型的对照组
- [[yq]] —— 多格式命令行查询，不是 Node 解析器
- [[dasel]] —— 另一把多格式选择器
- [[jc]] —— 命令输出转 JSON，不实现 `.properties` 写出器

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
