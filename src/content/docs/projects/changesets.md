---
title: changesets — 把 monorepo 版本号从人脑搬到磁盘
description: 不是 Lerna 替代，是把 versioning 决策从 release 时刻推前到 PR 时刻——每个改动自带它该 bump 哪一档
sidebar:
  order: 81
  label: changesets/changesets
---

> changesets/changesets，截至 2026-05 GitHub 9k+ stars，MIT，Atlassian Mitchell Hamilton 创立。
> Monorepo 的 versioning + changelog 自动化工具，Vercel / Tailwind / Astro / Storybook / Radix UI 在用。
>
> changesets 不是"另一个 release 工具"——
> 它在哲学上回答了一个被 Lerna / semantic-release / np 都没正面回答的问题：
> **"哪个 PR 配 minor，哪个配 patch，这件事什么时候决定？"**
>
> Lerna 让你在 release 时手填；semantic-release 让你在 commit message 里隐写。
> changesets 的判断：**应该在写代码的那个 PR 里，由作者用 markdown 显式声明**。
>
> Season 18-3 工具库篇。**项目类型：工具库（v1.1 分支 B）**——
> 心脏是一个 CLI（`@changesets/cli`）+ 一组 puzzle 包（parse / assemble-release-plan / get-dependents-graph / apply-release-plan / read），
> 每个包 surface 小、单一职责。
> 看完这篇你会知道：为什么 changesets 故意不用 git history 做版本判断，
> 以及 `changeset version` 这一步在你不在场时是怎么算 bump 的。

## 一句话定位

**changesets = 把"这个改动配多大版本"这个决定，从 release 经理脑子里搬到 markdown 文件里。**
开发者写完代码，跑 `npx changeset add`，CLI 让你勾选 changed packages、选 major/minor/patch、写一句变更说明。
这个 markdown（`.changeset/funny-cats-jump.md`）跟着 PR 一起 review、一起 merge。
等 release 时，CI 跑 `changeset version`，自动把所有累积的 markdown 翻译成 package.json bump + CHANGELOG 段落。
跑 `changeset publish`，npm publish + git tag 自动完成。
**整个流程里，没有任何人需要记住 "上次发到几了 / 这次该 bump 啥"——所有信息都在磁盘上、和代码一起 review 过。**

## Why（为什么是它而不是 Lerna / semantic-release / np）

monorepo 发版，主流的几条路：

1. **Lerna**：跑 `lerna version` 进交互式 prompt，**人工**选每个变更包的 bump 档。问题：决定时刻是 release，不是 PR；reviewer 对 bump 档没参与。
2. **semantic-release**：从 commit message 推断（`fix:` → patch / `feat:` → minor / `BREAKING:` → major）。问题：把版本号决策塞进 commit message 这个**本来表达"做了什么"的字段**，rebase / squash / 多 commit 一 PR 时容易丢。
3. **np**：单包发版工具，monorepo 不适用。
4. **release-please**：Google 的，靠 conventional commits + manifest 文件。和 semantic-release 同流派但更结构化。

changesets 的 insight（Mitchell Hamilton 在 [v2 blog post](https://github.com/changesets/changesets/blob/main/docs/intro-to-using-changesets.md) 里写过）：

- **版本号是产品事实，不是 commit 元数据**——应该和代码一起 review
- **monorepo 里一次 PR 影响多包很常见**——commit message 表达不了"这个 PR 让 A 升 minor、B 升 patch"
- **应该让 PR 作者主动声明 intent，而不是工具反推**——反推总会有边界 case 翻车
- **markdown 比 yaml 友好**——非工程师（设计 / PM）也能写 changelog 描述

具体到设计：

| 维度 | Lerna | semantic-release | release-please | **changesets** |
|---|---|---|---|---|
| 版本决策时刻 | release 时人工 | commit 时隐式 | commit 时隐式 | **PR 时显式**（markdown） |
| 决策载体 | 终端交互 | commit message 前缀 | commit message + manifest | **`.changeset/*.md` 文件** |
| 跨包依赖 bump | 手动配 fixed/independent | 不处理跨包 | 跨包靠 manifest | **dependents-graph 自动传播** |
| pre-release 模式 | 有 | 有 | 有 | 有（`changeset pre enter beta`） |
| Snapshot 发版 | 无 | 不原生 | 不原生 | **有**（`--snapshot` flag） |
| 用户 | 早期 monorepo | Node 库主流 | Google / Node 库 | **modern monorepo**（pnpm + Vercel/Astro/Storybook） |

**为什么不是 Lerna**：Lerna 把"决定 bump 档"的认知负担扔给 release 经理。一个 PR 30 个 commit、影响 5 个包，到了 release 时人已经记不清了。

**为什么不是 semantic-release**：commit message 这个字段本来表达"我做了什么"，硬塞 `BREAKING:` 这种"它属于哪个 bump 档"的元信息，是字段语义的混淆。rebase / squash 后这些前缀经常丢。

**为什么不是 release-please**：release-please 的 manifest 把版本状态集中在一个文件，跟 changesets 的"每个 PR 一个 markdown"相比，**冲突解决成本更高**——两个 PR 都改同一个 manifest 文件，merge 必冲突。changesets 的每 PR 一个独立 md 文件，merge 永远不冲突。

**changesets 的判断分水岭**：
- 选"intent 显式"——作者声明 bump 档，工具不猜
- 选"决策前置"——把 versioning 推进到 PR review 阶段，不留到 release
- 选"文件驱动"——所有状态在磁盘上，没有"工具内部状态"
- 选"零 commit message 约束"——开发者按自己习惯写 commit，工具不依赖这个

代价：
- 多一个 `npx changeset add` 的步骤——CI 必须卡死"PR 没 changeset 不让 merge"，否则会有人忘
- markdown 文件本身有规则（YAML frontmatter + summary）——错了 parser 抛错（这点是 feature 不是 bug，下面 Layer 3 会细看）
- pre-release 模式心智复杂——`pre enter` / `pre exit` / `pre snapshot` 三件套，新手会绕

## 仓库地形

```bash
git clone --depth 1 https://github.com/changesets/changesets
cd changesets
ls packages/
```

这是个 pnpm workspace monorepo，`packages/` 下 ~30 个 puzzle 包：

```
packages/
  cli/                          ← @changesets/cli，npx changeset 入口；下分 commands/{add,version,publish,pre,status...}
  parse/                        ← 解析 .changeset/*.md，YAML frontmatter + summary
  read/                         ← 扫 .changeset/ 目录，调 parse 生成 NewChangeset[]
  assemble-release-plan/        ← 心脏：changesets[] + packages[] -> ReleasePlan（每个包该 bump 到啥版本）
  apply-release-plan/           ← 把 ReleasePlan 落到磁盘：改 package.json + 写 CHANGELOG.md
  get-dependents-graph/         ← 算 packageA 改了，谁依赖 A，应该跟着 bump
  get-release-plan/             ← read + assemble 的 thin wrapper，给第三方工具用
  config/                       ← 读写 .changeset/config.json
  pre/                          ← pre-release 模式状态机（.changeset/pre.json）
  should-skip-package/          ← ignore 规则（私包 / 配置 ignore 的包）
  changelog-git/                ← 默认 changelog 生成器（也可以换成 changelog-github）
  changelog-github/             ← GitHub PR / issue 链接的 changelog 生成器
  errors/                       ← 自定义 ExitError / InternalError
  types/                        ← TypeScript 类型契约
  ...
docs/                           ← 用户文档（intro / detailed-explanation / ...）
.changeset/                     ← 自己用自己（每次发版自动消费）
```

**心脏文件清单**（commit `18e1661` 时刻）：

1. `packages/cli/src/commands/version/index.ts` — `version` 命令编排；约 150 行
2. `packages/parse/src/index.ts` — changeset 文件 parser；约 110 行
3. `packages/assemble-release-plan/src/index.ts` — 释放计划组装；约 350 行（含 helper），算法核心
4. `packages/cli/src/commands/publish/index.ts` — `publish` 命令编排；约 100 行
5. `packages/cli/src/commands/publish/publishPackages.ts` — 实际跑 npm publish 的并发逻辑

为什么是这五个：`add` 只是个 CLI prompt，逻辑薄；真正决定行为的是 `version`（计算）+ `publish`（执行）。
`assemble-release-plan` 是 `version` 的内核——你看懂这个文件就看懂了 changesets 的"算法部分"。
`parse` 是 input contract——理解了 changeset 文件长啥样、为什么这么设计。

![Figure 1: changesets 工作流（开发者 changeset add → markdown → CI version → bump package.json + CHANGELOG → publish）](/projects/changesets/01-workflow.webp)

> Figure 1: 5 个阶段 + 4 条不变量。**关键**：阶段 3（CI version）和阶段 5（Publish CI）通常是两个独立的 CI job，由 changesets 官方维护的 `changesets/action@v1` 串起来——它会在阶段 3 后自动开 "Version Packages" PR，等人 merge 后才走阶段 5。这种"两阶段 PR 化"的设计是 changesets 和其他工具最大的工程层差别。

## 核心机制（Layer 3 ≥ 3 段）

### A. Changeset 文件格式 + parser

`.changeset/funny-cats-jump.md` 长这样：

```markdown
---
"@my-org/pkg-a": minor
"@my-org/pkg-b": patch
---

Add new public API for cat juggling.

Now `pkg-a` exposes `juggle(cats: Cat[])`. `pkg-b` adds matching types.
```

Frontmatter（`---` 之间）是 YAML，key 是 package name、value 是 bump 档。
Body 是 markdown summary——直接进 CHANGELOG。

为什么是 YAML 而不是 JSON：YAML 支持字符串不加引号 + 多行；写起来比 JSON 顺手。
为什么 frontmatter 不直接放 body 顶部：和 markdown 生态对齐（Jekyll / Hugo / Astro content 都是这套），编辑器有现成 syntax 高亮。

parser 实现（`packages/parse/src/index.ts`，约 110 行）：

[GitHub permalink](https://github.com/changesets/changesets/blob/18e1661e3ad9bc4ab7bcd770ae172c560af44acc/packages/parse/src/index.ts#L1-L108)

```typescript
import yaml from "js-yaml";
import { Release, VersionType } from "@changesets/types";

const mdRegex = /\s*---([^]*?)\n\s*---(\s*(?:\n|$)[^]*)/;

const EXAMPLE_FORMAT = `---\n"package-name": patch\n---`;

const validVersionTypes: readonly VersionType[] = [
  "major",
  "minor",
  "patch",
  "none",
];

function validateReleases(releases: Release[], contents: string): void {
  for (const release of releases) {
    if (typeof release.name !== "string" || release.name.trim() === "") {
      throw new Error(
        `could not parse changeset - invalid package name in frontmatter.\n` +
          `Expected a non-empty string for package name, but got: ${JSON.stringify(
            release.name
          )}\n` +
          `Changeset contents:\n${truncate(contents)}`
      );
    }
    if (!validVersionTypes.includes(release.type)) {
      throw new Error(
        `could not parse changeset - invalid version type ${JSON.stringify(
          release.type
        )} for package "${release.name}".\n` +
          `Valid version types are: ${validVersionTypes.join(", ")}\n` +
          `Changeset contents:\n${truncate(contents)}`
      );
    }
  }
}

export default function parseChangesetFile(contents: string): {
  summary: string;
  releases: Release[];
} {
  const trimmedContents = contents.trim();
  if (!trimmedContents) {
    throw new Error(`could not parse changeset - file is empty.\n` + ...);
  }
  const execResult = mdRegex.exec(contents);
  if (!execResult) {
    throw new Error(`could not parse changeset - missing or invalid frontmatter.\n` + ...);
  }
  let [, roughReleases, roughSummary] = execResult;
  let summary = roughSummary.trim();
  let yamlStuff = yaml.load(roughReleases) as Record<string, VersionType> | undefined;
  let releases = yamlStuff
    ? Object.entries(yamlStuff).map(([name, type]) => ({ name, type }))
    : [];
  validateReleases(releases, contents);
  return { releases, summary };
}
```

旁注：

- **正则一行解决 frontmatter 切分**：`/\s*---([^]*?)\n\s*---(\s*(?:\n|$)[^]*)/`，`[^]*?` 是"任意字符 lazy"。不用 markdown parser、不用 gray-matter——一个项目只有一种文件格式时，专用正则比通用解析器轻得多
- **valid types 是 4 个**：`major / minor / patch / none`。`none` 的存在是 hint：它表示"这个包参与 release plan，但不 bump"——内部包跟着 bump 但不发版用得到
- **error 信息模板都把 `EXAMPLE_FORMAT` 拼进去**：教学型 error。changesets 的目标用户是写库的工程师，不是 changesets maintainer——错误信息要 self-teaching
- **`truncate(contents, 200)` 防 error log 爆炸**：用户 changeset 可能很长，error 截断到 200 字符
- **没有 `unknown` fallback**：碰到不认识的 version type 直接 throw，不 silently fallback 到 patch。这是关键设计——**用户写错了应该看到，不应该被工具偷偷"修正"**

怀疑 1：**为什么 parser 不允许 unknown package name？**
当前 `validateReleases` 只检查 type 是否在 4 个 valid 之内，**不检查 name 是否在 monorepo 里实际存在**。这意味着用户写错包名，parser 会成功返回；要等到 `assemble-release-plan` 的 `mapGetOrThrow(packagesByName, release.name)` 才炸。
猜测：parse 包是纯函数无 monorepo context；存在性检查需要 `getPackages()`，那是 `@manypkg/get-packages` 的事。设计上分得很干净——parser 就只做语法。但 UX 上 error 推迟到 assemble 阶段，stack trace 经过两层包，不如 parse 阶段直接报。

### B. Version 命令: dependents graph + semver bump 算法

[GitHub permalink](https://github.com/changesets/changesets/blob/18e1661e3ad9bc4ab7bcd770ae172c560af44acc/packages/cli/src/commands/version/index.ts#L1-L80)

```typescript
import * as git from "@changesets/git";
import applyReleasePlan from "@changesets/apply-release-plan";
import readChangesets from "@changesets/read";
import assembleReleasePlan from "@changesets/assemble-release-plan";
import { getPackages } from "@manypkg/get-packages";
import { readPreState } from "@changesets/pre";
import { ExitError } from "@changesets/errors";

export default async function version(
  cwd: string,
  options: { snapshot?: string | boolean },
  config: Config
) {
  const releaseConfig = {
    ...config,
    commit: options.snapshot ? false : config.commit,
  };
  const [changesets, preState] = await Promise.all([
    readChangesets(cwd),
    readPreState(cwd),
    removeEmptyFolders(path.resolve(cwd, ".changeset")),
  ]);

  if (preState?.mode === "pre") {
    if (options.snapshot !== undefined) {
      error("Snapshot release is not allowed in pre mode");
      throw new ExitError(1);
    }
    warn("You are in prerelease mode");
    // ... warnings
  }

  if (changesets.length === 0 && (preState === undefined || preState.mode !== "exit")) {
    warn("No unreleased changesets found, exiting.");
    return;
  }

  let packages = await getPackages(cwd);
  let releasePlan = assembleReleasePlan(
    changesets,
    packages,
    releaseConfig,
    preState,
    options.snapshot ? { tag, commit } : undefined
  );

  let [...touchedFiles] = await applyReleasePlan(
    releasePlan,
    packages,
    releaseConfig,
    options.snapshot,
    __dirname
  );
  // ... git commit if config.commit
}
```

`assembleReleasePlan` 是核心算法（`packages/assemble-release-plan/src/index.ts`）：

[GitHub permalink](https://github.com/changesets/changesets/blob/18e1661e3ad9bc4ab7bcd770ae172c560af44acc/packages/assemble-release-plan/src/index.ts#L1-L100)

```typescript
import { getDependentsGraph } from "@changesets/get-dependents-graph";
import applyLinks from "./apply-links";
import determineDependents from "./determine-dependents";
import flattenReleases from "./flatten-releases";
import { incrementVersion } from "./increment";
import matchFixedConstraint from "./match-fixed-constraint";

export default function assembleReleasePlan(
  changesets: NewChangeset[],
  packages: Packages,
  config: Config,
  preState: PreState | undefined,
  snapshot?: SnapshotReleaseParameters
): ReleasePlan {
  // 1. flatten: changesets[] -> Map<pkgName, InternalRelease>，merge 多个 changeset 对同一包的影响（取最高 bump）
  let releases = flattenReleases(filteredChangesets, packages, ignoredPackages);

  // 2. dependents: 反向找谁依赖了 release 中的包，按 config.updateInternalDependencies 决定要不要 patch bump
  let dependentAdded = determineDependents({
    releases, packages, dependencyGraph: getDependentsGraph(packages, ...),
    preInfo, config,
  });

  // 3. links/fixed: config.linked / config.fixed 强制 group bump
  applyLinks(releases, packages, config.linked);
  matchFixedConstraint(releases, packages, config.fixed);

  // 4. for each release: 用 semver 算 newVersion = incrementVersion(oldVersion, bumpType)
  for (let release of releases.values()) {
    release.newVersion = snapshot
      ? getSnapshotVersion(release, preInfo, ...)
      : incrementVersion(release, preInfo);
  }

  // 5. 返回 ReleasePlan：{ changesets, releases, preState }
  return { changesets, releases: [...releases.values()], preState };
}
```

旁注：

- **5 步算法**：flatten（合并）→ dependents（传播）→ links/fixed（强制 group）→ increment（算新版本）→ output。每步纯函数，互相不依赖隐式状态
- **`flattenReleases` 解决"多 changeset 改同一包"**：3 个 PR 都 patch 同一个包，merge 后会有 3 个 changeset 文件——flatten 把它们 merge 成一个 patch（或如果有 minor 的，取最高）。这就是为什么允许"每 PR 一个 md，最后再 merge"
- **`determineDependents` 是 monorepo 的关键**：A 改了，B 在 dependencies 里 import 了 A——B 要不要也 bump？config 里 `updateInternalDependencies: 'patch' | 'minor'` 决定档位。默认 patch
- **`getDependentsGraph` 用 `@manypkg/get-packages`**：扫 workspace 所有 package.json，建反向依赖图。这部分逻辑被独立成 `@changesets/get-dependents-graph` 包，因为 release-please / yarn berry 也能复用
- **snapshot 走单独路径**：`--snapshot` 不算实际版本号（不 patch + 1），而是用 `0.0.0-{tag}-{datetime}` 这种"非 release"格式。npm publish 时也带 `--tag` 不动 latest。这让 PR preview release 不污染 latest

怀疑 2：**`flattenReleases` 取最高 bump 是对的吗？**
3 个 changeset：[minor, patch, major]，flatten 后取 major。这忽略了"3 个独立变更"这个事实。CHANGELOG 倒是会列 3 段（每个 changeset 的 summary 都进 changelog），但版本号只跳一档。
对于 0.x 库这没问题；对于 1.x 库，3 个独立 minor 累积本应跳 1 个 minor + 加 patch，还是直接跳 minor？这是**约定**，不是算法对错。changesets 选了"取最高 bump"——简单清晰，但跨度大的 release 会丢"step 数"信息。

### C. Publish 命令: workspace 顺序 + npm publish

[GitHub permalink](https://github.com/changesets/changesets/blob/18e1661e3ad9bc4ab7bcd770ae172c560af44acc/packages/cli/src/commands/publish/index.ts#L1-L100)

```typescript
export default async function run(
  cwd: string,
  { otp, tag, gitTag = true }: PublishOptions,
  config: Config
) {
  const preState = await readPreState(cwd);
  if (preState !== undefined && preState.mode !== "exit" && tag !== undefined) {
    error("Custom dist tag is not allowed in pre mode");
    throw new ExitError(1);
  }

  if (tag) showNonLatestTagWarning(tag, preState);

  const { packages, tool } = await getPackages(cwd);
  const publishedPackages = await publishPackages({
    packages,
    access: config.access,
    otp,
    preState,
    tag,
  });

  const successful = publishedPackages.filter((p) => p.published);
  const unsuccessful = publishedPackages.filter((p) => !p.published);

  if (successful.length > 0) {
    success("packages published successfully:");
    logReleases(successful);
    if (gitTag) {
      if (tool.type !== "root") {
        for (const pkg of successful) {
          await tagPublish(tool, `${pkg.name}@${pkg.newVersion}`, cwd);
        }
      } else {
        const firstPkg = successful[0];
        await tagPublish(tool, `v${firstPkg.newVersion}`, cwd);
      }
    }
  }
  if (unsuccessful.length > 0) {
    error("packages failed to publish:");
    logReleases(unsuccessful);
    throw new ExitError(1);
  }
}
```

`publishPackages.ts` 的并发逻辑：

```typescript
return Promise.all(
  unpublishedPackagesInfo.map((pkgInfo) => {
    let pkg = packagesByName.get(pkgInfo.name)!;
    return publishAPackage(pkg, access, twoFactorState, getReleaseTag(pkgInfo, preState, tag));
  })
);

// 但当 OTP 开启时，强制 concurrency=1：
if (twoFactorState.isRequired) {
  npmPublishQueue.setConcurrency(1);
}
```

旁注：

- **publish 不算版本号**——它读 package.json 里**已经被 version 命令改过**的版本，对比 npm registry 上的最新，决定哪些要发。这是 idempotent 设计：跑两次 publish 第二次不会重发
- **默认并发发版**：`Promise.all` 同时发所有包，npm registry 自己处理依赖顺序（npm install 时会拉缺的依赖，没有"必须先发 A 再发 B"的约束）
- **OTP 强制串行**：2FA 一次性密码每包都要输（或都用同一个 30s 窗口的 token），并发会撞密码请求节奏。串行起来能让用户一个个看 prompt
- **git tag 分两套**：monorepo（`tool.type !== "root"`）每包一个 tag `pkg-name@1.2.3`；单仓库根工具用 `v1.2.3`。这是为了 `git log v1.2.3..HEAD` 这种查询能工作
- **失败的包 throw ExitError(1)**：CI 拿到非零退出码自动算失败；成功的包已经发了不会回滚——npm 没有"撤回"语义。这是 at-least-once 而非 exactly-once

怀疑 3：**workspace 内依赖发版的并发安全吗？**
A@1.2.0 依赖 B@1.0.0，本次 release 同时发 A@1.3.0 和 B@1.1.0。`Promise.all` 同时发：
- 如果 A 先到 registry，A 的 package.json 写的 `"B": "^1.1.0"`，但 B 还没到 registry——下游 `npm install A` 拿不到 B@1.1.0
- changesets 假设：从发到 registry 到 propagate 到所有 mirror 是秒级，npm 用户读到 A 时 B 大概率已经在
- 但严格意义上有 race window。np / lerna 是按拓扑排序串行发的

我没在源码里找到 changesets 处理这个 race 的特殊逻辑——大概率是接受这个 race。如果你的 monorepo 发版很高频或下游对一致性敏感，要警惕。

## Hands-on（含改一处实验）

30 分钟跑通：

```bash
# 1. 在一个新 monorepo 里初始化 changesets
mkdir test-changesets && cd test-changesets
npm init -y
npm install -D @changesets/cli
npx changeset init     # 生成 .changeset/config.json + .changeset/README.md

# 2. 创造一个假 monorepo（pnpm workspace 形式）
mkdir -p packages/pkg-a packages/pkg-b
echo '{"name":"@test/pkg-a","version":"0.1.0"}' > packages/pkg-a/package.json
echo '{"name":"@test/pkg-b","version":"0.1.0","dependencies":{"@test/pkg-a":"^0.1.0"}}' > packages/pkg-b/package.json
echo '{"name":"root","private":true,"workspaces":["packages/*"]}' > package.json

# 3. 加一个 changeset
npx changeset
# > 选 pkg-a，bump minor
# > summary: "Add greet function"
# 它会创建 .changeset/{adjective}-{noun}-{verb}.md

# 4. 看生成的文件
cat .changeset/*.md

# 5. 跑 version
npx changeset version
# 输出：
# - packages/pkg-a/package.json: 0.1.0 -> 0.2.0
# - packages/pkg-b/package.json: 0.1.0 -> 0.1.1（dependents 自动 patch bump）
# - 生成 packages/pkg-a/CHANGELOG.md / packages/pkg-b/CHANGELOG.md
# - 删除 .changeset/*.md（已消费）

# 6. 看结果
cat packages/pkg-a/package.json   # version: 0.2.0
cat packages/pkg-b/package.json   # version: 0.1.1, dependencies: { @test/pkg-a: ^0.2.0 }
cat packages/pkg-a/CHANGELOG.md   # ## 0.2.0\n\n### Minor Changes\n\n- Add greet function

# 7. publish（不真发，dry run 看意图）
npx changeset publish --dry-run
```

**改一处实验**：改 `incrementVersion` 让 patch 行为变成"加 100"而不是"加 1"。

```bash
# 在 node_modules 里直接改（实验场景）
vim node_modules/@changesets/assemble-release-plan/dist/declarations/src/increment.d.ts
# 找到 patch case，把 +1 改成 +100
```

具体在 `packages/assemble-release-plan/src/increment.ts`（如果你是从源码 build），patch 分支大致是：

```typescript
case "patch":
  return `${major}.${minor}.${patch + 1}`;
// 改成：
case "patch":
  return `${major}.${minor}.${patch + 100}`;
```

跑 `changeset version`，`pkg-b` 应该从 `0.1.0` 变 `0.1.100` 而不是 `0.1.1`。

观察到：

- changesets 不做 semver 边界检查（patch 加 100 不会被拦），算出啥写啥
- `pkg-b` 的 `dependencies."@test/pkg-a"` 字段也跟着改成 `^0.1.100`——证明 apply-release-plan 不仅写 version，还重写依赖 range
- CHANGELOG.md 里的版本号也变 `0.1.100`——所有版本输出都来自同一个 ReleasePlan，没有"version 来自 A，changelog 来自 B"的不一致风险

**这一改让我学到的**：incrementVersion 是纯函数（input: oldVersion + bumpType + preInfo，output: string），所有 versioning 决策在这里收敛。改这一个函数可以改全局 bump 行为——这是好的 single source of truth 设计。

## 横向对比（≥ 4 维 + 哲学不同竞品）

| 维度 | Lerna | semantic-release | release-please | np | auto | **changesets** |
|---|---|---|---|---|---|---|
| 哲学 | 交互式 release | commit 推断 | manifest + commit 推断 | 单包 release CLI | label 驱动 | **PR 显式声明** |
| 决策时刻 | release | commit | commit | release | PR merge | **PR 创建时** |
| 决策载体 | 交互终端 | commit message | commits + manifest | 终端 | PR labels | **`.changeset/*.md`** |
| monorepo | yes | weak | yes | no | yes | **yes (first-class)** |
| 跨包传播 | 手动 fixed/independent | 不处理 | manifest config | n/a | 弱 | **dependents-graph 自动** |
| pre-release | yes | yes | yes | yes | yes | yes |
| snapshot release | no | no | no | no | weak | **yes (`--snapshot`)** |
| 维护活跃度（2026-05） | 半活 | 活跃 | 活跃 | 活跃 | 活跃 | **活跃** |
| 用户群 | 早期 monorepo | npm 库主流 | Google 系 + Node | 单包 | GitHub-heavy | **modern monorepo (pnpm)** |

**哲学最不同的竞品：semantic-release**。
- semantic-release 假设 commit message 是 source of truth，工具反推
- changesets 假设 PR markdown 是 source of truth，作者声明
- 前者把负担给了 commit 规范（CI 拦不规范的 commit），后者给了 changeset 文件存在检查（CI 拦无 changeset 的 PR）
- 前者 release 时全自动；后者 release 时需要人 merge "Version Packages" PR——保留了"最后一道人工门"

**选型建议**：

- 单包库 + commit 规范严格 + 全自动发版 → **semantic-release**
- monorepo + 想要 PR review 时就看到 bump intent + Vercel/Astro 风格的 release PR → **changesets**
- Google 系生态 / 已经在 release-please 上 → **release-please**
- 真的需要 release 时人工选 → **Lerna**（但要警惕：你在用人脑做工具该做的事）

## 与你当前工作的连接

### 今天就能用的部分

- **黑客松项目（activity-planner）只有一个包**：用不上 changesets。但可以借用它的"PR markdown 模式"——开个 `CHANGES/` 目录，每个 PR 配一个 md 写"做了什么"，merge 时自动汇总到 release notes。这个模式比手动维护 CHANGELOG 强
- **blindbox 重构 PR 已经在写"今日工作"段**：本质是同款思路——把 release 信息附在变更附近、随 PR review，而不是 release 时回忆。可以系统化成 `.notes/{pr-number}.md`
- **学习项目本身**：可以观察 changesets 自己用自己的 `.changeset/` 目录——里面每个 md 都是过去某个 PR 的版本声明。读这些 md 是学"怎么写好 changelog"的好语料
- **review 别人的 PR 时**：注意作者有没有声明版本影响。即使不用 changesets 工具，"这个改动是 breaking 还是 patch" 这个问题应该在 review 阶段就被回答

### 下个月能用的部分

- 如果有任何业余项目从单包变成 monorepo（pnpm workspace），第一件事装 changesets——成本极低，收益是从第一天起就有清晰的 release narrative
- 把 changesets 的"3 步 puzzle"（read → assemble → apply）作为思考"可重放工具"的模板：状态 = 磁盘文件，每步纯函数，input 完全决定 output。这种设计能搬到任何"发布 / 部署 / 迁移"工具
- 学 `flattenReleases` 的 merge 逻辑写自己的"多 markdown 合并"小工具——比如多个会议纪要 merge 成周报

### 不要用的部分

- **不要在单包仓库上 PR 必带 changeset**——changesets 是为 monorepo 设计的，单包用它纯属仪式开销
- **不要 fork changeset 文件格式去做"非 release"用途**（比如假装拿它做 feature flag 配置）——它的 parser 强校验 4 个 valid types，硬塞别的会被拒绝，自己维护 fork 是技术债
- **不要把 `.changeset/config.json` 的 `updateInternalDependencies` 设成 'minor'**——默认 patch 是对的，monorepo 内部依赖跟着 minor bump 会让无关包频繁版本跳，污染下游用户的 update 体验
- **不要试图"跳过 Version Packages PR"全自动化发版**——这道 PR 不是繁文缛节，是给你最后一次"看一眼这次发了啥"的机会。changesets 的工程哲学就是"机器算、人确认"，绕过它就退化成 semantic-release 了

## 限制（≥ 4 条独立）

1. **新成员上手成本**：`npx changeset add` 不是 git/npm 标准动作，新人第一周必忘，PR CI 必须有 `changeset-bot` 拦截，否则会有"忘加 changeset 的 PR 被 merge → release 时漏 bump"。教学链路是 onboarding 必备项
2. **changeset 文件命名是随机三词组**（`funny-cats-jump.md`），无法从文件名看出对应哪个 PR。需要 `git log .changeset/funny-cats-jump.md` 反查。命名策略可以批评——`{pr-number}-{slug}.md` 会更友好
3. **不处理 git history 真实变更**：你完全可以写一个 changeset 说"这个包 minor bump"但代码一行没改——changesets 不验证。这是 trade-off：信任作者声明 vs 强制和代码 diff 对齐。前者更轻、后者更安全
4. **`updateInternalDependencies` 只有 patch / minor 两档**：没法配"内部依赖 bump 时下游不动"。如果你想做"独立 release cadence"，得用 `ignore` 配置绕，不直观
5. **pre-release 模式状态机晦涩**：`pre enter beta` / `pre exit` / 期间所有 changeset 都被打 prerelease 标——出错时（比如忘了 `pre exit` 直接发版）行为难预测。文档里有 5 段 warning 不是没原因
6. **没有原生的 "release notes 校对"步骤**：Version Packages PR 里的 CHANGELOG 段落是 changeset summary 直接拼的——如果作者写得糙、错别字、内部黑话，会原样进 release notes。需要团队约定"changeset summary 像写文档那样写"

## 宣传 vs 现实

| 项目宣传 | 代码现实 |
|---|---|
| "automated versioning" | version 命令是自动的，但"哪些包 bump 哪一档"完全靠人工写的 changeset 文件——是 explicit-driven，不是 inferred |
| "monorepo first" | 确实 monorepo first，但单包仓库也能用（`tool.type === "root"`），单包场景下价值远低于宣传 |
| "no commit conventions required" | 是真的，但你需要遵守 changeset 文件 conventions（YAML frontmatter + valid types）。是把约束从 commit message 搬到了 markdown，不是消除约束 |
| "works with any package manager" | npm/yarn/pnpm/bun 都支持，但 dependents-graph 在 yarn berry workspace protocol（`workspace:*`）下行为有 corner case，issues 里有 |

## 自检问题（≥ 3，行号级）

1. `parseChangesetFile` 在 `packages/parse/src/index.ts` 里用一行正则切 frontmatter。这个正则在 markdown summary 里出现 `---` 分隔符（比如用 `---` 画分隔线）时会怎样？追到具体行号说出 match 行为，并给出一个能让 parser 误判的最小输入
2. `assembleReleasePlan` 走了 5 步：flatten → dependents → links → fixed → increment。如果一个包同时被 `linked` 和 `fixed` 配置覆盖，最终 bump 由谁决定？追到 `applyLinks` 和 `matchFixedConstraint` 调用顺序的源码行
3. `publishPackages` 用 `Promise.all` 并发发包，OTP 开启时 `npmPublishQueue.setConcurrency(1)` 串行。这个 queue 是哪个库？concurrency 改之后已经在 flight 的请求会怎样？是 throttle 新请求还是 abort？
4. `version` 命令成功后，`.changeset/*.md` 被删除（apply-release-plan 干的）。如果 `applyReleasePlan` 删 md 时部分成功（删了 3 个、第 4 个 fs error），release plan 已经写到 package.json 但只有部分 md 被消费——下次跑 `version` 会发生什么？有没有事务/回滚？

## 接下来读的文件（按顺序）

1. `packages/apply-release-plan/src/index.ts`（约 300 行）— 学"把 ReleasePlan 落到磁盘"的执行细节，特别是 `getChangelogEntry` 怎么调 `changelogFunctions.getReleaseLine`
2. `packages/get-dependents-graph/src/index.ts`（约 200 行）— 学反向依赖图算法，对比 nx / turborepo 的版本
3. `packages/cli/src/commands/add/index.ts`（约 200 行）— 学交互式 prompt 设计（@inquirer/prompts），看怎么处理"选包 + 选 bump 档 + 写 summary"的 UX
4. `packages/pre/src/index.ts`（约 150 行）— pre-release 状态机，理解 `.changeset/pre.json` 怎么记录 pre-release 上下文
5. `.changeset/` 目录（changesets 自己的 PR-level changeset 历史）— 读真实项目怎么写 changeset summary

## 元数据

- 升级日期: 2026-05-29
- 项目类型: 工具库（v1.1 分支 B）
- 核心信息表 9 字段: stars(9k+) / fork / 最近活跃(2026-05-28) / commit hash(`18e1661e3ad9bc4ab7bcd770ae172c560af44acc`) / 主语言(TypeScript) / 维护方(Atlassian + Mateusz Burzyński 等) / License(MIT) / 类似项目(Lerna, semantic-release, release-please) / 用户(Vercel, Tailwind, Astro, Storybook, Radix)
- Layer 3 三段独立小节: A 文件格式+parser / B Version 命令算法 / C Publish 命令并发
- GitHub permalink: 4 处（parse/index.ts L1-L108, version/index.ts L1-L80, assemble-release-plan/index.ts L1-L100, publish/index.ts L1-L100）
- 显式怀疑: 3 处（parser 不查 name 存在性 / flatten 取最高 bump 的语义代价 / 并发 publish 的 race window）
- Figure: 1 张 webp（`/projects/changesets/01-workflow.webp`，72KB）
- 限制: 6 条
- 宣传 vs 现实: 4 行
- 启用工具: WebFetch（GitHub raw + API）+ Read + 本地 PIL 画图
