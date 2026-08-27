# JSON dialect source review GX

> 用途：记录 `json5` 与 `jsonc-parser` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-gx` 标记 2026-08-27 平行 writer GX，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer GX
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 tap / mocha / tsc，未测 bundle 或吞吐
- worktrees：本机 `research-worktrees/json5` 与 `research-worktrees/jsonc-parser`（gitignored），不进入 Git
- slugs：`json5`、`jsonc-parser`（本轮新建，仓库原先没有这两页）

## json5

- canonical source：`https://github.com/json5/json5`
- tag：`v2.2.3`（lightweight tag）
- revision：`c3a75242772a5026a49c4017a16d9b3543b62776`
- package：`json5@2.2.3`（MIT）
- npm：`json5@2.2.3` latest，`gitHead` 与 revision 一致
- also observed：`main` 上另有 2 个提交（README / grammar），`package.json` 仍报 `2.2.3`，未绑定
- inspected：
  - `package.json`
  - `lib/index.js`
  - `lib/parse.js`
  - `lib/stringify.js`
  - `lib/cli.js`
  - `lib/register.js`
  - `lib/require.js`
  - `lib/util.js`
  - `README.md`
  - `CHANGELOG.md`
- observed：
  - 入口只导出 `parse` / `stringify`；`engines.node >= 6`；无 `exports` 字段；
  - `parse` 是 lex + parse 双状态机，状态存在模块级变量（`source` / `parseState` / `stack` / `pos`）；
  - 词法层接受 `//`、`/* */`、单引号、未加引号 IdentifierName、尾逗号、`0x`、前导 `+`、前导/尾随小数点、`Infinity` / `NaN`；
  - 对象属性用 `Object.defineProperty` 写入，避免 `__proto__` 污染（changelog 记为 2.2.2）；
  - `stringify` 先看 `toJSON5` 再看 `toJSON`；第二参可以是 `{ replacer, space, quote }`；`gap !== ''` 时对象/数组带尾逗号；环抛 `TypeError`；
  - CLI 先 `JSON5.parse` 再 `JSON.stringify`，输出的是 JSON 不是 JSON5；
  - `json5/register` 挂 `require.extensions['.json5']`；`json5/require` 只是弃用包装。

## jsonc-parser

- canonical source：`https://github.com/microsoft/node-jsonc-parser`
- tag：`v3.3.1`（lightweight tag）
- revision：`3c9b4203d663061d87d4d34dd0004690aef94db5`
- package：`jsonc-parser@3.3.1`（MIT）
- npm：`jsonc-parser@3.3.1` latest，**无 `gitHead`**；身份由 tag + `package.json` version 共同锁定
- also observed：`v4.0.0-next.2` 指向另一条 prerelease，仓内 HEAD `package.json` 已是 `4.0.0-next.2`，未绑定
- inspected：
  - `package.json`
  - `src/main.ts`
  - `src/impl/parser.ts`
  - `src/impl/scanner.ts`
  - `src/impl/edit.ts`
  - `src/impl/format.ts`
  - `README.md`
  - `CHANGELOG.md`
- observed：
  - 导出 scanner / `visit` / `parseTree` / `parse` / `getLocation` / `format` / `modify` / `applyEdits`；
  - `ParseOptions.DEFAULT` 只有 `{ allowTrailingComma: false }`；注释默认允许，`disallowComments` 才拒绝；
  - scanner 只认双引号字符串、十进制数字、`true` / `false` / `null`，以及 `//` / `/* */`；单引号、未加引号 key、`0x`、`+1`、`Infinity` 都不是合法 token；
  - `parse` 容错：错误写入调用方数组，仍返回部分对象；空输入默认报 `ValueExpected`，除非 `allowEmptyContent`；
  - `parse` 用人工数组根，返回 `currentParent[0]`；
  - `onObjectBegin` / `onArrayBegin` 返回 `false` 会抑制子节点 visitor；
  - `modify` 用 `JSON.stringify` 生成插入文本，再经 `format` 算 edit；`applyEdits` 按 offset 从后往前应用，重叠抛错。
