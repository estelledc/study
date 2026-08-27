---
title: pathe — 不绑 Node 的 POSIX 路径重写
description: 用户态重写 Node path，强制正斜杠；posix/win32 只换 delimiter
来源: https://github.com/unjs/pathe
日期: 2026-08-27
分类: 工具库
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/unjs/pathe
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 614844ba1f7f34f051959f3d1a953c54eaeaf3b2
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.0.3
---

## 是什么

pathe 是一份用 TypeScript 重写的路径工具，对外尽量长得像 Node 的 `path`，但**自己实现算法**，不 `import 'node:path'`。日常类比：它不是给 Node 路径模块套一层翻译器，而是另造一把只认正斜杠的尺子——Windows 输入先被换成 `/`，再按 POSIX 规则拼。

```ts
import { join, normalize, sep } from "pathe"

normalize("c:\\foo\\..\\bar") // "C:/bar"
join("a\\b", "../c")          // "a/c"
sep                           // "/"
```

固定 `2.0.3` 的 README 把它写成 Node `path` 的 drop-in，并强调行为在各平台都按 POSIX；**唯一按平台分叉的导出是 `delimiter`**。

## 为什么重要

不看固定源码，容易把 pathe 和「包一层 Node path」的 [[upath]] 说成同一件事：

- 为什么浏览器或非 Node runtime 也能 import，而不必先有 `node:path`
- 为什么 `posix` 和 `win32` 几乎是同一把尺子，只换分隔符常量
- 为什么 `C:` 不是绝对路径，而 `C:/` 和 `//server` 是
- 为什么 `matchesGlob` 和 `pathe/utils` 的 alias API 不在 Node 标准 `path` 里

一句话：pathe 的合同是 **用户态 POSIX 重写 + 可选 alias 工具**，不是 Node 内置模块的代理。

## 核心要点

固定 2.0.3 可以拆成五步：

1. **先统一斜杠**：`normalizeWindowsPath` 把 `\` 换成 `/`，并把 `x:/` 盘符改成大写。后续 `join` / `resolve` / `dirname` 都先走这一步。

2. **规范化自己走**：`normalize` / `normalizeString` 处理 `.` / `..`、UNC 前缀、盘符后补 `/`。空串得到 `"."`；`C:` 规范化后变成 `C:/`。

3. **解析 cwd 可缺席**：`resolve` 从右往左拼，碰到绝对路径就停。没有 `process.cwd` 时回退 `'/'`，所以它不把 Node 进程当成硬依赖。

4. **平台对象是 Proxy**：`posix` 与 `win32` 都代理同一份 `_path`。读 `delimiter` 时，posix 给 `":"`，win32 给 `";"`。default export 是 `posix`。顶层 `delimiter` 才看 `process.platform === "win32"`。

5. **额外能力不在主入口混装**：`matchesGlob` 源码调用 `zeptomatch`；alias / `filename` 从 `pathe/utils` 另进。`toNamespacedPath` 只做反斜杠规范化，不生成 Node 的 `\\?\` 命名空间路径。

## 实践示例

### 案例 1：Windows 输入，POSIX 输出

```ts
import { normalize, isAbsolute } from "pathe"

normalize("c:\\foo\\bar") // "C:/foo/bar"
isAbsolute("C:")          // false
isAbsolute("C:/")         // true
isAbsolute("//server")    // true
```

**逐部分解释**：盘符单独出现还不是绝对路径；必须带根斜杠。`//server` 被 `_IS_ABSOLUTE_RE` 当成 UNC 风格绝对路径。这些断言来自固定仓 `test/index.spec.ts`，本轮未执行该测试。

### 案例 2：resolve 在没有 cwd 时仍有根

```ts
import { resolve } from "pathe"

resolve("foo", "bar") // 有 process.cwd 时接到当前目录；否则从 "/" 起
```

源码 `cwd()`：存在 `process.cwd` 就把它的 `\` 换成 `/`；否则返回 `"/"`。浏览器或边缘 runtime 不会因为缺 Node API 直接抛错。

### 案例 3：alias 走子路径，不走主包

```ts
import { normalizeAliases, resolveAlias } from "pathe/utils"

const aliases = normalizeAliases({
  "#fs": "/vendor/fs",
  "#fs/promises": "/vendor/fs-promises",
})
resolveAlias("#fs/promises/read", aliases)
```

`normalizeAliases` 先按路径段数量把更具体的 key 排到前面，再避免短 alias 把长 alias 吃掉。解析时要检查 alias 边界处是不是分隔符，防止 `#fs` 误伤 `#fsm`。

## 踩过的坑

1. **把 `posix` / `win32` 当成两套算法**：固定源码里它们只换 `delimiter`，`sep` 都是 `"/"`。
2. **把 `toNamespacedPath` 写成 Node 的 `\\?\C:\` 转换**：这里只调用 `normalizeWindowsPath`。
3. **把 `zeptomatch` 写成已核验的运行时依赖**：它出现在源码 import 和 `devDependencies`；本轮未构建 `dist`，不宣称发布物零依赖。
4. **用下载量或 bundle 数字做选型**：本轮没有测体积，也不引用未绑定的 npm 统计。
5. **以为默认导出等于顶层命名导出的平台 `delimiter`**：default 是 `posix`，其 `delimiter` 恒为 `":"`；顶层 `delimiter` 才会看 Windows。

## 适用 vs 不适用场景

**适用**：

- 需要在 Node 和浏览器里共用同一套 `/` 路径规则
- 希望 API 面接近 Node `path`，但不想绑 `node:path`
- 需要 unjs 风格的 alias 映射（`pathe/utils`）

**不适用**：

- 必须跟当前 Node 版本的新 `path` API 自动同步——那是 [[upath]] 的代理模型
- 需要 Node 原生 `win32` 语义或 `\\?\` 命名空间路径
- 要把未测的包体积或跨 OS 实测差异写成结论

## 固定版本边界

- 本文绑定 `unjs/pathe@614844ba...`，annotated tag `v2.0.3`，`package.json` 版本 `2.0.3`。
- npm latest 同号，未暴露 `gitHead`；身份以 tag peel 为准。
- 源码基于 Node `lib/path.js` 的一份历史 fork，许可证在 `LICENSE`。
- 本文未安装依赖、未跑 vitest、未构建 dist，状态保持 `UNVERIFIED`。

## 学到什么

1. **「长得像 path」不等于「调用 path」**——pathe 把算法搬进用户态。
2. **斜杠规范化和绝对路径判定是两道门**——`C:` 与 `C:/` 不是同一个问题。
3. **平台对象可以只是 Proxy 皮肤**——不要从导出名字推导第二套 Windows 实现。
4. **额外能力有独立入口**——glob 和 alias 不是主 `path` 合同的一部分。

## 应用型自测

1. `import pathe from "pathe"` 得到的是 `win32` 还是 `posix`？它的 `delimiter` 会不会随操作系统变？
2. `toNamespacedPath("c:\\temp")` 会不会变成 `\\?\C:\temp`？
3. 没有 `process.cwd` 时，`resolve("a")` 的根从哪来？

检查点：

1. 默认导出是 `posix`；其 `delimiter` 固定 `":"`。顶层命名导出 `delimiter` 才会在 win32 上变成 `";"`。
2. 不会。它只把反斜杠换成正斜杠并大写盘符。
3. 从 `"/"` 回退，不抛错。

## 延伸阅读

- Node 路径文档：[nodejs.org/api/path.html](https://nodejs.org/api/path.html)
- 固定源码：[unjs/pathe](https://github.com/unjs/pathe) —— 本文绑定提交 `614844ba1f7f34f051959f3d1a953c54eaeaf3b2`
- 对照入口：`src/_path.ts`、`src/index.ts`、`src/utils.ts`
- [[upath]] —— 另一条路线：代理 `node:path`，而不是重写
- [[node-js]] —— 被对齐的标准 API 面

## 关联

- [[upath]] —— Node 代理 + 扩展名工具的对照
- [[vite]] —— 前端工具链里常见的路径规范化需求
- [[nuxt]] —— unjs 生态里会碰到同一套 `/` 约定
- [[node-js]] —— `path` 原版合同

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
