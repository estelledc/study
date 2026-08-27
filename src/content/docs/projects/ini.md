---
title: ini — npm 自家的单文件 INI 编解码器
description: 介绍 ini 7.0.0 如何用一行正则把 section 收成嵌套对象，并丢掉 __proto__。
来源: https://github.com/npm/ini
日期: 2026-08-27
分类: 工具库
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/npm/ini
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 847941ced4fb8465f0ccb383fd8b15c7e5aa09fc
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 7.0.0
---

## 是什么

`ini` 是 npm 组织维护的 JavaScript INI 编解码器。日常类比：它把一份带 `[section]` 的文本说明书拆成 nested 抽屉，再按同一套规则装回去；没有文件 I/O，只吃字符串。

你写：

```js
const { parse, stringify } = require('ini');

const config = parse(`
scope = global
[database]
user = dbuser
[paths.default]
datadir = /var/lib/data
array[] = first
array[] = second
`);

stringify(config);
```

`parse` 是 `decode` 的别名，`stringify` 是 `encode` 的别名。固定 7.0.0 只有一个实现文件 `lib/ini.js`，CJS 导出这四个名字以及 `safe` / `unsafe`。

## 为什么重要

不理解它的“一行正则 + 点号嵌套 + 只认三种字面量”，就解释不了下面几件事：

- 为什么 `[paths.default]` 会变成 `config.paths.default`，而不是一个叫 `paths.default` 的键
- 为什么 `port = 8080` 读出来仍是字符串 `"8080"`
- 为什么写成 `debug` 而没有 `=` 会得到布尔 `true`
- 为什么 `__proto__` section 看起来像被解析了，结果里却没有这个键

## 核心要点

固定 7.0.0 的主链可以拆成五步：

1. **只做字符串进出**：没有 `path`、没有 `fs`。调用方自己 `readFile` / `writeFile`。`package.json` 的 `main` 是 `lib/ini.js`，没有 `exports` 字段，也没有 `type: module`。

2. **按行匹配两种形状**：`decode` 用 `/^\[([^\]]*)\]\s*$|^([^=]+)(=(.*))?$/i`。第一支是 section 头，第二支是 `key` 或 `key=value`。`;` / `#` 开头和空行直接跳过。

3. **section 先挂对象，再按点合并**：每个 section 先落在 `Object.create(null)` 上。扫完后再用 `splitSections(name, '.')` 把 `a.b` 嵌进 `out.a.b`，`\.` 会留下字面点。

4. **值几乎不转型**：缺 `=` 时值是 `true`；字面量 `true` / `false` / `null` 走 `JSON.parse`。数字、路径、空字符串都保持字符串。

5. **数组靠后缀或重复键**：默认 `bracketedArray=true`，`key[]` 聚成数组。关掉后，同一 key 出现第二次才改成数组。`stringify` 对数组默认补回 `[]`。

## 实践示例

### 案例 1：点号 section 会嵌套，字面点要转义

```js
const obj = parse(`
[paths.default]
datadir = /var/lib/data
[literal\\.dot]
kept = yes
`);
obj.paths.default.datadir; // '/var/lib/data'
obj['literal.dot'].kept;   // 'yes'
```

`splitSections` 遇到前面带 `\` 的 `.` 不会切开。`stringify` 再写回去时，会把点号 section 重新拼成 `paths.default`。

### 案例 2：没有等号就是 true，数字不会变成 number

```js
const obj = parse(`
debug
port = 8080
empty =
flag = false
`);
obj.debug; // true
obj.port;  // '8080'
obj.empty; // ''
obj.flag;  // false
```

`match[3]` 不存在时走 `true`；`false` / `null` 才会被 `JSON.parse`。`8080` 没有这条通道。

### 案例 3：`__proto__` 被丢掉，构造函数路径却仍是普通键

```js
const obj = parse(`
__proto__ = quux
[__proto__]
foo = bar
[other]
foo = asdf
`);
obj.__proto__; // undefined
obj.other.foo; // 'asdf'
```

名为 `__proto__` 的 key 直接 `continue`；同名 section 会解析进临时对象，但不挂到结果上。`constructor.prototype.foo` 这种键会原样留下，因为实现认的是键名本身，不是任意原型链路径。

## 踩过的坑

1. **把 `import { parse } from 'ini'` 当成仓库里有 ESM 源**：README 用 ESM 举例，固定提交仍是 `module.exports`。Node 可以把 CJS 具名导出互操作进来，但源码仓不是 native ESM。

2. **指望 `port` 变成数字**：只有 `true` / `false` / `null` 会转型。要数字得自己 `Number()`。对照 [[properties]] 的 `cast`。

3. **把重复 key 默认当成数组**：默认必须写 `key[]`。`bracketedArray: false` 才按出现次数折叠。

4. **把 7.0.0 当成“解析行为大改”**：`CHANGELOG` 写明破坏变更是 `engines.node` 收到 `^22.22.2 || ^24.15.0 || >=26.0.0`。解析主链仍在同一文件。

5. **把 `safe()` 理解成 HTML 转义**：它只处理 INI 危险字符。含 `=` / 换行 / 前导 `[` / 已有引号 / 首尾空白的值会走 `JSON.stringify`，`;` 和 `#` 则加反斜杠。

## 适用 vs 不适用场景

**适用**：

- 只要把 INI 文本和 plain object 互转，文件读写自己做
- 接受 section 变嵌套对象、默认 `key[]` 表示数组
- 运行时满足 Node `^22.22.2 || ^24.15.0 || >=26.0.0`

**不适用**：

- 需要 Java `.properties` 的 `:` 分隔、`#` / `!` 注释、`${var}` 或 include——应看 [[properties]]
- 需要在命令行里改 YAML / XML / properties——[[yq]] / [[dasel]] 更贴
- 不能接受“数字仍是字符串”、也不能自己做转型
- 还停留在 Node 20 及以下——7.0.0 的 engines 会拒绝安装

## 固定版本边界

- 本文绑定 `npm/ini@847941ced4fb8465f0ccb383fd8b15c7e5aa09fc`，lightweight tag `v7.0.0` 与 npm `ini@7.0.0` 的 `gitHead` 同指此提交。
- `package.json` 无运行时依赖；`files` 只发布 `bin/` 与 `lib/`。
- `decode` 的结果和中间 section 都用 `Object.create(null)`。
- 本文未安装依赖、运行上游测试或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **INI 在这里是“行 + 一种正则”，不是完整文法**——对不上的行被默默丢掉。
2. **嵌套来自 section 名里的点，不是缩进**——`[a.b]` 和 `a.b =` 是两条不同的合并路径。
3. **类型合同极窄**——布尔和 `null` 有字面量，数字没有。
4. **原型键是黑名单，不是通用净化**——只挡 `__proto__` 这个名字。

## 应用型自测

1. `parse('port = 8080').port` 的 JS 类型是 number 还是 string？
2. 默认选项下，连续两行 `item = a` / `item = b` 会得到数组吗？
3. `[__proto__]` 里的键会不会出现在 `parse` 的返回对象上？

检查点：

1. string。只有 `true` / `false` / `null` 会走 `JSON.parse`。
2. 不会。默认要 `item[]`，或显式 `bracketedArray: false`。
3. 不会。实现解析该 section，但不把它挂到结果上。

## 延伸阅读

- 文档：[github.com/npm/ini](https://github.com/npm/ini)
- 固定源码：[npm/ini](https://github.com/npm/ini) —— 本文绑定提交 `847941ced4fb8465f0ccb383fd8b15c7e5aa09fc`
- [[properties]] —— 同一“文本配置”问题，默认走 Java `.properties` 并多出 variables / include
- [[yq]] —— 命令行侧也能读 properties，但合同是 jq 风格查询，不是 JS API

## 关联

- [[properties]] —— `.properties` / 可选 INI section 的对照组
- [[yq]] —— 多格式命令行处理器，声明也吃 properties
- [[dasel]] —— 另一把多格式查询刀
- [[jc]] —— 把命令输出收成 JSON，不负责 INI 往返

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
