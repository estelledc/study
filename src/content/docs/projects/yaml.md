---
title: yaml — 先留下 Document，再决定要不要变成 JS
description: 先收成可改的 Document，需要普通对象时再 toJS
来源: https://github.com/eemeli/yaml
日期: 2026-08-27
分类: 解析
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/eemeli/yaml
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: ddb21b04cb889722cec8f89dc1b67f19d62d7f7d
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.9.0
---

## 是什么

`yaml` 是 Eemeli Aro 写的 JavaScript YAML 解析 / 序列化库。日常类比：它先把源文本收成一份可改的 **Document 账本**，你需要普通对象时再 `toJS()`；不是一打开就把注释、锚点和样式扔掉。

```js
import { parse, stringify, parseDocument } from 'yaml'

parse('enabled: true\ncount: 3')
stringify({ enabled: true, count: 3 })
const doc = parseDocument('enabled: true # keep me')
```

三层入口叠在一起：`parse` / `stringify` 给日常值，`parseDocument` / `parseAllDocuments` 给 AST，再往下是 `Lexer` → `Parser`（CST）→ `Composer`。

## 为什么重要

不读固定 2.9.0 源码，下面这些合同很容易被旧教程带偏：

- 为什么 README 写「几乎任何字符串都能吃」，`parse()` 却仍可能抛错
- 为什么默认 YAML 1.2 / `core` schema 下，`yes` 不是布尔、`<<` 也不会合并
- 为什么改注释、锚点或键顺序必须停在 Document，而不是先 `parse()` 再 `stringify()`
- 为什么别名展开默认有预算，而不是「能解析就算安全」

## 核心要点

固定版本的主链可以拆成五步：

1. **默认文档合同**：`Document` 构造把 `version` 设成 `'1.2'`，再 `setSchema()` 绑上 `core` 与 `resolveKnownTags: true`。`merge` 默认关。

2. **`parse()` 是薄封装**：`parseDocument()` 走 `Parser.parse` + `Composer.compose(..., true)`；多文档会往第一份 Document 塞 `MULTIPLE_DOCS`。`parse()` 再 `warn` 警告，并在 `logLevel !== 'silent'` 时抛出 `errors[0]`，最后 `toJS()`。

3. **schema 分层**：`'failsafe'` / `'core'` / `'json'` / `'yaml-1.1'`。1.2 下 `coreKnownTags` 仍认识显式 `!!binary` / `!!omap` / `!!set` / `!!timestamp`；隐式 `yes`/`on` 仍是字符串。

4. **`toJS()` 防展开**：`maxAliasCount` 默认 `100`；`0` 直接禁止别名，`-1` 关掉检查。超限抛 `ReferenceError`（`Excessive alias count...`）。

5. **`stringify()` 的边**：数字 indent 会被夹到 1–8；`undefined` 默认返回 `undefined`（除非 `keepUndefined`）；输出文档以 `\n` 结尾。无生产依赖，`engines.node >= 14.6`。

## 实践示例

### 案例 1：先看 Document，再决定要不要 JS

```js
import { parseDocument } from 'yaml'

const doc = parseDocument('enabled: true\n# trailing')
doc.errors    // 语法问题停在这里，不一定立刻 throw
doc.toJS()    // { enabled: true }
```

空输入会合成一份空 Document，`parse()` 走 `toJS()` 后得到 `null`。这和 [[js-yaml]] 的 `load('')` 直接抛错不是同一合同。

### 案例 2：多文档必须换入口

```js
import { parse, parseAllDocuments } from 'yaml'

parse('a: 1\n---\nb: 2')
// 第一份文档能出来，但 errors 里有 MULTIPLE_DOCS；默认 logLevel 会 throw

parseAllDocuments('a: 1\n---\nb: 2').map((d) => d.toJS())
```

`parse()` 只承诺单文档。流式 `---` / `...` 用 `parseAllDocuments`。

### 案例 3：1.2 默认值 vs 显式打开旧行为

```js
import { parse } from 'yaml'

parse('flag: yes')                          // { flag: 'yes' }
parse('<<: { a: 1 }\nb: 2')                 // 键名就是 '<<'
parse('flag: yes', { version: '1.1' })      // { flag: true }
parse('<<: { a: 1 }\nb: 2', { merge: true })
```

要 YAML 1.1 的 `yes`/`on`，换 `version: '1.1'`（schema 变成 `yaml-1.1`）。只要 `<<`，单独开 `merge: true`。

## 踩过的坑

1. **把 README 的「不抛错」安到 `parse()` 上**：不抛错的是 Composer / `parseDocument` 收集 `errors`；`parse()` 默认会 throw 第一项。
2. **先 `parse()` 再 `stringify()` 想保留注释**：JS 值已经丢掉 comment / 样式；改树请用 `parseDocument` + `visit`。
3. **以为默认就能吃 Helm / K8s 的 `<<`**：1.2 `core` 默认关 merge。
4. **把 `maxAliasCount` 当成「没有别名攻击」**：默认 100 是展开预算，不是形式化证明。

## 适用 vs 不适用场景

**适用**：

- 要改 YAML 还想留注释、空行或锚点
- 需要 CST / Document，而不是一次性变成普通对象
- 希望别名展开默认有上限

**不适用**：

- 只要 `load` / `dump` 两个函数、并接受 v5 事件管线 → [[js-yaml]]
- 在 shell 里改 K8s manifest → [[yq]]
- 还没跑 yaml-test-suite，却把「全部通过」写成当前事实

## 固定版本边界

- 本文绑定 `eemeli/yaml@ddb21b04cb889722cec8f89dc1b67f19d62d7f7d`。annotated tag `v2.9.0` 与 npm `yaml@2.9.0` `gitHead` 同指此提交。
- 无生产 `dependencies`；`engines.node` 为 `>= 14.6`。
- 默认 `version: '1.2'`、`schema: 'core'`、`merge: false`、`uniqueKeys: true`、`prettyErrors: true`、`maxAliasCount: 100`。
- 本文未安装依赖、运行 jest / yaml-test-suite 或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **「能解析」和「变成 JS」是两步**——Document 才是注释与错误的容器。
2. **默认 1.2 core 会静默改语义**——`yes` 和 `<<` 都不再按 1.1 习惯工作。
3. **别名预算写在 `toJS()`，不在 Lexer**——没走到 JS 之前，展开攻击还没发生。
4. **公开 API 有三层**——日常值、Document、CST；选错层就会丢掉你真正要的信息。

## 应用型自测

1. `parse('flag: yes')` 里的 `flag` 是 `true` 还是 `'yes'`？
2. `parse('a: 1\n---\nb: 2')` 默认会得到两个对象，还是抛错？
3. 未改选项时，`parse('*a\n---\n&a [1, *a]')` 这类别名展开受什么默认上限约束？

检查点：

1. `'yes'`。默认 core 只认 `true`/`True`/`TRUE`。
2. 抛错。`parseDocument` 记下 `MULTIPLE_DOCS`，`parse()` 再 throw。
3. `maxAliasCount` 默认 `100`；超限是 `ReferenceError`。

## 延伸阅读

- 官方文档：[eemeli.org/yaml](https://eemeli.org/yaml/)
- 固定源码：[eemeli/yaml](https://github.com/eemeli/yaml) —— 本文绑定提交 `ddb21b04cb889722cec8f89dc1b67f19d62d7f7d`
- 对照入口：`src/public-api.ts`、`src/doc/Document.ts`、`src/compose/composer.ts`、`src/nodes/Alias.ts`
- [[js-yaml]] —— 同主题的 `load`/`dump` 事件管线，默认别名预算不同
- YAML 1.2 spec：[yaml.org/spec/1.2.2](https://yaml.org/spec/1.2.2/)

## 关联

- [[js-yaml]] —— 另一套 JS YAML 实现，v5 默认也是 1.2 core
- [[yq]] —— shell 里改 YAML 的 jq 风格工具
- [[dasel]] —— 多格式选择器，不是完整 YAML 1.2 Document 模型

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[js-yaml]] —— js-yaml — v5 把 load/dump 接到事件管线上

- [[js-yaml]] —— js-yaml — v5 把 load/dump 接到事件管线上
