---
title: lerna — 一个仓库发几十个 npm 包的祖宗工具
来源: 'https://github.com/lerna/lerna'
日期: 2026-05-30
分类: 前端工程
难度: 初级
---

## 是什么

lerna 是一个**让你一条命令把"一个仓库里几十个 npm 包"全部发出去**的工具。日常类比：像快递站老板，你把 30 个包裹一起递过去，他自己看哪个该贴 1.0、哪个该贴 1.1，再按"先寄轻的再寄重的"顺序送出去——你不用一个一个跑。

具体来说，你的项目长这样：

```
my-monorepo/
  packages/
    util/          ← 包 A
    core/          ← 包 B（依赖 A）
    cli/           ← 包 C（依赖 B）
  lerna.json       ← lerna 配置
  package.json
```

跑 `lerna publish`，它会：扫描所有包 → 算依赖关系 → 帮你 bump 版本号 → 按"被依赖的先发"顺序依次 `npm publish`。**没有 lerna 之前**，开发者要手动改 30 个 package.json 的版本号、手动 npm publish 30 次、还要记住先发哪个后发哪个。

## 为什么重要

不理解 lerna 这一代工具，下面这些事都没法解释：

- 为什么 Babel / React / Jest 这些大项目都是 monorepo（一个仓库装几十个 npm 包），而不是 30 个独立 git 仓库
- 为什么 2022 年 lerna 36k stars 还宣布 EOL，再被 Nx 团队"收尸"——开源工具如何代际更替
- 为什么现在新项目都用 pnpm + changesets + Turborepo 三件套，而不再用 lerna
- 为什么 monorepo 工具一定要解决"拓扑排序发版"——谁先发谁后发不能搞错

## 核心要点

lerna 的工作可以拆成 **三步**：

1. **扫包**：读 `lerna.json` 知道哪些目录是包（默认 `packages/*`），把每个目录的 `package.json` 都加载进来。类比：班主任点名，先把全班学生登记到花名册。

2. **算图 + 拓扑排序**：从每个包的 `dependencies` 找出"谁依赖谁"，画成一张依赖图。发版时按"叶子节点先发"——被依赖的包先到 npm，后面的包才能查到它。类比：工地浇混凝土，地基先干，柱子才能立。

3. **bump 版本 + publish**：lerna 有两种模式，**fixed**（所有包共用一个版本号，一改俱改）和 **independent**（每个包各自维护版本号）。决定好版本后，按拓扑顺序逐个 `npm publish`。

这三步加起来就是经典的 lerna 工作流，今天的 changesets / Nx / Turborepo 都在沿用。

## 实践案例

### 案例 1：搭一个最小 monorepo

```bash
mkdir my-mono && cd my-mono
npm init -y
npx lerna@latest init   # 生成 lerna.json + packages/ 目录
```

生成的 `lerna.json` 长这样：

```json
{
  "version": "0.0.0",
  "npmClient": "npm"
}
```

只有两行。**逐部分解释**：`version: "0.0.0"` 表示用 fixed 模式且当前全局版本号是 0.0.0；`npmClient` 告诉 lerna 你用 npm（也可填 yarn/pnpm，pnpm 还要配 `pnpm-workspace.yaml`）。`packages/` 是放子包的默认目录。

### 案例 2：fixed mode vs independent mode

`lerna.json` 里只改一个字段就切换：

```json
{ "version": "1.2.3" }              // fixed mode：所有包都是 1.2.3
{ "version": "independent" }        // independent mode：每个包自己维护版本号
```

**怎么选**：包之间紧密耦合（像 React 的 react / react-dom 必须版本对齐）→ fixed；包独立演化（像一组 utility 包，A 改了 B 不一定要发）→ independent。**踩坑提醒**：fixed 改一个包，所有包都升一档版本号，下游用户会看到一堆"没改动也升版本"的包。

### 案例 3：拓扑发布

假设 `@demo/cli` 依赖 `@demo/core`，`@demo/core` 依赖 `@demo/util`，跑：

```bash
npx lerna publish --yes
```

输出顺序是：

```
publishing @demo/util  ✓
publishing @demo/core  ✓     ← util 已在 npm 上，core 才能 resolve
publishing @demo/cli   ✓     ← core 已在 npm 上，cli 才能 resolve
```

**为什么必须这个顺序**：cli 的 `package.json` 里写着 `"@demo/core": "^1.2.0"`，npm publish 时 registry 会校验 core 是否存在；如果 core 还没发，cli 这一步就 404。lerna 自动按依赖图排序解决这件事。

## 踩过的坑

1. **fixed mode 让用户重复升级**——改一个包导致全部升版本，用户下载到一堆"没改动却换号"的包，CHANGELOG 也全是空的。新项目大多选 independent 模式避免这个。

2. **conventional commits 写错就 bump 错**——`independent + --conventional-commits` 时 lerna 看 commit 前缀决定 major/minor/patch；把 `feat:` 写成 `fix:` 直接少升一档，发出去的 1.2.4 实际是 breaking change，下游 CI 全爆。

3. **`--reject-cycles` 默认是 false**——两个包循环依赖时 lerna 不报错，而是把它们放到同一并发批"破环发布"，可能 race condition（A 引用 B 老版本）。生产环境必须显式开 `--reject-cycles=true`。

4. **`lerna bootstrap` 在 v7 已删除**——历史上 lerna 最有名的命令现在不存在了。npm 7 / yarn / pnpm 都内置 workspace 自动 symlink。如果博客是 2022 之前的、出现 `lerna bootstrap` 字样，直接换成 `npm install` 即可。

## 适用 vs 不适用场景

**适用**：

- 老项目存量迁移——已经用 lerna 多年，升 lerna v8 跟 Nx 团队走，比从头换工具链便宜
- 只需要 version + publish 两个能力，不想引 Nx / Turborepo 全套
- 团队习惯了 fixed 模式批量发版，且包之间耦合紧

**不适用**：

- 新项目从零搭 monorepo——直接用 [[pnpm]] workspace + [[changesets]] + [[turborepo]] 三件套，更轻、维护更活跃
- 需要 task pipeline + remote cache（构建结果跨机器复用）→ 用 [[turborepo]] 或 [[nx]]，lerna 完全没有
- 需要严格控制每次发版语义——用 [[changesets]] 的"显式声明"模式，比 conventional commits 更可控

## 历史小故事（可跳过）

- **2015 年**：Babel 作者 Sebastian McKenzie 在管 100+ 包的 Babel 仓库时手动发版崩溃，写了个内部脚本，后来抽出来开源叫 lerna。
- **2017-2020 年**：React / Jest / Vue 2 / Angular CLI / NestJS 全用 lerna，stars 飙到 36k+。
- **2022 年 4 月**：原维护者 Daniel Stockman 宣布精力不足，仓库 600+ issue 堆积，社区炸锅。
- **2022 年 5 月**：Nrwl（[[nx]] 的母公司）宣布接管，把 lerna 重写到 Nx 项目图之上。
- **2024 年（v7）**：bootstrap 命令被删除——npm/yarn/pnpm 都已内置 workspace，bootstrap 失去存在理由。

之后 lerna 实质成了 Nx 的 version+publish 子集，工具死了但工作流还活着。

## 学到什么

1. **monorepo 的核心是"统一发版"，不是"一个仓库放多个包"**——单纯放一起谁都会，难的是版本怎么 bump、谁先 publish
2. **拓扑排序在工程里到处出现**——发版顺序、构建顺序、模块加载顺序，都是同一个图算法的不同应用
3. **工具的"先发优势"在快速演化的开发领域不可持续**——lerna 36k stars 仍然在 5 年内被换代，选型要看维护活跃度而不只是 star 数
4. **EOL 不一定是死亡**——开源被收购重写到新基座是常见结局，理解收购方的商业目的才能判断未来走向

## 延伸阅读

- 接管公告：[Nrwl blog "We're taking over Lerna"](https://blog.nrwl.io/lerna-is-dead-long-live-lerna-61259f97dbd9)（讲为什么收 + 怎么改）
- 官方文档：[lerna.js.org](https://lerna.js.org)（v8 现状版，注意已无 bootstrap 章节）
- 替代方案对比：[Monorepo.tools](https://monorepo.tools)（Nx 团队维护，但对比尚算公允）
- [[nx]] —— 收编 lerna 的母体，理解 lerna 现状必读
- [[changesets]] —— version 管理的现代替代

## 关联

- [[nx]] —— Nx 团队 2022 接管 lerna 并把它重写到 Nx 项目图之上
- [[turborepo]] —— 同代 monorepo 工具，专注 task pipeline + remote cache
- [[pnpm]] —— 用 workspace + hardlink 把 lerna 的 bootstrap 命令"吃掉"了
- [[changesets]] —— intent-based 的版本管理，比 lerna 的 conventional commits 更可控
- [[npm]] —— lerna 最终调用的底层 publish 命令
- [[git]] —— lerna version 命令打 tag、查 changed 都依赖 git

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[changesets]] —— changesets — 让每个 PR 自带版本号 bump 声明
- [[framer-motion]] —— Framer Motion — React 声明式动画
- [[jest]] —— Jest — 一个包就能跑 JS 测试的全家桶
- [[nx]] —— Nx — 一个仓库装几十个项目时帮你少跑活的工具
- [[turborepo]] —— Turborepo — 让 monorepo 学会"哪些活已经干过了不要再干"
