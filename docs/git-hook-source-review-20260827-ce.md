# Git hook pair source review

> 用途：记录 husky、lint-staged 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL CE
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、真实 hook、`git commit` 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- pair：首选 husky + lint-staged；两者 canonical 仓库均小、tag/package/`gitHead` 一致，未触发 fallback

## husky

- canonical source：`https://github.com/typicode/husky`
- revision：`799e84b716d0e03db80db5d5b0dcdd15b9d555fc`
- package：`husky@9.1.7`
- tag：annotated `v9.1.7`（tag object `447a780a7f654865f9c8b2b45a0ffd3074445b82`，peeled 到上述 revision）
- npm `gitHead`：与 tag peel / `package.json` version 一致
- engines：`node >= 18`
- inspected：
  - `package.json`
  - `index.js`
  - `bin.js`
  - `husky`（runtime shim，安装后复制为 `.husky/_/h`）
  - `index.d.ts`
  - `test/1_default.sh`
  - `test/9_husky_0.sh`
  - `test/12_deprecated.sh`
  - `docs/get-started.md`
- observed：
  - 默认导出把 `core.hooksPath` 设为 `<dir>/_`（默认 `.husky/_`），并写入 14 个客户端 hook 入口，每个入口只 source 同目录的 `h`；
  - 用户脚本位于 `<dir>/<hook-name>`；shim 找不到该文件时以 0 退出，不阻止 Git；
  - `HUSKY=0` 在 install 与 runtime 都会跳过；`HUSKY=2` 打开 shim `set -x`；
  - `husky init` 写入 `package.json` 的 `prepare: husky`，并创建 `.husky/pre-commit`，内容为当前 npm user agent 前缀加 ` test`；
  - `add` / `set` / `uninstall` 已弃用并 `exit 1`；`install` 打印弃用但仍走默认安装；
  - 旧的 `#!/usr/bin/env sh` + `. "$(dirname -- "$0")/_/husky.sh"` 两行在固定版本只打印将在 v10 失败的警告，测试仍允许 commit 成功。
- main vs pin：
  - `origin/main` 在 2026-03 仍自报 `9.1.7`，`index.js` / `husky` shim 与 pin 相同；
  - pin 之后的提交是文档、赞助与 CI Node 矩阵，不改变本页绑定的安装/运行合同。

## lint-staged

- canonical source：`https://github.com/lint-staged/lint-staged`
- revision：`d15344350d914f5ce24df2c85f3ffebb9b387f3b`
- package：`lint-staged@17.3.0`
- tag：lightweight `v17.3.0` 直接指向上述 revision
- npm `gitHead`：与 tag / `package.json` version 一致
- engines：`node >= 22.22.1`；运行时要求 Git `>= 2.32.0`
- inspected：
  - `package.json`
  - `MIGRATION.md`
  - `lib/index.js`
  - `lib/runAll.js`
  - `lib/gitWorkflow.js`
  - `lib/getStagedFiles.js`
  - `lib/getDiffCommand.js`
  - `lib/searchConfigs.js`
  - `lib/loadConfig.js`
  - `lib/validateConfig.js`
  - `lib/configFiles.js`
  - `lib/groupFilesByConfig.js`
  - `lib/generateTasks.js`
  - `lib/matchFiles.js`
  - `lib/getSpawnedTasks.js`
  - `lib/validateOptions.js`
  - `lib/assertGitVersion.js`
  - `lib/state.js`
  - `lib/cli.js`
- observed：
  - 入口先校验 Git 版本，再 `runAll`：解析仓库、并行取暂存文件与配置、按配置分组、`GitWorkflow.prepare`、跑任务、`updateIndex`、按错误恢复或清理；
  - 默认文件列表是 `git diff --staged --diff-filter=ACMR --raw -z`，排除 submodule（`160000`）与 symlink（`120000`）；存在 `MERGE_HEAD` 时只保留同时出现在 `HEAD` 与 `MERGE_HEAD` 的路径；
  - 配置可来自显式对象/路径，或 git ls-files + 从 cwd 向上的文件系统搜索；多个配置按最深目录优先，文件只归属一份配置；
  - 默认备份 stash（`--diff` 或无初始 commit 时关闭）；默认隐藏部分暂存文件的未暂存改动；任务成功后对匹配文件执行 `git add`，命令里再写 `git add` 会被警告为弃用；
  - `--fail-on-changes` 比较任务前后 `git diff --patch --unified=0` 的 SHA-256；`yaml` 是 optionalDependency，无扩展名的 `.lintstagedrc` 按 YAML 加载。
- main vs pin：
  - `origin/main` 在 17.3.0 之后仍自报 `17.3.0`，但已出现未发布的 `--all`、`defineConfig` 与 backup-stash 查找修复；
  - 本页不把这些后续提交写成 17.3.0 合同。
