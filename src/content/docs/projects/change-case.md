---
title: change-case — 用 Unicode 切词再映射到十一种写法
description: 先用 Unicode 正则切词，再换 delimiter / locale；keys 入口按深度改对象键名
来源: https://github.com/blakeembrey/change-case
日期: 2026-08-27
分类: 工具库
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/blakeembrey/change-case
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 8aaff31471c918d3eac2b40939c601bee37375dd
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 5.4.4
---

## 是什么

change-case 是一个把字符串在多种书写约定之间转换的 ESM 包。日常类比：它先用一把认识字母和数字的尺子把句子画成一段段词，再决定段与段之间放空格、连字符还是什么都不放。

```ts
import { camelCase, kebabCase, snakeCase } from "change-case"

camelCase("TEST_VALUE") // testValue
kebabCase("Test String") // test-string
snakeCase("TestV2")      // test_v2
```

固定 `5.4.4` 住在 monorepo 的 `packages/change-case`。同一次提交里还有独立的 `title-case` / `sponge-case` / `swap-case`，**不在这个 npm 包的 exports 里**。

## 为什么重要

不理解固定 5.4.4 的切词和变换分层，下面这些事会对不上：

- 为什么 `trainCase("WWWAuthenticate")` 得到 `Www-Authenticate`，而 [[scule]] 默认保住 `WWW`
- 为什么 `camelCase("version 1.2.10")` 会变成 `version_1_2_10`，以及 `mergeAmbiguousCharacters` 怎样把它黏回去
- 为什么 `change-case/keys` 默认只改一层 key，嵌套对象原样留下
- 为什么 TypeScript 里不能 `require("change-case")`

## 核心要点

固定版本的主链可以拆成五步：

1. **`split` 用 Unicode 属性**：先 `trim`，再用 `\p{Ll}\p{Lu}` 和 `\p{Lu}\p{Lu}\p{Ll}` 插入 `\0`，然后把非字母数字收成 `\0`。前后的空分隔会被修掉；纯分隔符输入得到 `[]`。

2. **大多数 case 只是换连接符**：`noCase` 把词 `toLocaleLowerCase` 后用空格（或 `delimiter`）接上。`kebabCase` / `snakeCase` / `dotCase` / `pathCase` 都是它的薄封装。

3. **首字母策略分两路**：`capitalCase` 每个词都“首大写 + 其余小写”。`trainCase` 就是它换上 `-`。`sentenceCase` 只把第一个词走 capital，其余全小写。

4. **camel / pascal 多一个数字歧义**：词下标大于 0 且首字符是 `0-9` 时，`pascalCaseTransformFactory` 会先加 `_`。所以 `version 1.2.10` 的 camel 是 `version_1_2_10`。`mergeAmbiguousCharacters: true` 改用 capital 变换，得到 `version1210`。

5. **选项是切词前后的夹具**：`locale: false` 关闭 `toLocale*`；`prefixCharacters` / `suffixCharacters` 可保住 `__typename` 两端；`separateNumbers` 已标 deprecated，等价于传入 `split: splitSeparateNumbers`。

## 实践示例

### 案例 1：默认会丢掉环绕分隔符

```ts
import { camelCase, snakeCase } from "change-case"

camelCase("_foo_bar_") // fooBar
snakeCase("TestV2")    // test_v2
```

下划线被当成非词字符剥掉。若要 GraphQL 的 `__typename` 留下前缀，必须显式 `prefixCharacters: "_$"`。

### 案例 2：数字歧义只发生在 camel / pascal

```ts
import { camelCase, pascalCase, snakeCase } from "change-case"

camelCase("version 1.2.10")  // version_1_2_10
pascalCase("version 1.2.10") // Version_1_2_10
snakeCase("version 1.2.10")  // version_1_2_10

camelCase("version 1.2.10", { mergeAmbiguousCharacters: true }) // version1210
```

`snakeCase` 的下划线来自 delimiter，不是那套“词首数字加 `_`”的工厂。README 把后者写成 pascal/snake，固定源码只挂在 camel/pascal。

### 案例 3：keys 默认深度是 1

```ts
import { camelCase } from "change-case/keys"

camelCase({ TEST_KEY: { FOO_BAR: true } })
// { testKey: { FOO_BAR: true } }

camelCase({ first_name: "bob", credentials: [{ built_things: true }] }, Infinity)
// { firstName: "bob", credentials: [{ builtThings: true }] }
```

工厂用 `Object.create(Object.getPrototypeOf(object))` 保留原型，再按 `Object.keys` 写入新键。`depth === 0` 或非对象原样返回；数组会映射每个元素并递减 depth。

## 踩过的坑

1. **把 train case 当成 HTTP header case**：这里每个词都会被 normalize 成首大写其余小写。要缩写保留，看 [[scule]] 的默认 `trainCase`。
2. **以为 `titleCase` 在这个包里**：固定仓的 title 规则在独立包 `title-case@4.3.1`，本页未绑定。
3. **忘了 keys 的默认深度**：只改顶层。嵌套要自己传 `Infinity` 或更大数字。
4. **在 TypeScript 里走 CommonJS**：README 写明 pure ESM，不能按 legacy `node` resolution `require`。
5. **把 host locale 当成稳定合同**：默认 `toLocaleLowerCase()` 跟运行时走，本轮未测差异。

## 适用 vs 不适用场景

**适用**：

- 需要 `constantCase` / `pathCase` / `sentenceCase` 这一整排 delimiter 变体
- 要把对象 key 按深度改名，并且能接受 ESM
- 要按 Unicode 字母数字切词，而不是固定的 `-_/.`

**不适用**：

- 必须 `require()` 进 CJS 包，或想要模板字面量级的输入输出类型 → [[scule]]
- 需要默认保住 HTTP 缩写
- 要把 `title-case`、locale 渲染或 benchmark 数字写成已验证事实

## 固定版本边界

- 本文绑定 `blakeembrey/change-case@8aaff31471c918d3eac2b40939c601bee37375dd`。lightweight tag `change-case@5.4.4` 与 npm `gitHead` 同指此提交。
- 同提交 `title-case` 报 `4.3.1`，后续 `main` 还有更新；两者都未并入本页 applicable version。
- 未安装依赖、未跑 vitest / bench，状态保持 `UNVERIFIED`。

## 学到什么

1. **十一种写法大多是同一个 `noCase` 换连接符**——真正分叉的是 capital / pascal 变换。
2. **数字和缩写没有普适道德**：加 `_`、黏在一起、或保留 WWW，都是显式选项。
3. **对象 key 映射是另一条出口**，默认深度 1，避免误伤嵌套协议字段。
4. **monorepo 里的包名不等于页面绑定**——`title-case` 要另开笔记。

## 应用型自测

1. `trainCase("WWWAuthenticate")` 在固定 5.4.4 里是 `WWW-Authenticate` 还是 `Www-Authenticate`？
2. `camelCase({ TEST_KEY: { FOO_BAR: true } })` 从 `change-case/keys` 引入时，`FOO_BAR` 会不会变成 `fooBar`？
3. `mergeAmbiguousCharacters: true` 作用在 `snakeCase` 上吗？

检查点：

1. `Www-Authenticate`。它走 `capitalCase`。
2. 不会。默认 `depth = 1`。
3. 不会。该选项只传给 camel / pascal。

## 延伸阅读

- 包文档：[packages/change-case/README.md](https://github.com/blakeembrey/change-case/tree/master/packages/change-case)
- 固定源码：[blakeembrey/change-case](https://github.com/blakeembrey/change-case) —— 本文绑定 `8aaff31471c918d3eac2b40939c601bee37375dd`
- 审查记录：仓库内 `docs/string-case-source-review-20260827-fg.md`
- 对照入口：`packages/change-case/src/index.ts`、`packages/change-case/src/keys.ts`
- [[scule]] —— 字符扫描 + 模板字面量类型的对照

## 关联

- [[scule]] —— 同一问题的切词器路线不同
- [[zod]] —— 需要把未知对象的 key 先规范化再校验时，常和 keys helper 前后衔接
- [[immer]] —— 改对象形状但不共享 change-case 的 key 遍历

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[scule]] —— scule — 先切词再拼大小写的 TypeScript 字符串工具
