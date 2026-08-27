---
title: CSON — 把 CoffeeScript 对象记号包成文件与 CLI 的高层包装
description: 介绍 cson 8.4.0 如何把 parse/stringify 交给 cson-parser，并默认关掉会执行代码的 JS/CoffeeScript 模式。
来源: https://github.com/bevry/cson
日期: 2026-08-27
分类: 工具库
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/bevry/cson
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 379264c2ac0b97044b8ec4d95d965bda9f823898
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 8.4.0
---

## 是什么

CSON（CoffeeScript-Object-Notation）看起来像少了括号和逗号的对象字面量，还能写注释和多行字符串。固定 8.4.0 的 `cson` 包从 v2 起就不再自己做语法，而是高层包装：默认把字符串交给 `cson-parser`，把文件和命令行留在本包。

日常类比：前台只负责收文件、看后缀、决定能不能走危险通道；真正把文本拆成对象的，是后院另一家店。

你写：

```js
var CSON = require('cson');

var obj = CSON.parse('port: 8080\nname: "api"');
var text = CSON.stringify(obj);
```

`parse` 是 `parseCSONString` 的别名，`stringify` 转到 `createCSONString`，`load` 读文件。导出的是单例：`module.exports = new CSON()`。

## 为什么重要

不读固定 8.4.0 源码，下面这些边界很容易和“CSON 就是可执行 CoffeeScript”混在一起：

- 为什么默认 `parse` 不会跑任意 CoffeeScript
- 为什么 `requireFile('app.cson')` 其实没有 `require()`
- 为什么没传 callback 时失败返回 `Error`，CLI 却会抛出去
- 为什么 git 树里看不到 `edition-esnext/`，npm 却以它为 `main`

## 核心要点

固定 v8.4.0 的主链可以拆成五步：

1. **按格式选通道**：`getOptions` 默认允许 CSON 与 JSON，禁止 JavaScript 与 CoffeeScript。后缀 `.cson` / `.json` / `.coffee` / `.js` 只在没手写 `format` 时生效。
2. **默认 CSON 不求值**：`parseCSONString` / `createCSONString` 直接调用 `require('cson-parser').parse/stringify`。默认缩进是 tab。
3. **JSON 走语言内建**：`JSON.parse` / `JSON.stringify`；JSON 默认缩进是两个空格。
4. **危险通道默认锁住**：只有 `javascript: true` 才 `vm.runInNewContext`；只有 `coffeescript: true` 才 `coffeescript.eval`，或 `requireCSFile` 里的 `coffeescript/register` + `requirefresh`。
5. **错误当返回值**：无 callback 时，失败返回 `Error`。CLI 检查到 `Error` 再 `throw`。`createCSString` / `createJSString` 直接返回“尚未支持”。

## 实践示例

### 案例 1：默认 parse 与打开 CoffeeScript 不是同一条路

```js
var CSON = require('cson');

CSON.parse('host: "localhost"');
CSON.parseString('console.log(1)', { format: 'coffeescript' });
CSON.parseString('console.log(1)', { format: 'coffeescript', coffeescript: true });
```

第一行走 `cson-parser`。第二行因 `coffeescript` 默认 false 返回 Error。第三行才 `coffeescript.eval`。

### 案例 2：`requireFile` 对 `.cson` 只是读文件再 parse

```js
CSON.requireFile('./app.cson');
CSON.requireFile('./legacy.js', { format: 'javascript', javascript: true });
```

`.cson` 走 `parseCSONFile` → `safefs.readFileSync` → `cson-parser`。`.js` 在显式打开后才 `requirefresh`。名字里的 require 对 CSON 文件并不成立。

### 案例 3：CLI 靠后缀选方向，选不出来就停

```bash
json2cson in.json > out.cson
cson2json in.cson > out.json
cson in.data out.data
```

`cson` / `cson2json` / `json2cson` 都指向 `bin.cjs`。后缀是 `.json` 或目标是 `.cson` 则 json→cson；反过来 cson→json。两边都含糊时必须给 `--json2cson` 或 `--cson2json`。从 stdin 读时，1 秒内没有非空白数据就打印帮助并退出。

## 踩过的坑

1. **把 CSON 默认路径当成 `eval`**：默认关闭 CoffeeScript/JS。要执行代码必须改选项，这是刻意分界，不是漏写。
2. **按 Node 习惯写 `try/catch` 包 `CSON.parse`**：无 callback 时解析失败返回 Error，不一定抛。CLI 才会把这个 Error 再扔出去。
3. **克隆 git tag 就当能 `require('cson')`**：`.gitignore` 排除 `edition*/`。`main` 和 `bin.cjs` 都指向编译目录，那是 npm 包才带的文件。
4. **把 `ensureErrorType` 当成稳妥包装**：非 `Error` 时它递归调用自己。本轮只读到源码，未构造这种输入。
5. **顺着 package.json 去读 `cson-parser` 源码仓**：npm `cson-parser@4.0.9` 写的是 `groupon/cson-parser`，该远程当前不可读；本文只核对其版本声明，不描述其内部算法。

## 适用 vs 不适用场景

**适用**：

- 已有 `.cson` 配置或 Atom 时代遗留对象文件，需要读成普通对象或转成 JSON
- 只要数据，不要在配置里执行函数；保持默认关闭的 JS/CS 通道
- 用同一套 CLI 在 JSON 与 CSON 之间转换，并接受 tab / 两空格的默认缩进差

**不适用**：

- 需要无执行语义、无 CoffeeScript 依赖的文本配置——[[hjson]] 更贴
- 必须把函数写进配置并在加载时运行——这不是默认 CSON 通道，而且 `createCS` / `createJS` 仍未支持
- 只能消费 git 树、不能接受“源码在 CoffeeScript、运行入口在编译目录”
- 运行时必须是现代 ESM-only 环境——本包 `type` 为 commonjs，`engines.node` 写 `>=6`

## 固定版本边界

- 本文绑定 `bevry/cson@379264c2ac0b97044b8ec4d95d965bda9f823898`，annotated tag `v8.4.0` 剥皮提交与 npm `cson@8.4.0` 的 `gitHead` 一致。
- 阅读的是 `source/index.coffee`、`source/bin.coffee` 与 `bin.cjs`；未安装依赖，因此未见 `edition-esnext/`。
- 依赖声明为 `cson-parser@^4.0.9`、`extract-opts@^5.8.0`、`requirefresh@^5.13.0`、`safefs@^8.9.0`。`cson-parser@4.0.9` 自己依赖 `coffeescript@1.12.7`，其 git 远程当前不可读。
- edition 列表写 Node 6 到 21；`package.json` 的 `engines.node` 是 `>=6`。许可为 Artistic-2.0。
- 本文未运行上游测试或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **包名是格式，实现却是分层**——`cson` 管文件、选项和 CLI，语法默认外包。
2. **默认关闭的通道才是安全边界**——JS/CoffeeScript 能执行，所以必须显式打开。
3. **API 的 `require*` 对 CSON 是读文件**——不要按 Node 模块缓存去想 `.cson`。
4. **git tag 对齐 npm `gitHead`，不等于运行入口在 git 树里**——编译目录被 ignore。

## 应用型自测

1. `CSON.parse` 失败且没有 callback 时，是抛错还是返回 `Error`？
2. `CSON.requireFile('app.cson')` 会不会走 Node 的 `require`？
3. 不改选项时，`CSON.parseString(code, { format: 'javascript' })` 会执行 `code` 吗？

检查点：

1. 返回 `Error`。CLI 检测到后再 `throw`。
2. 不会。它调用 `parseCSONFile`。
3. 不会。`javascript` 默认 false，返回“格式被选项禁用”的 Error。

## 延伸阅读

- 固定源码：[bevry/cson](https://github.com/bevry/cson) —— 本文绑定提交 `379264c2ac0b97044b8ec4d95d965bda9f823898`
- npm 包装层说明见 README：自 v2 起本包是 [cson-parser](https://www.npmjs.com/package/cson-parser) 的高层包装
- [[hjson]] —— 不依赖 CoffeeScript、在 JSON 文本上加注释与无引号键
- [[vite]] —— 现代项目配置更常是 JS/TS 模块
- [[zod]] —— 读出对象之后仍要校验形状

## 关联

- [[hjson]] —— 人类可读 JSON 方言，默认也不执行代码
- [[vite]] —— 配置即模块，和“读文本再 parse”相对
- [[zod]] —— 解析成功不等于字段合法
- [[marked]] —— 同属文本进、结构出，但出口是 HTML
- [[lodash]] —— 解析后的对象变换

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
