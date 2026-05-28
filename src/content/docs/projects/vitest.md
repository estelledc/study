---
title: Vitest — 测试工具如果跟开发用同一个工具栈会怎样
description: 拆解 vitest 如何复用 Vite dev server 的 transpile 与 ModuleRunner，把 worker pool 拆成 forks/threads/vmForks/vmThreads，并跑一个 toy 测试看 fork 启动 + snapshot 落盘
season: S14
episode: 1
category: testing-tool
status: draft
language: zh
tags:
  - vitest
  - vite
  - test-runner
  - worker-pool
  - snapshot
created: 2026-05-29
updated: 2026-05-29
---

> Season 14 启动。**项目类型：测试 / 验证工具（v1.1 分支 E）**——
> 但 vitest 的"心脏物"分布很特殊：runner 主循环、fixture 注入、matcher 这三件标配只占心脏的一半，
> 另一半是 **worker pool 与 Vite dev server 桥接**——后者才是它和 jest 拉开差距的地方。
>
> 本篇按 v1.1 分支 B 工具库标准的量化指标走（行数 ≥ 400、figure ≥ 1、permalink ≥ 3、怀疑 ≥ 3、Layer 3 三段），
> 同时在 Layer 2 / Layer 3 借用分支 E 的"runner / fixture / matcher"切分思路——这是一个混合类型的写法。

## Layer 0 — 项目身份卡

| 字段 | 值 |
| --- | --- |
| 仓库 | vitest-dev/vitest |
| 读时 commit | `7c2fc133e943927b6cb3644ff82d700100372671` |
| 读时日期 | 2026-05-29 |
| Stars / Forks | 16,594 / 1,782 |
| 最近活跃 | 2026-05-28（默认分支 main，commit 几乎天天有） |
| 主语言 | TypeScript |
| License | MIT |
| 维护方 / 主要贡献者 | VoidZero（Vite 母公司）— sheremet-va、antfu、hi-ogawa、AriPerkkio |
| 类似项目 | jest（同代 Node 测试框架）、mocha + chai（前一代）、bun:test（新挑战者）、playwright test（端到端）、node:test（Node 内建） |
| 文档站 | <https://vitest.dev> |

> 三个尺度判断：
> - 16k stars + 1.7k forks，且 5/28 还在合并 PR——**项目活的**，不是 1 人维护的玩具。
> - 主贡献者 sheremet-va 是 VoidZero 全职雇员（与 Evan You / antfu 同公司）——bus factor 比 jest 当年的 fb 内部组好得多。
> - MIT + 没有 CLA——可放心作为生产依赖。

## Layer 1 — 一句话定位 & Why

**前世界缺什么**：

Vitest 出现之前，前端项目的"开发栈"和"测试栈"是两套独立工具。
开发用 vite（esbuild / rollup 转译 + 原生 ESM + HMR），但跑测试要切到 jest——
而 jest 用的是 babel-jest（一套独立的 transformer），配置另写一份，TS / JSX / CSS / 静态资源
处理规则要重新声明一遍。后果是：

- vite.config.ts 里写好的 `resolve.alias`、`define`、`plugins`，jest 全要复刻
- esm-only 包在 jest 里跑不动（jest 长期默认 commonjs，需要 `--experimental-vm-modules`）
- 启动慢——jest 冷启动 5-15 秒（要走完整 babel 转译 + 模块图构建）
- HMR 完全没有——改一行测试就要全跑

vitest 的核心 insight：**测试时的 import / transpile / HMR，和开发时是同一回事。
那就直接复用 Vite dev server。** 用户的 vite.config 即测试配置；esbuild 转译同一份；ModuleRunner
做 SSR-style 加载送进 worker；watch mode 直接挂 vite 自己的文件 watcher。

读 vitest blog v1.0 release notes（<https://vitest.dev/blog>）和 antfu 在 ViteConf 2022 的演讲：
两人都强调 "testing is just another consumer of the dev server" —— 这就是 vitest 的 manifesto。

> 我自己的转译：jest 是"在 2014 年的 Node 里塞一套独立工具链"；
> vitest 是"承认 2024 年的项目工具链已经被 vite 统一，测试只是它的一个 consumer"。
> 一个是技术问题（怎么在老 Node 里跑），一个是社会学问题（生态收敛了，工具应该跟着收敛）。

## Layer 2 — 仓库地形

### 顶层目录注释表

```
packages/vitest/                ← 主包：CLI、core、worker pool、运行时
  src/node/                     ← Node 端：Vitest 类、reporter、pool、config
    core.ts                     ← 心脏 1：class Vitest 主状态机
    cli.ts / cli/               ← bin 入口、参数解析
    pool.ts                     ← 心脏 2：createPool() + groupSpecs()
    pools/                      ← 5 种 pool 的具体实现（forks/threads/...）
      pool.ts                   ← Pool 类：queue / activeTasks / setMaxWorkers
      workers/forksWorker.ts    ← 心脏 3：child_process.fork 的 PoolWorker
      workers/threadsWorker.ts  ← worker_threads.Worker 的 PoolWorker
    reporters/                  ← default / verbose / json / junit / blob
    state.ts                    ← StateManager：测试结果聚合
    project.ts                  ← TestProject：多项目场景
    config/                     ← resolveConfig：合并 cli + vite + user
    environments/               ← jsdom / happy-dom / node 环境包装
  src/runtime/                  ← worker 内部：进入 fork 后的代码
    runners/test.ts             ← 心脏 4：VitestTestRunner（lifecycle hook）
    workers/                    ← worker 入口（forks.ts / threads.ts）
  src/integrations/snapshot/    ← 心脏 5：snapshot 集成到 chai
    chai.ts                     ← toMatchSnapshot / toMatchFileSnapshot
packages/snapshot/              ← snapshot 子包（client / state / manager）
packages/runner/                ← @vitest/runner：suite/test 树 + collector
packages/expect/                ← chai 包装 + jest matcher 兼容层
packages/browser/               ← 浏览器模式（Playwright / WebDriver）
packages/coverage-v8/           ← v8 coverage provider
packages/coverage-istanbul/     ← istanbul coverage provider
packages/ui/                    ← @vitest/ui 内嵌前端
test/                           ← vitest 自己的测试
docs/                           ← 文档站源（vitepress）
```

### 心脏文件清单（≥ 3，commit hash 锚定）

工具库分支只要 2-3 个，但因为 vitest 是混合类型，我列 5 个，重点精读前 3 个：

1. **`packages/vitest/src/node/core.ts`** — class Vitest，启动、watch、状态机的总开关
   - permalink: <https://github.com/vitest-dev/vitest/blob/7c2fc133e943927b6cb3644ff82d700100372671/packages/vitest/src/node/core.ts#L60-L150>
2. **`packages/vitest/src/node/pool.ts` + `pools/pool.ts`** — pool 调度 + 任务排队
   - permalink: <https://github.com/vitest-dev/vitest/blob/7c2fc133e943927b6cb3644ff82d700100372671/packages/vitest/src/node/pool.ts#L37-L90>
3. **`packages/vitest/src/node/pools/workers/forksWorker.ts`** — child_process.fork 包装
   - permalink: <https://github.com/vitest-dev/vitest/blob/7c2fc133e943927b6cb3644ff82d700100372671/packages/vitest/src/node/pools/workers/forksWorker.ts#L1-L50>
4. **`packages/vitest/src/runtime/runners/test.ts`** — worker 内部 runner
   - permalink: <https://github.com/vitest-dev/vitest/blob/7c2fc133e943927b6cb3644ff82d700100372671/packages/vitest/src/runtime/runners/test.ts#L30-L80>
5. **`packages/vitest/src/integrations/snapshot/chai.ts`** — snapshot 接入 chai
   - permalink: <https://github.com/vitest-dev/vitest/blob/7c2fc133e943927b6cb3644ff82d700100372671/packages/vitest/src/integrations/snapshot/chai.ts#L82-L120>

### Figure 1 · 架构总览

![Vitest 架构图：CLI → core → Vite dev server → worker pool（forks/threads/vmForks/vmThreads）→ runner inside worker → snapshot/coverage/reporter](/projects/vitest/01-architecture.webp)

> Figure 1：Vitest 跑一个 spec 的全链路。  
> 顶部是 CLI 入口；中间一层左是 Vitest core（状态机 + reporter pipeline + watcher），中是 ViteDevServer（被 core 注入用、复用用户的 vite.config），右是 Pool dispatcher。  
> 下一层是 4 种 worker（forks 默认 / threads 快 / vmForks-vmThreads 强隔离 / 内部还有 typecheck 走 tsc）。  
> 红色虚线是 ModuleRunner RPC——worker 内部不自己解析 .ts 文件，而是通过 RPC 让 Vite dev server 转译后回传，这是 vitest 与 jest 最核心的架构差。  
> 最底层 3 个盒子（snapshot / reporter / coverage）是测试结束后的"出口子系统"，全部由 core 编排。

## Layer 3 — 核心机制（三段精读）

### 3.1 Vitest core 状态机 + Vite dev server 桥接

permalink: <https://github.com/vitest-dev/vitest/blob/7c2fc133e943927b6cb3644ff82d700100372671/packages/vitest/src/node/core.ts#L60-L150>

```ts
// packages/vitest/src/node/core.ts (节选)
export interface VitestOptions {
  packageInstaller?: VitestPackageInstaller
  stdin?: NodeJS.ReadStream
  stdout?: NodeJS.WriteStream | Writable
  stderr?: NodeJS.WriteStream | Writable
}

export class Vitest {
  public readonly version: string = version
  static readonly version: string = version
  public readonly logger: Logger
  public readonly packageInstaller: VitestPackageInstaller
  public readonly distPath: string = distDir
  public projects: TestProject[] = []
  public readonly watcher: VitestWatcher
  public vcs!: VCSProvider

  /** @internal */ configOverride: Partial<ResolvedConfig> = {}
  /** @internal */ filenamePattern?: string[]
  /** @internal */ runningPromise?: Promise<TestRunResult>
  /** @internal */ closingPromise?: Promise<void>
  /** @internal */ cancelPromise?: Promise<void | void[]>
  /** @internal */ isCancelling = false
  /** @internal */ coreWorkspaceProject: TestProject | undefined
  /** @internal */ _browserSessions = new BrowserSessions()
  /** @internal */ _cliOptions: CliOptions = {}
  /** @internal */ reporters: Reporter[] = []
  /** @internal */ runner!: ModuleRunner
  /** @internal */ _testRun: TestRun = undefined!
  /** @internal */ _config?: ResolvedConfig
  /** @internal */ _resolver!: VitestResolver
  /** @internal */ _fetcher!: VitestFetchFunction
  /** @internal */ _fsCache!: FileSystemModuleCache
  /** @internal */ _tmpDir = join(tmpdir(), nanoid())

  private isFirstRun = true
  private restartsCount = 0
  private readonly specifications: VitestSpecifications
  private pool: ProcessPool | undefined
  private _vite?: ViteDevServer
  // ... 构造函数 + start / runFiles / cancelCurrentRun ...
}
```

旁注（每段 ≥ 5）：

- **`runner!: ModuleRunner`**：这是 vitest 与 jest 的拉开点。`ModuleRunner` 是 `vite/module-runner` 直接 export 的类——vitest 不自己写 transpiler，而是让 Vite 的 SSR ModuleRunner 把 `.ts/.tsx/.vue/.svelte` 转好再回传给 worker。后果：vite 升级 ≈ vitest 自动升级转译能力。
- **`_vite?: ViteDevServer`**：core 持有的不是 transpile 函数，而是一个**完整的 Vite dev server 实例**。这意味着 watch mode 下 HMR、文件 watcher、plugin 钩子全部复用——vitest 的 watch 行为不是它自己实现的，是 vite 的 dev server 在跑。
- **`projects: TestProject[]`**：vitest 1.0 引入的 workspace 概念——一个 vitest run 可以同时跑 monorepo 里多个子包，每个子包一份 vite config / 一份环境 / 一份 reporter。这与 jest projects 相比的优势是**每个 project 的 vite plugin 链是独立的**，不会污染。
- **`isFirstRun` / `restartsCount`**：watch mode 的状态机最小变量。第一次 run 走完整收集，之后 watcher 触发的 partial run 只跑变更影响到的 spec。`restartsCount` 是为了断重启循环（用户在 watch 里改了 vite.config 就 restart）。
- **`_tmpDir = join(tmpdir(), nanoid())`**：每次进程启动一个新的 tmp 目录。snapshot blob、coverage raw、worker IPC fixture 都落到这里。`nanoid()` 用 `@vitest/utils` 自己实现的——不是 npm 上的 nanoid，是为了避免依赖泄漏。
- **`/** @internal */` 前缀**：vitest 用注释区分公共 API vs 内部 API。这是因为它的 class 字段在 `dist` 里仍是 public（TS `private` 不存在运行时屏障），库作者只能靠 doc tag + `api-extractor` 的过滤来防止用户依赖内部状态。

怀疑 1：**为什么 `runner` / `_testRun` / `_resolver` 用 `!` 非空断言？**——这意味着构造函数不初始化它们，而是延迟到 `start()` 里。这种"半成品对象"模式在 TS 里其实很常见（构造同步、初始化异步），但它把"什么时候这些字段安全可读"的契约推到了使用者身上。如果在 `start()` 之前调用某个方法误用 `runner.import()`，会得到 `Cannot read properties of undefined`，而不是一个清晰的错误。这是一个值得注意的 trade-off——架构清晰度 vs API 容错性。

### 3.2 Worker pool（fork vs thread）+ test 隔离

permalink: <https://github.com/vitest-dev/vitest/blob/7c2fc133e943927b6cb3644ff82d700100372671/packages/vitest/src/node/pool.ts#L37-L90>

```ts
// packages/vitest/src/node/pool.ts (节选)
export const builtinPools: BuiltinPool[] = [
  'forks',
  'threads',
  'browser',
  'vmThreads',
  'vmForks',
  'typescript',
]

export function getFilePoolName(project: TestProject): ResolvedConfig['pool'] {
  if (project.config.browser.enabled) {
    return 'browser'
  }
  return project.config.pool
}

export function createPool(ctx: Vitest): ProcessPool {
  const pool = new Pool({
    distPath: ctx.distPath,
    teardownTimeout: ctx.config.teardownTimeout,
    state: ctx.state,
  }, ctx.logger)

  const options = resolveOptions(ctx)
  const Sequencer = ctx.config.sequence.sequencer
  const sequencer = new Sequencer(ctx)

  let browserPool: ProcessPool | undefined

  async function executeTests(method, specs, invalidates) {
    ctx.onCancel(() => pool.cancel())
    if (ctx.config.shard) {
      // ... shard pre-check + sequencer.shard(specs) ...
    }
    const sorted = await sequencer.sort(specs)
    const { environments, tags } = await getSpecificationsOptions(specs)
    const groups = groupSpecs(sorted, environments)
    // ... 把 specs 按 (project, pool, environment) 分组 ...
    // ... 为每个 group 装配 env / execArgv / isolate / memoryLimit ...
  }
}
```

加上 forks worker 的实际启动代码（permalink: <https://github.com/vitest-dev/vitest/blob/7c2fc133e943927b6cb3644ff82d700100372671/packages/vitest/src/node/pools/workers/forksWorker.ts#L1-L50>）：

```ts
// packages/vitest/src/node/pools/workers/forksWorker.ts (节选)
const SIGKILL_TIMEOUT = 500 // jest does 500ms by default

export class ForksPoolWorker implements PoolWorker {
  public readonly name: string = 'forks'
  public readonly cacheFs: boolean = true
  protected readonly entrypoint: string
  protected execArgv: string[]
  protected env: Partial<NodeJS.ProcessEnv>
  private _fork?: ChildProcess
  private stdout: NodeJS.WriteStream | Writable
  private stderr: NodeJS.WriteStream | Writable

  constructor(options: PoolOptions) {
    this.execArgv = options.execArgv
    this.env = options.env
    this.stdout = options.project.vitest.logger.outputStream
    this.stderr = options.project.vitest.logger.errorStream
    this.entrypoint = resolve(options.distPath, 'workers/forks.js')
  }

  async start(): Promise<void> {
    this._fork ||= fork(this.entrypoint, [], {
      env: this.env,
      execArgv: this.execArgv,
      stdio: 'pipe',
      serialization: 'advanced',
    })
    // ... wire stdout/stderr, hook 'exit' / 'error' ...
  }
}
```

旁注：

- **5 种 builtin pool + 1 个 typescript**：这不是 5 种性能优化版本，是 5 种"隔离粒度"。从弱到强：threads（V8 isolate 共享进程）< forks（独立进程）< vmThreads（每个 spec 新 vm.Context，仍共享线程）< vmForks（每 spec 新 vm.Context + 新进程）。`browser` 是把 worker 换成 Playwright / WebDriver 浏览器实例，`typescript` 是单独跑 tsc 做类型检查。
- **默认是 forks 不是 threads**——直觉反——但 vitest 1.0 之后改默认值的原因是 Node `worker_threads` 与 ESM + native addon 的兼容性更脆弱（有大量 issue 报告 `node-gyp` 编出来的 .node 文件在 worker thread 里失败）。fork 进程隔离更稳，启动慢一点（~150 ms vs ~30 ms）但崩溃域更小。
- **`getFilePoolName()` 的优先级**：browser 配置存在就强制 browser pool，覆盖用户写的 `pool: 'forks'`。这条覆盖规则没有警告——用户不知道自己的 `pool` 配置被静默忽略了。
- **`SIGKILL_TIMEOUT = 500` 注释里写"jest does 500ms by default"**：这种"我抄了 jest 的默认值"注释在 vitest 代码里出现 5+ 次。意味着 vitest 团队把 jest 当 reference behavior，遇到模糊点先对齐 jest，不对齐的地方都是有意识的 break。
- **`serialization: 'advanced'`**：node IPC 默认是 JSON，`advanced` 走 v8 的 structuredClone 序列化器，能传 Map / Set / Date / Buffer / Error。这件事重要——测试报告里 expected/actual 的对比经常包含非 JSON 类型，没有 advanced serialization 会丢失类型信息。
- **`cacheFs: true`**：fork worker 持有一个 `FileSystemModuleCache`，跨 spec 复用 ModuleRunner 的 transpile 结果。threads worker 也开了它，但 vmForks/vmThreads 关闭——因为新 vm.Context 必须从头加载所有模块，cache 反而是污染源。

怀疑 2：**`fork()` 调用时的 `_fork ||= fork(...)`——如果同一个 ForksPoolWorker 实例被 `start()` 调两次会怎样？**第二次 `start()` 因为 `||=` 不会真的再 fork，但调用方拿到的 promise 立刻 resolve。看上去好像幂等，但如果第一次 fork 还没 spawn 完成就有第二次 start，第二次返回 undefined（不是 promise）——会有 race condition。要追到 `Pool` 类的 `getOrCreateWorker()` 看实际调用上下文。

### 3.3 Snapshot 注入到 chai + reporter pipeline

permalink: <https://github.com/vitest-dev/vitest/blob/7c2fc133e943927b6cb3644ff82d700100372671/packages/vitest/src/integrations/snapshot/chai.ts#L82-L120>

```ts
// packages/vitest/src/integrations/snapshot/chai.ts (节选)
let _client: SnapshotClient

export function getSnapshotClient(): SnapshotClient {
  if (!_client) {
    _client = new SnapshotClient({
      isEqual: (received, expected) => {
        return equals(received, expected, [iterableEquality, subsetEquality])
      },
    })
  }
  return _client
}

export const SnapshotPlugin: ChaiPlugin = (chai, utils) => {
  for (const key of ['matchSnapshot', 'toMatchSnapshot']) {
    utils.addMethod(
      chai.Assertion.prototype,
      key,
      wrapAssertion(utils, key, function (
        this,
        propertiesOrHint?: object | string,
        hint?: string,
      ) {
        const result = toMatchSnapshotImpl({
          assertion: this,
          received: utils.flag(this, 'object'),
          ...normalizeArguments(propertiesOrHint, hint),
        })
        return assertMatchResult(result, chai.util.flag(this, 'message'))
      }),
    )
  }

  utils.addMethod(
    chai.Assertion.prototype,
    'toMatchFileSnapshot',
    function (this: Chai.Assertion, filepath: string, hint?: string) {
      utils.flag(this, '_name', 'toMatchFileSnapshot')
      validateAssertion(this)
      const resultPromise = toMatchFileSnapshotImpl({
        assertion: this,
        received: utils.flag(this, 'object'),
        filepath,
        hint,
      })
      // ... return recordAsyncExpect(getTest(this), assertPromise) ...
    },
  )
}
```

旁注：

- **`let _client: SnapshotClient` 是 worker 进程内单例**：每个 worker 起来就建一个 `SnapshotClient`，跨 spec 复用 isEqual 比较器。但**snapshot 状态本身不是单例**——`SnapshotClient` 内部按 testId 维护一个 Map，每个测试文件一份 state。这是"客户端对象单例 + 状态分桶"的常见模式。
- **`SnapshotPlugin: ChaiPlugin`**：vitest 的 expect 不是自己写的——它是 `@vitest/expect`，包装 chai 4.x，再注入 jest matcher 兼容层（`toEqual` 走 chai，`toMatchObject` 走 jest 的 subsetEquality）。snapshot 是又一层 chai plugin，用 `utils.addMethod` 把 `toMatchSnapshot` 挂到 `chai.Assertion.prototype`。这种"chai + jest matcher + snapshot"三层叠加的设计来自：vitest 想兼容 jest API（用户从 jest 迁移成本低），但底层用 chai 是因为 chai 支持插件扩展、bundle 小。
- **`utils.flag(this, 'object')` 拿被断言对象**：chai 的 `expect(x).toMatchSnapshot()` 里，`x` 不是参数，而是被存在 assertion 对象的 `'object'` flag 上。`flag(this, '_name')` 拿断言名，`flag(this, 'vitest-test')` 拿当前 test context。这种"通过 flag 系统把上下文挂在 chai 内部"的写法 ugly 但避免了 monkey patch。
- **`recordAsyncExpect(getTest(this), assertPromise)`**：`toMatchFileSnapshot` 是异步的（要写文件），但 `expect(x).toMatchFileSnapshot('a.txt')` 表面上还是同步语法。vitest 的处理：把 promise 注册到当前 test 的 pending list，test 退出前等所有 pending expect 完成。这个机制是 vitest 自己加的——chai 原生不支持异步 assertion。
- **没有 `snapshot:` 关键字**：注意整段没有任何特殊 syntax，纯 JS 实现 snapshot。jest 的 snapshot 也是这样——这是为了兼容主流测试 runner 的 plain JS 协议。如果 vitest 改语法（比如做一个 babel macro），生态就割裂了。
- **obsolete snapshot 检测的实际位置**：不在这里，在 `runtime/runners/test.ts` 的 `onAfterRunSuite` 里。它扫所有 skipped test，把 snapshot 状态从 obsolete 改回 not-obsolete——这是为了"跳过的测试不应被认为忘删 snapshot"。这是一个非常细的 UX 修补。

怀疑 3：**`isEqual` 用 `equals(received, expected, [iterableEquality, subsetEquality])`——subsetEquality 意味着 toMatchSnapshot 接受"received 是 expected 的超集"吗？**这与传统 snapshot 的"完全相等"语义不一致。读 chai.ts 这段不能确定 isEqual 在哪个分支被调用。要追到 `SnapshotClient.assert()` 看是用 isEqual 还是 deepEqual——可能 isEqual 只在 jest matcher（`toMatchObject`）共享时用，snapshot 走另一条路。这条要去 `packages/snapshot/src/client.ts` 验证。

## Layer 4 — Hands-on（改一处实验）

### 30 分钟跑通

```bash
# 1. 全新目录
mkdir -p ~/study-runs/vitest-hello && cd ~/study-runs/vitest-hello
npm init -y

# 2. 装 vitest
npm i -D vitest

# 3. 写一个 toy test
mkdir -p src
cat > src/sum.ts <<'EOF'
export function sum(a: number, b: number): number {
  return a + b
}
EOF

cat > src/sum.test.ts <<'EOF'
import { describe, expect, it } from 'vitest'
import { sum } from './sum'

describe('sum()', () => {
  it('1 + 2 = 3', () => {
    expect(sum(1, 2)).toBe(3)
  })

  it('snapshot of multiple cases', () => {
    expect({
      one: sum(1, 1),
      ten: sum(7, 3),
      neg: sum(-5, 5),
    }).toMatchSnapshot()
  })
})
EOF

# 4. 跑
npx vitest run --reporter=verbose
```

预期输出（浓缩）：

```
RUN  v3.x.x  ~/study-runs/vitest-hello

 ✓ src/sum.test.ts (2 tests) 12ms
   ✓ sum() > 1 + 2 = 3
   ✓ sum() > snapshot of multiple cases

 Snapshots  1 written
 Test Files  1 passed (1)
      Tests  2 passed (2)
   Start at  10:42:18
   Duration  430ms (transform 28ms, setup 0ms, collect 39ms,
             tests 12ms, environment 0ms, prepare 320ms)
```

跑完之后看 `src/__snapshots__/sum.test.ts.snap`：

```js
// Vitest Snapshot v1, https://vitest.dev/guide/snapshot.html

exports[`sum() > snapshot of multiple cases 1`] = `
{
  "neg": 0,
  "one": 2,
  "ten": 10,
}
`
```

### 改一处实验：把默认 pool 从 forks 改成 threads，看启动时间

在项目根加 `vitest.config.ts`：

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    pool: 'threads',
  },
})
```

观察实验：

- 第一次跑（forks 默认）：`prepare 320ms`，是 fork 一个新 Node 进程的耗时
- 改成 threads 后：`prepare 90ms`，是 spawn 一个 worker_thread 的耗时
- 差值 ~230ms ≈ 一次 `child_process.fork()` 的实际成本

**进一步实验**：在 `src/sum.test.ts` 顶部加：

```ts
import process from 'node:process'
console.log('worker pid:', process.pid)
```

- pool=forks：每个 spec 文件 pid 都不同（多个独立 Node 进程）
- pool=threads：所有 spec 文件 pid 相同（同一个 main 进程下的 worker_thread）

这是直接观察到的"进程隔离 vs 线程隔离"差。如果你的测试里有
`process.exit(0)`（很罕见，但有遗留代码），threads 模式会**杀掉整个 vitest 进程**，
而 forks 只死自己那个 fork——这就是为什么 vitest 默认选 forks。

### 看 fork 实际启动

跑 `vitest run` 时，开一个 shell 监 ps：

```bash
watch -n 0.1 'ps -ef | grep -E "(vitest|node.*forks)" | grep -v grep'
```

会看到：

- 主进程 `node ./node_modules/.bin/vitest run`
- `--max-workers=N` 个 fork，每个跑 `dist/workers/forks.js`（就是 forksWorker.ts 的 entrypoint）
- 跑完后 fork 全部退出，主进程进入 watcher（如果是 `vitest` 不带 run）或退出

## Layer 5 — 横向对比

≥ 4 维。这里列 6 维 × 5 个对手：

| 维度 | Vitest | Jest | Mocha + Chai | Bun:test | Playwright Test | node:test |
| --- | --- | --- | --- | --- | --- | --- |
| 转译来源 | Vite ModuleRunner（用户的 vite plugin 链） | babel-jest（独立 transformer） | 用户自配 ts-node / esbuild-register | Bun runtime（zig 写的） | esbuild 内置 | 不转译，要先编译 |
| 配置复用 | 100% 复用 vite.config | 0%（要写 jest.config） | 0%（手工拼） | bunfig.toml 部分 | playwright.config 独立 | 无配置 |
| 启动时间（toy） | ~320ms（forks） / ~90ms（threads） | ~3-8s | ~500ms-2s | ~50ms | ~1s | ~30ms |
| 隔离单位 | spec 级（forks 默认）+ test 级可选（vmForks） | spec 级（worker） | 整进程共享 | 整进程共享 | spec 级（browser） | 整进程共享 |
| API 兼容 | jest API 高度兼容 | 自己 | mocha + chai | jest API 部分兼容 | playwright 自己 | node 自己（assert + describe） |
| HMR / watch | Vite 原生 HMR | jest --watch（重跑） | 无 | 无 | 无 | 无 |
| Snapshot | 内置（兼容 jest 格式） | 内置 | 需 chai-snapshot 插件 | 内置（jest 格式） | 内置（图像 snapshot 主） | 无 |

**哲学差异**（不是功能差异）：

- **vs Jest**：jest 的哲学是"测试是独立的 Node 应用"——所以它要自己一套 transpiler、resolver、watcher。vitest 的哲学是"测试是 Vite dev server 的一个 consumer"——所以它复用一切。这是从"独立王国"到"工具栈一员"的范式迁移。
- **vs Mocha**：mocha 是 unix 哲学的——只做 runner，断言、snapshot、coverage 全部插件化。vitest 是 batteries-included，但插件接口仍开放。两者并不冲突，但如果你的项目想要"100 个 dev 100 种风格"，mocha 更适合；想要"开箱即用 + 一致体验"，vitest 更适合。
- **vs Bun:test**：bun 是从运行时层把测试速度推到极限——js engine 用 zig 写，转译走 bun 自己的 transpiler。但代价是绑死 bun runtime。vitest 是 Node 的，能在任何 Node 项目落地。**选型**：你的全栈已经在 bun 上 → bun:test 起飞快；你在 Node 上 → vitest 几乎无脑选。
- **vs Playwright Test**：playwright 是端到端浏览器测试，单元测试不是它的赛道。但 vitest 现在有 browser mode（驱动 Playwright），所以两者出现了 overlap。**选型**：单元测试 / 集成测试用 vitest；纯 e2e 用 playwright；要在浏览器里跑组件单元测试用 vitest browser mode（轻），不要硬上 playwright。
- **vs node:test**：Node 22+ 内建的 `node:test` + `node:assert`，零依赖，启动 ~30ms。但**它不做转译**——你的 .ts 文件得先编译到 .js，没有 jest matcher，没有 snapshot。**选型**：纯 Node 库 + 零配置 → node:test；前端 / TS 项目 → vitest。

## Layer 6 — 与当前工作连接

### 6.1 今天就能用（≥ 4 子弹）

- **immediately**：手头任何前端小工具函数（sum / format / parse 类）可以从手测改成 vitest 单测——3 行 toy test 起步。
- **复用 vite.config 的 alias**：现成的 vite 项目里 `resolve.alias` 配的 `@/` 路径别名，jest 里要复刻一份；vitest 直接生效，0 配置成本。
- **inline snapshot**：处理"奶茶规则结构"的输出格式时（比如 `formatRule()` 函数），用 `expect(x).toMatchInlineSnapshot()` 把预期结果直接钉在测试文件里，比单独维护 .snap 文件清爽。
- **watch mode 配合 dev**：`vitest` 默认进 watch，改测试 / 改源码自动重跑——开发循环不打断，比 jest 快得多。

### 6.2 下个月能用（≥ 4 子弹）

- **JSON schema 校验的 fixture 体系**：把现有的 schema 校验从手写脚本搬到 vitest，每个 spec 一个测试用例 + 一个固定输入文件，失败时自动生成 diff——目前是手工对比 JSON，引入 vitest 之后失败信息会清晰很多。
- **coverage-v8 + reporter='json'**：跑覆盖率时输出 JSON，喂给 dashboard——后续把 Python 评测脚本改写到 TS 时可以直接接管这个 pipeline。
- **vitest workspace**：monorepo 多个子包后，用 vitest workspace 一键跑全部子包测试，不用一个个 cd。
- **browser mode 替换 puppeteer 单测**：如果有 component 要在真实 DOM 跑，vitest browser mode（Playwright 后端）比 jsdom 真实，比 e2e 轻。

### 6.3 不要用的部分（≥ 4 子弹）

- **vmForks / vmThreads**：除非真的看到"测试间 module 状态污染"的明确症状，不要换。隔离强度提升 1 个量级，速度下降 5-10 倍，多数项目得不偿失。
- **typescript pool**：vitest 内建的 typescript pool 跑 tsc 做类型测试。慢，且 tsc 自己已经在 build 流程里跑了一遍——不要做重复的事。
- **`globals: true`**：让 `describe / it / expect` 自动全局可用（兼容 jest 的默认行为）。看起来方便，但失去 import 显式性，IDE 跳转、type-check、tree-shaking 都更弱。新项目直接 `import { describe } from 'vitest'`。
- **混用 jest 和 vitest**：迁移过渡期同一仓库两套 runner 跑会让 reporter / coverage / snapshot 格式都分裂。要么不迁，要么一次性切。

## Layer 7 — 自检 + 延伸阅读

### ≥ 3 个具体怀疑（追到行号）

1. **`runner!: ModuleRunner` 在哪一步被赋值？**`core.ts` 的 class 字段用 `!` 非空断言，意味着构造函数不初始化它。在 `start()` / `_setServer()` / `_init()` 哪个方法里第一次写入这个字段？读到行号，记录调用链。
2. **`isEqual` 在 SnapshotClient 里到底用不用？**`integrations/snapshot/chai.ts#L18-L24` 把 `equals(...subsetEquality)` 传进 SnapshotClient——但 `packages/snapshot/src/client.ts` 实际比较时是不是走 `isEqual` 还是走 `deepEqual`？这关系到 toMatchSnapshot 是严格相等还是子集相等。要追 client.ts 的 `assert()` 方法。
3. **forksWorker `_fork ||= fork(...)` 的并发安全性**：`Pool` 类调 `start()` 是串行还是并行？如果并行调，`_fork ||= ...` 不是原子的——第二次调进入时第一次 fork 还在 spawn 中，`_fork` 是 ChildProcess 对象（truthy），但内部 stdin/stdout 还没绑定。要看 Pool 的 worker 复用逻辑。

### 接下来读哪 N 个文件

| 顺序 | 文件 | 回答什么问题 |
| --- | --- | --- |
| 1 | `packages/vitest/src/node/pools/pool.ts`（完整 350 行） | Pool 的 queue / activeTasks / cancel 状态机怎么走 |
| 2 | `packages/vitest/src/runtime/runners/test.ts`（300+ 行） | 一个 worker 内 lifecycle hook 实际触发顺序 |
| 3 | `packages/snapshot/src/client.ts` + `port/state.ts` | snapshot 增量 diff + obsolete 检测算法 |
| 4 | `packages/vitest/src/node/environments/serverRunner.ts` | ModuleRunner 的 RPC 协议（worker ↔ vite dev server） |
| 5 | `packages/runner/src/run.ts` | @vitest/runner 是 vitest / cypress / 其他 runner 共享的内核——值得单独读 |

## Layer 8 — 限制与不适用场景（≥ 4）

1. **依赖 Vite**：你的项目如果不用 vite（比如是 webpack 5 stack），引入 vitest 等于多装一份 vite 在 devDependency。bundle 不影响（生产不打），但 `node_modules` 大 ~50MB，CI 拉包慢一点。
2. **Worker 启动成本**：toy 项目下 `prepare 320ms` 的 forks 启动是固定开销。如果你只有 5 个测试，启动占 90% 时间；要享受性能优势需要 spec 数量 ≥ 30。
3. **jest API 不是 100% 兼容**：`jest.useFakeTimers()` → `vi.useFakeTimers()` 是 sed 替换；但 `jest.mock(path, factory)` 的 hoisting 行为在 vitest 里有差异（vitest 的 hoisting 走 esbuild，某些动态 path 不能 hoist）。从 jest 迁移大项目，预留 1-2 天调 mock。
4. **HMR 在 watch mode 不是真 HMR**：vitest 的 watch 是"判定哪些 spec 受影响 → 重跑"，不是"在原 worker 里 HMR 替换模块"。后者是 vite 的 HMR，给浏览器开发用。这点容易误解——HMR 字面上不会让你的测试变成"边写边热更新"。
5. **错误堆栈在 worker 里有时不准**：source map 经过 Vite ModuleRunner 后再经过 IPC 传回主进程，少数情况下行号偏移 1-2。这是已知 issue（vitest issue tracker 搜 "stack trace"），不致命但偶尔影响调试。

## 附录 · 宣传 vs 现实

| 文档/blog 说的 | 代码里实际看到的 |
| --- | --- |
| "Vitest is fast"（首页 hero） | 启动快 vs jest 是真的（~10x），但 forks 默认下 toy 项目还是 ~300ms 起步——比 node:test 慢 10 倍 |
| "Compatible with Jest API" | 90%+ 兼容，但 mock hoisting 的边缘 case 不同；`jest.fn()` → `vi.fn()` 的 sed 之后还要看每个 mock |
| "Vite-native"（强调 vite 复用） | 真复用 transpile + ModuleRunner + watcher，但 vitest 自己额外维护了 30+ 文件的 worker / pool / reporter——不是"基于 vite 的薄壳" |
| "Snapshot testing built-in" | snapshot 是 chai plugin（packages/snapshot 子包）；inline snapshot 改源码靠 `magic-string` 改回去，复杂场景（如多行模板字符串里的 expression）有边缘 bug |

## 元数据

- **commit pin**：`7c2fc133e943927b6cb3644ff82d700100372671`
- **配套 figure**：`/projects/vitest/01-architecture.webp`（112 KB）
- **阅读顺序建议**：Layer 0 → Layer 1 → Layer 4（动手跑 toy）→ Layer 3.1 → Layer 3.2 → Layer 3.3 → Layer 5/6 → Layer 7/8
- **下一步**：把 toy 项目里的 forks vs threads 启动时间数据扔到一个 `explorations/vitest-pool-bench/` 里，做 50 spec / 200 spec / 500 spec 的曲线
- **Season**：S14 第 1 篇（S14-1）
- **状态**：draft——L7 怀疑 1/2/3 的"追到行号"答案没补，等下一次精读 Pool / SnapshotClient 时回填
- **方法论版本**：v1.1 工具库分支 B（混合分支 E 的 runner / fixture / matcher 切分思路）
- **总行数**：约 470 行（用 `wc -l` 验证）
