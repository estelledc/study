---
title: changesets — 让每个 PR 自带版本号 bump 声明
来源: 'changesets/changesets, GitHub 11.9k stars, MIT 协议'
日期: 2026-05-29
分类: 工具库
难度: 中级
---

## 是什么

changesets 是 monorepo 的**版本管理 + changelog 自动化工具**。日常类比：像在每个快递包裹上贴一张面单——上面写明这次发货影响哪些商品、是大件还是小件。等仓库要发货时，工具读所有面单，自动算清单、贴标签。

具体来说，开发者写完代码跑 `npx changeset add`，CLI 问你：改了哪些包？major / minor / patch？写一句变更说明。它生成一个 markdown 文件 `.changeset/funny-cats-jump.md`，跟 PR 一起 review、一起 merge。等 release 时 CI 跑 `changeset version`，把所有累积的 markdown 翻译成 package.json 版本 bump + CHANGELOG 段落。

它由 Atlassian 的 Mitchell Hamilton 开源，Vercel / Astro / Storybook / Chakra UI / SvelteKit / Remix 在用。

## 为什么重要

不理解 changesets，下面这些事很难想清楚：

- 为什么 monorepo 发版比单包难——一个 PR 改 5 个包，每个该 bump 哪一档，谁来决定
- 为什么 semantic-release（commit message 推断）在 squash merge 后版本会跳错
- 为什么"全自动发版"听起来好，但成熟项目都留一道"Version Packages" PR 给人 merge
- 为什么 versioning 的 source of truth 应该是磁盘上的 markdown，不是 commit message 也不是 release 经理脑子

## 核心要点

changesets 的设计可以拆成 **三步**：

1. **版本决策前置到 PR 时刻**：作者在写代码同时就声明这次该 bump 啥。类比：装修工每钉一颗钉子时就在墙上贴张小纸条写"这是承重墙的钉子"，而不是装修完再回忆。

2. **状态全在磁盘上**：每个 changeset 是 `.changeset/` 目录下的一个 markdown 文件。没有"工具内部状态"、没有数据库。`git diff` 看得清清楚楚，merge 永远不冲突（每个 PR 一个独立 md）。

3. **跨包依赖自动传播**：包 A 改了，包 B 在 dependencies 里 import 了 A——工具自动 bump B（默认 patch）。这一步靠"反向依赖图"算，不靠人记忆。

合起来一句话：**"machine 算清单、human 确认 release"**。

## 实践案例

### 案例 1：一个 changeset 文件长什么样

```markdown
---
"@my-org/pkg-a": minor
"@my-org/pkg-b": patch
---

Add new public API for cat juggling.

Now `pkg-a` exposes `juggle(cats: Cat[])`. `pkg-b` adds matching types.
```

**逐部分解释**：

- 顶部 YAML frontmatter：key 是包名，value 是 bump 档（`major` / `minor` / `patch` / `none`）
- 下面 markdown body 是给 CHANGELOG 用的描述
- 文件名是随机三词组（`funny-cats-jump.md`）——保证多 PR 不会撞名

### 案例 2：30 分钟跑通

```bash
mkdir test-changesets && cd test-changesets
npm init -y
npm install -D @changesets/cli
npx changeset init                   # 生成 .changeset/config.json

# 假装一个 monorepo
mkdir -p packages/{pkg-a,pkg-b}
echo '{"name":"@test/pkg-a","version":"0.1.0"}' > packages/pkg-a/package.json
echo '{"name":"@test/pkg-b","version":"0.1.0","dependencies":{"@test/pkg-a":"^0.1.0"}}' > packages/pkg-b/package.json
echo '{"name":"root","private":true,"workspaces":["packages/*"]}' > package.json

npx changeset                        # 选 pkg-a，bump minor，写 summary
npx changeset version                # 自动 bump、写 CHANGELOG、删 changeset 文件
```

跑完后：

- `pkg-a`：`0.1.0` → `0.2.0`
- `pkg-b`：`0.1.0` → `0.1.1`（dependents 自动 patch bump）
- 两个包都生成 `CHANGELOG.md`
- `.changeset/*.md` 被删除（已消费）

### 案例 3：版本号是怎么算出来的

`assemble-release-plan` 是核心算法，5 步纯函数：

1. **flatten**：多个 changeset 改同一包 → merge 成一个，取最高 bump
2. **dependents**：找谁依赖了变更包，按 config 决定要不要跟着 bump
3. **links / fixed**：`config.linked` / `config.fixed` 强制几个包 group bump
4. **increment**：用 semver 算 `newVersion = bump(oldVersion, type)`
5. **output**：返回 ReleasePlan（每个包的新版本 + 该写的 CHANGELOG 段落）

每一步都是纯函数：同样的 changeset 文件 + 同样的 package.json，跑一万次结果一样。这种 single source of truth 设计让 release 行为完全可预测。

## 踩过的坑

1. **新人 PR 必忘加 changeset**：`npx changeset add` 不是 git/npm 标准动作，第一周必踩。CI 必须配 `changeset-bot` 拦截，否则会有"忘加 changeset 的 PR 被 merge → release 时漏 bump"
2. **changeset 文件名是随机三词组无法溯源**：`funny-cats-jump.md` 看不出对应哪个 PR，得 `git log .changeset/funny-cats-jump.md` 反查
3. **flatten 取最高 bump 会丢"step 数"**：3 个 changeset 是 [minor, patch, major]，flatten 后只跳一档 major。CHANGELOG 列三段，但版本号只 +1 个 major
4. **不验证 git diff**：你完全可以写一个 changeset 说"这个包 minor"但代码一行没改——changesets 不查。trade-off 是信任作者声明 vs 强制对齐 diff

## 适用 vs 不适用场景

**适用**：

- pnpm / yarn / npm workspace monorepo（pnpm 适配最好）
- 想让 reviewer 在 PR 阶段就看到"这个改动是 breaking 还是 patch"
- 团队接受多一个步骤（写 changeset）换 release 透明度
- 需要 snapshot release（PR preview 包）—— `changeset version --snapshot` 原生支持

**不适用**：

- 单包仓库——`npm version` 就够，装 changesets 纯属仪式开销
- 想要全自动发版无人参与——changesets 的"Version Packages" PR 必须人 merge，绕过它就退化成 semantic-release
- commit message 严格规范的项目——semantic-release 从 `feat:` / `fix:` / `BREAKING:` 推断，更省事
- 没有 monorepo 工具基础（没用 pnpm / yarn workspace）——先解决 workspace 再装 changesets

## 历史小故事（可跳过）

- **2019 年**：Atlassian 的 Mitchell Hamilton 在做 design system monorepo 时受不了 Lerna 的 release-time 决策模式，做了第一版
- **2020 年**：项目移到独立 GitHub org `changesets/changesets`，完全开源
- **2021 年**：v2 rearchitecture（Thinkmill 赞助），把 monolithic CLI 拆成约 30 个独立小包，每包 surface 小、单一职责
- **2022 年起**：Vercel / Astro / Storybook / Chakra UI / SvelteKit 成为主要用户；GitHub Action `changesets/action@v1` 让"自动开 Version Packages PR"成为标准模式
- **2026 年**：11.9k stars，仍在活跃维护，每周都有 release

## 学到什么

1. **状态在磁盘上 vs 状态在工具内部**——前者可见、可 review、可手改；后者依赖工具版本和黑盒
2. **决策前置**：能在 PR 时回答的问题，不要拖到 release 时回答——人会忘，reviewer 也参与不了
3. **machine 算 + human 确认** 的两段式比"全自动"更稳健，留一道人门是 feature 不是 bug
4. **monorepo 的版本管理是 dependents-graph 问题**——把这一步独立成纯函数包（`@changesets/get-dependents-graph`）让其他工具也能复用

## 延伸阅读

- 官方文档：[Intro to using changesets](https://github.com/changesets/changesets/blob/main/docs/intro-to-using-changesets.md)（10 分钟读完工作流）
- 设计动机：[Detailed explanation](https://github.com/changesets/changesets/blob/main/docs/detailed-explanation.md)（讲清楚为什么不用 commit message）
- 视频教程：[Changesets — automating versioning and publishing](https://www.youtube.com/watch?v=g0gJN0MPlVc)（30 分钟动手演示）
- [[lerna]] —— 上一代 monorepo 版本工具，对比看决策模式差异
- [[pnpm]] —— changesets 默认搭配的 package manager
- [[turborepo]] —— monorepo build 工具，和 changesets 职责互补

## 关联

- [[lerna]] —— Lerna 在 release 时人工选 bump 档；changesets 把这步推到 PR 时刻，是"决策前置"的范式转换
- [[pnpm]] —— pnpm workspace 是 changesets 最常见的运行环境，workspace protocol 适配最好
- [[turborepo]] —— turborepo 管 build / cache，changesets 管 version / publish，两者职责不重叠
- [[nx]] —— nx 也有自己的 release 工具（nx release），思路接近 changesets 但绑死 nx 生态
- [[biome]] —— Biome 自己用 changesets 发版，可以读它的 `.changeset/` 目录学怎么写 summary
- [[astro]] —— Astro 是 changesets 的重度用户，每个 release PR 都很标准

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[electron-builder]] —— electron-builder — Electron 打包发布事实标准
- [[lerna]] —— lerna — 一个仓库发几十个 npm 包的祖宗工具
