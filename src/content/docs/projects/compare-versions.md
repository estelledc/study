---
title: compare-versions — 用轻量函数比较版本字符串
description: 轻量比较版本字符串，支持短版本、四段号和 npm 风格 satisfies。
来源: https://github.com/omichelsen/compare-versions
日期: 2026-08-27
分类: 版本比较
难度: 入门
difficulty: 入门
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/omichelsen/compare-versions
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 497a7e0c5fc00c6bb16f3aa81ce32fe2acdd43cd
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 6.1.1
---

## 是什么

`compare-versions` 是一个只做「比大小 / 是否落在区间」的小函数库。日常类比：不像 [[semver]] 那样先办一张标准 SemVer 证件，它更像口袋卡尺——`1`、`1.2`、`1.2.3.4`、`v01.2.3` 都能量，量完给你 -1、0、1，或者一句「满不满足这个算子」。

```js
import { compareVersions, compare, satisfies } from "compare-versions"
compareVersions("11.1.1", "10.0.0") // 1
compare("10.1.8", "10.0.4", ">")    // true
satisfies("1.2.5", "~1.2.3")        // true
```

固定 6.1.1 从 v5 起主导出是**具名导出**，不再是 default。源码是 TypeScript，发布 `lib/esm` 与 `lib/umd`，`sideEffects: false`，没有 `engines` 字段，也没有运行时依赖。

## 为什么重要

不理解它和 npm `semver` 的分界，下面这些事会混成一谈：

- 为什么 `compare(v1, v2, ">")` 是布尔值，而 `compareVersions(v1, v2)` 才是排序函数
- 为什么 `1` 和 `1.0.0.0` 在这里相等，到 [[semver]] 的严格 `parse` 却过不了
- 为什么 `satisfies("1.2.4-alpha", "^1.2.3")` 在两边结论可以不一样
- 为什么 `validate("v1.0.0")` 为 true，`validateStrict("v1.0.0")` 却为 false

## 核心要点

固定 6.1.1 的执行链可以拆成五步：

1. **用一条宽松正则切开**：`validateAndParse` 允许可选前导 `v^~<>=`、1 到 4 段、`x/*` 通配和前导零。不是字符串就抛 `TypeError`；对不上正则就抛 `Invalid argument not valid semver`。

2. **`compareVersions` 只回答先后**：弹出预发布段后，用 `compareSegments` 逐段比。缺段按 `'0'` 补；`x` / `*` / `X` 与任何段相等。build 被正则吃掉，不进入比较。

3. **`compare` 是算子包装**：先断言算子属于 `> >= = <= < !=`，再看 `compareVersions` 的 -1/0/1 是否落在该算子的结果集合里。

4. **`satisfies` 是字符串递归，不是 Range 类**：先去掉算子后面的空格，再按 `||`（OR）、` - `（改写成 `>=a <=b`）、空格（AND）往下拆。普通比较符直接交给 `compare`；`^` / `~` 另算指针。

5. **caret / tilde 的指针不同**：`~` 固定锁前两段（指针 `i = 2`）。`^` 找第一个不是 `'0'` 的段，下标加 1；若结果不大于 1，就退回 1。range 自己带预发布时，版本也必须带预发布且主段完全相等；range **不**带预发布时，不会做 npm 那种「预发布一律排除」。

## 实践示例

### 案例 1：短版本、四段号和前导 v 都能比

```js
import { compareVersions } from "compare-versions"
compareVersions("1.0.0.0", "1")     // 0
compareVersions("v1.2.3.4", "01.2.3.4") // 0
compareVersions("1.0.0-alpha", "1") // -1
```

缺段被补成 0，所以 `1`、`1.0`、`1.0.0`、`1.0.0.0` 在这条比较链上相等。这是 Chromium 四段号能进来的原因，也是它和严格 SemVer 证件最不像的地方。

### 案例 2：同名 `compare` 必须带算子

```js
import { compare, compareVersions } from "compare-versions"
compareVersions("10.1.8", "10.0.4") // 1
compare("10.1.8", "10.0.4", ">")    // true
compare("10.1.1", "10.1.1", "!=")   // false
```

漏掉第三参数会按「算子不是字符串」抛 `TypeError`。空字符串或 `"foo"` 则是 `Invalid operator`。不要把它和 `semver.compare(a, b)` 的两参数签名混用。

### 案例 3：satisfies 能写 npm 风格区间，但不等于 node-semver

```js
import { satisfies } from "compare-versions"
satisfies("1.2.5", "~1.2.3")                 // true
satisfies("1.3.0", "~1.2.3")                 // false
satisfies("0.3.0", "^0.2.3")                 // false
satisfies("1.2.3-beta.4", "^1.2.3-beta.2")   // true
satisfies("1.2.4-beta.2", "^1.2.3-beta.2")   // false
```

`~` 不跨 minor，`^0.2.3` 不跨到 `0.3.0`。range 带着预发布时，主段必须完全相等，所以 `1.2.4-beta.2` 过不了 `^1.2.3-beta.2`。range **不**写预发布时，这里不会套用 npm `includePrerelease` 的排除门。

## 踩过的坑

1. **继续写 `import compareVersions from "compare-versions"`**：v5 起主导出是具名的。
2. **把 `compare` 当排序函数**：排序用 `compareVersions`；`compare` 必须给算子，返回布尔。
3. **以为 `validate` 等于 SemVer 2.0**：`validate("2020")`、`validate("1.0.x")`、`validate("v1.0.0")` 都是 true。要三段无 `v` 无前导零，用 `validateStrict`。
4. **拿它当 npm 安装器的 drop-in**：没有 `Range`、`intersects`、`minVersion`、`coerce`、`inc`，预发布默认策略也不同。
5. **对 `^` / `~` 的 0.x 规则只记「和 npm 一样」**：指针实现能复现 README 里那组用例，但源码是段比较，不是先 desugar 成 `>=` / `<` 再跑 `testSet`。

## 适用 vs 不适用场景

**适用**：

- 要比 `1` / `1.2` / 四段 Chromium 号 / 带 `v` 或前导零的字符串
- 只要排序或「是否满足这个算子 / 这段 range」，不要发号、不要区间代数
- 希望 ESM/UMD 双入口、无运行时依赖

**不适用**：

- 必须复现 npm 安装器的预发布排除和 `^0.0.x` desugar → 用 [[semver]]
- 需要 `inc`、`coerce`、`subset`、`maxSatisfying`
- 要把 README 的 bundle 徽章当成本页测过的体积

## 固定版本边界

- 本文绑定 `omichelsen/compare-versions@497a7e0c5fc00c6bb16f3aa81ce32fe2acdd43cd`。GitHub tag `v6.1.1` 与 npm `compare-versions@6.1.1` 的 `gitHead` 指向同一提交。
- 发布入口为 `lib/esm/index.js` 与 `lib/umd/index.js`；源码在 `src/`。
- 未安装依赖、未跑 mocha/c8、未测 UMD/ESM bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **同名 API 不一定同签名**——这里的 `compare` 是「带算子的布尔」，排序函数叫 `compareVersions`。
2. **宽松解析换来短版本和四段号**——缺段当 0，通配当相等。
3. **satisfies 可以长得很像 npm range，实现却是递归改写**——没有 `Range` 对象。
4. **校验有两道门**——`validate` 认常见变体，`validateStrict` 才贴近 SemVer 2.0 证件。

## 应用型自测

1. `compareVersions("1.0.0.0", "1")` 返回什么？`require("semver").parse("1")` 在默认严格模式下会得到对象吗？
2. 调用 `compare("1.2.3", "1.2.4")` 不传算子，会得到 -1 还是抛错？
3. `validate("v1.0.0")` 和 `validateStrict("v1.0.0")` 分别是什么？

检查点：

1. `0`。`semver.parse("1")` 失败，返回 `null`。
2. 抛错：算子必须是字符串且属于那 6 个符号。
3. `true` 与 `false`。严格正则不要前导 `v`。

## 延伸阅读

- 固定源码：[omichelsen/compare-versions](https://github.com/omichelsen/compare-versions) —— 本文绑定 `497a7e0c5fc00c6bb16f3aa81ce32fe2acdd43cd`
- [[semver]] —— npm 的完整解析 / range / 发号合同
- npm range 说明：[docs.npmjs.com semver](https://docs.npmjs.com/cli/v6/using-npm/semver)

## 关联

- [[semver]] —— 标准证件 vs 口袋卡尺
- [[changesets]] —— 发版算下一号时仍常走完整 SemVer
- [[pnpm]] —— 安装器侧的 range 消费者
- [[volta]] —— 工具版本字符串同样会碰到短版本

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[semver]] —— semver — npm 用来解析和匹配 SemVer 的标准库
