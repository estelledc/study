---
title: load-json-file — 读任意 JSON 文件并剥掉 UTF-8 BOM
description: 固定版本用 TextDecoder 去 BOM，再走原生 JSON.parse 与可选 beforeParse/reviver
来源: https://github.com/sindresorhus/load-json-file
日期: 2026-08-27
分类: 包管理
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/sindresorhus/load-json-file
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: eeac7ad786731a6c7e4a50b414ebb43c847bf6f6
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 7.0.1
---

## 是什么

load-json-file 是一个 **通用 JSON 文件加载器**：你给路径，它读字节、去掉 UTF-8 BOM，再 `JSON.parse`。日常类比：它是开信封的小刀，不管信纸上写的是不是 `package.json`，也不会按 npm 的习惯改字段。

固定 `7.0.1` 是纯 ESM，零运行时依赖，入口只有异步 `loadJsonFile` 和同步 `loadJsonFileSync`：

```js
import {loadJsonFile} from 'load-json-file'

const data = await loadJsonFile('foo.json')
```

和 [[read-pkg]] 不同：这里路径是调用方给的任意文件，不会自动补 `package.json`。

## 为什么重要

不看解码和解析这两下，容易把它写成「薄封装的 `fs.readFile` + `JSON.parse`」然后漏掉合同：

- 为什么带 BOM 的 JSON 在这里能过，用 `readFile(..., 'utf8')` 却可能在首字符上栽跟头
- 为什么没有 `parse-json` 那种带文件名的错误
- 为什么可以在 parse 前改字符串、parse 后再改值
- 为什么它不能替代 [[read-pkg]] 的 name / `_id` 规范化

一句话：load-json-file 的合同是 **Buffer → TextDecoder → 可选改写 → 原生 JSON.parse**。

## 核心要点

固定 `7.0.1` 的 `parse` 只有十几行：

1. **按 Buffer 读**：`fs.promises.readFile(filePath)` / `readFileSync(filePath)`，不传 `'utf8'`。
2. **用 `TextDecoder` 转字符串**：注释写明，它和 `buffer.toString()` / `fs.readFile(path, 'utf8')` 不同，会去掉 BOM。
3. **可选 `beforeParse`**：若传入函数，先对整段字符串调用，返回值再送去解析。
4. **`JSON.parse(data, reviver)`**：`reviver` 原样交给原生解析器。

类型文件把返回值默认成一份本地 `JsonValue` 联合，并允许调用方写 `loadJsonFile<MyType>(...)`。`package.json` 的 `exports` 只有 `./index.js`，没有 `exports.types`；类型靠发布物里的 `index.d.ts`。

## 实践示例

### 案例 1：读旁边的 package.json，但不规范化

```js
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {loadJsonFile} from 'load-json-file'

const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), 'package.json')
const data = await loadJsonFile(fixture)
```

固定测试就是这样读自己的 `package.json`，然后断言 `data.name === 'load-json-file'`。它不会去 trim name，也不会补 `_id`。

### 案例 2：parse 前改字符串

```js
const data = await loadJsonFile(fixture, {
  beforeParse: (string) => string.replace('"name": "load-json-file"', '"name": "foo"'),
})
// data.name === 'foo'
```

`beforeParse` 看到的是解码后的整份文本。测试用字面量替换证明它发生在 `JSON.parse` 之前。

### 案例 3：用 reviver 改解析后的值

```js
const data = await loadJsonFile(fixture, {
  reviver: (key, value) => key === 'name' ? 'foo' : value,
})
```

这是 `JSON.parse` 的标准 reviver，不是包自己的 schema。键叫 `name` 时测试把它换成 `'foo'`。

## 踩过的坑

1. **把它当 [[read-pkg]]**：不补 `package.json` 文件名，不调用 `normalize-package-data`，坏 JSON 走原生错误。
2. **以为 README 里的 strip-bom 链接还是运行时依赖**：`7.0.1` 的 `package.json` 没有 dependencies；去 BOM 在 `TextDecoder`。`origin/main` 后来删了那条链接，但未发新版本，本文不绑定。
3. **用 `utf8` 字符串 API 复述实现**：源码特意读 Buffer，再 decode。
4. **指望 `exports.types`**：固定包只导出 `./index.js`。类型存在，但解析器怎么找到 `.d.ts` 取决于你的工具链，本轮未验证。
5. **把「企业版 Tidelift」或未测速度写成功能**：那是 README 商业段落，不是源码合同。

## 适用 vs 不适用场景

**适用**：

- 要读任意 `.json`，包括可能带 UTF-8 BOM 的文件
- 需要 `beforeParse` 或 `JSON.parse` reviver，而不想拉规范化
- 希望运行时依赖为零的 ESM 小函数

**不适用**：

- 要按 npm 规则读 `package.json`、修 name、拿 `_id`——用 [[read-pkg]]
- 要向上找最近的 manifest——那是 `read-package-up`，不是本页
- 需要 `parse-json` 那种带上下文的语法错误
- 准备跟 `origin/main` 上未发布的文档提交走，却仍按 `7.0.1` 推理

## 固定版本边界

- 本文绑定 `sindresorhus/load-json-file@eeac7ad7...`，npm 包 `load-json-file@7.0.1`。
- annotated tag `v7.0.1` 解引用后与 npm `gitHead` 一致。
- `origin/main` 另有 `5f75a3a`（去掉 strip-bom 链接）和 `de8256b`（注释拼写），未打新标签，未绑定。
- `engines.node` 为 `^12.20.0 || ^14.13.1 || >=16.0.0`；固定 CI 矩阵只跑 Node 16。
- 本文只做静态阅读，没有执行 `xo` / `ava` / `tsd`，也没有喂带 BOM 的真实文件，状态保持 `UNVERIFIED`。

## 学到什么

1. **去 BOM 可以是解码器行为，不必再引 `strip-bom`**
2. **通用 JSON 加载器和 package 规范化器不是同一个抽象**
3. **`beforeParse` 改文本，`reviver` 改值，顺序不能反过来说**
4. **标签落后 main 两笔文档提交时，要以 npm `gitHead` 为准，不要偷偷跟上**

## 应用型自测

1. `loadJsonFile()` 不传路径时，会不会自动去读 `package.json`？
2. 固定实现去 BOM 靠的是 `strip-bom` 这个依赖吗？
3. `beforeParse` 是在 `JSON.parse` 之前还是之后运行？

检查点：

1. 不会。调用方必须给出 `filePath`。
2. 不是。`7.0.1` 零依赖，靠 `TextDecoder().decode(buffer)`。
3. 之前。它接收解码后的字符串，返回值再交给 `JSON.parse`。

## 延伸阅读

- README：[sindresorhus/load-json-file](https://github.com/sindresorhus/load-json-file)
- 固定源码：[sindresorhus/load-json-file](https://github.com/sindresorhus/load-json-file) —— 本文绑定提交 `eeac7ad786731a6c7e4a50b414ebb43c847bf6f6`
- [[read-pkg]] —— 专门读 `cwd/package.json` 并做 normalize
- [JSON.parse reviver](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse#using_the_reviver_parameter)

## 关联

- [[read-pkg]] —— package 专用读取 + 规范化
- [[pnpm]] —— 安装器会读很多 JSON，但不等于这个 20 行加载器
- [[changesets]] —— 变更文件是 Markdown，不是本包的 JSON 路径

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[read-pkg]] —— read-pkg — 读当前目录的 package.json 并做规范化
