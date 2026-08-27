---
title: jsonc-parser — 带偏移的 JSONC 扫描器，改值却不重写整份文件
description: 说明 jsonc-parser 在固定版本里如何用 scanner、visit 与 parseTree 做容错解析，以及 modify 为何用 JSON stringify 生成补丁。
来源: https://github.com/microsoft/node-jsonc-parser
日期: 2026-08-27
分类: 解析
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/microsoft/node-jsonc-parser
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 3c9b4203d663061d87d4d34dd0004690aef94db5
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.3.1
---

## 是什么

jsonc-parser 是 Microsoft 发布的 **JSON with Comments 扫描器 / 容错解析器**。日常类比：它不像 [[json5]] 那样把整份便签一次煮成对象，而像在原稿上用尺标出每个字段的起止，再只剪掉你要改的那一格。

你写：

```ts
import { parse, modify, applyEdits } from "jsonc-parser"

const errors = []
const value = parse('{ "a": 1, /* keep */ }', errors)
const edits = modify(text, ["a"], 2, { formattingOptions: { tabSize: 2, insertSpaces: true } })
const next = applyEdits(text, edits)
```

固定 3.3.1 的主链是 scanner → `visit` →（`parse` 取值 / `parseTree` 建 DOM / `modify` 算文本 edit）。注释可以留在原文里；新插入的值本身仍是 `JSON.stringify` 出来的严格 JSON。

## 为什么重要

不理解它的默认值和 edit 合同，下面这些事会对不上：

- 为什么 `tsconfig.json` 风格的尾逗号，默认 `parse` 会记一条 `CommaExpected`，却仍可能返回对象
- 为什么改一个字段不会把周围注释抹掉，但新值本身没有注释语法
- 为什么未加引号的 key、单引号、`0xFF` 在这里不是合法 token
- 为什么编辑器能回答“光标在哪个 JSONPath”——`getLocation` 是对 `visit` 的早退

一句话：jsonc-parser 先服务**带偏移的文档**，再顺便给出 JS 值。

## 核心要点

主链可以拆成五步：

1. **scanner 认的是 JSON + 注释**：`createScanner` 产出 `SyntaxKind`。字符串只认双引号；数字是十进制；关键字只有 `true` / `false` / `null`；`//` 与 `/* */` 是 trivia。

2. **`visit` 是 SAX 入口**：对象/数组/字面量/分隔符/注释都有回调。`onObjectBegin` / `onArrayBegin` 返回 `false` 会抑制子节点。

3. **默认选项很窄**：`ParseOptions.DEFAULT` 只有 `{ allowTrailingComma: false }`。注释默认允许；要禁注释才设 `disallowComments`。空文档默认报 `ValueExpected`，除非 `allowEmptyContent`。

4. **`parse` 容错**：错误推进调用方数组，函数本身不抛。实现用一个人工数组当根，返回 `currentParent[0]`。属性名必须是 `StringLiteral`。

5. **改文档走 edit 列表**：`modify` 在 `parseTree` 上定位，用 `JSON.stringify` 生成插入文本，再可选 `format`。`applyEdits` 按 offset 从后往前应用，重叠抛 `Overlapping edit`。

## 实践示例

### 案例 1：容错 parse

```ts
import { parse } from "jsonc-parser"

const errors = []
const value = parse('{ "a": 1, }', errors)
```

默认不允许尾逗号，`errors` 会有记录；`value` 仍可能是 `{ a: 1 }`。不要只看返回值判断原文是否合法。

### 案例 2：visit 早退

```ts
import { visit } from "jsonc-parser"

visit(text, {
  onObjectBegin: () => false,
  onObjectProperty: (name) => console.log(name),
})
```

`onObjectBegin` 返回 `false` 后，这个对象的属性回调被抑制。这是 3.3.x changelog 写明的合同，用来跳过大子树。

### 案例 3：改一个字段，留下旁边的注释

```ts
import { modify, applyEdits } from "jsonc-parser"

const text = '{ /* keep */ "port": 80 }'
const edits = modify(text, ["port"], 443, {})
const next = applyEdits(text, edits)
```

`/* keep */` 还在；`443` 是 `JSON.stringify(443)` 插进去的。`formattingOptions` 缺省时，新文本不走 format。

## 踩过的坑

1. **把“JSONC”当成默认允许尾逗号**：默认 `allowTrailingComma: false`。读 `tsconfig` 这类文件要显式打开。

2. **以为 `parse` 失败会抛异常**：它把问题记进 `errors`。忘了传数组，等于把诊断丢掉。

3. **拿 JSON5 的词法来喂它**：未加引号 key、单引号、`+1`、`Infinity`、`0x` 会变成 `Unknown` / `InvalidSymbol`。那是 [[json5]] 的方言。

4. **把多次 `modify` 的 edit 数组合并**：文档写明不同 `EditResult` 不能直接拼接。应对每一轮 `applyEdits` 后再算下一轮。

5. **空文档当 `{}`**：默认不是。要空输入也过，得设 `allowEmptyContent`。

## 适用 vs 不适用场景

**适用**：

- 配置/设置页：在带注释的 JSON 上改一个 path
- 语言服务：按 offset 问 path，或按 path 找 node
- 需要容错——坏掉的逗号不该让整个文档消失

**不适用**：

- 要手写未加引号 key / 十六进制 / `Infinity` → [[json5]]
- 只要一个值、可以丢掉注释和偏移 → 标准 `JSON.parse`
- 需要未绑定的解析速度或 VS Code 内部实现细节
- 把 npm `4.0.0-next.*` 当成 3.3.1 的合同

## 固定版本边界

- 本文绑定 `microsoft/node-jsonc-parser@3c9b4203...`，lightweight tag `v3.3.1`，仓内 `package.json` 为 `3.3.1`。
- npm `jsonc-parser@3.3.1` **没有 `gitHead`**；身份靠 tag + 版本号，不靠 registry 提交指针。
- 发布形态是 `lib/umd/main.js` 与 `lib/esm/main.js`。仓内后续 tag `v4.0.0-next.2` 未绑定。
- 本文未编译、未跑 mocha，状态保持 `UNVERIFIED`。

## 学到什么

1. **容错解析的合同是“值 + errors”，不是 throw**——漏看数组等于假装原文合法。
2. **默认 JSONC ≠ 默认尾逗号**——选项表比口号小。
3. **edit 保留的是周围文本，不是新值的方言**——插入物仍是 `JSON.stringify`。
4. **scanner 的 token 集合就是方言边界**——JSON5 多出来的那些，这里根本扫不出来。

## 应用型自测

1. 默认 `parse('{ "a": 1, }')` 允不允许尾逗号？还会不会返回对象？
2. 属性名写成 `unquoted: 1` 时，`parseProperty` 期待的 token 是什么？
3. `applyEdits` 遇到两条互相覆盖的 edit 会怎样？

检查点：

1. 不允许。`errors` 会记 `CommaExpected`；仍可能得到 `{ a: 1 }`。
2. `StringLiteral`。未加引号 key 会走 `PropertyNameExpected`。
3. 抛 `Error('Overlapping edit')`。

## 延伸阅读

- 仓库 README：[microsoft/node-jsonc-parser](https://github.com/microsoft/node-jsonc-parser)
- 固定源码：本文绑定提交 `3c9b4203d663061d87d4d34dd0004690aef94db5`
- 对照入口：`src/main.ts`、`src/impl/parser.ts`、`src/impl/scanner.ts`、`src/impl/edit.ts`
- [[json5]] —— 手写超集与 `JSON.parse` 风格 API
- [[jq]] —— 值已经被 parse 之后的查询，不保留注释偏移

## 关联

- [[json5]] —— 另一条方言：值向、可 stringify、不保留 offset
- [[vscode]] —— JSONC 作为编辑器体验的常见宿主，本页只钉 parser 仓
- [[biome]] —— 工具链侧的 JSON/JSONC，但是 lint/format 整包
- [[jq]] —— 命令行处理 JSON 值
- [[node-js]] —— 包以 Node 模块形态发布（UMD + ESM）

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
