# giget + download-git-repo source review (writer GD)

> 用途：记录 `giget` 与 `download-git-repo` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-gd` 标记 2026-08-27 平行 writer GD，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- evidence：npm metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未下载远端 tarball / zip，未运行上游 test、CLI、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`（gitignored），不进入 Git
- slugs：`giget`、`download-git-repo` 为本轮新增项目页，不是既有笔记改写

## giget

- canonical source：`https://github.com/unjs/giget`
- tag：`v3.3.1`（annotated tag `e7c7108c8dde7d264240014e1aa903b7c5e03895` peel 到提交）
- revision：`34f8cb6455636fe3652427ef2769aff521ed07bb`
- package：`giget@3.3.1`（MIT），npm latest 同号，未暴露 `gitHead`
- inspected：
  - `package.json`
  - `README.md`
  - `src/index.ts`
  - `src/giget.ts`
  - `src/cli.ts`
  - `src/providers.ts`
  - `src/git.ts`
  - `src/registry.ts`
  - `src/types.ts`
  - `src/_utils.ts`
  - `templates/nuxt.json`
  - `test/providers.test.ts`
- observed：
  - 发布物 `type: module`，`exports["."]` 只指向 `./dist/index.mjs`；源码 `package.json` 无 runtime `dependencies`，CLI / 下载 / 解包依赖由构建打进 dist；
  - `downloadTemplate` 在未写 `provider:` 前缀时，默认走 registry（可用 `registry: false` 或无 registry 时退回 `github`）；
  - `parseGitURI` 无 `#ref` 时默认 `main`；GitLab 走 `expandRepo`，子目录用 `::`；
  - 内置 provider：`http`/`https`、`git`、`github`/`gh`、`gitlab`、`bitbucket`、`sourcehut`；`host+git:` 改走本地 git clone；
  - 默认下载 HTTP tarball 到 `~/.cache/giget`（`XDG_CACHE_HOME` 或 Windows `tmpdir/giget`）；`git` provider 才 `clone --depth 1`，子目录用 sparse checkout，commit SHA 浅克隆失败后回退全量 fetch；
  - 解包去掉 tarball 第一层目录，再按 `subdir` / `ignore` 过滤；非空目标目录无 `force` 会抛错；`forceClean` 先 `rm`；
  - 固定 CLI（`src/cli.ts`）未把 `--cwd` 传进 `downloadTemplate`，也未声明 README 写的 `--registry` / `--no-registry`；registry 仍可由 `GIGET_REGISTRY` 与编程接口控制。

## download-git-repo

- canonical source：`https://gitlab.com/flippidippi/download-git-repo`
- revision：`23e8c09b4a19aaf9c9b3e265d41b924143daf707`（GitLab `master` / `HEAD`，与 npm `download-git-repo@3.0.2` `gitHead` 一致）
- package：`download-git-repo@3.0.2`（MIT），npm latest 同号
- also observed：`https://github.com/flipxfx/download-git-repo` 在本轮不可达；仓库无 git tag
- inspected：
  - `package.json`
  - `README.md`
  - `index.js`
  - `test/index.js`
- observed：
  - 单一 CJS 导出 `download(repo, dest, opts, fn)`；`opts` 可省略；
  - 默认 type 是 `github`，默认 checkout 是 `master`；
  - 默认走 HTTP zip（`extract: true`、`strip: 1`、`accept: application/zip`）；`opts.clone === true` 才调用 `git-clone`，且只在 `checkout === 'master'` 时 `shallow: true`，成功后 `rimraf` 掉 `dest/.git`；
  - shorthand：`[type:][origin:]owner/name[#checkout]` 或 `direct:url[#checkout]`；
  - 依赖 `download@^7.1.0`、`git-clone@^0.1.0`、`rimraf@^3.0.0`；
  - 测试覆盖 github / gitlab / bitbucket 的 download 与 clone，以及 direct zip / clone / filter。
