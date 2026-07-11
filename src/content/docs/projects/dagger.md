---
title: Dagger — 用真正的编程语言写 CI pipeline
来源: https://github.com/dagger/dagger
日期: 2026-05-31
分类: DevOps
难度: 中级
---

## 是什么

Dagger 是一个**让你用 Go / TypeScript / Python 写 CI/CD pipeline、而不是写 YAML 的工具**。它由 Docker 联合创始人 Solomon Hykes 在 2018 年离开 Docker 之后创立，目标是把"构建、测试、发布"这件事从配置文件里解放出来。

日常类比：**写 YAML pipeline 像填一张冗长的报销单**——格式严苛、字段固定、改一行还要等 CI 跑完才知道写错没。**Dagger 像让你直接给会计写一个小程序**——程序怎么算、跑出什么结果，IDE 当场就告诉你，跑前就能本地试。

最简单的体验，写一个 TypeScript 函数：

```ts
import { dag, Directory, Container, object, func } from '@dagger.io/dagger'

@object()
class MyApp {
  @func()
  test(source: Directory): Container {
    return dag.container()
      .from('node:20')
      .withDirectory('/app', source)
      .withWorkdir('/app')
      .withExec(['npm', 'ci'])
      .withExec(['npm', 'test'])
  }
}
```

然后跑 `dagger call test --source=.`。本地起容器、装依赖、跑测试，结果直接打印。**这段代码搬到 GitHub Actions 上一字不改也能跑**。

## 为什么重要

不理解 Dagger 的设计哲学，下面这些事都没法解释：

- 为什么"在我这能跑、CI 上又挂了"在用 Dagger 的项目里能被根除——本地和 CI 调用的是同一个 Engine，跑的是同一份代码
- 为什么改 pipeline 不用每次 push 等 5 分钟才知道写错——在 IDE 里就有类型提示和补全，本地能跑能调
- 为什么有人愿意把数百行 GitHub Actions YAML 重写成 100 行 TypeScript——因为前者没法抽函数、没法 import、没法测试
- 为什么 BuildKit 的内容寻址缓存能让"看起来从零开始"的 pipeline 跑得飞快——同样输入永远命中缓存

简单说：**它把 CI 从"运维写的一次性脚本"升级成"工程师写的可复用代码"**。

## 核心要点

Dagger 的核心模型可以拆成 **三件事**：

1. **Engine**：本地（或远程）跑的容器引擎，基于 BuildKit。它通过 GraphQL API 暴露所有能力——拉镜像、跑命令、挂目录、保存产物。

2. **SDK + Functions**：Go / TypeScript / Python SDK 把 GraphQL API 包装成原生类型。你写带 `@func` 装饰器的函数，Dagger CLI 就能直接调用：`dagger call build --src=.`。

3. **内容寻址缓存**：每个 step 都被翻译成 BuildKit 的 LLB（Low-Level Builder）操作，输入哈希一致就复用结果。改了一行代码只重跑受影响的 step。

简单说：**SDK 写的是声明式图谱，Engine 翻译成 LLB 跑，缓存替你省 80% 的时间**。

## 实践案例

### 案例 1：本地跑测试，零 YAML

```ts
@func()
async test(): Promise<string> {
  return await dag.container()
    .from('python:3.12')
    .withDirectory('/app', dag.host().directory('.'))
    .withWorkdir('/app')
    .withExec(['pip', 'install', '-r', 'requirements.txt'])
    .withExec(['pytest'])
    .stdout()
}
```

跑 `dagger call test`。第一次慢，之后只要 `requirements.txt` 没变，pip 那层就走缓存秒过。**和写 Earthfile 像，但你能 import 工具函数、能跑单测、能在 IDE 里跳定义**。

### 案例 2：函数复用 + 多语言流水线

```ts
@func()
deps(src: Directory): Container {
  return dag.container().from('node:20')
    .withDirectory('/app', src)
    .withWorkdir('/app')
    .withExec(['npm', 'ci'])
}

@func()
build(src: Directory): Directory {
  return this.deps(src)
    .withExec(['npm', 'run', 'build'])
    .directory('/app/dist')
}

@func()
publish(src: Directory): Promise<string> {
  return this.build(src)
    .dockerBuild()
    .publish('ghcr.io/me/app:latest')
}
```

逐部分解释：

- `deps` 把"装依赖"切成可复用函数，等价于 Earthly 的 target 但是真函数
- `build` 调 `this.deps(src)` 接上一步——**像写普通代码，没有 DSL**
- `publish` 一直接到 push 镜像，整条链由 BuildKit 智能跳过没变的步骤

跑 `dagger call publish --src=.`，全链路一行命令。

### 案例 3：CI 里跑同一份函数

GitHub Actions 配置：

```yaml
- uses: dagger/dagger-for-github@v6
  with:
    version: '0.13'
    verb: call
    args: test --source=.
```

**关键点**：开发者本机跑的 `dagger call test` 和 CI 跑的命令一字不差，Engine 也是同一版本——除非差在 secrets / 权限 / 网络，本地过了 CI 大概率也会过。

## 踩过的坑

1. **Engine 启动慢**：第一次跑 `dagger call` 会拉 Engine 镜像（几百 MB）+ 启容器，可能要 30 秒。之后 Engine 常驻，每次调用毫秒级。CI 上这一笔不可避免。

2. **缓存依赖输入哈希**：`withDirectory` 默认会哈希整个目录。把 `node_modules`、`.git` 一起挂进去会导致每次哈希都变、缓存全失效。正确做法：传一个过滤过的 Directory，或用 `.withMountedCache` 单独挂可缓存目录。

3. **Function 的可见性**：只有标了 `@func` 的方法才能被 `dagger call` 调用。私有辅助函数不加装饰器，避免误曝光给 CLI。

4. **GraphQL 同步坑**：SDK 链式调用是惰性的——直到你 `await stdout()` 或 `directory()` 时才真的发请求。在循环里忘记 await 会导致并行跑出意料之外的顺序。

## 适用 vs 不适用场景

**适用**：

- 复杂 CI pipeline（多语言、多产物、多环境矩阵）希望抽函数复用
- 团队对 CI 调试痛苦（push-wait-fail 循环）严重，想本地反复跑
- 已经在用 BuildKit / Docker，想把 CI 的缓存策略对齐
- 需要把 pipeline 跨多个仓库共享——可以发布成 Dagger Module

**不适用**：

- 简单到只跑一两条 npm test 的项目——直接写 GitHub Actions YAML 即可
- 团队完全不懂 Go/TS/Python，运维人员只会写 YAML——学习曲线还是有的
- 完全离线 / 无容器运行时的环境 → Engine 必须能拉镜像、起容器
- 实时性极高的 webhook 触发场景 → Engine 启动开销在意

## 历史小故事（可跳过）

- **2018 年**：Solomon Hykes 离开 Docker，开始想"如果 Docker 是 90 年代以来开发流程最大的一次跃迁，那么下一次跃迁是什么"。
- **2022 年**：Dagger 公开发布，初代用 CUE 语言写 pipeline DSL。社区反应分化——CUE 学习成本高，写起来不顺手。
- **2023 年**：v0.3 大改版，抛弃 CUE DSL，提供 Go / TypeScript / Python SDK。**这是项目的转折点**——"用真正语言写 CI"才是杀手级定位。
- **2024 年**：v0.10+ 引入 Dagger Cloud（远程缓存 + trace 可视化）；Functions 与 Modules 机制完善，开始有跨项目复用案例。
- **现在**：14k+ GitHub stars，Replicated 等团队在生产 CI 用，社区生态以模块（Module）形式扩展。

## 学到什么

1. **配置 vs 代码** —— 当一份 YAML 超过 100 行，就在用一种"残废的编程语言"。Dagger 直接给你完整的语言。
2. **缓存即性能** —— 内容寻址 + LLB 是从 BuildKit 学来的核心机制，比 Earthly 那套层缓存更精确
3. **本地 = CI 是个强约束** —— 一旦做到这点，"环境差异"这类 bug 的根因被根除
4. **从 DSL 撤回到通用语言** —— 项目自我修正：v0.3 抛弃 CUE 是承认了"用户想要的不是新 DSL，而是少写 YAML"

## 延伸阅读

- 官方文档：[Dagger Documentation](https://docs.dagger.io/)（Quickstart 最快）
- 创始人讲解：[Solomon Hykes — Dagger Intro](https://www.youtube.com/results?search_query=solomon+hykes+dagger)（30 分钟把转向通用语言的动机讲透）
- 与 Earthly 对比：[Dagger vs Earthly Discussion](https://github.com/dagger/dagger/discussions)（社区里能找到很多迁移笔记）
- GitHub 仓库：[dagger/dagger](https://github.com/dagger/dagger)（看 examples 目录上手最快）
- [[github-actions]] —— Dagger 最常被部署的 CI 平台，两行配置即可
- [[earthly]] —— 同问题域的 DSL 路线，对比能看清"DSL vs 通用语言"两条路

## 关联

- [[earthly]] —— 同问题域的"DSL 路线"，Dagger 走的是"通用语言路线"，对比能看清两条思路
- [[github-actions]] —— Dagger 最常作为 GH Actions 里一个步骤跑，本地写本地调
- [[drone]] —— 容器原生 CI 的早期代表，Dagger 把"容器内跑"从 YAML 升级到代码
- [[tekton]] —— Kubernetes 原生 CI，与 Dagger 都依赖容器，但 Tekton 仍是 YAML/CRD 配置
- [[jenkins]] —— 老牌 CI，Jenkinsfile 是 Groovy 脚本，Dagger 把这条思路推到完整语言
- [[nix]] —— 另一条"可重复构建"路线，更纯粹但更难入门，Dagger 用容器做了 80% 的事

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
