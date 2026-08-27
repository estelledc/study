---
title: pkg-dir — 把最近的 package.json 收成包根目录
description: 固定 v8：packageDirectory 依赖 find-up-simple，不依赖 find-up
来源: https://github.com/sindresorhus/pkg-dir
日期: 2026-08-27
分类: 包管理
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/sindresorhus/pkg-dir
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: fe0b0fbe45a2b3bd92961cbc586d8fde90e58e01
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 8.0.0
---

## 是什么

pkg-dir 是一个 **只负责找回 Node 包根目录** 的 ESM 小函数。日常类比：它不问整栋楼里有哪些文件，只顺着楼梯找最近的门牌 `package.json`，然后告诉你门牌所在的那一层。

```js
import {packageDirectory} from 'pkg-dir'
const root = await packageDirectory()
```

固定 `8.0.0` 的实现是：用 `find-up-simple` 找 `package.json`，再 `path.dirname`。找不到就返回 `undefined`。

## 为什么重要

名字容易让人以为它还包着 [[find-up]]，或仍导出默认函数 `pkgDir`：

- 为什么 `import pkgDir from 'pkg-dir'` 在这份源码里不存在
- 为什么 v8 的 `package.json` 依赖是 `find-up-simple`，不是 `find-up`
- 为什么 npm latest `9.0.0` 不能单独当成另一份源码
- 为什么后继仓库改名叫 `package-directory`，却多了一条 type-only manifest 规则

一句话：它是 **包根目录的薄封装**，通用上行搜索在别的包。

## 核心要点

固定 8.0.0 只有一条链：

1. **入口**：`packageDirectory({cwd} = {})` 与 `packageDirectorySync({cwd} = {})`。
2. **查找**：`findUp('package.json', {cwd})` / `findUpSync`，来自 `find-up-simple`。
3. **收口**：`filePath && path.dirname(filePath)`。空值保持 falsy，不会拼出 `'.'`。
4. **选项**：类型里只有 `cwd`；没有 `stopAt`、`type`、matcher。
5. **模块形态**：`"type": "module"`，`exports` 指向 `index.js` / `index.d.ts`，引擎 `node >= 18`。

v7 仍依赖 `find-up@^6.3.0`；切到 v8 才换成 `find-up-simple`。更早的 v5 才是 CJS 默认导出 `pkgDir`。

## 实践示例

### 案例 1：从子目录回到包根

```js
import path from 'node:path'
import {packageDirectory} from 'pkg-dir'

const root = await packageDirectory({
  cwd: path.join(process.cwd(), 'fixture'),
})
```

固定测试里，`fixture/` 自己没有 `package.json`，函数回到仓库根。disjoint 临时目录则是 `undefined`。

### 案例 2：同步入口

```js
import {packageDirectorySync} from 'pkg-dir'
const root = packageDirectorySync()
```

和异步版同一条 `dirname` 合同，只是调用 `findUpSync`。

### 案例 3：不要用旧默认导出

```js
// 固定 8.0.0 没有这行
// import pkgDir from 'pkg-dir'
import {packageDirectory} from 'pkg-dir'
```

v6 已改成命名导出。把 npm 5 教程抄进 v8 会直接模块错误。

## 踩过的坑

1. **以为它包装了 [[find-up]] 8**：本提交依赖 `find-up-simple@^1.0.0`。README 的 Related 仍列出 find-up，那是文档互链，不是 `dependencies`。
2. **把 npm `9.0.0` 当成另一份实现**：registry 上 `9.0.0` 与 `8.0.0` 的 `gitHead` 都是本提交；两个 tarball 只有 `package.json` 的 `version` 字段不同。
3. **把 GitHub 最新 tag `v8.2.0` 当成 pkg-dir**：该提交把包名改成 `package-directory`，并增加 `ignoreTypeOnlyPackageJson`。npm 没有 `pkg-dir@8.2.0`。
4. **指望它跳过只有 `"type"` 字段的 package.json**：这是后继 `package-directory@8.2.0` 的行为，本页不绑定。
5. **默认导出 `pkgDir`**：那是 v5 CJS 合同。

## 适用 vs 不适用场景

**适用**：

- 只要最近包根目录字符串，不要自己 `dirname`
- ESM、Node 18+ 的 CLI 或测试辅助
- 能接受“第一份 `package.json` 就是根”，不做 workspace 协议判断

**不适用**：

- 需要通用文件名、matcher 或 `findDown`——用 [[find-up]]
- 需要忽略 type-only manifest——那是改名后的 `package-directory`
- 还在 CJS 里 `require('pkg-dir')` 并期待默认函数

## 固定版本边界

- 本文绑定 `sindresorhus/pkg-dir@fe0b0fbe...`，即 git tag `v8.0.0`；仓内 `package.json` 写 `8.0.0`。
- npm `pkg-dir@8.0.0` 与 `pkg-dir@9.0.0` 的 `gitHead` 均为本提交。未猜测另一份 9.0.0 源码。
- 后继 npm 包 `package-directory@8.2.0` 指向 `516b394c...`，不在本文范围内。
- 本文未安装依赖、未跑 `xo` / `ava` / `tsd`，状态保持 `UNVERIFIED`。

## 学到什么

1. **包根 ≠ 通用 walker**——这里只硬编码 `package.json`
2. **依赖名以 `package.json` 为准**——Related 链接不能代替 `dependencies`
3. **npm 版本号可能只改字段**——`9.0.0` 与 `8.0.0` 共享 revision
4. **导出名称会断代**——`pkgDir` 默认导出停在 v5

## 应用型自测

1. 固定 8.0.0 的运行时依赖是 `find-up` 还是 `find-up-simple`？
2. `packageDirectory()` 找到文件后返回的是文件路径还是目录？
3. npm `pkg-dir@9.0.0` 是否对应一个与 `v8.0.0` 不同的 git 提交？

检查点：

1. `find-up-simple`。
2. 目录：`path.dirname(filePath)`。
3. 不是。两个 npm 版本的 `gitHead` 都是 `fe0b0fbe...`。

## 延伸阅读

- 固定源码：[sindresorhus/pkg-dir](https://github.com/sindresorhus/pkg-dir) —— 本文绑定提交 `fe0b0fbe45a2b3bd92961cbc586d8fde90e58e01`
- [[find-up]] —— 通用上行 / 下行查找；本页不包装它
- 后继包：[package-directory](https://github.com/sindresorhus/package-directory) —— 未绑定

## 关联

- [[find-up]] —— 通用路径发现
- [[pnpm]] —— workspace 与包根协议更复杂
- [[volta]] —— 读到 `package.json` 后还要看 `volta` 字段

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[find-up]] —— find-up — 沿目录树上行或下行找文件
