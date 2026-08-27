---
title: js-yaml — v5 把 load/dump 接到事件管线上
description: 固定 5.4.1 仍叫 load/dump，内部已换成事件流再构造 JS
来源: https://github.com/nodeca/js-yaml
日期: 2026-08-27
分类: 解析
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/nodeca/js-yaml
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: e5a3ba0efee53629b979f784cd53736f89ea61b6
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 5.4.1
---

## 是什么

js-yaml 是 nodeca 的 JavaScript YAML 解析 / 序列化库。日常类比：门口还挂着 `load` / `dump` 两块旧招牌，车间已经换成「事件传送带 → 组装台」。固定 5.4.1 自称 **YAML 1.2 parser and serializer**。

```js
import { load, dump } from 'js-yaml'

load('greeting: hello')
dump({ greeting: 'hello' })
```

没有 ESM default export。要旧的 `yaml.load()` 写法，用 `import * as yaml from 'js-yaml'`，或 CommonJS 解构。

## 为什么重要

不读固定 5.4.1 源码，v3/v4 教程会把你带到已经不存在的合同上：

- 为什么默认不再是 YAML 1.1，`yes` / `<<` 的行为都变了
- 为什么 `DEFAULT_SAFE_SCHEMA`、`Type`、`js-yaml/lib/...` 全部消失
- 为什么 `load('')` 不再返回 `undefined`
- 为什么 dump 默认用另一套 schema，而不是 load 那套 `CORE_SCHEMA`

## 核心要点

固定版本的主链可以拆成五步：

1. **`load` 是两段管线**：`parseEvents(source)` 得到事件，`constructFromEvents(events, { source })` 再物化。嵌套上限 `maxDepth` 默认 `100`。

2. **默认 schema 分裂**：load 默认 `CORE_SCHEMA`（failsafe + core 的 null/bool/int/float），**不含** `!!merge`。dump 默认 `DUMP_SCHEMA`：在 `YAML11_SCHEMA` 上再混入 core 的 int/float resolve，为的是跨 1.1/1.2 都比较好引用。

3. **单文档门**：`load` 在 0 个文档时抛 `expected a document, but the input is empty`，多于 1 个抛 `expected a single document...`。`loadAll` 返回数组；iterator 形式已 deprecated。

4. **默认 map 仍是 `{}`**：`mapTag` 把标量键 `String(key)`，对象键直接报错；`__proto__` 用 `defineProperty` 写成自有数据属性。要 `Map` 用 `realMapTag`，要旧的吞复杂键用 `legacyMapTag`。

5. **别名默认不设上限**：`maxAliases` 默认 `-1`。merge 打开后才有 `maxTotalMergeKeys`（默认 10000）和「merge 序列长度 > 100」硬顶。官方 safety 文档要求你自己做节点计数走查。

## 实践示例

### 案例 1：v4 → v5 最小迁移

```js
import { load, dump } from 'js-yaml'

try {
  const data = load('greeting: hello')
  dump(data)
} catch (e) {
  console.error(e)
}
```

无选项时，named export 就能接上旧的 `load`/`dump`。空串、`yes`、`<<`、复杂键都不要再按 v4 习惯猜。

### 案例 2：把 1.1 行为显式加回去

```js
import { load, CORE_SCHEMA, YAML11_SCHEMA, mergeTag, realMapTag } from 'js-yaml'

load('flag: yes')                                 // { flag: 'yes' }
load('flag: yes', { schema: YAML11_SCHEMA })      // { flag: true }
load('<<: { a: 1 }\nb: 2', {
  schema: CORE_SCHEMA.withTags(mergeTag),
})
load('? [a, b]\n: pair', {
  schema: CORE_SCHEMA.withTags(realMapTag),
})
```

`Schema.extend()` 已换成 `withTags()`。`!!set` 在 `YAML11_SCHEMA` 下产出 `Set`，不再是「值为 null 的对象」。

### 案例 3：dump 的 schema 不是 load 的镜像

```js
import { dump, CORE_SCHEMA } from 'js-yaml'

dump({ port: 0o755 })                 // DUMP_SCHEMA，偏向安全引用
dump({ port: 0o755 }, { schema: CORE_SCHEMA })
```

dump 还会走 `jsToAst` → 可选 `flowLevel` / `sortKeys` / `transform` → `present()`。`styles` / `replacer` / `quotingType` 这些 v4 选项已经不在。

## 踩过的坑

1. **继续 `import yaml from 'js-yaml'`**：v5 故意不提供 default export。
2. **把 v4 的 `DEFAULT_SAFE_SCHEMA` 当成「现在的安全默认」**：现在默认是 1.2 `CORE_SCHEMA`，没有 `!!js/function` 那条旧故事，也没有内置别名上限。
3. **`load('')` 当「没有配置」**：现在抛错；`loadAll('')` 才是空数组。
4. **复杂键被默默 `toString`**：v5 默认直接拒绝，避免 silent 丢失。
5. **本仓库脚本层仍依赖 js-yaml 4**：`scripts/lib/frontmatter.mjs` 的合同不能倒推到 5.4.1。

## 适用 vs 不适用场景

**适用**：

- 已有 `load` / `dump` 调用，想迁到 YAML 1.2 默认值
- 需要事件流、AST `visit` 或自定义 `defineScalarTag` / `defineMappingTag`
- dump 时希望默认按「两边都能引用」的 schema 加引号

**不适用**：

- 要保留注释并改树 → [[yaml]]
- 希望别名展开默认有预算 → [[yaml]] 的 `maxAliasCount: 100`
- 在 shell 里改清单 → [[yq]]
- 还在用 `Type` / `DEFAULT_SCHEMA` / `js-yaml/lib/dumper` 的内部路径

## 固定版本边界

- 本文绑定 `nodeca/js-yaml@e5a3ba0efee53629b979f784cd53736f89ea61b6`。lightweight tag `5.4.1` 与 npm `js-yaml@5.4.1` `gitHead` 同指此提交；仓库没有 GitHub Releases latest。
- 生产依赖只有 `argparse`。
- load 默认 `CORE_SCHEMA` + `maxAliases: -1` + `json: false`（重复键抛错）+ `maxDepth: 100`。
- dump 默认 `DUMP_SCHEMA`、`skipInvalid: false`、`noRefs: false`、`flowLevel: -1`。
- 本文未安装依赖、运行 YAML Test Suite 或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **函数名还在，实现已经换代**——v5 是事件 + 构造器，不是 v4 schema 的补丁。
2. **load 与 dump 的默认 schema 不对齐**——读 1.2 core，写 1.1 兼容扩展。
3. **「安全」从 schema 名单挪到了调用方**——默认不再靠 `DEFAULT_SAFE_SCHEMA` 这个名字，别名要自己限。
4. **对象 map 是兼容选择，不是完整 YAML 模型**——复杂键和 `__proto__` 都写在 `mapTag` 里。

## 应用型自测

1. `load('flag: yes')` 得到 `true` 还是 `'yes'`？怎样才会变成布尔？
2. `load('')` 返回什么？`loadAll('')` 呢？
3. 默认 `load` 遇到 `*a` 别名时，有没有内置数量上限？

检查点：

1. `'yes'`。要 1.1 布尔，传 `{ schema: YAML11_SCHEMA }`。
2. `load('')` 抛 `YAMLException`；`loadAll('')` 返回 `[]`。
3. 没有。`maxAliases` 默认 `-1`，safety 文档要求调用方自己计数。

## 延伸阅读

- 官方文档：[nodeca.github.io/js-yaml](https://nodeca.github.io/js-yaml/)
- 固定源码：[nodeca/js-yaml](https://github.com/nodeca/js-yaml) —— 本文绑定提交 `e5a3ba0efee53629b979f784cd53736f89ea61b6`
- v5 迁移：仓库 `docs/migrate_v4_to_v5.md`
- 安全说明：仓库 `docs/safety.md`
- [[yaml]] —— Document / CST / 默认别名预算 100
- YAML 1.2 spec：[yaml.org/spec/1.2.2](https://yaml.org/spec/1.2.2/)

## 关联

- [[yaml]] —— 同主题的 Document 模型实现
- [[yq]] —— 命令行改 YAML
- [[dasel]] —— JSON / YAML / TOML 选择器

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[yaml]] —— yaml — 先留下 Document，再决定要不要变成 JS

- [[yaml]] —— yaml — 先留下 Document，再决定要不要变成 JS
