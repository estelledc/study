---
title: del — 先 glob 再删的 Node 清理库
description: 固定 8.0.1 用 globby 选路径，默认拦住 cwd 与 cwd 外，删除走 fs.rm
来源: https://github.com/sindresorhus/del
日期: 2026-08-27
分类: 工具库
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/sindresorhus/del
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: f9412a3d60895a3ce3d5d62ba323112cec291838
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 8.0.1
---

## 是什么

del 是 Sindre Sorhus 的 Node 删除库：先用 glob 找出目标，再决定是否真删。日常类比：它像带清单的清洁工——先把“扫什么、不扫什么”列出来，默认不会把你站着的房间或隔壁房间一起拆掉。

固定 `8.0.1` 是 ESM named export，没有 default export，也没有 bin：

```js
import { deleteAsync, deleteSync } from "del"

const removed = await deleteAsync(["temp/*.js", "!temp/unicorn.js"])
```

返回值是**已处理路径的字符串数组**，不是布尔。引擎声明 `node >= 18`。

## 为什么重要

README 仍写 “Similar to rimraf”，但固定 8.0.1 的运行时已经不依赖 [[rimraf]]：

- 为什么 `deleteAsync("dist")` 和 `rimraf("dist")` 的安全边界不同
- 为什么 `**` 会连父目录一起匹配，否定规则必须再排除父路径
- 为什么 `dryRun: true` 仍返回路径，磁盘却不动
- 为什么旧代码 `import del from 'del'` 在 8.x 会直接失败

一句话：del 的主合同是**匹配 + 沙箱 + 清单**，不是另一套 Windows 重试算法。

## 核心要点

`index.js` 的主链可以拆成五步：

1. **规范化 pattern**：数组化；Windows 上若 `is-glob` 判定不是 glob，先 `slash()`。
2. **globby 选文件**：默认覆盖 `expandDirectories`、`onlyFiles`、`followSymbolicLinks` 为 `false`，`cwd` 默认 `process.cwd()`。其余选项原样传给 globby。
3. **倒序再删**：`files.sort((a, b) => b.localeCompare(a))`，让字典序靠后的路径先处理。
4. **沙箱检查**：未设 `force` 时，`is-path-cwd` 禁止删当前工作目录，`is-path-inside` 禁止删 cwd 外路径；失败抛 `PresentableError`。
5. **真正删除**：`dryRun` 为假时调用 `fsPromises.rm(file, { recursive: true, force: true })`（sync 对应 `fs.rmSync`）。返回前再正序排序。

`onProgress` 只出现在 async 路径，给出 `deletedCount` / `totalCount` / `percent` / `path`。并发上限来自传给 `p-map` 的 `concurrency`。

## 实践示例

### 案例 1：带否定规则的清理

```js
import { deleteAsync } from "del"

const deleted = await deleteAsync(["temp/*.js", "!temp/unicorn.js"])
```

`*.js` 不会匹配点文件；要删 `.cache.js` 需要 `dot: true`，或在 pattern 里写上显式的 `.` 段。

### 案例 2：先看清单，再决定是否真删

```js
const preview = await deleteAsync(["public/assets/**"], { dryRun: true })
```

`dryRun` 仍走 globby 和沙箱，只是跳过 `fs.rm`。README 提醒：`**` 会匹配子项**和父目录**，要保留某文件时，必须同时否定父路径。

### 案例 3：越过 cwd 沙箱

```js
await deleteAsync([absOutside], { cwd: process.cwd(), force: true })
```

没有 `force` 时，测试写明错误文案是 `Cannot delete files/directories outside the current working directory. Can be overridden with the \`force\` option.` 删 `process.cwd()` 本身则是另一句 `Cannot delete the current working directory...`。

## 踩过的坑

1. **把 8.x 仍写成 `import del from 'del'`**：固定包只有 `deleteAsync` / `deleteSync`。
2. **以为它内部还调用 rimraf**：`package.json` 依赖是 globby 一族；删除入口是 Node `fs.rm`。
3. **只否定文件、不否定父目录**：`public/assets/**` + `!public/assets/goat.png` 仍可能把 `public/assets` 本身删掉。
4. **把 `cwd` 当成“可以删掉当前进程工作目录”**：`safeCheck` 的 cwd 检查看的是 `process.cwd()`，测试覆盖了“options.cwd 指向别处、目标仍是实际 cwd”的情况。
5. **指望这个包自带 CLI**：固定 `8.0.1` 没有 `bin`；命令行是另一个包 `del-cli`，不在本页范围内。

## 适用 vs 不适用场景

**适用**：

- 构建清理需要 glob / 否定规则，并想先 `dryRun` 看清单
- 默认不准删当前工作目录或逃出项目根
- 调用方只要路径列表，不要布尔“是否全部删完”

**不适用**：

- 需要 Windows `EBUSY` 重试或 move-remove——那是 [[rimraf]] 的 `windows` / `moveRemove`
- 必须兼容 CommonJS `require('del')` default export
- 要把 README 的“类似 rimraf”理解成运行时仍包装 rimraf

## 固定版本边界

- 本文绑定 `sindresorhus/del@f9412a3d...`，npm `del@8.0.1`，`gitHead` 与 tag `v8.0.1` 一致。
- 引擎是 `node >= 18`；许可证 MIT；`sideEffects: false`。
- 删除实现是 Node `fs.rm`，不是 rimraf；`del-cli` 未绑定。
- 本文未安装依赖、未执行删除、未跑 ava / tsd，状态保持 `UNVERIFIED`。

## 学到什么

1. **glob 默认开、沙箱默认开**，和 rimraf 的路径默认、根保护是两条合同
2. **返回值是清单**，所以 `dryRun` 才能成为一等能力
3. **`force` 同时放开 cwd 和 cwd 外**，不是只放开其中一项
4. **“类似 rimraf”是产品叙事**，8.0.1 的依赖图已经换了底座

## 应用型自测

1. `deleteAsync(["dist"])` 没有 `force` 时，能删掉 `process.cwd()` 本身吗？
2. 固定 8.0.1 删除一个目录时，会 `require('rimraf')` 吗？
3. `dryRun: true` 还会调用 `fs.rm` 吗？

检查点：

1. 不能。`is-path-cwd` 会抛 `PresentableError`。
2. 不会。`index.js` 调用的是 `fsPromises.rm` / `fs.rmSync`。
3. 不会。`dryRun` 只收集路径。

## 延伸阅读

- 固定源码：[sindresorhus/del](https://github.com/sindresorhus/del) —— 本文绑定提交 `f9412a3d60895a3ce3d5d62ba323112cec291838`
- [[rimraf]] —— 路径优先、多实现、Windows 重试的对照路线
- [[node-js]] —— `fs.rm({ recursive, force })` 的运行时底座
- [[vite]] —— 常见的 `dist` / `public` 清理调用方

## 关联

- [[rimraf]] —— 字面路径递归删除，默认保护的是根而不是 cwd
- [[node-js]] —— del 8.x 的实际删除原语
- [[pnpm]] —— 清理脚本的常见宿主
- [[vite]] —— 前端产物目录清理

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[rimraf]] —— rimraf — 跨平台的 Node `rm -rf`
