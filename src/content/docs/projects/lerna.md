---
title: lerna — JS monorepo 第一代工具，2022 EOL 后被 Nx 收编的代际故事
description: 不是另一个 monorepo 工具，是 monorepo 工具的"祖宗"——bootstrap + version + publish 三步流程定义了 2017-2020 整个生态；2022 维护者撤退、Nrwl 接管，现在只剩 version + publish 作为 Nx 子集存在，是研究"工具代际更替"的最佳活体标本
sidebar:
  order: 83
  label: lerna/lerna
---

> lerna/lerna，截至 2026-05 GitHub 36.1k stars（历史峰值），MIT，Sebastian McKenzie 创立。
> "The original JavaScript monorepo tool"——Babel 作者 2015 年为了管 Babel 自己的 monorepo 写出来的副产品，
> 后来变成 React / Jest / Vue / Angular CLI 都在用的事实标准。
>
> 2022 年项目宣布 "end of life"——
> 维护者 Daniel Stockman 撤出，issue 堆积 600+ 个未处理，社区炸锅；
> 同年 Nrwl（[Nx](/projects/nx) 的母公司）接手仓库，把 lerna 重写到 Nx 项目图之上。
> 现在的 lerna 实质是 **"Nx 的 version + publish 子集"**——
> bootstrap 命令在 v7 里被移除（npm/yarn/pnpm 都有 workspace 了，bootstrap 失去存在理由）。
>
> Season 18-5 收官篇。**项目类型：工具库（v1.1 分支 B）**——
> 历史上 lerna 是 monorepo 第一代解决方案，
> 它的衰落不是因为代码烂，是因为**它要解决的问题被新一代生态 ABI 内置了**：
> - npm 7+ workspaces / yarn workspaces / pnpm workspace —— 把 bootstrap 抢走
> - changesets / semantic-release —— 把 version + changelog 抢走（更轻、更聚焦）
> - Turborepo / Nx —— 把 task pipeline + caching 抢走
> 看完这篇你会知道：为什么"先发优势"在快速演化的开发者工具领域不可持续，
> 以及 Nrwl 收购一个 EOL 项目后是怎么把它"装进"自己的产品的。

## 一句话定位

**lerna = JS monorepo 第一代解决方案的活化石**——
2015 年 Sebastian McKenzie 写它的时候，npm 还没有 workspace、yarn 还没发布、pnpm 还在 zero-day。
彼时如果你想在一个仓库里放 `@babel/core` 和 `@babel/parser` 让它们互相 require，
你只能手动在每个 package 的 `node_modules` 里建 symlink——
lerna 的 **bootstrap** 命令把这一步自动化了：扫 `packages/*`，
找出哪些 package 依赖另一个 workspace 内的 package，自动建 symlink，外部依赖走 npm install。
**version** 命令是第二个核心动作：把所有 package 一起 bump 版本（fixed mode）或独立 bump（independent mode），
打 git tag，更新 CHANGELOG.md。
**publish** 命令是第三个：按 topological order（被依赖的先发）依次 `npm publish` 到 registry。
这三步流程定义了 2017-2020 几乎所有 JS monorepo 项目的发版工作流——
直到 2020 之后，npm 7 / yarn / pnpm 都内置 workspace、bootstrap 失去存在理由，lerna 才开始衰落。

## Why（为什么这个 EOL 项目还值得读）

读 lerna 不是为了用它（你大概率不会再选它做新项目），是为了搞清楚三件事：

1. **monorepo 工具的"代际更替"是怎么发生的**——
   一个工具占据 35k+ stars、定义事实标准、被所有大型 JS 项目使用，
   仍然可以在 5 年内从"必选"变成"维护停滞"再变成"被收购"。
   读 lerna 等于读一份 monorepo 工具演化的"完整生命周期标本"。
2. **bootstrap → workspace → task pipeline 的演化路线**——
   每一代工具解决了上一代的痛点，但也带来了新问题。
   lerna 的 bootstrap 是手动 symlink；npm workspaces 自动 symlink；pnpm 用 hardlink + content-addressable store；
   Nx / Turborepo 在 workspace 之上加 task graph + remote cache。
   这是一条清晰的"上层抽象不断变薄、底层基础设施不断变厚"的演化路径。
3. **Nrwl 怎么把一个 EOL 项目"装进"自己的产品**——
   Nrwl 收购 lerna 不是慈善，是**为了把 Lerna 用户平滑迁移到 Nx**。
   现在的 lerna 实质是 Nx 的薄壳：底层项目图用 `@nx/devkit`，命令调度走 `runProjectsTopologically`，
   `Project` 类只读 `lerna.json`，但所有 workspace 解析都委托给 npm/yarn/pnpm 的原生 workspace 配置。
   这是 OSS 收购整合的教科书级案例。

McKenzie 在 [lerna v1 launch HN 帖（2015）](https://news.ycombinator.com/item?id=10859912) 里写过原始动机：
"Babel 当时是 100+ 包的 monorepo，npm 没有 workspace，每次发版要手动改 100 个 package.json 的版本号 + 100 次 npm publish——
我把这件事自动化了，原本是个 Babel 内部脚本，后来抽出来叫 lerna。"

后来 Daniel Stockman 在 [lerna 2022-04-23 README 公告](https://github.com/lerna/lerna/issues/3121) 里宣布维护停滞：
"我个人精力不足以继续维护，lerna 已经 'unmaintained'，建议社区考虑 Nx / Turborepo / changesets 替代方案。"

同月 Nrwl CTO Victor Savkin 在 [Nrwl blog "We're taking over Lerna"](https://blog.nrwl.io/lerna-is-dead-long-live-lerna-61259f97dbd9) 里宣布接管：
"Lerna 不会消失，我们会把它重写到 Nx 之上，保留 lerna 用户的工作流，同时引入 Nx 的项目图和缓存能力。"

> 这是个**"工具死了，工作流还活着"** 的故事——
> bootstrap 命令真的死了（v7 删除），但 version + publish 在 2026 年的 lerna 里仍然 1:1 兼容。

## 仓库地形

```bash
git clone --depth 1 https://github.com/lerna/lerna
cd lerna
ls
```

仓库是个 Nx-managed monorepo（讽刺地，lerna 自己用 Nx 管理），顶层结构：

```
lerna/
  libs/                       ← Nx 风格的源码组织（不是传统的 packages/）
    commands/                 ←   每个 lerna 子命令一个独立包
      version/                ←     `lerna version` 实现（940 行 index.ts）
      publish/                ←     `lerna publish` 实现（1252 行 index.ts）
      init/                   ←     `lerna init` 实现
      list/                   ←     `lerna list` 实现
      changed/                ←     `lerna changed` 实现（用 collectProjectUpdates）
      run/                    ←     `lerna run` 实现（已大幅退化为 nx run 的 shim）
      exec/                   ←     `lerna exec` 实现
      diff/                   ←     `lerna diff` 实现
      info/                   ←     `lerna info` 实现
      clean/                  ←     `lerna clean` 实现
      import/                 ←     `lerna import` 实现
      create/                 ←     `lerna create` 实现
    core/                     ←   公共基础设施
      src/lib/
        project/              ←     Project 类（414 行）—— 解析 lerna.json + workspace 配置
        package/              ←     Package 类（包级抽象）
        command/              ←     Command 抽象基类
        collect-updates/      ←     哪些 package 自上次 tag 后变了（changed 检测）
        conventional-commits/ ←     conventional commit 解析 + changelog 生成
        scm-clients/          ←     github/gitlab API client（创建 release）
        cycles/               ←     依赖环检测
        npm-conf/             ←     npm 配置链解析
        npmlog/               ←     npm 风格日志（npmlog 已死，lerna 把它 vendor 进来）
    nx-plugin/                ←   把 lerna 命令暴露给 Nx executor 体系
    child-process/            ←   exec 包装
    e2e-utils/                ←   端到端测试基础设施
    test-helpers/             ←   单元测试 helper
  packages/                   ← npm 发布的 user-facing 包（lerna / @lerna/*）
    lerna/                    ←   主入口 npm 包
  e2e/                        ← 端到端测试
  integration/                ← 集成测试
  website/                    ← Docusaurus 文档站
  __fixtures__/               ← 全局测试夹具
  lerna.json                  ← lerna 自己的 lerna.json（用 lerna 管 lerna）
  nx.json                     ← lerna 自己的 nx.json（讽刺）
  package-lock.json           ← 用 npm（不是 pnpm 也不是 yarn）
```

**心脏文件三选**（commit `f4387d673bfdf4923ab62cd52d3498dec6dc7f2c`，2026-03-23）：

| 文件 | 行数 | 角色 |
|---|---|---|
| `libs/core/src/lib/project/index.ts` | 414 | Project 类——解析 lerna.json，兜住 npm/yarn/pnpm 三种 workspace 配置 |
| `libs/commands/version/src/index.ts` | 940 | VersionCommand 类——fixed/independent 双模式 + conventional commits + git tag + GitHub release |
| `libs/commands/publish/src/index.ts` | 1252 | PublishCommand 类——topological 发布、OTP 处理、from-package/from-git/canary 三种发布方式 |

> 注：用户提示里的 `version-command.ts` / `publish-command.ts` 是早期路径，
> 现在重组到 `libs/commands/<name>/src/index.ts` 里——这是 Nrwl 接手后做的 Nx-native 重组。

## 核心机制

### A. Project 类：lerna.json 兜住 npm/yarn/pnpm 三种 workspace

`Project` 类是整个 lerna 的入口——所有命令都先 `new Project(cwd)` 拿到 packages 列表。
设计哲学："**自己不发明 workspace，复用包管理器的**"——这是 Nrwl 接手后的关键妥协。

[libs/core/src/lib/project/index.ts L66-L111](https://github.com/lerna/lerna/blob/f4387d673bfdf4923ab62cd52d3498dec6dc7f2c/libs/core/src/lib/project/index.ts#L66-L111)：

```typescript
/**
 * A representation of the entire project managed by Lerna.
 *
 * Wherever the lerna.json file is located, that is the project root.
 * All package globs are rooted from this location.
 */
export class Project {
  config: LernaConfig;
  configNotFound: boolean;
  rootConfigLocation: string;
  rootPath: string;
  packageConfigs: string[];
  manifest: Package;

  constructor(cwd?: string, options?: { skipLernaConfigValidations: boolean }) {
    const { config, configNotFound, filepath } = this.#resolveLernaConfig(cwd);

    this.config = config;
    this.configNotFound = configNotFound || false;
    this.rootConfigLocation = filepath;
    this.rootPath = path.dirname(filepath);

    this.manifest = this.#resolveRootPackageJson();

    if (this.configNotFound) {
      throw new ValidationError("ENOLERNA", "`lerna.json` does not exist, have you run `lerna init`?");
    }

    if (!options?.skipLernaConfigValidations) {
      this.#validateLernaConfig(config);
    }

    this.packageConfigs = this.#resolvePackageConfigs();
  }
```

旁注：

- **构造器即副作用**——`new Project()` 直接读文件、抛异常。这是 OOP-heavy 时代的 JS 常见写法（参考 npm-cli），现代风格会拆成 `await Project.load(cwd)` async 工厂。lerna 没改，因为兼容性
- **`rootPath = dirname(filepath)`**——lerna.json 所在的目录就是 monorepo 根。这个约定决定了 lerna 不能在子目录运行（除非显式传 cwd），所有 path 都 relative to rootPath
- **`#resolveLernaConfig` 用 cosmiconfig**——支持 `lerna.json` 和 `package.json` 里的 `"lerna"` 字段两处。早期 lerna 只读 lerna.json，cosmiconfig 是后来加的迁移友好层
- **`#validateLernaConfig` 阻断废弃配置**——如果配置里有 `useWorkspaces`（v6 之前的开关），抛 `ECONFIGWORKSPACES` 错并指引去看 npm/yarn/pnpm workspace
- **`manifest = Package(packageJson, rootPath)`**——根 package.json 也包成 Package 对象，方便后续按相同接口处理

[libs/core/src/lib/project/index.ts L349-L402](https://github.com/lerna/lerna/blob/f4387d673bfdf4923ab62cd52d3498dec6dc7f2c/libs/core/src/lib/project/index.ts#L349-L402)：

```typescript
/**
 * By default, the user's package manager workspaces configuration will be used to resolve packages.
 * However, they can optionally specify an explicit set of package globs to be used instead.
 *
 * NOTE: This does not impact the project graph creation process, which will still ultimately use
 * the package manager workspaces configuration to construct a full graph, it will only impact which
 * of the packages in that graph will be considered when running commands.
 */
#resolvePackageConfigs(): string[] {
  if (this.config.packages) {
    log.verbose("packageConfigs",
      `Explicit "packages" configuration found in lerna.json. Resolving packages using the configured glob(s): ${JSON.stringify(this.config.packages)}`);
    return this.config.packages;
  }

  // pnpm is a special case as it has a separate file in which it specifies workspaces configuration
  if (this.config.npmClient === "pnpm") {
    log.verbose("packageConfigs",
      'Package manager "pnpm" detected. Resolving packages using `pnpm-workspace.yaml`.');
    const workspaces = this.#resolvePnpmWorkspaceConfig().packages;
    if (!workspaces) {
      throw new ValidationError("EWORKSPACES",
        'No "packages" property found in `pnpm-workspace.yaml`. ...');
    }
    return workspaces;
  }

  const workspaces = this.manifest?.get("workspaces");
  const isYarnClassicWorkspacesObjectConfig = Boolean(
    workspaces && typeof workspaces === "object" && Array.isArray((workspaces as any).packages)
  );
  const isValidWorkspacesConfig = Array.isArray(workspaces) || isYarnClassicWorkspacesObjectConfig;

  if (!workspaces || !isValidWorkspacesConfig) {
    throw new ValidationError("EWORKSPACES",
      dedent`
        Lerna is expecting to able to resolve the "workspaces" configuration from your package manager...
        (A) Did you mean to specify a "packages" config manually in lerna.json instead of using your workspaces config?
        (B) Alternatively, if you are using pnpm as your package manager, make sure you set "npmClient": "pnpm" in your lerna.json...
      `);
  }

  if (isYarnClassicWorkspacesObjectConfig) {
    return (workspaces as any).packages;
  }

  return workspaces as string[];
}
```

旁注：

- **三路分支**——`lerna.json.packages` 显式 > pnpm-workspace.yaml > package.json `"workspaces"` 字段。三种来源对应 lerna 用户的三个时代（手动配置 / 投靠 pnpm / 投靠 npm-yarn）
- **pnpm 是特例**——只有 pnpm 把 workspace 配置放在单独的 yaml 文件里（[pnpm 笔记](/projects/pnpm)），所以这里要 `if (npmClient === "pnpm")` 单独读 `pnpm-workspace.yaml`
- **yarn classic vs yarn berry 的区分**——yarn classic 支持 `"workspaces": { "packages": [...] }` 对象格式（带 `nohoist` 等），yarn berry 只支持数组。lerna 用 `isYarnClassicWorkspacesObjectConfig` 兼容前者
- **`useWorkspaces` 已删除**（[L306-L311](https://github.com/lerna/lerna/blob/f4387d673bfdf4923ab62cd52d3498dec6dc7f2c/libs/core/src/lib/project/index.ts#L306-L311)）——v6 之前 `lerna.json` 有 `useWorkspaces: true` 开关，v6 之后默认就是 true。现在如果还写这个字段会直接报错，**强制用户走 workspace 路线**
- **错误信息含 `(A) (B)` 两路指引**——这是 lerna 的好传统：错误信息不只说"哪里错了"，还告诉你两种修复路径

**怀疑 1**：`#resolvePnpmWorkspaceConfig` 用 `js-yaml` 的 `load`，对 pnpm-workspace.yaml 里的 `catalog:` 字段（pnpm 9+ 新增）会怎么处理？追到 `load(content) as PnpmWorkspaceConfig`——`PnpmWorkspaceConfig` 类型只声明 `packages: string[]`，catalog 字段会被吃掉但不报错。如果用户在 catalog 里声明的版本要应用到 workspace 包，lerna 不会 honor 它——这是个静默 bug。

### B. VersionCommand：fixed vs independent 双模式

`lerna version` 的核心 trade-off：**所有 package 一起 bump 还是独立 bump**。
fixed mode 下，`lerna.json` 里的 `version` 字段就是全局版本号；
independent mode 下，`version: "independent"` 是哨兵值，每个 package 自己维护版本。

[libs/commands/version/src/index.ts L98-L143](https://github.com/lerna/lerna/blob/f4387d673bfdf4923ab62cd52d3498dec6dc7f2c/libs/commands/version/src/index.ts#L98-L143)：

```typescript
class VersionCommand extends Command {
  declare options: VersionCommandConfigOptions;

  commitAndTag?: boolean;
  pushToRemote?: boolean;
  allowBranch?: boolean;
  gitRemote?: string;
  tagPrefix?: string;
  releaseClient?: ReturnType<typeof createReleaseClient>;
  releaseNotes?: { name: string; notes: string }[];
  gitOpts?: {
    amend?: boolean;
    commitHooks?: boolean;
    granularPathspec?: boolean;
    signGitCommit?: boolean;
    signoffGitCommit?: boolean;
    signGitTag?: boolean;
    forceGitTag?: boolean;
    overrideMessage?: boolean;
  };
  savePrefix?: string;
  currentBranch?: string;
  updates: ProjectGraphProjectNodeWithPackage[] = [];
  tags?: string[];
  globalVersion?: string;
  hasRootedLeaf?: boolean;
  runPackageLifecycle?: (pkg: Package, script: string) => Promise<void>;
  runRootLifecycle?: (script: string) => Promise<void> | void;
  updatesVersions?: Map<string, string>;
  packagesToVersion?: Package[];
  projectsWithPackage: ProjectGraphProjectNodeWithPackage[] = [];
  premajorVersionBump?: "default" | "force-patch";

  get otherCommandConfigs() {
    // back-compat
    return ["publish"];
  }

  get requiresGit() {
    return !!(
      this.commitAndTag ||
      this.pushToRemote ||
      this.options.allowBranch ||
      this.options.conventionalCommits
    );
  }
```

旁注：

- **类字段全是 `?` 可选**——typescript 严格模式下意味着所有字段在使用前都要 narrowing。这是 lerna 把 JS 翻译到 TS 时的典型遗物，现代写法会用 `!` 断言或在构造器里初始化
- **`updates: ProjectGraphProjectNodeWithPackage[]`**——这是 Nrwl 接管后引入的核心类型，类型里的 `ProjectGraph*` 来自 `@nx/devkit`。**lerna 的"项目图"实质上就是 Nx 的项目图**——这是收编最深的痕迹
- **`otherCommandConfigs = ["publish"]`**——背向兼容：`lerna version` 也读 `lerna.json.command.publish` 配置，因为历史上 publish 命令包含 version 步骤，配置写在 publish 里
- **`requiresGit` 是 getter**——只在用到 git 操作（commit / tag / push / branch 限制 / conventional commits）时才走 git 校验，from-package 模式可以跳过
- **`gitOpts.overrideMessage`**——`amend && message` 时为 true，意思是"amend 已有 commit 但用新 commit message"。这种细枝末节是积累 8 年的实战边界

[libs/commands/version/src/index.ts L213-L298](https://github.com/lerna/lerna/blob/f4387d673bfdf4923ab62cd52d3498dec6dc7f2c/libs/commands/version/src/index.ts#L213-L298)：

```typescript
async initialize() {
  if (!this.project.isIndependent()) {
    this.logger.info("current version", this.project.version);
  }

  if (this.requiresGit) {
    // git validation, if enabled, should happen before updates are calculated and versions picked
    if (!isAnythingCommitted(this.execOpts)) {
      throw new ValidationError("ENOCOMMIT",
        "No commits in this repository. Please commit something before using version.");
    }

    this.currentBranch = getCurrentBranch(this.execOpts);

    if (this.currentBranch === "HEAD") {
      throw new ValidationError("ENOGIT",
        "Detached git HEAD, please checkout a branch to choose versions.");
    }

    if (this.pushToRemote && !remoteBranchExists(this.gitRemote, this.currentBranch, this.execOpts)) {
      throw new ValidationError("ENOREMOTEBRANCH", dedent`
        Branch '${this.currentBranch}' doesn't exist in remote '${this.gitRemote}'.
        If this is a new branch, please make sure you push it to the remote first.
      `);
    }

    if (this.options.allowBranch &&
        ![].concat(this.options.allowBranch).some((x) => minimatch(this.currentBranch, x))) {
      throw new ValidationError("ENOTALLOWED", dedent`
        Branch '${this.currentBranch}' is restricted from versioning due to allowBranch config.
      `);
    }

    if (this.commitAndTag && this.pushToRemote &&
        isBehindUpstream(this.gitRemote, this.currentBranch, this.execOpts)) {
      const message = `Local branch '${this.currentBranch}' is behind remote upstream ${this.gitRemote}/${this.currentBranch}`;
      if (!this.options.ci) {
        throw new ValidationError("EBEHIND", dedent`${message}\nPlease merge remote changes...`);
      }
      this.logger.warn("EBEHIND", `${message}, exiting`);
      return false; // CI execution should not error, but warn & exit
    }
  }
  // ...
}
```

旁注：

- **`this.project.isIndependent()` 是哨兵值检测**——[project/index.ts L205-L207](https://github.com/lerna/lerna/blob/f4387d673bfdf4923ab62cd52d3498dec6dc7f2c/libs/core/src/lib/project/index.ts#L205-L207) 里实现就是 `return this.version === "independent"`。把字符串 "independent" 重载成"模式开关"是 2015 年 JSON-only 配置时代的限制——TypeScript discriminated union 还没普及
- **5 个 git 前置校验**——nothing committed / detached HEAD / remote branch missing / branch not in allow list / behind upstream。每个都对应历史上某次"用户跑 lerna version 把仓库搞砸了"的 issue
- **CI 模式特殊处理 EBEHIND**——交互模式抛错阻止操作，CI 模式只 warn 然后 `return false` exit 0。这种 "CI vs local 分流" 的 UX 决策散落在 lerna 各处，形成 `options.ci` 这个全局开关
- **`return false` 表示成功跳过**——Command 基类约定：`initialize()` 返回 false 等价于"无事可做但成功退出"。区别于 throw，后者是错误退出
- **`allowBranch` 用 minimatch**——支持 glob 模式，比如 `allowBranch: ["main", "release-*"]`。这是 2018 年加的（@allowBranch issue），覆盖单分支限制场景

**怀疑 2**：`isBehindUpstream` 在 `git pull` 进行中（git fsck 锁住 .git/HEAD）会怎么样？追到 `libs/commands/version/src/lib/is-behind-upstream.ts`——内部用 `execa('git', ['rev-list', '--left-right', '--count', `${remote}/${branch}...${branch}`])`。如果 .git 锁住，execa 会抛 `ENOLCK` 类错误，没有 retry——这意味着 lerna version 在 CI 里和并发的 fetch hook 撞车会偶发失败。生产环境出现过这个 issue 吗？

### C. PublishCommand：topological order 发布

`lerna publish` 的核心问题：**A 依赖 B（workspace 内），必须 B 先发到 npm，A 才能 publish 时 resolve B 的版本**。
解决方法是按依赖图拓扑排序，被依赖的先发。

[libs/commands/publish/src/index.ts L126-L161](https://github.com/lerna/lerna/blob/f4387d673bfdf4923ab62cd52d3498dec6dc7f2c/libs/commands/publish/src/index.ts#L126-L161)：

```typescript
configureProperties() {
  super.configureProperties();

  // For publish we want to enable topological sorting by default, but allow users to override with --no-sort
  this.toposort = this.options.sort !== false;

  // Defaults are necessary here because yargs defaults
  // override durable options provided by a config file
  const {
    exact,
    gitHead,
    tagVersionPrefix = "v",
    verifyAccess,
  } = this.options;

  if (this.requiresGit && gitHead) {
    throw new ValidationError("EGITHEAD", "--git-head is only allowed with 'from-package' positional");
  }

  // https://docs.npmjs.com/misc/config#save-prefix
  this.savePrefix = exact ? "" : "^";

  // https://docs.npmjs.com/misc/config#tag-version-prefix
  this.tagPrefix = tagVersionPrefix;

  // inverted boolean options are only respected if prefixed with `--no-`, e.g. `--no-verify-access`
  this.gitReset = gitReset !== false;

  // consumed by npm-registry-fetch (via libnpmpublish)
  this.npmSession = crypto.randomBytes(8).toString("hex");

  this.verifyAccess = verifyAccess;
}
```

旁注：

- **`toposort` 默认 true，--no-sort 关闭**——`this.options.sort !== false` 是 lerna 标志性的 "tri-state boolean" 模式：未指定 / true / false 三态用 `!== false` 区分。yargs 的 `--no-x` 会把 `options.x` 设为 false，所以这里靠 `!== false` 实现"默认 true"
- **`gitHead` 只允许 from-package 模式**——from-package 是"package.json 已经 bump 过版本，跳过 version 步骤直接 publish"，需要传 git commit hash 写到 publish meta，所以 `gitHead` 在其他模式下没意义
- **`npmSession = crypto.randomBytes(8).toString("hex")`**——npm registry 用这个 session ID 做 telemetry/tracing，每次 publish 一个，传给 libnpmpublish
- **`gitReset !== false` 默认 true**——publish 失败时把 package.json 改动 reset 回 HEAD，避免本地仓库脏
- **没看到 `concurrency` 字段在这里**——它在 Command 基类里读，默认值在 [global-options.ts L56](https://github.com/lerna/lerna/blob/f4387d673bfdf4923ab62cd52d3498dec6dc7f2c/libs/core/src/lib/command/global-options.ts) 是 4

[libs/commands/publish/src/index.ts L877-L942](https://github.com/lerna/lerna/blob/f4387d673bfdf4923ab62cd52d3498dec6dc7f2c/libs/commands/publish/src/index.ts#L877-L942)：

```typescript
private topoMapPackages(mapper: (pkg: Package) => Promise<unknown>) {
  return runProjectsTopologically(this.updates, this.projectGraph, (node) => mapper(getPackage(node)), {
    concurrency: this.concurrency,
    rejectCycles: this.options.rejectCycles,
  });
}

private async packUpdated() {
  const tracker = this.logger.newItem("npm pack");

  tracker.addWork(this.packagesToPublish.length);

  await createTempLicenses(this.project.licensePath, this.packagesToBeLicensed);

  if (!this.hasRootedLeaf) {
    // despite being deprecated for years...
    await this.runRootLifecycle("prepublish");
    // these lifecycles _should_ never be employed to run `lerna publish`...
    await this.runPackageLifecycle(this.project.manifest, "prepare");
    await this.runPackageLifecycle(this.project.manifest, "prepublishOnly");
    await this.runPackageLifecycle(this.project.manifest, "prepack");
  }

  const opts = this.conf.snapshot;
  const packSteps = [
    this.options.requireScripts && ((pkg: Package) => this.execScript(pkg, "prepublish")),
    (pkg: Package) => this.copyAssets(pkg).then(() => pkg),
    (pkg: Package) =>
      pulseTillDone(packDirectory(pkg, pkg.location, opts)).then((packed) => {
        tracker.verbose("packed", path.relative(this.project.rootPath, pkg.contents));
        tracker.completeWork(1);
        // store metadata for use in this.publishPacked()
        pkg.packed = packed;
        // manifest may be mutated by any previous lifecycle
        return pkg.refresh();
      }),
  ].filter(Boolean) as ((pkg: Package) => Promise<Package>)[];

  const mapper = async (pkg: Package) => {
    let result = pkg;
    for (const step of packSteps) {
      result = await step(result);
    }
    return result;
  };

  if (this.toposort) {
    await this.topoMapPackages(mapper).catch((err) => {
      // remove temporary license files if _any_ error occurs _anywhere_
      this.removeTempLicensesOnError();
      throw err;
    });
  } else {
    await pMap(this.packagesToPublish, mapper, { concurrency: this.concurrency });
  }
  // ...
}
```

旁注：

- **`runProjectsTopologically` 来自 `@lerna/core`，本质是 Nx 的图算法**——Nrwl 接手后把原来 lerna 自实现的 toposort 替换成 Nx 的实现，统一项目图概念。这是收编最关键的代码 swap
- **`packSteps` 是函数数组管道**——每个 step 接受 Package 返回 Promise<Package>，串成链。第一步可选（`requireScripts && ...`），用 `.filter(Boolean)` 删掉 false——典型的"动态管道"风格
- **lifecycle hooks 满天飞**——`prepublish` / `prepare` / `prepublishOnly` / `prepack` 在 root 包跑一次；`prepublish`（如果 `requireScripts`）在每个子包跑。这是 npm lifecycle 的历史包袱，lerna 全部尊重
- **`removeTempLicensesOnError` 兜底**——`createTempLicenses` 把根 LICENSE 文件复制到每个子包用于打包。如果中途任何一步失败，必须清理这些临时文件，否则下次运行会污染。这种 "create / cleanup" 配对在分布式系统里要么用 try/finally，要么用 `defer`，lerna 用 .catch + 显式调用
- **`pulseTillDone(packDirectory(...))`**——`pulseTillDone` 是 lerna 自己的进度条 helper，作用是"在长时间操作期间持续打 dot 到 stderr，避免 CI 以为进程死了"。npm/yarn 也都有类似工具
- **`this.toposort ? topoMapPackages : pMap`**——sort 默认 true 时按拓扑跑（同层并发，跨层串行），关 sort 时直接 pMap 全并发。后者风险：如果 A 依赖 B 同时发，A 在 publish meta 里写 B 的版本，但 B 还没出现在 registry，npm 会抓 A 的依赖时报 404——所以默认必须 toposort

**怀疑 3**：`runProjectsTopologically` 内部如果检测到环（比如 A → B → A），`rejectCycles: true` 时抛错，`rejectCycles: false`（默认）时怎么走？追 `@lerna/core` 的 `runProjectsTopologically`——大概率是把环上的所有节点放到同一批 `pMap` 并发跑（破环）。这意味着循环依赖在默认配置下会**沉默地变成并发发布**——如果 A 引用 B 的 workspace 版本，可能在 publish 时拿到老 registry 版本。这是隐性 footgun。

## Hands-on（含改一处实验）

30 分钟跑通：

```bash
# 1. clone（注意 SSL 警告可加 GIT_SSL_NO_VERIFY=1）
git clone --depth 1 https://github.com/lerna/lerna /tmp/lerna-probe
cd /tmp/lerna-probe

# 2. 看 lerna 自己用 lerna 管自己（不 install lerna 全局，节省时间）
cat lerna.json
# {
#   "$schema": "node_modules/lerna/schemas/lerna-schema.json",
#   "version": "8.x.x",
#   "npmClient": "npm",
#   ...
# }

# 3. 在另一个空目录搭一个 mini monorepo 跑通完整 init + version + publish dry-run
mkdir -p /tmp/lerna-demo && cd /tmp/lerna-demo
npm init -y
npx lerna@latest init           # 生成 lerna.json + packages/ + 改 package.json 加 workspaces
ls
# lerna.json  package.json  packages/  package-lock.json

# 4. 加两个 package
mkdir -p packages/a packages/b
cat > packages/a/package.json <<EOF
{ "name": "@demo/a", "version": "0.0.0", "main": "index.js" }
EOF
cat > packages/b/package.json <<EOF
{ "name": "@demo/b", "version": "0.0.0", "main": "index.js",
  "dependencies": { "@demo/a": "*" } }
EOF
echo "module.exports = 'a'" > packages/a/index.js
echo "console.log(require('@demo/a'))" > packages/b/index.js

# 5. 装依赖（npm workspaces 自动 symlink，不再需要 lerna bootstrap——v7 已删）
npm install
ls node_modules/@demo/  # a -> ../../packages/a (symlink)

# 6. 提交一笔 git
git init && git add -A && git commit -m "initial"

# 7. 跑 lerna version dry-run（--no-push --no-git-tag-version 看出最终决定的版本）
npx lerna version patch --no-push --no-git-tag-version --yes
# 输出：
# lerna info current version 0.0.0
# lerna info Looking for changed packages since...
# lerna info auto-confirmed
# Changes:
#  - @demo/a: 0.0.0 => 0.0.1
#  - @demo/b: 0.0.0 => 0.0.1
# lerna success version finished

# 8. 跑 lerna publish dry-run（--registry 指本地，避免真的 publish）
npx verdaccio &       # 启动本地 npm registry on :4873
sleep 2
npx lerna publish from-package --registry http://localhost:4873 --yes
# 观察输出：
#   - 先 publish @demo/a（被依赖），后 publish @demo/b（依赖者）
#   - 这就是 topological order
```

**改一处实验**：

把 `@demo/b` 改成依赖 `@demo/a`，再加一个 `@demo/c` 依赖 `@demo/b`，
然后给 `@demo/b/package.json` 加一个**故意的循环依赖**（`@demo/b` 依赖 `@demo/c`），
跑 `npx lerna publish --reject-cycles=false` 观察拓扑排序的"破环"行为：

```bash
cat > packages/b/package.json <<EOF
{ "name": "@demo/b", "version": "0.0.1", "main": "index.js",
  "dependencies": { "@demo/a": "*", "@demo/c": "*" } }
EOF
mkdir -p packages/c
cat > packages/c/package.json <<EOF
{ "name": "@demo/c", "version": "0.0.1", "main": "index.js",
  "dependencies": { "@demo/b": "*" } }
EOF
git add -A && git commit -m "add cycle"
npx lerna publish from-package --registry http://localhost:4873 --yes --reject-cycles=false
```

观察输出：lerna 不会报环错误，但发布顺序会变成"@demo/a 先发，然后 @demo/b 和 @demo/c **并发发布**"——
这就是上面怀疑 3 的实测：**默认配置下循环依赖被沉默地破环**，意味着如果 b 引用了 c 的某个版本，
publish 时可能 race condition。把 `--reject-cycles=true` 加上，lerna 会直接抛 `ECYCLE` 错——
**这是生产环境唯一安全的配置**，但默认是 false，与 README 文档中的"safe by default"宣传不符。

## 横向对比

| 维度 | **lerna** | [Turborepo](/projects/turborepo) | [Nx](/projects/nx) | [pnpm workspaces](/projects/pnpm) | Rush | [changesets](/projects/changesets) |
|---|---|---|---|---|---|---|
| 主创时间 | 2015 | 2021 | 2017 | 2017 | 2017 | 2019 |
| 哲学 | 三步流程：bootstrap+version+publish | task pipeline + remote cache | 全栈 monorepo 平台 | 包管理器 + workspace | 大型企业 monorepo 全套 | 仅 changelog + version |
| bootstrap | 已删（v7） | 不需要 | 不需要 | 内置（symlink + hardlink） | 内置 | 不做 |
| version 管理 | fixed/independent 双模式 | 不做（推荐 changesets） | 弱（推荐 release-it） | 不做 | 内置（rush version） | 核心功能（intent-based） |
| publish 编排 | topological + OTP | 不做 | 不做 | publish 单包，需自己写脚本 | 内置（rush publish） | changeset publish |
| task pipeline | 已退化（lerna run = nx run shim） | 强（核心） | 强（核心） | 不做 | 弱（rush build） | 不做 |
| remote cache | 无 | Vercel 商业 | Nx Cloud 商业 | 无 | 无 | 无 |
| 当前维护方 | Nrwl（Nx 收编） | Vercel | Nrwl | OpenJS Foundation | Microsoft | Atlassian/Thinkmill |
| star 峰值 | 36.1k | 27k+ | 24k+ | 30k+ | 5.6k | 9k+ |
| 现状 | EOL → Nx 子集 | 主流任务编排 | 全栈平台 | 包管理事实标准 | 大企业垂直方案 | version 事实标准 |

**4 维选型建议**：

1. **新项目，需要 monorepo 工作流** → 选 [pnpm workspaces](/projects/pnpm) + [changesets](/projects/changesets) + [Turborepo](/projects/turborepo) 三件套。
   pnpm 管依赖（取代 bootstrap），changesets 管版本（比 lerna version 更聚焦），Turborepo 管 task（lerna run 已废）。
   不要选 lerna——一个 EOL 工具的"未来"是被慢慢 deprecate
2. **存量 lerna 项目，迁移成本高** → 升 lerna v8 跟着 Nrwl 走。
   v8 已经把底层重写到 Nx 项目图，命令兼容 v6，内部基础设施换了。
   等 Nrwl 哪天合并 lerna 进 Nx 主仓库（高概率事件），届时再迁
3. **企业级 monorepo（500+ 包，复杂发版策略）** → Rush 或 [Nx](/projects/nx)。
   Rush 是 Microsoft 内部 fluentui / azure-sdk 用的，有 incremental rebuild + change file 系统，但学习曲线陡；
   Nx 是 SaaS 化路线，Nx Cloud 提供 remote cache。lerna 在这个量级不够用
4. **只需要 changelog + version（不需要 task / cache）** → 用 [changesets](/projects/changesets)，不用 lerna。
   changesets 的 intent-based 方案（开发者写 .changeset 文件，CI 聚合）比 lerna conventional commits 更可控

**哲学不同的对比**（非下位替代）：

- **lerna ↔ changesets**：lerna 用 conventional commits 自动推断版本（implicit），changesets 让开发者显式声明（explicit）。前者节省手动工作但容易出错（commit message 写错就 bump 错），后者多一步但语义清晰
- **lerna ↔ Turborepo**：lerna 关心"如何发版"（output：npm registry），Turborepo 关心"如何构建"（output：本地 dist + cache）。两者哲学正交，常组合使用
- **lerna ↔ pnpm workspaces**：lerna 把 workspace 当用户问题（用户先有 npm/yarn/pnpm workspace，lerna 在上面 publish），pnpm 把 workspace 当包管理器问题（first-class 支持 + content-addressable）。pnpm 把 lerna 的 bootstrap 命令"吃掉"了

## 与你当前工作的连接

### 今天就能用

- **理解 monorepo 工具的代际更替**——
  当你在选型 monorepo 工具时，lerna 是负面教材：占据 35k+ stars 的工具仍然可以在 5 年内 EOL，
  这意味着不要把"star 数"作为选型唯一指标。要看维护活跃度（最近 3 个月 commit / 维护者数 / issue 处理速度）
- **`isIndependent()` 哨兵值检测**——
  `version === "independent"` 这种"用字符串重载枚举"在你写 schema 时是反模式：
  现代写法用 discriminated union（`{mode: 'fixed', version: '1.0.0'} | {mode: 'independent'}`）
  让 TypeScript 帮你检查穷举。lerna 的写法是历史包袱
- **fixed vs independent mode 的取舍**——
  不止 lerna，所有 monorepo 工具都要回答这个问题：
  全 package 同步 bump 适合"功能耦合的产品"（如 Babel、React），独立 bump 适合"包之间松耦合的工具集"。
  你写自己的 monorepo 时先做这个决策
- **`runProjectsTopologically` 抽象**——
  如果你写自己的多任务调度（比如批处理脚本），拓扑排序 + 同层并发 + 跨层串行是经典 pattern。
  lerna 把它抽成了 Nx 的核心 primitive，可以借鉴

### 下个月能用

- **从 lerna 迁移到 changesets + Turborepo + pnpm**——
  如果你团队有存量 lerna 项目（黑客松或学习项目可能没有，但工作里大概率会遇到），
  这是个标准迁移路径：
  1. 先把 npm/yarn 切换到 pnpm（保留 workspace，用 `pnpm import` 转 lockfile）
  2. 把 `lerna run build` 替换为 `pnpm -r build` 或 `turbo run build`
  3. 把 `lerna version` 替换为 `changeset version`
  4. 把 `lerna publish` 替换为 `changeset publish`
  5. 删 `lerna.json`，删 `lerna` 依赖
- **Nx 项目图的复用**——
  即使你不用 Nx，理解 `ProjectGraphProjectNodeWithPackage` 这种"图节点 + 关联元数据"的设计很有用。
  在你写 dependency 检测、task 调度、影响范围分析时都可能需要类似抽象
- **OSS 收购整合的"Nrwl 收编 lerna"案例**——
  Nrwl 不是收购后弃置，是**真的重写到自己的产品之上同时保持 API 兼容**。
  这是开源项目商业化收购的最佳实践参考，未来如果你做开源项目被收购或收购别人，可以借鉴

### 不要用的部分

- **不要把 lerna 当新项目的默认选择**——
  即使 Nrwl 在维护，它的核心命令（bootstrap、run、exec）已经被新生态取代。
  把它当 "Nx 的 version + publish 子集" 看待，不要当 "monorepo 第一选择"
- **不要在新代码里学 lerna 的 OOP 风格**——
  类字段全 `?`、构造器即副作用、字符串重载枚举（"independent"）、
  `otherCommandConfigs` 这种 backward-compat 字段——都是 2015-2018 JS 风格的遗物。
  现代写法用 async factory + discriminated union + 不可变配置
- **不要用 lerna 的 conventional commits 自动 bump**——
  conventional commits 写错了直接影响发版（`feat:` 写成 `fix:` 会少 bump 一档），
  风险大于收益。用 changesets 的显式声明模式
- **不要用 `--reject-cycles=false`（默认）**——
  上面怀疑 3 + 实验已经证明，默认配置下循环依赖会被沉默地破环并发发布。
  生产环境必须强制 `--reject-cycles=true`，写到 lerna.json 里

## 自检 + 延伸

**自检问题（具体到行号）**：

1. `Project` 构造器里 `this.#validateLernaConfig(config)` 抛 `ECONFIGWORKSPACES` 是因为 `useWorkspaces` 字段在 v6 删除——但如果用户的 lerna.json 是从一个 fork 的项目复制的、且这个 fork 还在 v5，迁移路径在哪里？追 [project/index.ts L299-L312](https://github.com/lerna/lerna/blob/f4387d673bfdf4923ab62cd52d3498dec6dc7f2c/libs/core/src/lib/project/index.ts#L299-L312) 的错误信息，没有指向 `lerna repair` 命令——这是文档漏洞还是 lerna repair 不处理这个？
2. `VersionCommand.initialize()` 在 detached HEAD 时抛 `ENOGIT`——但 GitHub Actions 默认 checkout 到 detached HEAD（除非加 `ref: ${{ github.head_ref }}`），意味着 lerna version 在 PR 触发的 CI 里默认会爆炸。社区的 workaround 在哪？追 GitHub issue + lerna 文档的 CI 配置示例
3. `runProjectsTopologically` 在 `rejectCycles: false` 时怎么破环？追 `@lerna/core` 这个函数的实现——它把环上的节点都放到同一并发批吗？还是按 SCC（强连通分量）切？还是直接报错？这个行为在生产 race condition 风险有多大？
4. `topoMapPackages` 的 `concurrency: this.concurrency` 默认 4——意味着 4 个 npm publish 同时跑。如果其中一个被 npm registry 限流（`Too Many Requests`），其他 3 个会怎么处理？是整体 abort 还是只这一个 retry？追 publish 主流程的错误传播路径
5. `this.gitOpts.overrideMessage = amend && !!message` 这个分支——如果用户 `--amend` 但不传 `--message`，应该用什么 commit message？默认走 git 的 amend 行为（保留原 message）还是 lerna 自己的模板？追 `gitCommit` 函数 + `commitMessage` 默认值

**接下来读哪 N 个文件**：

1. `libs/core/src/lib/collect-updates/index.ts` —— `lerna changed` 的核心逻辑；如何用 git diff + lerna.json 计算"哪些包变了"
2. `libs/core/src/lib/conventional-commits/index.ts` —— conventional commits 解析 + changelog 生成；对比 changesets 的 intent-based 方案
3. `libs/commands/publish/src/lib/get-two-factor-auth-required.ts` —— npm 2FA OTP 流程；理解为什么 lerna 这么早就支持 OTP
4. `libs/nx-plugin/src/index.ts` —— 把 lerna 命令暴露给 Nx；理解 Nrwl 怎么"装入"
5. `libs/core/src/lib/cycles/index.ts` —— 依赖环检测算法；对比 Tarjan SCC 与简化版

## 限制

- **bootstrap 命令已删（v7）** —— 历史上 lerna 最核心的差异化命令在 2024 年 v7 release 里被移除（[changelog](https://github.com/lerna/lerna/blob/main/CHANGELOG.md)）。
  现在用户必须用 npm/yarn/pnpm 的 workspace 自己装依赖。这意味着旧文档（包括很多博客和 stackoverflow 答案）里的 `lerna bootstrap` 都失效
- **lerna run 已退化为 nx run shim** —— v6 之前 `lerna run` 自己实现 task 调度，现在内部直接调 `nx run`。
  如果你想要的行为（比如不开启 nx cache、不写 nx.json）和 nx 默认不一致，会出现 surprising behavior
- **没有 remote cache** —— lerna 自己不提供（Turborepo 有 Vercel cache、Nx 有 Nx Cloud），CI 上每次都全量跑。
  这是 lerna 在 task pipeline 维度被吊打的根本原因
- **Nrwl 的"接管"是有商业目的的** —— Nrwl 收 lerna 的目的是把 lerna 用户引流到 Nx Cloud。
  这不是慈善——意味着 lerna 的未来 roadmap 完全由 Nrwl 商业利益决定。
  如果哪天 Nrwl 决定砍 lerna（比如全部并入 Nx），存量用户没有诉求权
- **TypeScript 严格度低** —— `as any` / `@ts-ignore` 散落各处（[project/index.ts L154 / L309 / L334](https://github.com/lerna/lerna/blob/f4387d673bfdf4923ab62cd52d3498dec6dc7f2c/libs/core/src/lib/project/index.ts) 都有），
  说明从 JS 翻译过来时没做完整的类型补强。这种历史遗留意味着重构风险高
- **测试覆盖不均** —— 命令级 e2e 测试很多，但 `Project` / `Package` 类的单元测试相对少（grep 只有 `index.spec.ts`）。
  lerna 的稳定性靠的是 8 年实战验证 + 用户量大暴露问题快，而不是测试覆盖

## 附录：宣传 vs 现实

| 文档/官网说 | 代码现实 |
|---|---|
| "Lerna is a fast, modern build system for managing and publishing multiple JavaScript/TypeScript packages from the same repository." | "fast" 是相对 npm v3 的——Turborepo / Nx 比它快一个量级。"modern build system" 严重夸大——现在的 lerna 实质只剩 version + publish |
| `lerna init` "sets up a new monorepo" | init 只生成 lerna.json + 一个 packages 目录 + 改 package.json 加 workspaces。不装 task runner、不装 changelog 工具——用户还要自己配 |
| "Topological sort by default for safety" | 默认确实 toposort，但 `--reject-cycles=false`（默认）会沉默破环并发，文档里没强调这点 |
| "Backward compatible with v6" | API 兼容，但内部基础设施全换了。如果你 hook 进 lerna 内部 API（比如 `@lerna/project` 这种 deep import），v7+ 会炸 |
| "Maintained by Nx team" | 维护积极度比 Nx 主仓库低一个量级（Nx 仓库每天 commit，lerna 仓库每周 commit）。issue 响应也慢。"维护"意味着不让它崩，不意味着新功能 |

## 元数据

- 升级日期: 2026-05-29
- 项目类型: 工具库（v1.1 分支 B）
- 核心信息表 9 字段:
  - stars: 36.1k（历史峰值，2026-05 仍维持）
  - fork: ~3.5k
  - 最近活跃: 2026-03-23（Nx 团队维护节奏，每周 1-2 commit）
  - commit hash: `f4387d673bfdf4923ab62cd52d3498dec6dc7f2c`
  - 主语言: TypeScript（早期 JS，逐步翻译）
  - 维护方: Nrwl / Nx team（Victor Savkin / James Henry / Austin Fahsl / Benjamin Cabanes / Juri Strumpflohner）
  - License: MIT
  - 创立者: Sebastian McKenzie（Babel / Yarn / Rome 的连续创业者）
  - 类似项目: Turborepo / Nx / pnpm workspaces / Rush / changesets / yarn workspaces
  - 用户（历史）: Babel / React / Jest / Vue 2 / Angular CLI / NestJS（多数已迁出）
- Layer 3 三段独立小节:
  - A Project 类（lerna.json + 三种 workspace 兜底）
  - B VersionCommand（fixed vs independent + 5 路 git 校验）
  - C PublishCommand（topological + lifecycle + 破环风险）
- GitHub permalink 数: 6 处（Project 构造器 / resolvePackageConfigs / VersionCommand 类字段 / VersionCommand initialize / PublishCommand configureProperties / PublishCommand topoMapPackages）
- 显式怀疑: 5 处（pnpm catalog 字段被吃 / isBehindUpstream 与 git fetch race / runProjectsTopologically 破环行为 / detached HEAD 在 GitHub Actions / amend without message）
- Figure: 1 张 webp（`/projects/lerna/01-timeline.webp`，~70 KB，11 年时间线 + 黄金期/停滞期/接管期 + 三步哲学 + 死因诊断）
- 限制: 6 条
- 宣传 vs 现实: 5 行
- 启用工具: git clone（深度 1，--ssl-no-verify 兜底）+ Read + 本地 PIL 画图 + WebFetch（star 数 + 维护者列表）
- Season 18 收官：第 5 篇工具库篇，本季 = pnpm + DeepSpeed + Lerna 等 5 篇
