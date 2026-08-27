---
title: download-git-repo — 用 zip 或 clone 把远端仓库摊到目录
description: 默认下载 GitHub master zip；clone 成功后删除 .git，且只有 master 才浅克隆。
来源: https://gitlab.com/flippidippi/download-git-repo
日期: 2026-08-27
分类: CLI
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://gitlab.com/flippidippi/download-git-repo
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 23e8c09b4a19aaf9c9b3e265d41b924143daf707
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.0.2
---

## 是什么

download-git-repo 是一个 Node callback 库：把 `owner/name#branch` 这类缩写收成 zip URL 或 git 地址，再下载并解到目标目录。日常类比：它是一台只认旧标签的复印机——默认按钮印的是 GitHub 的 `master` zip，只有拧到 `clone: true` 才会真的调用 git。

你写：

```js
const download = require("download-git-repo")

download("flippidippi/download-git-repo-fixture", "tmp", function (err) {
  console.log(err ? "Error" : "Success")
})
```

固定 `3.0.2` 是单一 `index.js`。npm 与 GitLab `master` 都指向 `23e8c09b...`；本轮访问 `github.com/flipxfx/download-git-repo` 得到仓库不存在，canonical 以 GitLab 为准。

## 为什么重要

不读这 160 行，下面这些旧脚手架坑会对不上：

- 为什么 2026 年还在下载 `.../archive/master.zip`，而仓库默认分支早已是 `main`
- 为什么 `clone: true` 之后目标目录里没有 `.git`
- 为什么自定义 GitLab 要写成 `gitlab:host:owner/name`
- 为什么它和 [[giget]] 不能靠「都能下仓库」互换

vue-cli 一代模板下载普遍建立在这份合同上。

## 核心要点

固定实现只有一条函数和两条出口：

1. **normalize**：`direct:url[#ref]` 原样走 URL；否则 `[type:][origin:]owner/name[#checkout]`。缺 type 就是 `github`，缺 checkout 就是 `master`。

2. **HTTP zip（默认）**：拼 GitHub `/archive/<checkout>.zip`、GitLab `/repository/archive.zip?ref=`、Bitbucket `/get/<checkout>.zip`。交给 `download`，`extract: true`、`strip: 1`、`accept: application/zip`。

3. **git clone（opt-in）**：`git-clone` 的 `shallow` **只在 checkout 恰好等于 `'master'` 时为 true**。成功后立刻 `rimraf(dest + '/.git')`。

4. **options 透传**：`clone` 被删掉后，其余字段（`headers`、`filter`、`proxy`、`checkout`）继续传给底层下载或 clone。

## 实践示例

### 案例 1：默认 GitHub zip

```js
download("owner/template#v1.2.0", "my-app", (err) => {
  if (err) throw err
})
```

实际 URL 是 `https://github.com/owner/template/archive/v1.2.0.zip`。没写 `#v1.2.0` 时，checkout 回落 `master`。

### 案例 2：GitLab + token

```js
download(
  "gitlab:mygitlab.com:acme/template#release",
  "tmp",
  { headers: { "PRIVATE-TOKEN": process.env.TOKEN } },
  (err) => { if (err) throw err },
)
```

`type`、`origin`、`owner/name` 三段要写齐。HTTP 模式不会走 git 协议。

### 案例 3：clone 之后没有历史

```js
download("bitbucket:acme/template#main", "tmp", { clone: true }, (err) => {
  if (err) throw err
})
```

`#main` 不是 `'master'`，因此 `shallow` 为 false，会做完整 clone，然后删除 `.git`。留下的是一份无版本库的工作树。

## 踩过的坑

1. **默认分支还当 `main`**：解析器写死 `checkout = match[5] || 'master'`。只写 `owner/name` 时，GitHub 会去拉 `archive/master.zip`。
2. **以为 clone 能当本地仓库继续开发**：成功路径会删掉 `.git`。
3. **浅克隆范围被夸大**：只有 checkout 字符串精确等于 `master` 才 `shallow: true`；`main`、tag、commit 都是深克隆。
4. **把 GitHub 当 canonical**：npm `repository` 与源码都指向 GitLab `flippidippi/download-git-repo`；旧 GitHub 路径本轮不可达。
5. **和 [[giget]] 互换 API**：这边是 callback、默认 zip、默认 `master`；那边是 Promise、默认 tarball / registry、默认 `main`。

## 适用 vs 不适用场景

**适用**：

- 维护仍调用 `download-git-repo` 的旧脚手架，需要对照真实默认值
- 只要一份去掉 `.git` 的模板快照，并能接受 zip 解包
- 需要 `direct:` 直链或自定义 origin

**不适用**：

- 新脚手架——更应对 [[giget]] 这类默认 `main` + 缓存 tarball 的接口
- 需要保留 git 历史、shallow-by-ref 或 Promise API
- 把 2019 年的 `master` 默认推广到今天的 GitHub 仓库

## 固定版本边界

- 本文绑定 `flippidippi/download-git-repo@23e8c09b...`，包版本 `3.0.2`；npm `gitHead` 与 GitLab `master` 同指此提交。仓库没有 git tag。
- 运行时依赖：`download@^7.1.0`、`git-clone@^0.1.0`、`rimraf@^3.0.0`。
- 本文未安装依赖、未下载 fixture、未跑 mocha，状态保持 `UNVERIFIED`。

## 学到什么

1. **默认 ref 是合同，不是习惯**——2019 年的 `master` 会让 2026 年的 `main` 仓库直接 404。
2. **clone 成功不等于得到一个 git 仓库**——实现会删 `.git`。
3. **shallow 条件比文档口语更窄**——只认 `'master'` 这个字面量。
4. **canonical 以 npm / GitLab 为准**——失踪的 GitHub 镜像不能当出处。

## 应用型自测

1. `download("acme/app", "tmp", cb)` 会请求哪条 GitHub 路径？
2. `clone: true` 且 checkout 为 `main` 时，会做浅克隆吗？
3. clone 成功后，`tmp/.git` 还在吗？

检查点：

1. `https://github.com/acme/app/archive/master.zip`。
2. 不会。`shallow` 只在 `checkout === 'master'` 时打开。
3. 不在。成功回调前会被 `rimraf` 掉。

## 延伸阅读

- 文档：[gitlab.com/flippidippi/download-git-repo](https://gitlab.com/flippidippi/download-git-repo)
- 固定源码：[flippidippi/download-git-repo](https://gitlab.com/flippidippi/download-git-repo) —— 本文绑定提交 `23e8c09b4a19aaf9c9b3e265d41b924143daf707`
- [[giget]] —— 默认 tarball / registry / `main` 的对照
- [[vue]] —— 旧 vue-cli 模板下载常见消费方
- npm：[download-git-repo@3.0.2](https://www.npmjs.com/package/download-git-repo)

## 关联

- [[giget]] —— 现代 unjs 下载器，默认合同相反
- [[vue]] —— 历史脚手架栈里的常见调用方
- [[vite]] —— 当前前端 `create` 入口，不再走这套 zip 默认

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
