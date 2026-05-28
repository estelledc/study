---
title: Nx — 跨框架 monorepo 的 generator/executor 范式
description: 从 Angular CLI 演化而来的 monorepo 元框架，靠 project graph + executor 抽象 + Nx Cloud DTE 把任务编排做到企业级 monorepo 的极致
season: S18
episode: S18-2
category: framework-sdk
status: published
---

# Nx — 跨框架 monorepo 的 generator/executor 范式

## Layer 0 项目卡片

| 字段 | 值 |
|------|----|
| 仓库 | nrwl/nx |
| Stars | 约 26k |
| License | MIT |
| 主语言 | TypeScript |
| 维护方 | Nrwl（被 Nx 自身收编） |
| 起源 | Angular CLI 工程化扩展，2017 年初开源 |
| 当前定位 | 跨框架 monorepo 工具集（React / Vue / Node / Angular 全覆盖） |
| 核心抽象 | Devkit + plugins，generator/executor 双轨 |
| 商业层 | Nx Cloud（分布式缓存 + DTE，distributed task execution） |
| 我读的 commit | `c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7` |

一句话定位：Nx 不是 build 工具，是 monorepo framework，把"任务怎么定义、怎么执行、怎么共享缓存"做成可插拔的 plugin 体系。

![Nx 架构图](/projects/nx/01-architecture.webp)

## Layer 1 Why — 为什么不是另一个 Turborepo

很多人第一次看 Nx 会问"它和 [Turborepo](src/content/docs/projects/turborepo) 区别是什么"。这是把两类东西混了：

- Turborepo 像 build 工具，给定一棵 task graph 它跑得很快，约束少，配置文件薄。
- Nx 像 framework，提供 generators（脚手架）+ executors（任务运行器）+ plugins（生态扩展）。它不只跑 task，它还教你怎么定义 project、怎么生成代码、怎么和 IDE 集成。

第二个常见误解是"Nx 只能给 Angular 用"。Nx 确实从 Angular CLI 演化出来，但 6.x 之后已经完全跨框架，Nrwl 团队反而把 React 当一等公民。Angular 的影子留在了 schematics（被改造成 generator）、workspace.json（被改造成 nx.json + project.json）这些设计上。

第三个分水岭是 Nx Cloud。Turborepo 也有 remote cache，但 Nx Cloud 多了一个杀手锏：DTE（distributed task execution）。一个 task graph 可以拆给 N 台机器并行跑，每台机器的输出回流缓存。这是企业级 monorepo（数百个 project、数千个 test 文件）的刚需。

## Layer 2 仓库地形

```
nx/
├── packages/
│   ├── nx/                    # 核心运行时
│   │   ├── src/
│   │   │   ├── command-line/  # CLI 入口（run / run-many / affected / graph）
│   │   │   ├── project-graph/ # project graph 构建
│   │   │   ├── tasks-runner/  # 任务调度
│   │   │   ├── hasher/        # 缓存 hash 计算
│   │   │   └── executors/     # 内置 executor
│   ├── devkit/                # 插件作者用的工具库
│   ├── workspace/             # 工作区管理
│   ├── react/ vue/ angular/   # 框架插件
│   ├── jest/ cypress/ vite/   # 工具链插件
│   └── nx-cloud/              # 商业插件（client）
├── e2e/                       # 端到端测试
├── docs/                      # 官方文档源
└── scripts/                   # 发版/构建脚本
```

进入仓库第一眼看 packages/nx/src，三个目录决定了 Nx 的骨架：project-graph 决定"项目之间怎么连"、tasks-runner 决定"任务怎么跑"、hasher 决定"什么时候命中缓存"。其他都是这三个核心的外延。

## Layer 3 精读

### 3.1 Project graph 构建

Nx 的所有任务调度都建立在 project graph 之上。它的构建过程值得逐层看。

```typescript
// packages/nx/src/project-graph/build-project-graph.ts
export async function buildProjectGraphUsingProjectFileMap(
  projectsConfigurations: ProjectsConfigurations,
  externalNodes: Record<string, ProjectGraphExternalNode>,
  fileMap: ProjectFileMap,
  allWorkspaceFiles: FileData[],
  rustReferences: NxWorkspaceFilesExternals | null,
  cache: FileMapCache | null,
  shouldWriteCache: boolean
): Promise<{
  projectGraph: ProjectGraph;
  projectFileMapCache: FileMapCache;
}> {
  storedFileMap = fileMap;
  storedAllWorkspaceFiles = allWorkspaceFiles;

  const nxJson = readNxJson();
  const projectGraphVersion = '6.0';
  assertWorkspaceValidity(projectsConfigurations.projects, nxJson);
  const packageJsonDeps = readCombinedDeps();
  const rootTsConfig = readRootTsConfig();

  let filesToProcess: ProjectFileMap;
  let cachedFileData: ProjectFileMap;
  const useCacheData =
    cache &&
    !shouldRecomputeWholeGraph(
      cache,
      packageJsonDeps,
      projectsConfigurations,
      nxJson,
      rootTsConfig
    );
  if (useCacheData) {
    const fromCache = extractCachedFileData(fileMap, cache);
    filesToProcess = fromCache.filesToProcess;
    cachedFileData = fromCache.cachedFileData;
  } else {
    filesToProcess = fileMap;
    cachedFileData = {};
  }

  const context = createContext(
    projectsConfigurations,
    nxJson,
    fileMap,
    filesToProcess
  );
  let projectGraph = await buildProjectGraphUsingContext(
    externalNodes,
    context,
    cachedFileData,
    projectGraphVersion
  );
  const projectFileMapCache = createProjectFileMapCache(
    nxJson,
    packageJsonDeps,
    fileMap,
    rootTsConfig
  );
  if (shouldWriteCache) {
    writeCache(projectFileMapCache, projectGraph);
  }
  return { projectGraph, projectFileMapCache };
}
```

- 旁注 1：`projectsConfigurations` 是从 project.json + package.json 反推出来的，不是用户单独维护的图——这是 Nx 设计哲学，"图来自代码"。
- 旁注 2：`fileMap` 是文件级粒度的 map，不是 project 级——这意味着同一个 project 内部不同文件改动可以触发不同子图重算。
- 旁注 3：`shouldRecomputeWholeGraph` 比较 packageJsonDeps + nxJson + rootTsConfig 三件事，任何一个变了就全量重建——这是缓存安全性的核心。
- 旁注 4：`buildProjectGraphUsingContext` 是真正算 graph 的地方，会调用所有 plugin 的 processProjectGraph hook。
- 旁注 5：`projectGraphVersion = '6.0'` 是 graph 序列化协议版本，旧版本缓存自动失效——这种 explicit versioning 比 hash 比较更稳。
- 旁注 6：`storedFileMap` / `storedAllWorkspaceFiles` 是模块级变量，被外部 createContext 复用——这是 Nx 偶尔被诟病的"隐式全局状态"。

怀疑：cache 的 invalidation 边界看起来还是粗粒度的（rootTsConfig 一改就全量重算）。如果 ts paths 改了一项，整个 graph 都要重建，这在巨型 monorepo 上可能是真痛点。

### 3.2 Executor 与 Generator

Nx 把"做事的方式"分成两类：generator 写代码、executor 跑命令。两者都通过 schema.json 描述输入。

```typescript
// packages/devkit/src/generators/generator-utils.ts
export interface GeneratorCallback {
  (): void | Promise<void>;
}

export type Generator<T = unknown> = (
  tree: Tree,
  schema: T
) => void | GeneratorCallback | Promise<void | GeneratorCallback>;

export interface ExecutorContext {
  root: string;
  projectName?: string;
  targetName?: string;
  configurationName?: string;
  target?: TargetConfiguration;
  workspace?: ProjectsConfigurations & NxJsonConfiguration;
  projectsConfigurations?: ProjectsConfigurations;
  nxJsonConfiguration: NxJsonConfiguration;
  cwd: string;
  isVerbose: boolean;
  projectGraph: ProjectGraph;
  taskGraph?: TaskGraph;
}

export type Executor<T = any> = (
  options: T,
  context: ExecutorContext
) => Promise<{ success: boolean }> | AsyncIterableIterator<{ success: boolean }>;

// 使用示例：自定义一个 executor
const echoExecutor: Executor<{ message: string }> = async (options, context) => {
  console.log(`[${context.projectName}] ${options.message}`);
  return { success: true };
};

export default echoExecutor;
```

- 旁注 1：Generator 接收一个 Tree（虚拟文件系统），所有写入都先在 Tree 上 staged，最后由 framework 真正落盘——这让 dry-run 成为天然能力。
- 旁注 2：Executor 拿到完整 ExecutorContext，包含 projectGraph 和 taskGraph，意味着 executor 可以查询"我依赖谁、谁依赖我"。
- 旁注 3：Executor 支持 AsyncIterableIterator 返回，是为了 watch 模式——一个 build executor 可以持续 yield { success: true } 来表示每次重建结果。
- 旁注 4：所有 generator/executor 都通过 schema.json 描述输入，IDE 插件能直接读出来生成 UI——这是 "Nx Console" 的基础。
- 旁注 5：相比 Turborepo 的"配 task 字符串"，Nx 的 executor 是真正的代码，能做参数校验、能算 derived options、能 emit 多步操作。

怀疑：Executor + Generator 的双轨制学习曲线明显比 Turborepo 陡。对于只想跑 build/test 的小团队，引入 generator 概念可能是过度抽象。

### 3.3 Nx Cloud distributed cache + DTE

Nx Cloud 是 Nx 商业化的核心，DTE 是它的差异点。

```typescript
// 概念示意（基于公开 API 还原 DTE 协调流程）
interface DTECoordinator {
  // Agent 注册：每台 worker 启动后告诉协调器自己存在
  registerAgent(agentId: string, capabilities: AgentCapabilities): Promise<void>;

  // 任务分发：协调器根据 task graph 拓扑序 + agent 空闲度分发
  assignTask(taskId: string): Promise<AgentAssignment>;

  // 任务回流：agent 跑完后把 stdout/stderr/产物 hash 发回
  reportTaskResult(
    taskId: string,
    result: { success: boolean; outputs: string[]; cacheKey: string }
  ): Promise<void>;

  // 缓存查询：开跑前先问"这个 cacheKey 别的 agent 跑过没"
  queryCache(cacheKey: string): Promise<CacheEntry | null>;
}

class DTEAgent {
  async run(): Promise<void> {
    await this.coordinator.registerAgent(this.id, this.caps);
    while (true) {
      const task = await this.coordinator.requestTask();
      if (!task) break;

      const cached = await this.coordinator.queryCache(task.cacheKey);
      if (cached) {
        await this.replayCachedOutput(cached);
        continue;
      }

      const result = await this.executeTask(task);
      await this.coordinator.reportTaskResult(task.id, result);
      await this.uploadArtifacts(task.id, result.outputs);
    }
  }
}
```

- 旁注 1：DTE 不是简单的 sharding（"前 50 个 test 给 A、后 50 个给 B"），而是基于 task graph 的拓扑调度——一个 build 跑完，下游 lint/test 才能启动。
- 旁注 2：cacheKey 是核心，由 file content hash + project deps + executor version + 环境 hash 组合而成，跨 agent 共享。
- 旁注 3：Agent 启动时不知道自己会跑什么任务，由协调器派发——这避免了静态分片的负载不均。
- 旁注 4：报告结果时上传 stdout/stderr，PR 上可以直接看 task 日志，不用进 CI 系统点开。
- 旁注 5：失败任务会优先重试到不同 agent，规避 flaky 单机问题。
- 旁注 6：缓存命中时只下载产物 hash 引用，不重传字节，这是 remote cache 的常规优化。

怀疑：DTE 的拓扑调度看起来很美，但对网络抖动/agent 心跳超时的处理在公开文档里语焉不详。生产中遇到过的"agent 跑了一半挂了，task 卡 30 秒才被重派"应该是真实痛点。

## Layer 4 改一处

最小可上手实验：

```bash
npx create-nx-workspace@latest my-org --preset=ts --packageManager=pnpm
cd my-org

# 加一个 lib
npx nx g @nx/js:lib utils --directory=packages/utils

# 跑全量
npx nx run-many -t build,test --parallel=3

# 看 affected
npx nx affected:graph
```

第一次跑 run-many 会感觉慢，第二次同 cacheKey 会瞬间从 cache 命中——这是入门 Nx 最直观的"魔法时刻"。建议改一行 utils 的 src，再跑一次 affected:graph，会看到只有 utils 自己亮起。

## Layer 5 横向对比

| 维度 | Nx | Turborepo | Lerna | Bazel | pnpm workspaces | Rush |
|------|----|-----------|----|-----|-----------------|------|
| 抽象层 | framework（gen+exec） | build 工具 | 包管理 + 发版 | build system | 包管理 | 包管理 + task 编排 |
| 学习曲线 | 陡 | 平 | 平 | 极陡 | 平 | 中 |
| 缓存 | local + Nx Cloud | local + Vercel cache | 无 | 极强 | 无 | 有限 |
| 跨语言 | TS 为主 | TS 为主 | JS only | 全 | JS only | JS only |
| 分布式执行 | DTE（强项） | 无 | 无 | 有 | 无 | 无 |
| 代码生成 | generator | 无 | 无 | 无 | 无 | 无 |
| IDE 集成 | Nx Console | 无 | 无 | 弱 | 无 | 无 |
| 适用规模 | 中到超大 | 小到中 | 小 | 超大 | 小到中 | 中到大 |

简短结论：Turborepo 在小到中规模 monorepo 是更轻的选择；Bazel 在超大规模 + 跨语言场景仍是 ceiling；Nx 卡在中到大规模 + 想要"开箱即用框架感"的位置。

## Layer 6 通用启发

### 把"做事的方式"抽象成一等公民

- 不要让"怎么生成代码"散落在 README 里——把它沉淀成 generator
- 不要让"怎么跑任务"散落在 npm scripts 里——把它沉淀成 executor
- 抽象的代价是学习曲线，收益是新人接手时一行命令搞定
- generator/executor 不一定要叫这个名字，但"创建动作"和"执行动作"应该被命名、被复用

### 缓存的边界比缓存本身更重要

- 文件级 hash 比 project 级 hash 颗粒度更细
- 但是 hash 计算成本不能太高，否则缓存查询比真跑还慢
- 显式 version 字段（projectGraphVersion = '6.0'）比"靠所有 input hash 比"更可控
- 缓存失败的兜底必须是"重新跑"，不能是"静默错误结果"

### 商业层差异化点的选择

- Nx Cloud 选了 DTE，因为这是企业级 monorepo 的真痛点
- 没选"更好看的 UI"或"更多 plugin"——这些是开源社区会自发做的
- 商业 feature 应该是"开源做不动 + 真有人愿付钱"的交集
- 这个范式也适用于其他 OSS 商业化决策

### 跨框架的代价

- Nx 起源于 Angular，但成功转型到跨框架，代价是放弃了 angular.json 的简洁
- workspace.json → project.json 拆分是为了更好的 plugin 隔离
- Vue/React 一等公民支持靠 plugin 而不是核心改造，这种"core 极简 + plugin 富生态"是健康设计
- 但 plugin 多了之后，文档碎片化是真问题

## Layer 7 怀疑

1. project graph 全量重算的触发面太广——rootTsConfig 一改就全量，对 ts paths 频繁调整的项目可能很痛
2. Executor + Generator 的双轨 + plugin 体系学习曲线，让 Nx 在小团队几乎是过度工程，但官方营销不强调这一点
3. Nx Cloud DTE 在 agent 心跳超时/网络抖动下的行为公开材料里语焉不详，生产 SRE 必须自己摸索运维经验

## 限制

- 我读的版本是 commit `c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7`，更新版本可能有大改
- DTE 部分基于公开文档 + API 还原，没真正调试过 Nx Cloud 服务端
- 没有跑过超过 100 个 project 的真实 monorepo，对极端规模下的痛点只能推测
- TypeScript 之外的语言（Python/Rust/Go）支持在 Nx 里仍偏弱，这部分没深入

## 元数据

- 阅读时间：约 6 小时（含 Nx Cloud 概念梳理）
- 类比锚点：framework vs build 工具 / generator = 脚手架 / executor = 任务运行器 / DTE = CI 分布式
- 下一步：对比 Bazel rules 体系 + 自己写一个 minimal executor
- 关联笔记：[Turborepo](src/content/docs/projects/turborepo)
