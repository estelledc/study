---
title: lookpath — 不 spawn 子进程的 Go 风格 PATH 查找
description: 不 spawn which 的 Go 风格 PATH 查找，找不到返回 undefined。
来源: https://github.com/otiai10/lookpath
日期: 2026-08-27
分类: 命令行
难度: 初级
difficulty: 初级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/otiai10/lookpath
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 3885a0e45459b2d6bf466223a67055c3374d979d
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.2.2
---

## 是什么

lookpath 是一个只扫目录、不 `spawn` `which` / `where` 的命令查找库。日常类比：不打电话问系统管理员，自己拿着通讯录挨个敲门；没人在家就说“没有”，而不是摔门。作者对照的是 Go `os/exec.LookPath`，不是 BSD `which(1)`。

你写：

```js
const { lookpath } = require('lookpath')
const found = await lookpath('bash')
// 找到则是绝对路径，找不到是 undefined
```

固定 1.2.2 只有 async 导出，没有 sync，也没有 `all` / `nothrow`。库本身不抛“未找到”；CLI `lookpath` 在空结果上才 `throw` 并 `exit 1`。

## 为什么重要

不理解这层扫描，就会把“命令在不在”和“子进程调用 which”绑死：

- 为什么自定义 `env` 在 Windows 上要写 `Path`，写 `PATH` 会整段落空
- 为什么 `include` 是追加在现有 PATH 后面，不是插到最前
- 为什么带路径分隔符的参数会走 `path.resolve`，不再拆 PATH
- 它和 [[which]] 的失败值、同步 API、Windows cwd-first 都不一样

## 核心要点

固定 `src/index.ts` 可以压成四条：

1. **文件路径捷径**：`command` 含 `path.sep` 时，`isFilepath` 返回 `path.resolve(command)`，只对这一处做可执行检查。

2. **目录名单**：Windows 读 `env.Path`，其他平台读 `env.PATH`。默认 `process.env`，可用 `opt.env` 整表替换。然后 `concat(opt.include)`，再滤掉 `opt.exclude`。

3. **可执行**：`isExecutable` 把 `PATHEXT` 按分隔符切开，再 `concat('')`。空环境变量时会得到两个空扩展名。每个候选走 `fs.access(..., X_OK)`。扩展名顺序是 PATHEXT 在前、空后缀在后。

4. **并发但不乱序**：对各目录 `Promise.all`，再用 `find` 取第一个真值。完成顺序不影响 PATH 先后；只是同时发起访问。

## 实践示例

### 案例 1：用 include 补一条私有目录

```js
const { lookpath } = require('lookpath')

await lookpath('hello_world') // undefined，除非它已在 PATH
await lookpath('hello_world', {
  include: ['/tmp/my-bin'],
})
```

`include` 接在现有 PATH 后面。系统里若已有同名命令，会先命中系统那一份。

### 案例 2：env 整表替换，不是合并

```js
const env = {
  PATH: ['/tmp/bin', '/tmp/bin_1'].join(':'),
}
await lookpath('node', { env }) // 这份 env 里没有 node 就 undefined
await lookpath('node')          // 仍读 process.env
```

测试在 Windows 分支写的是 `Path`。只传 `{ PATH: '...' }` 在 Windows 上等于没有查找目录。

### 案例 3：相对文件当命令

```js
await lookpath('./tests/data/bin/hello_world')
```

因为含分隔符，实现 `path.resolve` 后再查 `X_OK`。非 Windows 上 `goodbye_world` 被测成 `0644`，应返回 `undefined`。

## 踩过的坑

1. **把 npm latest 1.2.3 当成可复查源码**：registry 的 `gitHead` 是 `6b80a53...`，canonical GitHub 上没有这条 ref，tag 只到 `v1.2.2`。本文不猜测 1.2.3。
2. **以为 git 工作树能直接跑 CLI**：`bin/lookpath.js` 去 `require('../lib')`。tag 里只有 `src/index.ts`，`lib/` 是发布时 `tsc` 产物。
3. **按 [[which]] 去接返回值**：这里是 `undefined`，不是 `null`，也不是异常。
4. **Windows 自定义 env 用了 `PATH`**：查找键是 `Path`。
5. **以为 `include` 能盖过系统 PATH**：它只追加；要覆盖得传 `env`。

## 适用 vs 不适用场景

**适用**：

- 只要知道命令在不在、在哪，且不愿意 spawn `which`
- 接受“找不到 = `undefined`”的 Go 风格
- 需要按目录 include / exclude，或塞进一套替换用的 env

**不适用**：

- 需要 sync 或一次返回全部命中——看 [[which]]
- 需要默认抛 `ENOENT`，让调用方走 try/catch
- 必须绑定尚未公开源码的 npm 1.2.3
- 需要本轮未测的并发访问性能或大小写规则保证

## 固定版本边界

- 本文绑定 `otiai10/lookpath@3885a0e4...`。轻量 tag `v1.2.2` 与 npm `lookpath@1.2.2` 的 `gitHead` 一致。
- npm `lookpath@1.2.3` 标为 latest，但其 `gitHead` 在公开仓库不可达；未绑定。
- 许可 MIT。`engines` 只写 `npm >= 6.13.4`，没有 Node 下界。
- 审查对象是 `src/index.ts` 与 `bin/lookpath.js`；未运行 jest，未执行 `tsc`。状态保持 `UNVERIFIED`。

## 学到什么

1. **LookPath 和 which(1) 的失败值不同**——库层 resolve `undefined`，CLI 才把空结果变成退出码。
2. **Windows 环境变量名是合同**：`Path` 不是 `PATH` 的别写。
3. **include 追加、env 替换**是两条入口，不能混用。
4. **Promise.all + find 仍遵守名单顺序**，只是同时发起 `access`。

## 应用型自测

1. `lookpath('definitely-missing')` 会 reject 吗？得到什么？
2. 在 Windows 上只传 `{ env: { PATH: 'C:\\tools' } }`，会扫这个目录吗？
3. PATH 里已有 `hello_world` 时，再 `include` 另一份同名文件，会命中哪一份？

检查点：

1. 不会 reject。Promise resolve `undefined`。
2. 不会。Windows 读的是 `env.Path`。
3. 先命中 PATH 里已有的那份；`include` 在后面。

## 延伸阅读

- 固定源码：[otiai10/lookpath](https://github.com/otiai10/lookpath) —— 本文绑定 `3885a0e45459b2d6bf466223a67055c3374d979d`
- 对照入口：`src/index.ts`、`bin/lookpath.js`、`tests/lookpath.spec.ts`
- Go 合同参考：[os/exec.LookPath](https://pkg.go.dev/os/exec#LookPath)（标准库，不是本仓库）
- [[which]] —— npm 维护的 which(1) 语义实现

## 关联

- [[which]] —— 可抛错、有 sync / `all`、Windows cwd-first
- [[volta]] —— PATH 首位 shim 同样会被本库扫到
- [[asdf]] —— 另一套 shim 目录
- [[zsh]] —— shell 内建查找与本库独立
