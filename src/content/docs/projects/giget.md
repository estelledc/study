---
title: giget — 用 tarball 和注册表下载模板仓库
description: 默认走 registry 或 git-host tarball，只有 git provider 才 clone；无 ref 时解析为 main。
来源: https://github.com/unjs/giget
日期: 2026-08-27
分类: CLI
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/unjs/giget
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 34f8cb6455636fe3652427ef2769aff521ed07bb
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.3.1
---

## 是什么

giget 是一份 TypeScript 写的模板下载器：把「仓库 / 子目录 / 版本」解析成 tarball 地址，缓存后再解到本地目录。日常类比：它更像带目录的快递柜，而不是让你每次自己跑一趟 `git clone`——默认不依赖本机 git，只有显式走 `git:` provider 才会克隆。

你写：

```ts
import { downloadTemplate } from "giget"

const { dir } = await downloadTemplate("gh:unjs/template")
```

或 `npx giget@latest nuxt`。裸名字先查内置 registry；带 `gh:` / `github:` 才直连 GitHub tarball。固定 `3.3.1` 的源码 `package.json` 没有 runtime 依赖，CLI 与解包逻辑由构建打进 `dist`。

## 为什么重要

不理解 giget 的解析顺序，下面这些事会对不上：

- 为什么 `giget nuxt` 和 `giget gh:unjs/template` 不是同一条路
- 为什么没写 `#ref` 时它找的是 `main`，不是旧工具里的 `master`
- 为什么默认成功并不证明本机装了 git
- 为什么 README 里的 `--registry` 不能直接当成固定 CLI 合同

[[nuxt]] 脚手架、unjs 模板分发都建立在这条下载合同上。

## 核心要点

固定版本可以拆成四步：

1. **拆 provider**：输入匹配 `provider:rest`。`http`/`https` 保留整段 URL；`gh+git:` 这类后缀改走本地 `git` provider。没写前缀时，registry 未关闭就走 registry，否则才是 `github`。

2. **provider 只返回 TemplateInfo**：GitHub 拼 `api.github.com/repos/.../tarball/<ref>`；GitLab 拼 `/-/archive/<ref>.tar.gz`，子组用 `::` 分隔目录。`parseGitURI` 无 `#ref` 时默认 `main`。

3. **下载进缓存再解包**：tarball 落到 `~/.cache/giget`（`XDG_CACHE_HOME` 或 Windows 的 `tmpdir/giget`）。解包去掉第一层目录，再按 `subdir` / `ignore` 过滤。

4. **目标目录是硬边界**：非空目录且没有 `force` 会抛错；`forceClean` 先递归删。`install: true` 才动态加载 nypm 装依赖。

## 实践示例

### 案例 1：从 GitHub 拉指定分支

```ts
const { dir, source } = await downloadTemplate("gh:unjs/template#dev", {
  dir: "my-app",
})
```

`gh` 与 `github` 是同一 provider。`#dev` 进入 tarball URL 的 ref；`source` 是去掉 provider 后的归一化串。

### 案例 2：裸名字走 registry

```bash
npx giget@latest nuxt
```

固定仓库里 `templates/nuxt.json` 给出 `name` / `tar` / `defaultDir`。默认 registry 是 `https://raw.githubusercontent.com/unjs/giget/main/templates/<name>.json`。同目录还有 `h3`、`nitro`、`unjs`、`maizzle`、`stacks`。

### 案例 3：真要 git clone

```ts
await downloadTemplate("git:unjs/template/src", { auth: process.env.GIGET_AUTH })
```

`git` provider 才会 `clone --depth 1`；有子目录时加 `--sparse`。token 经 `GIT_CONFIG` 的 `http.extraHeader` 注入，不进 argv。`#commit` 浅克隆失败后回退全量 fetch 再 checkout。

## 踩过的坑

1. **把默认 provider 写成 GitHub**：没写前缀且 registry 开着时，先取 `<name>.json`，不是 `github.com/<name>`。
2. **把 README 的 `--registry` / `--no-registry` 当成固定 CLI**：`src/cli.ts` 没声明这两项；要用 `GIGET_REGISTRY` 或编程接口的 `registry`。
3. **以为 `--cwd` 已经生效**：CLI 定义了该参数，但调用 `downloadTemplate` 时没有传入 `cwd`。
4. **把「零依赖」写成产物保证**：源码包确实没有 runtime `dependencies`，最终体积仍取决于打包进 dist 的实现。
5. **ignore 写成随便一个 glob 就能用**：字符串模式要 `path.matchesGlob`（文档写明 Node `>=22.5.0` 或 `>=20.17.0`）；低版本只接受回调。

## 适用 vs 不适用场景

**适用**：

- 脚手架需要 HTTP tarball、磁盘缓存和可选装依赖
- 要同一套 URI 接到 GitHub / GitLab / Bitbucket / Sourcehut
- 能接受默认 ref 是 `main`，并用 registry 做短名

**不适用**：

- 必须保留完整 `.git` 历史做后续开发
- 调用方还活在「默认 `master` + callback」的旧脚手架栈
- 要把 README 的 CLI 旗标或未测 bundle 写成保证

## 固定版本边界

- 本文绑定 `unjs/giget@34f8cb64...`，包版本 `3.3.1`；annotated tag `v3.3.1` peel 到此提交，npm latest 同号且无 `gitHead`。
- 发布 exports 只有 `./dist/index.mjs`。README 的 CommonJS `require` 示例未在本轮核验。
- 本文未安装依赖、未下载模板、未跑 CLI / 上游测试，状态保持 `UNVERIFIED`。

## 学到什么

1. **短名和带协议的 URI 不是同一入口**——registry 与 git host provider 先要分开。
2. **默认下载不等于 git clone**——clone 是独立 provider，还负责 sparse 与 SHA 回退。
3. **README 不是 CLI 合同**——以 `src/cli.ts` 实际转发的字段为准。
4. **默认分支写进解析器**——这里是 `main`，不能拿 2019 年的 `master` 默认去套。

## 应用型自测

1. `downloadTemplate("unjs/template")` 在未关 registry 时，会直接请求 GitHub tarball 吗？
2. `gh:org/repo` 没写 `#ref`，tarball URL 里的 ref 是 `master` 还是 `main`？
3. CLI 的 `--cwd ./tmp` 在固定 3.3.1 里一定改变解包根目录吗？

检查点：

1. 不会。它先取 registry 的 `unjs/template.json`。
2. `main`。`parseGitURI` 无 hash 时默认 `main`。
3. 不一定。CLI 没有把 `cwd` 传给 `downloadTemplate`。

## 延伸阅读

- 文档：[github.com/unjs/giget](https://github.com/unjs/giget)
- 固定源码：[unjs/giget](https://github.com/unjs/giget) —— 本文绑定提交 `34f8cb6455636fe3652427ef2769aff521ed07bb`
- [[download-git-repo]] —— 默认 zip / `master` / callback 的对照路线
- [[nuxt]] —— 内置 registry 里的 `nuxt` 短名指向 starter tarball
- [[ofetch]] —— 同一 unjs 工具带里的 HTTP 客户端

## 关联

- [[download-git-repo]] —— 旧脚手架常用的 zip/clone 下载器
- [[nuxt]] —— 常见的 registry 短名消费者
- [[ofetch]] —— unjs HTTP 包装，下载模板不是它的职责
- [[vite]] —— 另一条 `create` 脚手架入口，底层不是 giget

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
