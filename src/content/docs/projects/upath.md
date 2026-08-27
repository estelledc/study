---
title: upath — 代理 Node path 并强制正斜杠
description: 运行时代理 node:path，结果强制 /；posix/win32 原样透传
来源: https://github.com/anodynos/upath
日期: 2026-08-27
分类: 工具库
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/anodynos/upath
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: ef9377ff82bb6d56904df6824a91be843f2ece2c
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.0.8
---

## 是什么

upath 是 Node.js `path` 的一层运行时代理：每个函数进门先把字符串里的 `\` 换成 `/`，出门再保证结果也是 `/`。日常类比：它不重写尺子的刻度，只规定「读数一律用正斜杠」——真正怎么拼路径，还是问当前进程里的 `node:path`。

```ts
import upath from "upath"

upath.normalize("c:\\windows\\..\\nodejs\\path") // "c:/nodejs/path"
upath.sep                                       // "/"
upath.addExt("file", "js")                      // "file.js"
```

固定 `3.0.8` 是 TypeScript 重写后的 v3 线：双模块导出，`engines.node >= 20`，零运行时依赖，唯一 import 是 `node:path`。

## 为什么重要

不看代理边界，会把 upath 和重写派的 [[pathe]] 混成「都是跨平台 path」：

- 为什么新 Node 版本多出来的 `path` 函数，upath 不用改源码也能包到
- 为什么 `upath.posix` / `upath.win32` **不是** 强制正斜杠的版本
- 为什么 `normalizeSafe` 要单独存在——普通 `normalize` 会丢掉 `./`
- 为什么 `trimExt` 默认不肯砍掉超过 7 个字符的「扩展名」

一句话：upath 的合同是 **包一层 Node path + 一套扩展名 / 安全规范化工具**。

## 核心要点

固定 3.0.8 的主链可以拆成五步：

1. **加载时遍历 `path`**：`Object.entries(path)`。函数被包一层；`posix` / `win32` 原样挂上；其余属性直接拷贝。

2. **`toUnix` 是唯一规范化核**：`\` → `/`，再用 `/(?<!^)\/+/g` 折叠重复斜杠，但保留 UNC 的开头 `//`。

3. **`sep` 被改写，`delimiter` 不改**：`upath.sep` 恒为 `'/'`；`delimiter` 仍是当前 Node 平台的 `:` 或 `;`。

4. **Safe 变体保住前缀**：`normalizeSafe` / `joinSafe` 在调用被包装的 `normalize` / `join` 之后，若输入以 `./` 或 `//` / `//./` 开头，会把这个前缀补回去。`normalizeTrim` 再去掉非根尾斜杠。

5. **扩展名工具有长度门**：`addExt` / `removeExt` / `trimExt` / `changeExt` / `defaultExt`。后三者默认 `maxSize = 7`，太长的后缀不当扩展名砍。

## 实践示例

### 案例 1：同一套 API，结果强制 `/`

```ts
import { join, parse } from "upath"

join("some/nodejs\\windows", "../path")
parse("c:\\Windows\\dir\\file.ext")
```

包装器先 `toUnix` 每个字符串参数，再 `path.join` / `path.parse`，最后若结果是字符串再 `toUnix`。README 用这件事对照「Windows 上原生 `path.join` 把混合斜杠看错」；本轮没有在 Windows 上复测。

### 案例 2：`normalizeSafe` 留下 `./`

```ts
import { normalize, normalizeSafe } from "upath"

normalize("./dep")     // 走 Node normalize，通常得到 "dep"
normalizeSafe("./dep") // "./dep"
```

`normalizeSafe` 先 `toUnix`，再调用已经包装过的 `normalize`。若原文以 `./` 开头、结果却不是 `./` 或 `..`，就把 `./` 接回去。UNC 的 `//` 与 `//./` 同样会被补前缀。固定测试写在 `src/__tests__/safe.test.ts`。

### 案例 3：扩展名函数不是无条件切片

```ts
import { trimExt, changeExt, defaultExt } from "upath"

trimExt("archive.tar.gz")        // 默认 maxSize=7，".gz" 会被去掉
changeExt("notes.md", "txt")     // "notes.txt"
defaultExt("README", "md")       // "README.md"
defaultExt("README.md", "txt")   // 已有合法扩展名，保持 "README.md"
```

`isValidExt` 要求扩展名非空、长度不超过 `maxSize`、且不在 `ignoreExts` 里。`removeExt` 只在当前 `extname` 正好等于目标扩展时才切。

## 踩过的坑

1. **从 `upath.posix` / `upath.win32` 期待正斜杠保证**：源码明确把这两个对象**透传**，不包装。要 Unix 风格请用顶层函数。
2. **在 Node 20 上默认 `matchesGlob` 一定存在**：导出类型写成可能 `undefined`；它只是把当前 `path.matchesGlob` 拷过来。
3. **把 `trimExt("file.d.ts")` 想成总是去掉 `.ts`**：默认门限是 7，具体结果还要看 `extname` 认哪一段。
4. **当浏览器 polyfill 用**：v3 直接 `import 'node:path'`，并且 `engines.node >= 20`。无 Node 的环境应看 [[pathe]]。
5. **把 README 的下载量、测试条数或 bundle 徽章写进选型结论**：本轮未跑测试、未测体积。

## 适用 vs 不适用场景

**适用**：

- 已经在 Node >= 20 里用 `path`，只想结果统一成 `/`
- 需要 `addExt` / `changeExt` / `joinSafe` 这类文件名工具
- 希望新的 Node `path` 函数随运行时自动出现在代理上

**不适用**：

- 浏览器、边缘 runtime 或任何没有 `node:path` 的环境
- 必须让 `posix` / `win32` 子对象也强制正斜杠
- 需要一份不依赖 Node 的用户态实现——见 [[pathe]]
- 要把未复测的 Windows 行为或性能数字当成已验证事实

## 固定版本边界

- 本文绑定 `anodynos/upath@ef9377ff...`，tag `v3.0.8`，与 npm `upath@3.0.8` 的 `gitHead` 一致。
- `package.json` 声明 `node >= 20`，`type: module`，同时提供 import / require `exports`。
- `VERSION` 由构建期 `__UPATH_VERSION__` 注入；本轮未执行 tsup。
- 本文未安装依赖、未跑 jest / integration，状态保持 `UNVERIFIED`。

## 学到什么

1. **代理模型跟当前 Node 绑定**——API 面随运行时涨，不随这份源码涨。
2. **透传的 `posix` / `win32` 是刻意缺口**——顶层保证推不到子对象。
3. **Safe 变体解决的是前缀丢失**，不是另一套 join 算法。
4. **扩展名工具带长度和忽略名单**——不是简单的 `lastIndexOf('.')`。

## 应用型自测

1. `upath.win32.join("a\\b", "c")` 是否保证返回正斜杠？
2. `normalize("./src")` 和 `normalizeSafe("./src")` 在固定源码里差在哪？
3. 不传第三参时，`trimExt` 用什么 `maxSize`？

检查点：

1. 不保证。`win32` 是 Node 原对象，没有 `toUnix` 包装。
2. 普通 `normalize` 走包装后的 Node 实现，`./` 常被吃掉；`normalizeSafe` 会把 `./` 补回。
3. `7`。

## 延伸阅读

- 使用说明与 API 表：仓库 `readme.md`、`docs/API.md`
- 固定源码：[anodynos/upath](https://github.com/anodynos/upath) —— 本文绑定提交 `ef9377ff82bb6d56904df6824a91be843f2ece2c`
- 对照入口：`src/index.ts`
- [[pathe]] —— 不依赖 `node:path` 的用户态重写
- [[node-js]] —— 被代理的标准库

## 关联

- [[pathe]] —— 重写派对照：无 Node 依赖、平台对象只是 Proxy
- [[node-js]] —— `path` 的运行时来源
- [[vite]] —— 构建工具里同样要处理混合斜杠

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
