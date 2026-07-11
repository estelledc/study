---
title: Nx — 一个仓库装几十个项目时帮你少跑活的工具
来源: 'https://github.com/nrwl/nx'
日期: 2026-05-30
分类: 前端工程化
难度: 中级
---

## 是什么

Nx 是一个**让你把几十个项目塞进同一个仓库还不卡**的工具。日常类比：像装了 ETC 的高速收费站——你的车（任务）经过时，系统先看你的车牌（文件 hash），如果之前来过就直接放行，不用再付钱（重新跑）。

你写：

```bash
nx build my-app
```

第一次老老实实跑完 build。第二次只要源码没改，Nx 看一眼 hash 直接复用上次结果，零秒返回。如果改了 my-app 但没改它的依赖，只重跑 my-app；改了它的依赖，才会顺着图重跑下游。

这种"按需跑、能缓就缓"的能力，是大公司把几百个 package 塞进一个仓库还能让 CI 在 10 分钟内跑完的核心。

## 为什么重要

不理解 Nx，下面这些事都没法解释：

- 为什么大公司前端把所有项目放一个仓库还不会卡——靠的是 task graph + 缓存
- 为什么 [[turborepo]] 起步快但 [[lerna]] 慢慢退场——同一个赛道不同抽象层
- 为什么改一行代码 CI 跑 2 分钟而不是 20 分钟——affected 算法只跑受影响的项目
- 为什么 monorepo 工具都叫"build system"——它们的核心不是 build，是调度 + 缓存

## 核心要点

Nx 干的事可以拆成 **三件**：

1. **画图（project graph）**：先扫所有 package.json 和 import 语句，画出"谁依赖谁"。类比：像超市把货架按"买面包的人也常买黄油"理出关系图。

2. **跑任务（task runner）**：按图的拓扑序跑。先跑没人依赖的叶子（utils），再跑依赖它的（components），最后跑 app。类比：装修必须先打地基再砌墙再刷漆。

3. **算 hash 命中缓存**：每个任务的输入文件 + 配置 + 依赖 hash 拼成一个 cacheKey，命中就复用上次的产物和 stdout。类比：菜谱 + 食材一样，那道菜应该一样，没必要再炒一遍。

三件事加起来叫 **Nx 调度内核**，本地有 `.nx/cache/`，付费版 Nx Cloud 还能把缓存上云、把任务拆给多台机器并行（叫 DTE，distributed task execution）。

## 实践案例

### 案例 1：建一个新库不用手写配置

```bash
npx nx g @nx/js:lib utils --directory=packages/utils
```

执行完会自动做四件事：

- 在 `packages/utils/` 下生成 `src/index.ts`、`README.md`、`tsconfig.json` 模板
- 在根 `tsconfig.base.json` 注册 `@org/utils → packages/utils/src/index.ts` 路径映射
- 写一份 `project.json` 注册 build 和 test 两个 target
- 跑一次 prettier 让风格和仓库其余代码对齐

这就是 Nx 的 **generator**——把"建库时该做的几件事"沉淀成一个命令。比手写省 5 分钟，也避免漏掉某一步。

### 案例 2：只测改动影响到的项目

```bash
nx affected --target=test --base=main
```

Nx 比较当前分支和 main 之间改了哪些文件，沿 project graph 反推哪些项目被波及，**只跑这些项目的 test**。在一个有 50 个 package 的仓库，可能从"跑 200 个 test 文件"压到"跑 8 个"。

CI 上这一招是金子。配合 `--parallel=3` 把这 8 个 test 拆到 3 个进程并行，2 分钟搞定原本 20 分钟的活。

### 案例 3：看缓存到底命中了什么

```bash
NX_PERF_LOGGING=true npx nx build utils
```

第一次跑会看到 build 真实耗时。第二次同样命令瞬间返回，日志会写 `[remote cache] cache hit, key=abc123...`。

```bash
ls -lah .nx/cache/abc123/
cat .nx/cache/abc123/terminalOutputs/build.txt
```

里面就是上次的 stdout，原样回放。这种"连日志都缓存"的设计，让你看 CI 失败原因时，cached 任务的报错也不丢。

## 踩过的坑

1. **tsconfig.paths 改一行触发全图重建**：cache 失效的判定颗粒太粗，`packageJsonDeps + nxJson + rootTsConfig` 任一变化就全量重算 graph，5000+ 文件项目里每次微调要等 30 秒起步。

2. **generator/executor 双轨学习曲线陡**：对只想跑 build/test 的小团队，Nx 比 Turborepo 多出来的两个抽象（脚手架 + 执行器）经常是过度设计，10 人以下团队用 Turborepo 更合身。

3. **DTE 是付费功能**：免费版 Nx Cloud 只有 remote cache，分布式任务执行要按 agent 数收费。营销文案常把 DTE 当 Nx 的标准能力宣传，新人接入时容易踩坑。

4. **schema 演进太快**：从 `workspace.json` 拆到 `project.json + nx.json`，每两个大版本就要迁移一次。`nx migrate` 自动跑完还要手 review 50+ 文件，所谓"无痛升级"是营销话术。

## 适用 vs 不适用场景

**适用**：

- 中到大型 monorepo（20+ package）想要开箱即用的 task 调度 + 缓存
- 团队需要统一脚手架（generator 帮新人少踩坑）
- TypeScript 一等公民的前端栈（React / Vue / Angular / Node）
- 重复 build / test 多、CI 时间是瓶颈的项目

**不适用**：

- 5 个以下 package 的小仓库——直接 [[pnpm]] workspaces + npm scripts 够用
- 跨语言（Python / Rust / Go）大型 monorepo——Bazel 更合适
- 不愿付费但又需要分布式执行——免费版只有缓存
- 团队不接受"框架感"，想保持配置极简——选 [[turborepo]]

## 历史小故事（可跳过）

- **2017 年**：Nrwl（前 Angular 团队成员创立的咨询公司）开源 Nx，最早只是给 Angular CLI 加 monorepo 能力。
- **2018 年**：把 schematics 改造成 generator，把 builder 改造成 executor，确立 devkit 双轨抽象。
- **2019 年**：6.x 转型跨框架，把 React 当一等公民，Angular 反而退到平等位置。同年推出 Nx Cloud，提供 remote cache。
- **2021 年**：Nx Cloud 推出 DTE（distributed task execution），把 task graph 拆到多台 agent 并行。
- **2022 年**：用 Rust 重写 hasher 模块，本地 graph 构建从秒级压到百毫秒级。
- **2024 年**：Nrwl 被 Nx 自身收编（公司直接以产品命名），整合咨询团队全力推产品。

## 学到什么

1. **缓存的边界比缓存本身更重要**——文件级 hash 比 project 级颗粒度细，但太细会让 hash 计算比真跑还慢
2. **把"做事的方式"抽象成一等公民**——不要让"怎么建库""怎么跑测试"散落在 README，沉淀成 generator/executor
3. **商业层差异化点要选对**——Nx Cloud 选 DTE 因为这是大 monorepo 的真痛点，没选"更好看的 UI"或"更多 plugin"
4. **跨框架转型有代价但值得**——Nx 放弃了 angular.json 的简洁，换来 React/Vue/Node 的一等支持，市场扩大十倍
5. **显式版本号比 hash 比对更稳**——Nx 用 `projectGraphVersion = '6.0'` 标记 graph 协议，旧缓存自动失效，比"靠所有输入 hash 比"更可控

## 延伸阅读

- 视频：[Nx 官方 10 分钟入门](https://nx.dev/getting-started/intro)（动画讲清楚 graph + cache）
- 文档：[Nx Recipes](https://nx.dev/recipes)（按场景查的食谱集，比 Concepts 实用）
- [[turborepo]] —— Nx 最直接的对手，更轻更专注 build
- [[lerna]] —— Nx 的前辈，被 Nrwl 接管后基本退出舞台
- [[pnpm]] —— Nx 推荐的底层包管理器，本身只管依赖不管调度

## 关联

- [[turborepo]] —— 同赛道竞品，更轻但缺 generator 和 IDE 集成
- [[lerna]] —— 早期 monorepo 工具，被 Nrwl 接管后基本归一
- [[pnpm]] —— 底层包管理器，Nx 调度的依赖来源
- [[vite]] —— Nx 的 `@nx/vite` 插件把 Vite 包成 executor
- [[jest]] —— Nx 的 `@nx/jest` 插件把 Jest 包成 executor
- [[rollup]] —— Nx 默认的库 bundler 之一
- [[webpack]] —— Nx 早期默认 bundler，新项目逐步被 Vite/Rolldown 取代

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[changesets]] —— changesets — 让每个 PR 自带版本号 bump 声明
- [[lerna]] —— lerna — 一个仓库发几十个 npm 包的祖宗工具
- [[listr2]] —— listr2 — 把 CLI 任务跑成一棵会自己画进度的树
- [[turborepo]] —— Turborepo — 让 monorepo 学会"哪些活已经干过了不要再干"
