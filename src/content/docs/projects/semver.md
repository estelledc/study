---
title: semver — npm 用来解析和匹配 SemVer 的标准库
description: npm 用来解析 SemVer、比较版本并匹配 caret/tilde/range 的标准库。
来源: https://github.com/npm/node-semver
日期: 2026-08-27
分类: 版本比较
难度: 入门
difficulty: 入门
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/npm/node-semver
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 6e05b7637396ac66522cff8731f07cfe0ef49a29
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 7.8.5
---

## 是什么

`semver` 是 npm 自己用的 SemVer 解析器。日常类比：像车站检票口——先确认票面是不是「三段数字 + 可选预发布」，再决定两张票谁先走，以及一张票能不能进某个「允许区间」。

```js
const semver = require("semver")
semver.valid("1.2.3")                 // "1.2.3"
semver.compare("1.2.3", "1.2.4")      // -1
semver.satisfies("1.2.3", "^1.2.0")   // true
```

固定 7.8.5 是 CommonJS 包：`main` 指向 `index.js`，没有 `exports` map，声明 `engines.node >= 10`。常量 `SEMVER_SPEC_VERSION` 写的是 `'2.0.0'`，指 [semver.org](https://semver.org/) 规范版本，不是这个 npm 包的版本。

## 为什么重要

不理解这份固定源码的解析和 range 合同，下面这些事会对不上：

- 为什么 `semver.valid("1.2")` 是 `null`，而 `semver.coerce("1.2")` 能得到 `1.2.0`
- 为什么 `1.0.0+build.1` 和 `1.0.0+build.2` 比起来相等，却还有单独的 `compareBuild`
- 为什么 `1.2.4-alpha` 常常**不**满足 `^1.2.3`，即使数字看起来已经更大
- 为什么 `^0.1.2` 和 `^1.2.3` 放开的上界不是同一类 major

## 核心要点

固定 7.8.5 的主链可以拆成五步：

1. **先变成 `SemVer` 对象**：构造函数只接受字符串（或另一个 `SemVer`）。`FULL` 正则允许可选前导 `v`，但 major/minor/patch 必须是无前导零的数字标识符；长度超过 256 直接抛错。`parse` / `valid` 包一层 try/catch，失败返回 `null`。

2. **比较主版本，再比预发布**：`compare()` 走 `compareMain` 再 `comparePre`。build 被存进 `this.build`，默认比较不看它。没有预发布的版本，大于同一组 major/minor/patch 的预发布版。

3. **标识符按类型比**：`compareIdentifiers` 里，两端都是数字就按数值；一边是数字、一边不是，数字更小。所以 `1.0.0-alpha.2` 小于 `1.0.0-alpha.10`，也小于 `1.0.0-alpha.beta`。

4. **range 先 desugar 再 test**：`Range` 按 `||` 拆成若干 comparator set。hyphen、`^`、`~`、x-range、`*` 会先改写成 `>=` / `<` 再匹配。`^1.2.3` 变成 `>=1.2.3 <2.0.0-0`；`^0.1.2` 变成 `>=0.1.2 <0.2.0-0`；`^0.0.3` 变成 `>=0.0.3 <0.0.4-0`。

5. **预发布默认被 range 拒绝**：`testSet` 在未开 `includePrerelease` 时，候选若带 prerelease，必须和某个**自身也带 prerelease** 的 comparator 共享同一组 major/minor/patch。否则即便落在数字区间里也失败。

## 实践示例

### 案例 1：valid 与 coerce 不是同一道门

```js
const semver = require("semver")
semver.valid("1.2")                    // null
semver.parse("v1.2.3").version         // "1.2.3"
semver.clean("  =v1.2.3  ")            // "1.2.3"
semver.coerce("42.6.7.9.3-alpha").version // "42.6.7"
```

`valid` / `parse` 要完整 SemVer。`clean` 会先剥掉前导 `[=v]+`。`coerce` 默认从左边抓第一组可强迫的数字，缺的 minor/patch 补 `0`；`rtl: true` 才改成靠右取。

### 案例 2：build 不决定先后，预发布会

```js
const semver = require("semver")
semver.compare("1.0.0+aaa", "1.0.0+zzz") // 0
semver.compareBuild("1.0.0+aaa", "1.0.0+zzz") // -1
semver.compare("1.0.0-rc.1", "1.0.0")    // -1
```

默认 `compare` 只问「主版本 + 预发布」。要让 build 参与排序，必须显式走 `compareBuild`。

### 案例 3：range 的预发布门和 caret 上界

```js
const semver = require("semver")
semver.satisfies("1.2.3", "^1.2.0")           // true
semver.satisfies("1.2.4-alpha", "^1.2.3")     // false
semver.satisfies("1.2.3-alpha.2", "^1.2.3-alpha.1") // true
semver.satisfies("0.1.9", "^0.1.2")           // true
semver.satisfies("0.2.0", "^0.1.2")           // false
```

`1.2.4-alpha` 数字更大，但预发布默认进不了只写了稳定下界的 range。`^0.1.2` 的上界是下一个 minor，不是下一个 major。

## 踩过的坑

1. **把 `compare` 当成「带算子的布尔比较」**：这里返回 `-1/0/1`。要 `>` / `>=` 这种布尔结果，用 `gt` / `gte` / `cmp`，或看 [[compare-versions]] 的三参数 `compare`。
2. **以为 `1`、`1.2`、`1.2.3.4` 都是合法版本**：严格 `parse` 要三段。短版本靠 `coerce`；四段也不会变成 Chromium 四段比较。
3. **用默认 `satisfies` 放行预发布**：`1.2.4-alpha` 对 `^1.2.3` 是 false。要让预发布进区间，得设 `includePrerelease`，或让 range 里出现同一组 MMP 的预发布 comparator。
4. **把 `^0.x` 想成「0 开头也可以跨 minor」**：`0.0.z` 锁 patch，`0.y.z` 锁 minor，`x>=1` 才锁 major。
5. **丢掉 `inc` 的返回值却指望原字符串变了**：函数式 `inc` 返回新字符串或 `null`；只有 `SemVer#inc` 会改实例。

## 适用 vs 不适用场景

**适用**：

- 要和 npm 的安装/range 语义对齐，包括 caret、tilde、hyphen、`||` 和预发布排除
- 需要 `intersects` / `subset` / `minVersion` / `maxSatisfying` 这类区间代数
- 目标运行时满足 Node >= 10，并能接受 CommonJS 入口

**不适用**：

- 只要比较 `1`、`1.2`、Chromium 四段或带前导零的版本号 → 看 [[compare-versions]]
- 必须在浏览器里走极小 ESM、并且不需要 Range 对象
- 想把静态阅读写成已测 bundle 或 npm 安装性能结论

## 固定版本边界

- 本文绑定 `npm/node-semver@6e05b7637396ac66522cff8731f07cfe0ef49a29`。GitHub tag `v7.8.5` 与 npm `semver@7.8.5` 的 `gitHead` 指向同一提交。
- 包声明 `engines.node >= 10`；`RELEASE_TYPES` 为 major / premajor / minor / preminor / patch / prepatch / prerelease。
- 未安装依赖、未跑上游 tap、未测 CLI 或 benchmark，状态保持 `UNVERIFIED`。

## 学到什么

1. **规范版本和包版本是两件事**——`SEMVER_SPEC_VERSION` 钉的是 semver.org 2.0.0。
2. **默认比较故意丢掉 build**——build 只标识构建，不改变先后。
3. **range 是 desugar 之后的 comparator 集合**——`^` / `~` 的上界写在源码替换里，不是「感觉上兼容」。
4. **预发布默认不是区间成员**——这是 npm 安装预发布包时最容易误判的门。

## 应用型自测

1. `semver.compare("1.0.0+aaa", "1.0.0+zzz")` 是多少？若要让 `+aaa` 排在 `+zzz` 前面，该用哪条 API？
2. `semver.satisfies("1.2.4-alpha", "^1.2.3")` 默认是 true 还是 false？
3. `^0.1.2` 允许 `0.2.0` 吗？`parse("01.2.3")` 在默认严格模式下会得到对象吗？

检查点：

1. `0`。build 要用 `compareBuild`。
2. false。预发布被 `testSet` 挡下。
3. 不允许；严格 `parse("01.2.3")` 失败（前导零），返回 `null`。

## 延伸阅读

- 规范：[semver.org](https://semver.org/)
- 固定源码：[npm/node-semver](https://github.com/npm/node-semver) —— 本文绑定 `6e05b7637396ac66522cff8731f07cfe0ef49a29`
- [[compare-versions]] —— 同主题的轻量比较器，接受短版本和四段号
- [[changesets]] —— 用 bump 类型去算下一号，底层常经过 SemVer

## 关联

- [[compare-versions]] —— 比较 / satisfies 的轻量对照，API 名字容易撞车
- [[changesets]] —— monorepo 发版时的 increment 一步
- [[pnpm]] —— 安装器消费的就是这类 range 合同
- [[volta]] —— 工具链版本描述也会碰到 SemVer 字符串

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[compare-versions]] —— compare-versions — 用轻量函数比较版本字符串
