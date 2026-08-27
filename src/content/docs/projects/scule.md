---
title: scule — 先切词再拼大小写的 TypeScript 字符串工具
description: 默认按 - _ / . 与大小写边沿切词，再拼 Pascal / kebab / train / title
来源: https://github.com/unjs/scule
日期: 2026-08-27
分类: 工具库
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/unjs/scule
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 90d28593c8426d16beb5dadf3af8d341b6fee107
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.3.0
---

## 是什么

scule 是一份 TypeScript 字符串大小写工具。日常类比：它先用小刀把标识符切开，再按你要的衣服重新缝——刀法固定，缝法可以换。

```ts
import { camelCase, kebabCase, pascalCase } from "scule"

pascalCase("foo-bar_baz") // FooBarBaz
camelCase("foo-bar_baz")  // fooBarBaz
kebabCase("fooBar_Baz")   // foo-bar-baz
```

固定 `1.3.0` 的公开函数都建立在 `splitByCase` 上。`package.json` 同时给 CommonJS `require` 和 ESM `import`，并声明 `sideEffects: false`。

## 为什么重要

不理解这套切词合同，下面这些事会对不上：

- 为什么 `kebabCase("foo-bAr")` 得到 `foo-b-ar`，而不是“看起来更顺”的 `foo-bar`
- 为什么 `trainCase("WWWAuthenticate")` 能保住 `WWW`，但 `normalize: true` 会把它压成 `Www`
- 为什么 TypeScript 能把 `"foo-bar"` 推成字面量 `"fooBar"`，却不能在运行时还原被丢掉的分隔符
- 为什么它和 [[change-case]] 对同一串 HTTP header 大小写答案不同

## 核心要点

固定版本可以拆成四步：

1. **切词是唯一入口**：默认 splitter 是 `-` `_` `/` `.`。也可以传入自定义列表。切完的片段保留原大小写；分隔符本身被丢掉，所以这步不可逆。

2. **大小写边沿也会切**：从低到高（`fooBar` → `foo` / `Bar`）直接切开。从高到低且缓冲区长度大于 1 时，最后一个大写字母跟下一个小写字母组成新词（`FooBARb` → `Foo` / `BA` / `Rb`）。数字让 `isUppercase` 返回 `undefined`，不单独触发边沿。

3. **拼法是薄封装**：`pascalCase` 对每个片段 `upperFirst` 再拼接；`camelCase` 只是再 `lowerFirst`。`snakeCase` / `flatCase` 分别是 `kebabCase` 换 `"_"` 或 `""`。`kebabCase` 及其派生一律 `toLowerCase`。

4. **`normalize` 只给部分函数**：`pascalCase` / `camelCase` / `trainCase` / `titleCase` 可先 `toLowerCase` 再首字母大写。`titleCase` 另外用一份英文虚词正则（`a|an|and|...|the|to|with`）保持小写，并用空格连接。

## 实践示例

### 案例 1：默认切词，含连续分隔符

```ts
import { kebabCase, splitByCase } from "scule"

splitByCase("foo--bar-Baz") // ["foo", "", "bar", "Baz"]
kebabCase("foo--bar")       // "foo--bar"
```

空片段不会被 `kebabCase` 滤掉，所以双连字符会原样留下。`trainCase` / `titleCase` 才会 `.filter(Boolean)`。

### 案例 2：连字符后面的驼峰仍会再切

```ts
import { kebabCase, splitByCase } from "scule"

splitByCase("foo-bAr") // ["foo", "b", "Ar"]
kebabCase("foo-bAr")   // "foo-b-ar"
```

遇到 `-` 时函数 `continue`，并不把 `previousSplitter` 置为 true。于是后面的 `bAr` 仍按上升沿切开。这不是文档笔误，测试就锁了这个结果。

### 案例 3：train / title 对首字母的两种态度

```ts
import { titleCase, trainCase } from "scule"

trainCase("WWWAuthenticate")                 // WWW-Authenticate
trainCase("WWWAuthenticate", { normalize: true }) // Www-Authenticate
titleCase("this-IS-aTitle")                  // This is a Title
```

`trainCase` 默认把连续大写当成缩写留下，所以适合 HTTP header。`titleCase` 不管 `IS` 原来多大写，虚词都会被压成 `is`。

## 踩过的坑

1. **以为 kebab 会“顺一下”驼峰**：`foo-bAr` 会再切一刀。需要更粗的词边界时，应换 [[change-case]] 或自己传入 splitter。
2. **把 `normalize` 当成全局开关**：`kebabCase` / `snakeCase` / `flatCase` 没有这个参数，它们已经全小写。
3. **用 `splitByCase` 做往返**：分隔符被丢了，`foo_bar-baz` 拼回去无法区分原来用的是 `_` 还是 `-`。
4. **把 title case 当成国际化**：虚词表是一份英文正则，不是 locale 数据。
5. **对非字符串调用 `splitByCase`**：`!str || typeof str !== "string"` 时直接返回 `[]`。

## 适用 vs 不适用场景

**适用**：

- 要在 TypeScript 里同时拿到运行时转换和字面量类型
- 需要 CJS / ESM 双入口，且能接受默认 splitter 语义
- 想保住 `WWW-Authenticate` 这种 header 缩写

**不适用**：

- 需要 `locale`、Unicode 属性切词，或把对象 key 递归改名 → [[change-case]]
- 需要英文 title case 的完整虚词 / 缩写规则 → 那是 change-case 仓里的独立 `title-case` 包，不在 scule
- 要把静态阅读升级成已测 bundle 或跨引擎 `toLowerCase` 结论

## 固定版本边界

- 本文绑定 `unjs/scule@90d28593c8426d16beb5dadf3af8d341b6fee107`。annotated tag `v1.3.0` 与 npm `scule@1.3.0` 的 `gitHead` 同指此提交。
- 源码只有 `src/index.ts` 与 `src/types.ts`；测试在 `test/scule.test.ts`。
- 未声明 `engines`。未安装依赖、未跑 vitest / typecheck，状态保持 `UNVERIFIED`。

## 学到什么

1. **大小写转换的真相是切词表，不是一组互不相关的正则。**
2. **“看起来像一个词”不等于切词器也这么看**——连字符后的驼峰仍会再切。
3. **缩写保留是选项，不是默认道德**——`normalize` 会把它收掉。
4. **类型层的 `CamelCase<"foo-bar">` 只保证字面量输入**；宽 `string` 会退化成 `string`。

## 应用型自测

1. `kebabCase("foo-bAr")` 的结果是 `foo-bar` 还是 `foo-b-ar`？
2. `trainCase("WWWAuthenticate")` 默认会不会把 `WWW` 压成 `Www`？
3. `snakeCase("foo-barBaz")` 在固定源码里是独立实现，还是复用 `kebabCase`？

检查点：

1. `foo-b-ar`。上升沿仍会切。
2. 不会。默认保留连续大写。
3. 复用：`kebabCase(str, "_")`。

## 延伸阅读

- 固定源码：[unjs/scule](https://github.com/unjs/scule) —— 本文绑定 `90d28593c8426d16beb5dadf3af8d341b6fee107`
- 审查记录：仓库内 `docs/string-case-source-review-20260827-fg.md`
- 对照入口：`src/index.ts`、`src/types.ts`、`test/scule.test.ts`
- [[change-case]] —— 同主题的 Unicode / locale / keys 路线

## 关联

- [[change-case]] —— 正则切词 + locale + `change-case/keys`
- [[zod]] —— 同样把运行时函数和 TypeScript 类型绑在一起，但对象是 schema 而不是字符串
- [[immer]] —— 另一类“API 很薄、合同在内部遍历”的 TS 小库

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[change-case]] —— change-case — 用 Unicode 切词再映射到十一种写法
