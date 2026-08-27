---
title: Hjson — 给 JSON 加注释、无引号键和可省略逗号的人类配置格式
description: 介绍 hjson 3.2.2 如何用可选根括号、无引号字符串和 __COMMENTS__ 做可读配置，并区分 DSF 与 require hook。
来源: https://github.com/hjson/hjson-js
日期: 2026-08-27
分类: 工具库
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/hjson/hjson-js
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: be47262264c76e3658f0c6242be33ad2b8a4444c
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.2.2
---

## 是什么

Hjson 是 JSON 的人类界面：同一份对象可以带注释、无引号键、无引号字符串，逗号也可省。日常类比：把机器读的标签贴纸改成可以随手批注的便签，贴完再撕回机器认识的那一层。

你写：

```js
var Hjson = require('hjson');

var obj = Hjson.parse('{ rate: 1000 # req/s\n }');
var text = Hjson.stringify(obj);
```

`parse` 同时吃 JSON 和 Hjson；`stringify` 默认吐回 Hjson。固定 npm `hjson@3.2.2` 的源码仓以 `lib/hjson.js` 为入口，另有 `bin/hjson` 命令行。

## 为什么重要

不读固定 3.2.2 源码，下面这些合同很容易被“更松的 JSON”一句话带偏：

- 为什么根对象可以没有大括号，却不是另一种文件格式
- 为什么无引号字符串会把整行都吃进去
- 为什么 `Hjson.rt` 能保住注释，普通 `parse` 却不能
- 为什么 `Inf` / `0xFF` / 日期默认仍是字符串

## 核心要点

固定提交的主链可以拆成五步：

1. **选根策略**：`legacyRoot` 默认 true。先尝试对象或数组；否则按“省略了根括号的对象”解析，失败再退回单个值。
2. **空白与注释**：`#`、`//`、`/* */` 都在 `white()` 里丢掉。只有 `keepWsc` 为真时，才把片段挂到对象上不可枚举的 `__COMMENTS__`。
3. **键与值**：键可以无引号，除非碰到空白或 `{}[],:`。值是对象、数组、单/双引号字符串、`'''` 多行字符串，或无引号的 `tfnns()`。
4. **无引号记号**：`true` / `false` / `null` / 数字按字面识别；其余当字符串，一直读到换行、逗号、闭合括号或注释。前导零数字会被拒绝。
5. **再写回去**：`stringify` 默认不输出逗号、根括号总会出现。`Hjson.rt` 只是给 parse/stringify 强制 `keepWsc=true`。

## 实践示例

### 案例 1：根括号可省，是解析器开关，不是另一种语法

```js
Hjson.parse('host: localhost\nport: 8080');
Hjson.parse('{ host: localhost, port: 8080 }');
Hjson.parse('host: localhost\nport: 8080', { legacyRoot: false });
```

前两行都得到对象。第三行关掉 `legacyRoot` 后，根必须是 `{` 或 `[`，否则按单个值处理并可能报错。

### 案例 2：往返注释走 `__COMMENTS__`，不是隐藏字段协议

```js
var data = Hjson.rt.parse('# listen\nport: 8080');
data.port = 9090;
Hjson.rt.stringify(data);
```

`rt.parse` 把 `# listen` 记进 `__COMMENTS__`。`Object.keys(data)` 看不到它。普通 `parse` 不会建这个槽，再 `stringify` 也就写不回原注释。

### 案例 3：DSF 默认关闭，CLI 用 `+math` 才打开

```js
Hjson.parse('value: Inf');                 // 字符串 "Inf"
Hjson.parse('value: Inf', { dsf: [Hjson.dsf.math()] }); // Infinity
```

`Hjson.dsf` 提供 math / hex / date。源码把 DSF API 标成 experimental。命令行对应 `+math`、`+hex`、`+date`。

## 踩过的坑

1. **把无引号字符串当成“到下一个标点为止”**：它吃到换行。源码在缺括号时报 hint：`unquoted strings contain everything up to the next line`。
2. **以为 `emitRootBraces: false` 还能去掉根括号**：选项注释写明已过时，stringify 总是输出根括号。
3. **把 README 的 `serializeDeterministically` 当源码字段**：实现读取的是 `sortProps`；它只排序没有 comment 记录的新键。
4. **把 `require("hjson/lib/require-config")` 当成稳定加载器**：它注册 `require.extensions[".hjson"]`，同步读文件后 `Hjson.parse`。这是旧 Node hook。
5. **把 `Hjson.version` 当成 npm 3.2.2**：`lib/hjson-version.js` 仍导出 `"3.2.1"`。3.2.2 提交只更新了 npm 链接；仓库没有 git tag。

## 适用 vs 不适用场景

**适用**：

- 人手写配置，需要注释、可省逗号和无引号键，最终仍要一份普通对象
- 改完配置还想把原注释写回去，并接受 `__COMMENTS__` 这套约定
- 命令行在 JSON 与 Hjson 之间转换，默认输出带颜色的 Hjson

**不适用**：

- 必须严格 JSON、不能有注释或无引号值
- 需要把 `Inf` / 十六进制 / 日期当一等类型，却不想显式打开 DSF
- 不能接受“仓库无 tag、包版本与 `Hjson.version` 不一致”的 provenance
- 想用 CoffeeScript 对象记号而不是 Hjson 语法——应看 [[cson]]

## 固定版本边界

- 本文绑定 `hjson/hjson-js@be47262264c76e3658f0c6242be33ad2b8a4444c`，即 npm `hjson@3.2.2` 的 `gitHead`。仓库没有对应 tag。
- `package.json` 写 `3.2.2`；`lib/hjson.js` 头注释与 `lib/hjson-version.js` 仍是 `3.2.1`。
- 绑定之后 `master` 只多 2 个 README 提交，修正 `sortProps` 文档笔误；本文不描述它们。
- 重复键覆盖前值。`undefined` 与函数在对象里被丢掉，在数组里变成 `null`。
- 本文未安装依赖、运行上游测试或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **“更松的 JSON”其实是一套根策略 + 无引号扫描规则**——`legacyRoot` 和 `tfnns()` 决定一份文本是对象还是单个值。
2. **注释能往返，是因为挂了不可枚举槽，不是因为语法自己记得**——离开 `keepWsc` 就没有 `__COMMENTS__`。
3. **DSF 是可选插件，不是默认字面量**——`Inf` 默认仍是字符串。
4. **发布版本可以和库内 `version` 不是同一处文字**——要对 npm `gitHead`，不要只读 `Hjson.version`。

## 应用型自测

1. `Hjson.parse('a: 1')` 在默认选项下得到对象还是字符串？
2. 不传 `keepWsc` 的 `Hjson.parse` 再 `stringify`，原文件顶部的 `# comment` 还会在吗？
3. `Hjson.parse('{ value: Inf }')` 的 `value` 是 `Infinity` 还是 `"Inf"`？

检查点：

1. 对象。默认 `legacyRoot` 把无括号根当成对象。
2. 不会。普通 parse 不建 `__COMMENTS__`。
3. 字符串 `"Inf"`。要 `Infinity` 必须传入 `dsf: [Hjson.dsf.math()]`。

## 延伸阅读

- 语法站点：[hjson.github.io](https://hjson.github.io)
- 固定源码：[hjson/hjson-js](https://github.com/hjson/hjson-js) —— 本文绑定提交 `be47262264c76e3658f0c6242be33ad2b8a4444c`
- [[cson]] —— 另一条“看起来像对象字面量”的配置路线，语法来自 CoffeeScript
- [[vite]] —— 项目配置更多走 JS/TS 模块，而不是文本方言
- [[zod]] —— 解析之后的运行时形状检查

## 关联

- [[cson]] —— CoffeeScript 对象记号 vs Hjson 文本方言
- [[vite]] —— 配置常被当成可执行模块，而不是纯数据文件
- [[zod]] —— 配完格式后仍要校验字段
- [[marked]] —— 同是 JS 文本解析器，但目标是 HTML 而不是对象
- [[lodash]] —— 解析后的对象路径读写

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
