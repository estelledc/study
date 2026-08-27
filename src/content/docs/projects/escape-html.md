---
title: escape-html — 按字符码表转义五类 HTML 特殊字符
description: 介绍 escape-html 1.0.3 如何用一次扫描和 charCode switch 把五类 HTML 特殊字符写成实体。
来源: https://github.com/component/escape-html
日期: 2026-08-27
分类: 工具库
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/component/escape-html
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 7ac2ea3977fcac3d4c5be8d2a037812820c65f28
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.0.3
---

## 是什么

escape-html 是一个只做一件事的 CommonJS 小函数：把字符串里的 `&`、`<`、`>`、`"`、`'` 换成 HTML 实体。日常类比：安检口只认五种违禁品，其余原样放行；没有反向出口，也没有“整段 HTML 消毒”。

你写：

```js
var escapeHtml = require('escape-html');
escapeHtml('foo & bar');
// -> 'foo &amp; bar'
```

固定 1.0.3 的 `index.js` 只导出这一个函数。`package.json` 没有 `main` 字段，Node 按惯例解析到同目录 `index.js`。

## 为什么重要

不理解它“先找再扫、按字符码替换、没有 unescape”的合同，就解释不了下面几件事：

- 为什么干净字符串几乎只付一次正则探测的代价
- 为什么 `escapeHtml(null)` 会变成 `'null'` 而不是空串
- 为什么单引号写成 `&#39;` 而不是 `&apos;`
- 为什么它不能代替 sanitizer，也不能单独保证属性安全

## 核心要点

固定 1.0.3 的主链可以拆成五步：

1. **单一 CJS 导出**：`module.exports = escapeHtml`。没有具名导出，没有 tagged template，没有反向解码。

2. **先强制成字符串**：`var str = '' + string`。`null` 变成 `'null'`，`undefined` 变成 `'undefined'`，普通对象走 `toString`。

3. **先探测有没有特殊字符**：模块顶层正则是 `/["'&<>]/`。`exec` 没命中就直接返回刚才那份字符串。

4. **从第一个命中处按 `charCodeAt` 往下走**：`34` → `&quot;`，`38` → `&amp;`，`39` → `&#39;`，`60` → `&lt;`，`62` → `&gt;`。普通字符先攒着，碰到要替换的码再切开拼接。

5. **循环结束后补尾巴**：`lastIndex !== index` 时把剩余子串接上。每个特殊字符独立替换，不会因为 `&` 和 `<` 的先后顺序发生二次转义。

## 实践示例

### 案例 1：干净字符串原样返回

```js
escapeHtml('Hello, World!');
// -> 'Hello, World!'
```

第一次 `exec` 得到 `null`，函数立刻返回。仓库里的 `benchmark/index.js` 把这条路径单独列成 “no special characters”，但本轮未跑 benchmark，不引用文档里的 ops/sec。

### 案例 2：五种字符各走一条 switch 臂

```js
escapeHtml('\'>"&<');
// -> '&#39;&gt;&quot;&amp;&lt;'
```

源码用字符码而不是五次 `replace`。`'` 固定映射到数字实体 `&#39;`，与 HTML4 里 `&apos;` 未标准化的历史兼容有关。

### 案例 3：非字符串会被拼进结果

```js
escapeHtml(null);       // 'null'
escapeHtml(undefined);  // 'undefined'
escapeHtml(42);         // '42'
```

这是 `'' + string` 的语言规则，不是专门的 null 处理。对照 [[escape-goat]]：那边只有 `typeof === 'string'` 才走转义函数。

## 踩过的坑

1. **把它当成 HTML 消毒器**：它不删标签、不解析 DOM、不管 `javascript:`。用户输入进 HTML 正文前转义是一回事；富文本或 Markdown 开 `html: true` 是另一回事。

2. **不给属性加引号**：即便值里的 `"` 被换成 `&quot;`，未加引号的属性仍可能被空格切开。这是调用约定，不是库能补上的。

3. **没有 unescape**：`&amp;` 进函数后，`&` 会再变成 `&amp;amp;`。要可逆编解码应看 [[escape-goat]]。

4. **把 README 的 2014 年 benchmark 数字当成本轮测量**：`Readme.md` 记录过 Node 0.10 上的 ops/sec；本轮未安装 `benchmark`，未执行 `npm run bench`。

5. **以为 npm 包另有入口文件**：发布 `files` 只有 `LICENSE`、`Readme.md`、`index.js`；没有 ESM 条件导出。

## 适用 vs 不适用场景

**适用**：

- 服务端把不可信文本插进 HTML 正文或已加引号的属性
- 需要 CommonJS、零依赖、与 Express 生态常见的那份 1.0.3 合同对齐
- 只要单向转义，不要解码

**不适用**：

- 需要 tagged template，只转插值、保留字面量标签——看 [[escape-goat]]
- 需要同时解码 `&amp;` / `&#39;` / `&#039;`——同样看 [[escape-goat]]
- JSX 文本节点——[[react]] 在创建文本时自己转义
- 要把整段 HTML 洗成安全子集——这不是转义库的工作

## 固定版本边界

- 本文绑定 `component/escape-html@7ac2ea3977fcac3d4c5be8d2a037812820c65f28`，tag `v1.0.3` 剥皮提交与 npm `escape-html@1.0.3` 的 `gitHead` 相同。
- 源码仓 `package.json` 版本为 `1.0.3`，无 runtime 依赖，无 `engines`，无 `main`；`files` 只包含许可证、说明和 `index.js`。
- 正则、五条字符码和 `'' + string` 都写在同一文件；`Makefile` 只服务已退役的 component 构建，不参与 npm 运行。
- 本文未安装依赖、运行上游测试或测量吞吐，状态保持 `UNVERIFIED`。

## 学到什么

1. **短路径和替换路径是分开的**——没有特殊字符时连 switch 都不进。
2. **转义表是字符码合同，不是正则替换清单**——顺序不会造成 `&lt;` 被再写成 `&amp;lt;`。
3. **强制字符串化会把空值变成可见单词**——`null` 不是“跳过”。
4. **转义不是消毒**——它只保证这五个字符在 HTML 文本里不再开标签或截断属性。

## 应用型自测

1. `escapeHtml('Hello')` 会不会走进 `charCodeAt` 循环？
2. `escapeHtml("'")` 的结果是 `&apos;` 还是 `&#39;`？
3. `escapeHtml(null)` 返回空串、抛错，还是 `'null'`？

检查点：

1. 不会。`/["'&<>]/` 没命中就直接返回。
2. `&#39;`。源码 `case 39` 写死这个数字实体。
3. `'null'`。来自 `'' + string`，不是显式分支。

## 延伸阅读

- 固定源码：[component/escape-html](https://github.com/component/escape-html) —— 本文绑定提交 `7ac2ea3977fcac3d4c5be8d2a037812820c65f28`
- [[escape-goat]] —— 同一组五字符，但补上 ESM、unescape 与 tagged template
- [[express]] —— Node Web 框架；响应文本仍要调用方自己决定何时转义
- [[react]] —— JSX 文本节点默认转义，和这份 CJS 函数不是同一层

## 关联

- [[escape-goat]] —— 可逆编解码与模板插值对照组
- [[express]] —— 常见宿主；本库不内嵌在 Express 核心页的固定 5.2.1 主链里
- [[react]] —— 视图层自动转义对照
- [[koa]] —— 另一条 Node HTTP 流水线，同样要把输出转义留给应用

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
