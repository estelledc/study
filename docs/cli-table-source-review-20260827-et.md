# CLI table source review (writer ET)

> 用途：记录 `table` 与 `cli-table3` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-et` 标记 2026-08-27 平行 writer ET，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL ET
- evidence：GitHub metadata、npm latest 对照、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 Mocha / Jest，未执行 `table()` / `Table#toString()`，未测 bundle、下载量或性能
- worktrees：本机 `research-worktrees/`（gitignored），不进入 Git
- slugs：`table` 是 npm / GitHub 包名，不是 HTML `<table>` 或数据表格组件

## table

- canonical source：`https://github.com/gajus/table`
- revision：`8b85bc8f7e5202c2fcea295bd59d4e7d25519c7a`
- release：lightweight tag `v6.9.0` 指向该提交（"fix: allow readonly array input for table data (#218)"，2024-12-03）
- package：`table@6.9.0`；npm `gitHead` 与 tag 同指此提交
- license：BSD-3-Clause
- engines：`node >=10.0.0`
- source `package.json` version 字段为 `1.0.0`（semantic-release 占位）；以 tag / npm 版本为准
- inspected：
  - `package.json`
  - `src/index.ts`
  - `src/table.ts`
  - `src/types/api.ts`
  - `src/validateTableData.ts`
  - `src/stringifyTableData.ts`
  - `src/makeTableConfig.ts`
  - `src/makeStreamConfig.ts`
  - `src/createStream.ts`
  - `src/getBorderCharacters.ts`
  - `src/injectHeaderConfig.ts`
  - `src/wrapCell.ts`
  - `src/wrapWord.ts`
  - `src/utils.ts`
  - `src/truncateTableData.ts`
  - `src/drawTable.ts`
  - `src/validateConfig.ts`
  - `test/validateTableData.ts`
- observed：
  - 公开入口是 `table` / `createStream` / `getBorderCharacters`；`table(data, config)` 返回字符串，不写 stdout；
  - 主链为 `validateTableData` → `stringifyTableData` → `injectHeaderConfig` → `makeTableConfig` → `truncateTableData` → 行高映射 / 对齐 / padding → `drawTable`；
  - 数据必须是非空矩形数组；行数或列数为 0、列数不一致、或单元格规范化后含 `\u0001-\u0006\u0008\u0009\u000B-\u001A` 会 throw；
  - 单元格先 `String(cell)` 再把 `\r\n` 收成 `\n`；配置走 AJV（`config.json` / `streamConfig.json`），非法配置 throw `Invalid config.`；
  - 列默认 `alignment=left`、`verticalAlignment=top`、`paddingLeft/Right=1`、`truncate=Infinity`、`wrapWord=false`；未给 `border` 时合并 honeywell 模板；
  - `header.content` 会在数据前插入一行，并把既有 `spanningCells` 的 `row` +1，再注入 `colSpan=列数` 的首行 spanning cell（类型标注 deprecated）；
  - `createStream` 要求 `columnCount` 与 `columnDefault.width`；`write()` 直接 `process.stdout.write`，追加行用 `\r\u001B[K` 擦掉底边再画 join；
  - `getBorderCharacters` 只认 `honeywell` / `norc` / `ramac` / `void`。

## cli-table3

- canonical source：`https://github.com/cli-table/cli-table3`
- revision：`9577efd51114e61fb035b7cc493adf0c0dc7921b`
- release：annotated tag `v0.6.5` 解引用到该提交（tagger 2024-05-12）；tag 对象本身是 `2c80c8b2b2ed985ede234063db58e4354f74c3c5`
- package：`cli-table3@0.6.5`；npm `gitHead` 与剥开后的 tag 同指此提交
- license：MIT
- engines：`node 10.* || >= 12.*`
- dependencies：`string-width@^4.2.0`；`@colors/colors@1.5.0` 为 optional
- inspected：
  - `package.json`
  - `index.js`
  - `index.d.ts`
  - `src/table.js`
  - `src/cell.js`
  - `src/layout-manager.js`
  - `src/utils.js`
  - `test/table-test.js`
  - `test/cell-test.js`
  - `test/verify-legacy-compatibility-test.js`
- observed：
  - `Table` 继承 `Array`；`index.js` 再导出 `src/table`；调用方 `push` 行后 `toString()` 才画表；
  - `toString` 若存在 `options.head` 就把它插到数组前面；没有 head 时把 `style.head` 清成 `[]`；
  - 布局链为 `generateCells` → `layoutTable` → `fillInTable` → `addRowSpanCells` → `addColSpanCells` → `computeWidths` / `computeHeights` → 逐行 `draw`；
  - 非数组行按对象的第一个 key 展开：值是数组则 `unshift(key)` 成横表扩展，否则变成 `[key, value]` 竖表；
  - 缺格会被 `fillInTable` 补空白 cell 并 `warn`；cell `content` 只接受 boolean / number / bigint / string，否则 throw；
  - 默认 chars 是 norc 风格 `┌─┐`；`style.head` 默认 `['red']`，`style.border` 默认 `['grey']`；着色走 optional `@colors/colors/safe`，require 失败就原样输出；
  - `y === 0` 的内容行才套 head 色；`wordWrap` 可用 `textWrap` 别名；`wrapOnWordBoundary` 默认 true；
  - 截断符默认 `…`，OSC 8 超链接在截断后若丢失闭合序列会被补回。
