---
title: lint-staged — 只对暂存文件跑检查任务
description: 介绍 lint-staged 如何只对暂存文件派发任务，并在成功后把改动写回 index。
来源: https://github.com/lint-staged/lint-staged
日期: 2026-08-27
分类: 前端工程化
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/lint-staged/lint-staged
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: d15344350d914f5ce24df2c85f3ffebb9b387f3b
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 17.3.0
---

## 是什么

lint-staged 是一个“只处理当前暂存文件”的任务调度器。日常类比：安检只查已经放上传送带的行李，不会把整个候机楼翻一遍。

它不安装 Git hook。常见接法是让 [[husky]] 的 `.husky/pre-commit` 去调用它。固定 `17.3.0` 自己负责：列出暂存文件、找到配置、按 glob 派任务、必要时藏起未暂存改动、成功后把任务改动重新 `git add`。

```js
// lint-staged.config.js
export default {
  "*.js": "biome check --write",
}
```

包管理器要求 `node >= 22.22.1`。进程里还会读 `git version`，低于 `2.32.0` 直接抛错。

## 为什么重要

不读固定版本的文件列表和 GitWorkflow，很容易把旧行为当成现状：

- 为什么默认不把删除文件交给 linter（`--diff-filter=ACMR`）
- 为什么任务命令里再写 `git add` 会被警告
- 为什么半改半暂存的文件，未暂存那一半会先被藏起来
- 为什么 YAML 配置可能突然读不到：`yaml` 已改成 optionalDependency

一句话：lint-staged 的合同是“暂存快照上的任务”，不是“对整个工作区跑一次 CI”。

## 核心要点

固定 17.3.0 的主链是：

1. **取文件**：默认 `git diff --staged --diff-filter=ACMR --raw -z`。`160000`（submodule）和 `120000`（symlink）会被丢掉。仓库里有 `MERGE_HEAD` 时，只保留同时出现在 `HEAD` 与 `MERGE_HEAD` 的路径。

2. **找配置**：显式对象或 `--config` 只用一份；否则并行做 git ls-files 与从 cwd 向上的文件系统搜索。识别的文件名包括 `package.json` 的 `lint-staged` 字段、`.lintstagedrc*` 和 `lint-staged.config.*`。多个配置按目录最深优先，每个文件只进一份配置。

3. **派任务**：无 `/` 的 glob 打开 picomatch `matchBase`，所以 `*.js` 也会打到子目录。`../` 开头的 pattern 可以越过配置目录。函数配置会被收成 `{ "*": fn }`。嵌套数组表示串行组。

4. **GitWorkflow**：有初始 commit 且未使用 `--diff` 时默认建 backup stash。默认隐藏部分暂存文件的未暂存改动。任务跑完后对匹配文件做 `git add`。失败且允许 revert 时回到 backup。`--fail-on-changes` 则比较任务前后 `git diff --patch --unified=0` 的 SHA-256。

## 实践示例

### 案例 1：最小配置 + husky

```json
{
  "lint-staged": {
    "*.md": "biome check --write"
  }
}
```

```sh
# .husky/pre-commit
npx lint-staged
```

`*.md` 没有斜杠，会匹配任意目录下的 markdown。任务成功后，lint-staged 自己把改过的匹配文件加回 index，不必在命令末尾再写 `git add`。

### 案例 2：函数任务避免把文件名传给命令

```js
export default {
  "*.ts": () => "tsc --noEmit",
}
```

字符串命令会把匹配文件追加为参数。函数返回字符串时，固定实现按返回值生成命令，适合 `tsc --noEmit` 这种不能吃文件列表的工具。函数必须返回 string 或 string[]。

### 案例 3：覆盖文件集合

```bash
npx lint-staged --diff "main...HEAD" --diff-filter "ACMR"
```

`--diff` 替换默认 `--staged`，并默认关闭 stash（`stash = diff === undefined`）。这是对“比较范围”的覆盖，不是“再跑一遍全部 tracked 文件”。固定 17.3.0 没有 `--all`；那是 pin 之后 main 上尚未发布的提交。

## 踩过的坑

1. **继续在任务里写 `git add`**：v10 起就自动 stage 任务改动。固定代码看到标题里含 `git add` 会警告弃用。

2. **把无扩展名的 `.lintstagedrc` 当 JSON**：无扩展名走 YAML loader。`yaml` 现在是 optionalDependency，没装就会加载失败。JSON 应改用 `.lintstagedrc.json` 或 `package.json` 字段。

3. **以为删除文件也会被检查**：默认 filter 是 `ACMR`，不含 `D`。`updateIndex` 只会在状态曾是 `D` 且文件又重新出现时尝试加回。

4. **半暂存文件被任务改乱**：默认会先把未暂存那一半藏进 patch，任务后再恢复。`--hide-partially-staged=false` 等于让任务直接看见工作区混合物。

5. **用 `--diff` 还指望自动回滚**：`stash` 默认随 `--diff` 关闭；没有 backup 就不能按失败路径完整 revert。

6. **把 main 上的 `--all` / `defineConfig` 写成 17.3.0**：`origin/main` 在本 pin 之后仍自报 `17.3.0`，但这些 API 还不在本 revision。

## 适用 vs 不适用场景

**适用**：

- pre-commit 只想检查即将提交的文件
- 任务可能改文件，需要成功后自动写回 index
- monorepo 里多层 `lint-staged` 配置，希望文件按最近的配置分组

**不适用**：

- Node 低于 22.22.1，或 Git 低于 2.32.0
- 需要检查删除文件、submodule 或 symlink（默认列表已经排除）
- 需要 `--shell` 把整段命令交给 shell：该旗标在 v16 已删除
- 需要固定 17.3.0 尚未包含的 `--all` 或 `defineConfig`

## 固定版本边界

- 本文绑定 `lint-staged/lint-staged@d15344350d914f5ce24df2c85f3ffebb9b387f3b`，lightweight tag `v17.3.0` 与 npm `lint-staged@17.3.0` 的 `gitHead` 一致。
- 运行时依赖 `picomatch`、`string-argv`、`tinyexec`；`yaml` 可选。进程用 `tinyexec` 拉起任务，不是 v16 文档里的 `nano-spawn`。
- `origin/main` 已有未发布的 `--all`、`defineConfig` 与 backup-stash 查找修复；升级前应重新钉 revision。
- 本文未安装依赖、未跑 vitest / 集成测试、未执行真实 hook，状态保持 `UNVERIFIED`。

## 学到什么

1. **默认文件集合是产品决策**——`ACMR`、丢掉 submodule/symlink、merge 时取交集，都会改变“谁被检查”。
2. **自动 stage 是主路径**——成功后的 `git add` 在 `GitWorkflow.updateIndex`，不是用户命令的附件。
3. **stash 与 `--diff` 互斥**——覆盖 diff 时默认没有 backup；失败恢复不是永远可用。
4. **配置发现按目录切块**——最深配置先吃文件，剩余文件才留给更浅的配置；不是所有配置都看到全部暂存文件。

## 应用型自测

1. 暂存里只有一个被删除的 `src/old.js`，默认会把它传给 `*.js` 任务吗？
2. 使用 `--diff main...HEAD` 时，失败后还会默认用 backup stash 完整恢复吗？
3. 配置写成函数 `export default (files) => ({ '*.js': 'eslint' })` 还是 `export default { '*': fn }`？固定实现会先怎样规范化函数配置？

检查点：

1. 不会。默认 `--diff-filter=ACMR`，删除不在列表里。
2. 不会。`stash` 在传入 `diff` 时默认为 false。
3. 顶层函数配置会被收成 `{ "*": config }`，不再按原对象的 key 拆 glob。

## 延伸阅读

- 固定源码：[lint-staged/lint-staged](https://github.com/lint-staged/lint-staged) —— 本文绑定提交 `d15344350d914f5ce24df2c85f3ffebb9b387f3b`
- 主链：[lib/runAll.js](https://github.com/lint-staged/lint-staged/blob/d15344350d914f5ce24df2c85f3ffebb9b387f3b/lib/runAll.js)
- 迁移说明：[MIGRATION.md](https://github.com/lint-staged/lint-staged/blob/d15344350d914f5ce24df2c85f3ffebb9b387f3b/MIGRATION.md)
- [[husky]] —— 常见 hook 宿主；不负责暂存文件集合
- [[biome]] —— 可被 glob 任务调用的检查器

## 关联

- [[husky]] —— 把 `git commit` 接到 `npx lint-staged`
- [[biome]] —— 一体化检查器，适合作为 glob 命令
- [[vite]] —— 前端仓库常同时使用，但构建与 hook 任务是两条链
- [[webpack]] —— 旧前端工具链同样可以把 lint-staged 放进 pre-commit

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[husky]] —— Husky — 用 core.hooksPath 接上本地 Git 钩子

- [[husky]] —— Husky — 用 core.hooksPath 接上本地 Git 钩子
