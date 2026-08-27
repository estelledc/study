---
title: isomorphic-git — 纯 JS 读写 .git 的跨端实现
description: 纯 JavaScript git 实现：注入 fs/http，直接读写 .git，不依赖系统 git。
来源: https://github.com/isomorphic-git/isomorphic-git
日期: 2026-08-27
分类: Git 库
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/isomorphic-git/isomorphic-git
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 89d641a761b56a492270933608df78edd7c9ee33
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.41.9
---

## 是什么

isomorphic-git 是一份纯 JavaScript 的 git 实现：它直接读写工作区与 `.git`，不 fork 系统 `git`，也不依赖原生 C++ 模块。日常类比：它把 git 拆成一盒可单独拿走的零件——`clone` / `commit` / `push` 各是一个函数；文件和网络都由调用方塞进来。

Node 里通常这样接：

```js
import git from "isomorphic-git"
import http from "isomorphic-git/http/node"
import fs from "fs"

await git.clone({
  fs,
  http,
  dir: "./repo",
  url: "https://github.com/isomorphic-git/isomorphic-git",
  singleBranch: true,
  depth: 1,
})
```

固定 `v1.41.9` / `89d641a7...` 与 npm `isomorphic-git@1.41.9` 的 `gitHead` 一致。仓内 `package.json` / `src/utils/pkg.js` 仍写 `0.0.0-development`；发布时才改成 1.41.9。条件导出：Node 走 `index.cjs`，默认 ESM 走 `index.js`；HTTP 另有 `./http/node` 与 `./http/web`。`engines.node` 为 `>=14.17`。

## 为什么重要

不理解「自带 fs/http、只认 http(s)」这条合同，下面这些事会对不上：

- 为什么浏览器里必须另接 LightningFS / ZenFS，还常要 `corsProxy`
- 为什么 `git@host:path` 会抛 `UnknownTransportError`，错误对象里却带着 HTTP 改写建议
- 为什么 `clone` 失败会把半成品 `.git` 删掉，而不是留给你手工 salvage
- 为什么 criss-cross 历史会直接 `MergeNotSupportedError`，不是递归三路合并

## 核心要点

主链可以拆成五层：

1. **注入式运行时**：每个公开 API 都要求 `fs`。`FileSystem` 若看到可枚举的 `fs.promises` 就绑 Promise 接口，否则用 `pify` 包一层回调。`http` 必须提供 `request({ url, method, headers, body })`。
2. **函数即命令**：`src/index.js` 同时 named / default 导出 `clone`、`commit`、`fetch`、`push`、`statusMatrix` 等。bundler 可以只打用到的函数。
3. **`clone` 是四步编排**：`_init` → `_addRemote` → 可选写入 `http.corsProxy` → `_fetch` → `_checkout`。`fetchHead === null`（空远程）直接返回。任一步失败会 `rmdir(gitdir, { recursive: true })`，再抛出原错误。
4. **远程只认 HTTP**：`GitRemoteManager` 的 helper 表只有 `http` / `https`。scp 形 URL 被解析成 `ssh`，抛 `UnknownTransportError`。`_fetch` 发现阶段写死 `protocolVersion: 1`；`listServerRefs` 才默认协议 2。
5. **对象层自己写**：`commit` 从 index 拼 tree；空树 OID 是 `4b825dc642cb6eb9...`。`merge` 要求唯一 merge base；0 个且 `allowUnrelatedHistories` 时才用空树当 base，多于 1 个则拒绝。

## 实践示例

### 案例 1：浏览器要自带 fs 和 CORS 代理

```js
import git from "isomorphic-git"
import http from "isomorphic-git/http/web"

await git.clone({
  fs,
  http,
  dir: "/tutorial",
  corsProxy: "https://cors.isomorphic-git.org",
  url: "https://github.com/isomorphic-git/isomorphic-git",
  singleBranch: true,
  depth: 1,
})
```

`GitRemoteHTTP` 的 `corsProxify`：代理 URL 以 `?` 结尾就拼完整目标；否则剥掉 `http(s)://` 接到代理路径后。Web 端 `http.request` 会先 `collect(body)`，浏览器里还不能流式上传 pack。

### 案例 2：从 index 提交

```js
await git.add({ fs, dir, filepath: "README.md" })
const oid = await git.commit({
  fs,
  dir,
  message: "document the pin",
  author: { name: "Ada", email: "ada@example.com" },
})
```

`_commit` 用 `GitIndexManager.acquire` 拿 index，把扁平条目收成目录树再 `writeObject`。没给 `message` 且不是 `amend` 会 `MissingParameterError`。`disallowEmpty` 在空树或 tree 未变时抛 `EmptyCommitError`。`signingKey` 走 `onSign` 回调，库自己不内置 GPG。

### 案例 3：一次读完工作区状态

```js
const matrix = await git.statusMatrix({ fs, dir })
// ["a.txt", 0, 2, 0] 新文件未跟踪
// ["d.txt", 1, 1, 1] 与 HEAD / stage 一致
```

每一行是 `[filepath, HEAD, WORKDIR, STAGE]`。HEAD 只有 0/1；WORKDIR 0/1/2；STAGE 0/1/2/3。这是一次 walk，不是多次 `status`。

## 踩过的坑

1. **把 README 的 Node 10 矩阵当成 engines**：固定包声明 `>=14.17`。支持表是历史 CI 叙述，不是当前合同。
2. **以为 `git.version()` 在源码树里就是 1.41.9**：未发布的 `pkg.version` 是 `0.0.0-development`。
3. **SSH / `git@` URL 可以直接 clone**：只注册了 HTTP helper；SSH 会失败，错误里的 HTTP 改写只是建议。
4. **复杂合并会自动递归**：多个 merge base 抛 `MergeNotSupportedError`。`pull` 是 fetch → merge → checkout，冲突策略跟 merge 相同。
5. **clone 失败后还能接着用半成品目录**：失败路径会删 `gitdir`。`noCheckout: true` 只跳过工作区写出，仍会 fetch。

## 适用 vs 不适用场景

**适用**：

- 浏览器、Workers 或不想安装系统 git 的 Node 服务，需要读写真实 `.git`
- 只要 clone / commit / fetch / push / status，并能接受 HTTP(S) 远程
- 希望按函数 tree-shake，而不是拖进一整份 CLI 包装器

**不适用**：

- 必须走 SSH、`git://` 或自定义 remote helper
- 需要递归合并、完整 rebase / submodule / LFS 合同
- 想复用本机 credential helper、hook、pager——那是 [[simple-git]] 的子进程路线
- 把未实测的 bundle / 冷启动写成选型结论

## 固定版本边界

- 本文绑定 `isomorphic-git/isomorphic-git@89d641a761b56a492270933608df78edd7c9ee33`，tag `v1.41.9` 与 npm `gitHead` 同指此提交。
- 许可 MIT。公开 API 通过 `fs` + `http` 注入；远程发现默认 Git protocol v1。
- `checkout` 可设 `nonBlocking`，默认 `batchSize=100`。
- 本文未安装依赖、未跑上游测试、未测浏览器 CORS 或 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **跨端 git 的真正分界是 fs/http，不是「有没有 CLI」**——对象存储仍按 `.git` 布局。
2. **clone 失败即拆除**——半成品仓库不是默认资产。
3. **协议与传输是两张表**——fetch 走 v1，listServerRefs 才默认 v2；SSH 根本不在 helper 表里。
4. **合并策略是显式拒绝**——没有唯一 base 就停，而不是假装能递归。

## 应用型自测

1. `git.clone({ fs, http, dir, url: "git@github.com:org/repo.git" })` 会走 SSH helper 吗？
2. `_fetch` 发现远程时默认发 Git protocol v2 吗？
3. 两个提交有多个 merge base 时，`merge` 会递归三路合并吗？

检查点：

1. 不会。scp 形 URL 被解析成 `ssh`，抛 `UnknownTransportError`。
2. 不会。`_fetch` 写死 `protocolVersion: 1`。
3. 不会。`baseOids.length !== 1` 且不能用空树兜底时抛 `MergeNotSupportedError`。

## 延伸阅读

- 文档：[isomorphic-git.org](https://isomorphic-git.org/)
- 固定源码：[isomorphic-git/isomorphic-git](https://github.com/isomorphic-git/isomorphic-git) —— 本文绑定提交 `89d641a761b56a492270933608df78edd7c9ee33`
- [[simple-git]] —— 对照：spawn 系统 `git` 的 Node 包装器
- [[gitui]] —— 对照：libgit2 直连，而不是纯 JS 对象层

## 关联

- [[simple-git]] —— 子进程包装 vs 纯 JS 实现
- [[gitui]] —— Rust + libgit2 的另一条嵌入路线
- [[lazygit]] —— 复用系统 git porcelain 的 TUI
- [[node-js]] —— Node 条件导出与 `fs` 注入的主场

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[simple-git]] —— simple-git — 把系统 git 收成可链式 Promise
