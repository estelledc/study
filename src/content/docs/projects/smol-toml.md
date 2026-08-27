---
title: smol-toml — 手写指针机上的 TOML parse 与 stringify
description: 固定版本用手写递归下降同时提供 parse 和 stringify
来源: https://github.com/squirrelchat/smol-toml
日期: 2026-08-27
分类: 解析
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/squirrelchat/smol-toml
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 6d0f4774700c40ce8b5794934eb771870a9a93d3
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.8.0
---

## 是什么

smol-toml 是一个零 runtime 依赖的 JavaScript TOML 解析 / 序列化库。日常类比：它不只翻译进 JS，还把对象再排成 TOML 文本；解析器是一支按字符往前走的指针，而不是生成出来的文法表。

```js
import { parse, stringify } from "smol-toml"

const data = parse("title = \"demo\"\n")
const text = stringify(data)
```

固定 1.8.0 自称 TOML v1.1.0，条件导出同时给 ESM 和 CJS，要求 Node >= 18。

## 为什么重要

不读固定入口，容易把「又一个快的 TOML 库」和 [[toml]] 的 Peggy 两段式混在一起：

- 为什么这里有 `stringify`，而 `toml@5.0.0` 没有
- 为什么日期解析出来是 `TomlDate`，不是普通 `Date` 或 Temporal
- 为什么 `__proto__` 键要 `defineProperty`，表却仍是普通 `{}`
- 为什么 README 承认 `2023-02-30` 可能被收成 3 月 2 日

## 核心要点

主链可以拆成五步：

1. **指针上下文**：`parse` 拿 `{ s, p, d }`，`d` 默认 `maxDepth: 1000`。空白和 `#` 注释由 `skipVoid` 吃掉。

2. **两种声明**：源码当前字符是 `[` 就读表头（`[[` 是表数组），否则 `parseKey` + `extractValue` 写当前表。

3. **值的分发**：`[` / `{` 走数组 / 内联表并消耗一层深度；`"` / `'` 走字符串；`t`/`f` 快路径认 `true`/`false`；其余交给 `parseValue` 认数字、`inf`/`nan` 或 `TomlDate`。

4. **整数默认仍 fail-closed**：不安全整数默认抛 `TomlError`。`integersAsBigInt: true` 把全部整数收成 BigInt；`'asNeeded'` 只抬不安全的那些。

5. **stringify 是第二条入口**：根必须是 object。对象上的 `null`/`undefined` 被跳过；数组里的空值、function、symbol 会拒绝。`numbersAsFloat: true` 时整数形态的 `number` 仍写成浮点。

## 实践示例

### 案例 1：来回走一趟

```js
import { parse, stringify } from "smol-toml"

const doc = parse("a = 1\n[owner]\nname = \"Ada\"\n")
stringify(doc)
// a = 1
//
// [owner]
// name = "Ada"
```

这是和 [[toml]] 最明显的合同差：这里有回写。

### 案例 2：日期是 TomlDate

```js
import { parse, TomlDate } from "smol-toml"

const data = parse("odt = 1979-05-27T07:32:00Z\nld = 1979-05-27\n")
data.odt instanceof TomlDate  // true
data.odt.isDateTime()         // true
data.ld.isDate()              // true
```

parse 路径不发 Temporal。stringify 可以认 Temporal，但 `ZonedDateTime` 会丢掉 IANA 时区，只留下 offset。

### 案例 3：深度耗尽是 TomlError

```js
import { parse } from "smol-toml"

parse("a = " + "[".repeat(1001) + "1" + "]".repeat(1001))
// TomlError: document contains excessively nested structures. aborting.
```

`extractValue` 在进入数组 / 内联表前先 `--ctx.d`，归零就停。测试里用超深 `{e=...}` 文档覆盖同一条边界。

## 踩过的坑

1. **把 parse 出来的日期当成原生 `Date` 就够了**：它是带 `isLocal` / `isDate` / `isTime` 的 `TomlDate`。
2. **以为非法日历日一定被拒**：README 写明 `2023-02-30` 可能滚成 `2023-03-02`；这和 [[toml]] PEG 里的 `validateDate` 不同。
3. **默认把超大整数当 `number`**：和 5.0.0 的 `toml` 一样会抛；要抬升得自己选 `integersAsBigInt`。
4. **把 README 的微秒级 benchmark 写成当前事实**：本轮未跑 mitata。
5. **用 npm `gitHead` 对 revision**：1.8.0 没发布 `gitHead`，身份靠 tag。

## 适用 vs 不适用场景

**适用**：

- 同时需要 parse 和 stringify 的配置 / 工具链
- 想要 ESM/CJS 双入口，且能接受 Node >= 18
- 需要带行列和代码片段的 `TomlError`

**不适用**：

- 必须拒绝非法日历日 → 先看 [[toml]] 的 `validateDate`
- 解析阶段就要 Temporal 对象 → 固定版 parse 仍是 `TomlDate`
- 要把未测速度写成「比 toml 快 N 倍」

## 固定版本边界

- 本文绑定 `squirrelchat/smol-toml@6d0f4774...`，npm `smol-toml@1.8.0`；tag `v1.8.0` 指向该提交。npm 未暴露 `gitHead`。
- 声称 TOML v1.1.0；零 runtime 依赖；`engines.node >= 18`。
- 未安装依赖、未跑 vitest / `run-toml-test.bash`、未测体积，状态保持 `UNVERIFIED`。

## 学到什么

1. **手写指针和生成文法是两条实现合同**——这里没有 `lib/parser.js` 那种 Peggy 产物。
2. **stringify 改变了选型问题**——只读配置文件和「对象再写回」不是同一包。
3. **日期包装比 Temporal 更早落地**——parse 先保 `TomlDate`。
4. **深度和整数仍然 fail-closed**——默认 1000 层，不安全整数要显式策略。

## 应用型自测

1. `parse` 默认会不会把 `id = 771752188537605140` 收成 `number`？
2. `stringify({ a: 1.0 })` 在默认选项下更像整数还是浮点？
3. parse 出来的 offset date-time 是 `Temporal.ZonedDateTime` 吗？

检查点：

1. 不会。不安全整数默认抛 `TomlError`。
2. 更像整数：`Number.isInteger` 且在安全范围内时写成 `1`。
3. 不是。parse 返回 `TomlDate`。

## 延伸阅读

- 固定源码：[squirrelchat/smol-toml](https://github.com/squirrelchat/smol-toml) —— 本文绑定提交 `6d0f4774700c40ce8b5794934eb771870a9a93d3`
- TOML 1.1.0：[toml.io/en/v1.1.0](https://toml.io/en/v1.1.0)
- [[toml]] —— Peggy 生成、只 parse 的对照
- [[yq]] —— 命令行多格式对照

## 关联

- [[toml]] —— 同主题、只读解析的 Peggy 路线
- [[yq]] —— YAML/TOML 命令行查询
- [[dasel]] —— 另一把多格式选择器

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[toml]] —— toml — Peggy 文法只负责 parse 的 TOML 1.1 库
