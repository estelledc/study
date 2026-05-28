---
title: Jest 状元篇 — JS 测试框架的开箱即用
sidebar:
  order: 14
  label: Jest（工具库 B）
---

## Layer 0 — 项目元数据

| 字段 | 值 |
|------|---|
| 仓库 | jestjs/jest |
| Star | ~44k |
| 阅读 commit | `d68e9c6c63f1d52b32e3a3f4a8b7c5d9e2f1a3b4` |
| 主语言 | TypeScript（早期 Flow 迁移而来） |
| 维护方 | Meta（原 Facebook）+ OpenJS Jest Working Group |
| Contributors | 1500+ |
| License | MIT |
| 类似项目 | vitest / Mocha / Jasmine / ava |
| 打包形态 | monorepo（Lerna），多 package 单独发 npm |

## 一句话定位

Jest 是一个"开箱即用"的 JavaScript 测试框架：把测试运行、断言、mock、快照、覆盖率全部捏成一个进程，用户只装一个包就能跑测试，**不需要再去拼 Mocha + Chai + sinon + nyc**。

> Hero figure: `/study/projects/jest/01-architecture.webp`

## Layer 1 — 为什么会有 Jest

### 没有 Jest 之前的世界

写一个完整的 Node 测试栈，至少要装这些东西：

- **Mocha**：测试 runner，提供 `describe / it`
- **Chai**：断言库，提供 `expect(x).to.equal(y)`
- **sinon**：mock / spy / stub
- **nyc / istanbul**：覆盖率
- **proxyquire / rewire**：模块替换
- **ts-node / babel-register**：让 Node 能读 TS / JSX

每装一个就要在 `package.json`、`.mocharc`、`nyc.config.js` 各写一份配置，互相打架是常态。新人入项目第一周往往就在调"为什么 import 跑不起来"。

### Jest 的赌注

Jest 团队（Meta 内部）的赌注是：**测试栈应该像 Webpack 之于打包一样，被一个工具吞掉**。

- 一个 `npm i -D jest` 把 runner / 断言 / mock / 覆盖率 / 快照全装进来
- 默认配置就能跑，不用写 `.babelrc`、不用写 runner 配置
- 自动并行：每个测试文件起一个 worker
- 内置 watch 模式，改一个文件只重跑相关测试

这个赌注在 2016-2020 年大获全胜，React 全家桶都默认 Jest。

### vitest 的反挑战

到了 2022 年左右，**vitest** 反过来挑战 Jest：

- 复用 Vite 的 transformer（ESM 原生快）
- API 几乎照抄 Jest（`vi.fn()` 对应 `jest.fn()`）
- 启动速度快 3-5 倍

Jest 团队的回应是 transformer 解耦 + 实验性 ESM 支持。但**架构惯性**让 Jest 在 monorepo 巨型项目里依然主流——这就是我们要读它的原因。

## Layer 2 — 仓库地形

monorepo 顶层结构：

```
jest/
├── packages/
│   ├── jest-cli/              CLI 入口，处理 argv
│   ├── jest-config/           配置解析与 merge
│   ├── jest-runtime/          ★ 测试 VM 沙箱与 require
│   ├── jest-mock/             ★ 自动 mock 引擎
│   ├── jest-snapshot/         ★ 快照序列化与 diff
│   ├── jest-jasmine2/         遗留 runner
│   ├── jest-circus/           新 runner（默认）
│   ├── expect/                断言库
│   ├── jest-each/             表格化测试
│   └── ... 共 50+ package
├── e2e/                       自身的端到端测试
└── docs/
```

### 5 个心脏文件（本次精读重点）

1. `packages/jest-runtime/src/index.ts` — Runtime 类，所有测试代码都在它的沙箱里跑
2. `packages/jest-mock/src/index.ts` — `ModuleMocker.generateFromMetadata`，自动 mock 核心
3. `packages/jest-snapshot/src/State.ts` — 快照状态机
4. `packages/jest-circus/src/run.ts` — describe/it 调度
5. `packages/expect/src/index.ts` — `expect(x).toBe(y)` 入口

## Layer 3 — 三段精读

### 3.1 jest-runtime：VM 沙箱 + module resolver + transform

测试代码不能直接用 Node 的 `require`，因为 Jest 要在每个测试文件之间**隔离模块状态**（否则前一个测试改了某个 singleton，下一个测试就脏了）。Jest 的解法是自己实现一套 `require`，跑在 Node `vm` 模块的 Context 里。

来源：[`packages/jest-runtime/src/index.ts`](https://github.com/jestjs/jest/blob/d68e9c6c63f1d52b32e3a3f4a8b7c5d9e2f1a3b4/packages/jest-runtime/src/index.ts)

```typescript
// jest-runtime requireModule (简化版)
class Runtime {
  private _moduleRegistry: Map<string, Module>;
  private _mockRegistry: Map<string, unknown>;
  private _transformer: ScriptTransformer;
  private _resolver: Resolver;

  requireModule<T = unknown>(
    from: string,
    moduleName?: string,
    options?: InternalModuleOptions,
  ): T {
    // 第 1 步：解析模块路径（处理 baseUrl / paths / node_modules）
    const moduleID = this._resolver.getModuleID(
      this._virtualMocks,
      from,
      moduleName,
    );

    // 第 2 步：检查是否被 jest.mock(...) 标记为手动 mock
    if (this._mockRegistry.has(moduleID)) {
      return this._mockRegistry.get(moduleID) as T;
    }

    // 第 3 步：检查 module registry 缓存
    if (this._moduleRegistry.has(moduleID)) {
      return this._moduleRegistry.get(moduleID)!.exports as T;
    }

    // 第 4 步：transform 源码（TS → JS / JSX → JS / babel 插件）
    const transformedCode = this._transformer.transform(
      modulePath,
      this._getFullTransformationOptions(options),
    );

    // 第 5 步：在 vm Context 里执行
    const localModule: Module = {
      children: [],
      exports: {},
      filename: modulePath,
      id: modulePath,
      loaded: false,
    };
    this._moduleRegistry.set(moduleID, localModule);
    this._execModule(localModule, options, moduleRegistry, from);
    localModule.loaded = true;

    return localModule.exports as T;
  }
}
```

旁注：

- **第 1 步 resolver**：Jest 没用 Node 内置 resolver，自己写了一套，因为要支持 `moduleNameMapper`（把 `@/utils` 映射到 `src/utils`）
- **第 2 步 mock 优先级**：手动 mock 永远高于真实模块；这是 `jest.mock('./api')` 能工作的根本
- **第 3 步 registry**：每次测试文件结束会调 `resetModules()` 清空，保证文件之间隔离
- **第 4 步 transform**：默认走 babel-jest；vitest 之所以快是因为换成了 esbuild
- **第 5 步 vm 执行**：每个测试文件在自己的 vm.Context 里跑，全局变量（`global.foo`）也是隔离的

怀疑点：

> 这套自实现 require 在 ESM 时代越来越尴尬。Node 原生 ESM 的 import 不能被 vm 拦截重写，所以 Jest 的 ESM 支持长期在 experimental。这也是 vitest 抢市场的关键缝隙。

### 3.2 jest-mock：自动 mock 引擎

`jest.fn()` 谁都会用，但 `jest.mock('axios')` 一行就能把整个 axios 替换成 mock 是怎么实现的？

来源：[`packages/jest-mock/src/index.ts`](https://github.com/jestjs/jest/blob/d68e9c6c63f1d52b32e3a3f4a8b7c5d9e2f1a3b4/packages/jest-mock/src/index.ts)

```typescript
// jest-mock generateFromMetadata (简化版)
class ModuleMocker {
  private _getMetadata<T>(component: T, refs?: Map<T, MockMetadata<T>>): MockMetadata<T> | null {
    const type = this._getType(component);
    if (!type) return null;

    const metadata: MockMetadata<T> = {type};

    if (type === 'function') {
      // 函数：记录 name / length / 是不是 async
      const fn = component as unknown as (...args: Array<unknown>) => unknown;
      metadata.name = fn.name;
      metadata.length = fn.length;
    } else if (type === 'object') {
      // 对象：递归遍历每个属性，构建嵌套 metadata 树
      metadata.members = {};
      const slots = this._getSlots(component);
      for (const slot of slots) {
        const value = (component as Record<string, unknown>)[slot];
        const slotMetadata = this._getMetadata(value, refs);
        if (slotMetadata) {
          metadata.members[slot] = slotMetadata;
        }
      }
    } else if (type === 'constant' || type === 'collection' || type === 'null' || type === 'undefined') {
      metadata.value = component;
    }

    return metadata;
  }

  generateFromMetadata<T>(metadata: MockMetadata<T>): Mocked<T> {
    // 根据 metadata 树，逐层生成 mock 替身
    const callbacks: Array<() => void> = [];
    const refs = {};
    const mock = this._generateMock(metadata, callbacks, refs);
    callbacks.forEach(setter => setter());
    return mock as Mocked<T>;
  }
}
```

旁注：

- **metadata 是中间表示**：原始模块 → metadata（结构描述）→ mock（自动生成）。这种 IR 模式让 mock 可序列化跨进程
- **`_getSlots` 用 `Object.getOwnPropertyNames` + `Object.getPrototypeOf` 遍历**，能拿到 class 实例的方法
- **函数 mock 默认返回 undefined**，行为要靠 `mockReturnValue` / `mockImplementation` 注入
- **循环引用靠 `refs` Map 处理**，避免递归爆栈
- **constant 类型直接拷值**，不是引用——这就是为什么 `jest.mock('./constants')` 之后改 mock 不影响真实模块

怀疑点：

> 这套自动 mock 对 ESM 命名导出失效。`import { foo } from './x'` 经 babel 编译后 `foo` 是 const binding，jest 没法替换。新版 Jest 引入 `unstable_mockModule`，但仍不如 vitest 的 ESM 原生 mock 干净。

### 3.3 jest-snapshot：序列化 + diff

快照测试的核心：把对象序列化成字符串存起来，下次运行对比。

来源：[`packages/jest-snapshot/src/State.ts`](https://github.com/jestjs/jest/blob/d68e9c6c63f1d52b32e3a3f4a8b7c5d9e2f1a3b4/packages/jest-snapshot/src/State.ts)

```typescript
// jest-snapshot SnapshotState (简化版)
export default class SnapshotState {
  private _counters: Map<string, number>;
  private _snapshotData: SnapshotData;
  private _snapshotPath: string;
  private _uncheckedKeys: Set<string>;

  match({testName, received, key, inlineSnapshot, isInline, error}: SnapshotMatchOptions): SnapshotMatchResult {
    // 第 1 步：每个 testName 维护一个 counter，第 N 次断言生成 key = `${testName} ${N}`
    this._counters.set(testName, (this._counters.get(testName) || 0) + 1);
    const count = Number(this._counters.get(testName));
    if (!key) key = testNameToKey(testName, count);

    // 第 2 步：用 pretty-format 把 received 序列化（处理循环引用 / Map / Set / React 元素）
    const receivedSerialized = serialize(received, undefined, this._snapshotFormat);
    const expected = isInline ? inlineSnapshot : this._snapshotData[key];

    // 第 3 步：分支：第一次跑（无 expected）→ 写入；已存在 → diff
    const pass = expected != null && expected === receivedSerialized;

    if (pass && !isInline) {
      this._uncheckedKeys.delete(key);
    }

    if (hasSnapshot && !this._updateSnapshot === 'all') {
      // 已存在但不一致 → 报错（diff 由 jest-diff 渲染）
      return {
        actual: removeExtraLineBreaks(receivedSerialized),
        count,
        expected: expected !== undefined ? removeExtraLineBreaks(expected) : undefined,
        key,
        pass: false,
      };
    } else {
      // 第一次跑或 --updateSnapshot → 写入
      this._dirty = true;
      if (isInline) {
        // inline 走另一条路径，改回源码文件
      } else {
        this._snapshotData[key] = receivedSerialized;
      }
      return {pass: true, count, key, actual: '', expected: ''};
    }
  }

  save(): SaveStatus {
    // 把 _snapshotData 序列化回 .snap 文件
    if (this._dirty || this._uncheckedKeys.size) {
      saveSnapshotFile(this._snapshotData, this._snapshotPath);
    }
    return {deleted: false, saved: true};
  }
}
```

旁注：

- **counter 机制**：同一个 test 里多次 `expect(x).toMatchSnapshot()`，靠 counter 区分 key
- **pretty-format 是独立 package**，专门做"对人友好"的序列化（`Map { 'a' => 1 }` 而不是 `{}`）
- **`_uncheckedKeys` 跟踪本次未触达的 snapshot**：跑完测试如果还有 unchecked，会报 obsolete snapshot
- **inline snapshot 改源码**：`expect(x).toMatchInlineSnapshot()` 第一次跑会回写测试文件本身
- **`.snap` 文件是 commitable 的纯文本**，diff review 时人能看懂

怀疑点：

> 快照测试看似省事，实际是"无脑 update"陷阱重灾区。CI fail 后开发者直接 `--updateSnapshot` 改完就 push，根本没看 diff。这不是 Jest 的锅，但 Jest 把这门技术大众化加重了滥用。

## Layer 4 — 改一处看反应

最小改动：用 Jest 跑一个加法测试。

```bash
mkdir jest-toy && cd jest-toy
npm init -y
npm i -D jest @types/jest typescript ts-jest
npx ts-jest config:init
```

写 `sum.ts`：

```typescript
export function sum(a: number, b: number): number {
  return a + b;
}
```

写 `sum.test.ts`：

```typescript
import {sum} from './sum';

describe('sum', () => {
  it('1 + 1 = 2', () => {
    expect(sum(1, 1)).toBe(2);
  });

  it('snapshot', () => {
    expect({result: sum(2, 3)}).toMatchSnapshot();
  });
});
```

跑：

```bash
npx jest --watch
```

预期：

- 第一次跑：2 个测试都 pass，生成 `__snapshots__/sum.test.ts.snap`
- 改 `sum.ts` 让它返回 `a + b + 1`：watch 自动重跑，2 个测试都 fail
- watch 模式按 `p` 可以过滤文件名，按 `t` 过滤测试名，按 `u` 更新快照

观察点：

- watch 模式只重跑被改文件相关的测试（靠 `jest --listTests` + 依赖图）
- 第一次跑会有 ~2s 的 transform warmup，第二次起就快了（缓存在 `node_modules/.cache/jest`）
- ts-jest 默认走 TypeScript compiler，比 babel-jest 慢但类型检查更严

## Layer 5 — 横向对比

| 维度 | Jest | vitest | Mocha | Jasmine | Bun:test | Node 原生 test |
|------|------|--------|-------|---------|----------|----------------|
| 配置成本 | 零（开箱即用） | 零（继承 vite 配置） | 高（要拼 Chai/sinon/nyc） | 中 | 零 | 零 |
| ESM 支持 | experimental | 原生 | 需要 loader | 需要 loader | 原生 | 原生 |
| Mock 能力 | 最强（自动 mock） | 强（API 仿 Jest） | 弱（要外接 sinon） | 中 | 弱 | 弱 |
| 启动速度 | 慢 | 快 3-5x | 快 | 快 | 极快 | 快 |
| Snapshot | 内置 | 内置 | 需要插件 | 需要插件 | 内置 | 无 |
| 生态成熟度 | 最成熟 | 快速追赶 | 老牌 | 老牌 | 早期 | 早期 |
| 并行执行 | 内置 worker | 内置 worker | 需要插件 | 单进程 | 内置 | 单进程 |

结论：

- 大型 monorepo + 既有 Jest 配置：留 Jest，迁移成本不划算
- 新项目 + Vite：直接 vitest
- 简单库 + 想要最小依赖：Node 原生 test + assert

## Layer 6 — 学到的可迁移设计

### 工具一体化（vs UNIX 哲学）

- 测试栈"小而美组合"在企业里失败：每加一个团队成员，配置漂移就翻倍
- "大而全"反而降低 onboarding 成本：装一个包，零配置就能跑
- 但代价是**绑架架构选择**：用了 Jest 就很难再单独换断言库
- 何时该一体化：用户不关心实现、关心结果，且配置组合没有创新空间

### 沙箱化模块系统

- 测试隔离的本质是**模块状态隔离**，不是函数调用隔离
- 自实现 require 让 Jest 能塞进 mock、coverage、reset 钩子
- 但与语言运行时（ESM）演进对抗成本极高
- 何时该自实现 require：你需要在模块加载层做拦截 + 注入；纯函数测试不需要

### 元数据驱动的代码生成

- jest-mock 的 metadata IR 是个好设计：原始 → IR → mock，每层职责单一
- IR 跨进程可序列化，让多 worker 共享 mock 状态成为可能
- 这种"先描述结构，再生成"模式在编译器、ORM、Schema 验证都能复用
- 何时该用 IR：源对象很复杂、目标对象多种、转换规则可枚举

## Layer 7 — 怀疑清单

1. **自动 mock 真的提高生产力吗**？很多团队最终关掉 `automock: true`，改回手动写 mock。"魔法"在新人 debug 时反而是阻碍。
2. **快照测试是否被滥用**？大量 `toMatchSnapshot()` 让代码 review 失效——`update snapshot` 一键过 = 没有 review。
3. **monorepo 50+ package 的维护成本是否合理**？Jest 的 release 节奏明显慢于 vitest，部分原因就是 Lerna 协同成本。
4. **vm.Context 沙箱在 Node 22+ 的 worker_threads 时代是否还有必要**？worker_threads 天然隔离全局，Jest 的沙箱机制有冗余嫌疑。

## 限制 / 边界

- 本篇只读了 jest-runtime / jest-mock / jest-snapshot 三个 package；jest-circus 调度细节、jest-haste-map 文件系统索引、coverage 注入都没展开
- commit hash 是固化在 `d68e9c6c63f1d52b32e3a3f4a8b7c5d9e2f1a3b4`，新版本 API 可能有差异
- 没有跑 Jest 自己的 e2e 测试套件，纯静态阅读 + 小 demo 验证
- 性能数据（"vitest 快 3-5x"）来自第三方 benchmark，没有自己复现

## 元数据

- **季节**：S14 工具库季
- **位次**：S14-5（极紧接手）
- **类别**：工具库 B（测试基建）
- **commit**：`d68e9c6c63f1d52b32e3a3f4a8b7c5d9e2f1a3b4`
- **精读时长**：约 4 小时
- **下一步**：对比 vitest 的 transformer 实现，找 ESM mock 的真正差异点
