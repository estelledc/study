---
title: semantic-release — 从 commit 推断下一版并自动发布
description: 介绍 semantic-release 25.0.9 如何在 CI 里分析 commit、先打 tag 再调用 publish 插件，以及非 CI 强制 dry-run。
来源: https://github.com/semantic-release/semantic-release
日期: 2026-08-27
分类: 工具库
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/semantic-release/semantic-release
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 8d905a56e80030c141a71a32c0c4cb870e90470a
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 25.0.9
---

## 是什么

semantic-release 是一个**在 CI 里编排“分析 commit → 算下一版 → 打 tag → 调 publish 插件”**的发版主机。日常类比：它不让人在 PR 里填版本单，而是约定 commit 历史本身就是发版输入；主机负责找上一张 tag、问插件这批 commit 该涨哪一档，然后先推 git tag，再把包和 Release 交给插件。

固定 25.0.9 的入口是 `index.js` 的默认导出。配置由 `cosmiconfig("release")` 读取；默认插件是 `@semantic-release/commit-analyzer`、`@semantic-release/release-notes-generator`、`@semantic-release/npm`、`@semantic-release/github`。仓库根 `package.json` 自报 `0.0.0-development`，对外版本以 tag `v25.0.9` / npm 为准。

## 为什么重要

不读固定 25.0.9 的主机合同，下面这些事会对不上：

- 为什么本机直接跑常常“什么都没发布”——非 CI 且未设 `noCi` 时会被强制 dry-run
- 为什么 PR 流水线绿了也不会出新版本——CI 上的 pull request 直接 return
- 为什么第一次发版是 `1.0.0` 而不是 `0.1.0`
- 为什么报 `EGITNOPERMISSION` 时错误详情不该再带出 `GH_TOKEN`

## 核心要点

主机主链可以拆成六步：

1. **识别环境**：`env-ci` 判断 CI / PR。非 CI 强制 `dryRun`；CI 上的 PR 不发版。

2. **验权与分支**：`getGitAuthUrl` 可能把 token 写进 URL，但 `originalRepositoryURL` 会先存下来。当前分支必须落在默认（或配置的）branch 集合里，否则直接退出。

3. **找 lastRelease**：在当前 branch 的 tag 里按 semver 取最高正式版；prerelease 分支还要匹配 channel。

4. **analyzeCommits**：这是唯一 `required: true` 的插件步骤。主机会丢掉 `[skip release]` / `[release skip]` 的 commit，再从插件结果里取 `patch` / `minor` / `major` 的最高档。返回空则不发版。

5. **算版本并准备**：`getNextVersion` 对已有版本调用 `semver.inc`；没有上一版时用常量 `FIRST_RELEASE = "1.0.0"`。随后 `verifyRelease` → `generateNotes` → `prepare`。

6. **先 tag 再 publish**：非 dry-run 时先 `git tag`、写 git notes、push，**然后**才跑 `publish` 插件。部分插件依赖 tag 已经存在。

## 实践案例

### 案例 1：默认插件和默认分支

未写配置时，`get-config.js` 填入：

```js
plugins: [
  "@semantic-release/commit-analyzer",
  "@semantic-release/release-notes-generator",
  "@semantic-release/npm",
  "@semantic-release/github",
]
```

默认分支包括维护线模式 `+([0-9])?(.{+([0-9]),x}).x`、`master`、`main`、`next`、`next-major`，以及 `{ name: "beta"|"alpha", prerelease: true }`。`tagFormat` 默认是 `v${version}`。

本轮只读了主机仓库，没有固定审查 `commit-analyzer` 源码，因此不把 `feat:` / `fix:` / `BREAKING CHANGE` 的具体映射写成 25.0.9 主机合同。

### 案例 2：本机误跑不会出包

```js
if (!isCi && !options.dryRun && !options.noCi) {
  options.dryRun = true;
}
```

没有 CI 环境变量时，25.0.9 会自己改成 dry-run：跳过 tag / push / publish，只打印即将产生的 notes。想在本机真发版必须显式 `noCi`；这是安全默认，不是文档疏忽。

### 案例 3：权限错误不再回显带 token 的 URL

25.0.9 的 `EGITNOPERMISSION` 使用 `originalRepositoryURL || repositoryUrl`。`repositoryUrl` 在验权后可能已被 `getGitAuthUrl()` 改写成含 `GH_TOKEN` 的 basic-auth URL；抛给编程调用方的 `error.details` 必须用原始 URL。终端输出另有 `hideSensitive` hook，但 API 调用方看到的是未 hook 的 Error 对象。

## 踩过的坑

1. **把第一次发版想成 0.1.0**：常量是 `1.0.0`。
2. **在 PR 上跑 semantic-release 期待出包**：CI + `isPr` 时主机直接返回。
3. **以为 squash merge 后主机仍能看见每条原 commit**：主机读的是 merge 后的 git log；squash 会把多条 `feat`/`fix` 收成一条，分析器只能看到 squash 后的那一条。具体 conventional 规则不在本仓库。
4. **把 changelog / git commit 插件当成默认**：默认四件套不含 `@semantic-release/changelog` 或 `@semantic-release/git`。
5. **把 Node 18 当支持矩阵**：engines 是 `^22.14.0 || >= 24.10.0`。

## 适用 vs 不适用场景

**适用**：

- 单包（或每个包一条独立流水线），commit 规范可强制执行
- 希望 CI 在主干上无人值守打 tag、发 npm、开 GitHub Release
- 接受“没有相关 commit 就不发版”，以及 PR 流水线故意空转

**不适用**：

- 需要 reviewer 在 PR 里显式确认 bump 档——那是 [[changesets]] 的合同
- 多包 workspace 要一次算出 dependents 传播；25.0.9 主机按**当前仓库的一组 commit**出**一个** `nextRelease`
- 不能提供 git push 权限，或必须在非 CI 环境发正式包
- 需要本轮没有固定审查的 analyzer / npm / github 插件内部行为

## 固定版本边界

- 本文绑定 `semantic-release/semantic-release@8d905a56...`，即 tag `v25.0.9`；npm `gitHead` 与 tag 一致。
- 根 `package.json` 版本字段是 `0.0.0-development`；对外版本以 tag / registry 为准。
- 默认 `tagFormat` 为 `v${version}`；git notes ref 为 `semantic-release`。
- 本文未安装依赖、未跑上游测试、未调用 publish，状态保持 `UNVERIFIED`。

## 学到什么

1. **发版主机和分析插件是两层合同**——主机只保证步骤顺序、最高档合并和 skip 标记；conventional 映射在另一个包
2. **先 tag 再 publish** 让需要“tag 已存在”的插件成立，也意味着失败可能停在半发布状态
3. **非 CI dry-run / PR 不发版** 是写进主链的安全默认，不是 CI 模板的附加脚本
4. **错误字符串也是攻击面**：25.0.9 把已注入凭证的 URL 从 `EGITNOPERMISSION` 详情里拿掉

## 应用型自测

1. 本机没有 CI 环境变量，也没传 `noCi`，25.0.9 会不会创建 git tag？
2. 仓库从未打过版本 tag，`analyzeCommits` 返回 `minor`。下一版是 `0.1.0` 还是 `1.0.0`？
3. `EGITNOPERMISSION` 的 `details` 应该打印 `getGitAuthUrl()` 之后的 URL，还是配置里的原始 URL？

检查点：

1. 不会。非 CI 会被强制 `dryRun`，跳过 tag 创建。
2. `1.0.0`。没有 lastRelease 时用 `FIRST_RELEASE`，与本次 type 无关。
3. 原始 URL（`originalRepositoryURL`），避免把 token 写进抛给调用方的 Error。

## 延伸阅读

- 固定源码：[semantic-release/semantic-release](https://github.com/semantic-release/semantic-release) —— 本文绑定提交 `8d905a56e80030c141a71a32c0c4cb870e90470a`
- 主机文档：[semantic-release.gitbook.io](https://semantic-release.gitbook.io/semantic-release)
- [[changesets]] —— 对照：磁盘声明 + Version Packages PR，而不是 commit 推断
- [[lerna]] —— 更早的 monorepo 发版；不提供这套插件管道

## 关联

- [[changesets]] —— 同一问题的声明式一端；squash merge 不会毁掉磁盘上的 bump 档
- [[lerna]] —— 更早的 monorepo 发版；不提供这套插件管道

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
