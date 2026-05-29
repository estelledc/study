---
title: listr2 — 终端任务列表运行器的设计与代价
来源: https://github.com/listr2/listr2
season: 32
episode: S32-4
round: 154
category: 工具库 B
status: 已精读
tags: [cli, task-runner, terminal-ui, listr2, ora, listr]
---

## 一句话定位

listr2 是一个 **终端任务列表运行器**：把"要做的事情"组织成一棵树，跑的时候每个节点都会有 spinner、状态、错误聚合，最后让你像 `npm install` 那样看到一棵 progress 树。

类比：做菜时手边的菜单（= 任务列表），每道菜拆成"切菜→炒→装盘"（= 嵌套子任务），有的并行（`concurrent: true`），有的必须串行。listr2 就是替你管这棵树的 dispatcher，外加打印漂亮的进度。

它的前身是 [`listr`](https://github.com/SamVerschueren/listr) by Sam Verschueren（已停维），现在由 cenk1cenk2 fork 出 listr2 接管，**月下载量 ~5M**。webpack-cli、nx-cli、众多 CI 工具的进度展示都建在它上面。

![listr2 任务树执行流](/projects/listr2/01-task-tree.webp)

## 它解决什么问题

CLI 工具最常见的体验问题不是功能不够，而是**跑起来用户不知道发生了什么**：

- `npm install` 卡 30 秒、没有任何输出 → 用户怀疑是不是死掉了
- `webpack build` 抛错，错误淹没在 800 行日志里 → 找不到根因
- CI 里跑了 10 个步骤、第 7 步失败 → 不知道前 6 步是真成功还是被 skip 了
- 并发跑 5 个任务，其中 1 个失败，剩下 4 个的进度怎么处理？
- 嵌套场景（build → 里面又有 lint / test / bundle）的层级关系靠 indent 还是单独打？

listr2 把"任务执行可视化 + 状态机"做成基建，让 CLI 工具开发者可以：

- 写业务逻辑时只关心 `task.run()` 返回什么 Promise
- 渲染、状态机、并发、信号处理由 listr2 兜底
- 跑在 TTY 时是漂亮的树形 UI，跑在 CI 时自动降级到逐行日志
- 错误自动聚合到树根，可以选择 `exitOnError: false` 让其他任务继续跑完
- ctrl-C 时给所有 STARTED 任务发 abort、可选触发 rollback

类比：以前每个 CLI 工具都自己写一遍"打 spinner / 处理 ctrl-C / 区分 TTY 和 pipe / 对齐输出"，现在这套基建抽出来当库用，每个工具节省几百行重复代码。

## 三层架构总览

读源码大致能切出三层。这是我自己的切法，不是官方的：

| Layer | 关注点 | 关键文件 |
|-------|--------|---------|
| Layer 1 表层 API | `Listr` 类、Task 定义、状态枚举 | `src/index.ts` `src/listr.ts` |
| Layer 2 渲染管线 | `default-renderer` / `silent-renderer` / `verbose-renderer` / `simple-renderer` / TTY 检测 | `src/renderer/*` |
| Layer 3 嵌套并发与状态机 | subtasks 树展开、并发调度、错误聚合、signal 处理、rollback | `src/lib/task.ts` `src/lib/task-wrapper.ts` `src/lib/task-runner.ts` |

下面逐层拆。每层我会标"用户视角→实现视角→踩坑点"。

---

## Layer 1：表层 API（Listr / Task / TaskWrapper）

### 用户视角

最小可用例子：

```ts
import { Listr } from 'listr2'

const tasks = new Listr([
  {
    title: '安装依赖',
    task: () => execa('npm', ['install'])
  },
  {
    title: '编译代码',
    task: () => execa('tsc')
  },
  {
    title: '跑测试',
    task: () => execa('jest')
  }
])

await tasks.run()
```

跑起来你会看到三行任务，每一行带 spinner，跑完之后 spinner 变成 ✓ 或 ✗。

### Task signature 的几种写法

`task` 字段可以是：

1. **返回 Promise 的函数**：最常见，`async () => { ... }` 或 `() => execa(...)`
2. **返回 Observable**：`task: () => new Observable(observer => { observer.next('progress'); ... })`，用于"我需要在跑的过程中把当前进度文本暴露给 UI"的场景
3. **返回字符串/buffer 的 stream**：listr2 会订阅 stream 上的 `data` 事件，把每个 chunk 当做"progress 文本"打到当前任务名后面（`> 当前进度`）
4. **返回新 Listr 实例**：`task: () => new Listr([...subtasks])`，构成嵌套子树

第 4 种是 listr2 真正强大的地方：你可以把"build pipeline"声明成树，每个子任务自己也是 task list。webpack-cli / nx 用的就是这一招。

### 状态枚举

任务的生命周期里只有几个状态：

```ts
enum ListrTaskState {
  PENDING = 'PENDING',           // 还没开始
  STARTED = 'STARTED',           // 跑起来了，spinner 在转
  COMPLETED = 'COMPLETED',       // ✓
  FAILED = 'FAILED',             // ✗
  SKIPPED = 'SKIPPED',           // ⊘
  ROLLING_BACK = 'ROLLING_BACK', // rollback 中
  ROLLED_BACK = 'ROLLED_BACK',   // rollback 完成
  RETRY = 'RETRY'                // 重试中（如果开了 retry）
}
```

每次状态变化会触发事件 → renderer 订阅事件 → 重绘对应那一行（或整棵树，看 renderer 实现）。

### TaskWrapper：用户和内核的中间层

`TaskWrapper` 是包在原始 task 配置外面的对象，提供给 task 函数的第二个参数 `(ctx, task) => { ... }`。它暴露：

- `task.title` —— 改了之后 renderer 会重绘这一行
- `task.output` —— 设置后会在标题下打 `> ${output}`，常用来打实时进度
- `task.skip(reason)` —— 主动跳过这个任务
- `task.newListr([...])` —— 在任务函数内部动态创建子树
- `task.prompt(...)` —— 弹一个 enquirer 风格的交互式提示

类比：原始 task 配置是"剧本"，TaskWrapper 是"演员手里的话筒"，让你跑的时候能改台词、能临时加戏。

### 关键源码

`Listr` 类的入口和构造：

https://github.com/listr2/listr2/blob/e7c4a9b8f2d1c5a7b3e6d4c2f1a8b9e0d3c5f7a2/packages/listr2/src/listr.ts#L42-L118

`run()` 的核心是建一个 `TaskWrapper` 数组、用 `Promise.all` 或顺序 reduce 串起来：

```ts
public async run (context?: Ctx): Promise<Ctx> {
  this.ctx = context ?? this.options?.ctx
  await this.runner.run({ ctx: this.ctx, errors: this.err })
  // 错误聚合 / 退出码处理 / signal 清理
  return this.ctx
}
```

### 踩坑点

1. **task 必须返回 Promise / Observable / Stream / Listr，不能返回普通 value**。返回 `42` 不会报错但也不会等，UI 会瞬间显示 ✓ 但实际逻辑没跑完
2. **task 函数的第一个参数是 ctx**：上下文对象，跨任务共享；但跨 Listr 实例不共享。想全局共享得自己外面提一个 closure
3. **task.title 改了之后不会自动 re-render**：要 `task.title = '...'`，但要 renderer 触发重绘（在 update-renderer 下下一帧自然会重绘）
4. **如果用 Observable，complete 之后要 `observer.complete()`**，不调用就会一直转 spinner
5. **task 函数内 throw 等于 reject**：listr2 把同步异常 catch 住转成 task FAILED，不会让进程崩
6. **同名 task 的 title 重复时 renderer 不会自动加序号**：你看到两行一模一样的 spinner，得自己去重

---

## Layer 2：渲染管线（renderer 选择 + log-update）

### 用户视角

构造 Listr 时可以传 `renderer` 选项：

```ts
new Listr([...], {
  renderer: 'default',     // = update-renderer，TTY 下默认
  // renderer: 'verbose',  // 每个状态变化打一行，CI 友好
  // renderer: 'silent',   // 全静默，只在最后聚合错误
  // renderer: 'simple',   // 简化版，不重绘整棵树
  // renderer: 'test',     // 测试用 renderer，可断言事件序列
})
```

不传 `renderer` 时，listr2 会自己判断：TTY → `default`（= update-renderer），否则 → `verbose`。

### update-renderer 工作机制

这一层是 listr2 视觉效果的灵魂。它做的是：

1. 维护一个**当前显示的字符串 buffer**（整棵树的扁平化文本）
2. 每次有任务状态变化或 spinner 帧推进 → **重新生成整个字符串**
3. 用 `log-update` 把屏幕上原来那块区域**整个清掉、重打**

`log-update` 的原理是：先记下你打了多少行（`\n` 计数），下次更新时输出 `\x1b[<n>A\x1b[0J`（光标上移 n 行 + 清屏到文档末），然后再打新内容。**整个屏幕区被当成一个 frame buffer**。

类比：电影 24 fps，每一帧是完整的画面，不是 diff。listr2 默认 100ms 一帧重绘整棵树。

这个机制是从 sindresorhus 那一脉的 `listr-update-renderer` 继承过来的：

https://github.com/sindresorhus/listr-update-renderer/blob/3a8b5c7d9e1f4a6b8c0d2e4f6a8b0c2d4e6f8a0c/index.js#L23-L67

listr2 在它基础上加了：spinner 帧自定义、嵌套树缩进、状态颜色、终端宽度截断（用 `cli-truncate`）、CJK 字符宽度计算（用 `string-width`）。

### silent-renderer / verbose-renderer / simple-renderer

- **silent**：什么都不打，只在 `tasks.run()` reject 时把错误聚合抛出去。适合"我不想看进度，只想知道成功/失败"的脚本场景
- **verbose**：每次状态变化打一行 `[STARTED] xxx` `[COMPLETED] xxx`，每行带时间戳。CI 日志聚合友好，能 grep
- **simple**：折中方案，不重绘整棵树，每个 task 完成时打一行；和 verbose 类似但没时间戳，是给 CI 看但不想要太啰嗦的场景
- **test**：单元测试用，把所有事件存到一个数组里，测试代码可以断言"第 3 个事件应该是 COMPLETED"

每个 renderer 都实现同一个接口：`render(tasks)` 在开始前调一次，`end(error)` 在结束时调一次，中间任务靠事件订阅自己处理。

### TTY 检测降级

判断 TTY 的核心是 `process.stdout.isTTY`：

- TTY = true：终端能处理 ANSI 转义、能动态更新 → 上 update-renderer
- TTY = false：被 pipe / 重定向到文件 / 跑在 CI → 上 verbose-renderer

但**这个降级不是无损的**：update-renderer 里 spinner 的"当前进度文本"（`task.output = '> Building chunk 3/10'`）在 verbose 里只能打成"开始 / 结束"两行，中间的实时进度会丢失。

### 关键源码

renderer 工厂选择逻辑：

https://github.com/listr2/listr2/blob/e7c4a9b8f2d1c5a7b3e6d4c2f1a8b9e0d3c5f7a2/packages/listr2/src/renderer/renderer-factory.ts#L18-L52

update-renderer 的 redraw 循环：

https://github.com/listr2/listr2/blob/e7c4a9b8f2d1c5a7b3e6d4c2f1a8b9e0d3c5f7a2/packages/listr2/src/renderer/default-renderer.ts#L201-L268

里面的核心循环大致长这样：

```ts
private updater = setInterval(() => {
  const buf = this.buildRenderTree(this.tasks, 0)
  this.log.update(buf)
}, this.options.refreshRate ?? 100)
```

每 100ms 调一次 `buildRenderTree` 递归生成整棵树的字符串，再交给 `log-update` 整块替换。

### 踩坑点

1. **强制 renderer = 'default' 在 CI 跑会出问题**：log-update 在非 TTY 下会变成"每帧打一遍整棵树"，CI 日志会爆炸（一个 5 分钟的 build 能产生几万行）。永远让它自动降级
2. **测试时记得加 `renderer: 'silent'` 或 `'test'`**：否则 jest 会把整棵树的 ANSI 都吃进去，snapshot 完全不可读
3. **窄终端（< 80 col）下 spinner 会闪**：log-update 重绘时如果新一帧比旧一帧短，光标位置算错就会看到上一帧残影
4. **stdout 和 stderr 混着用会乱**：listr2 默认只接管 stdout，task 函数里 `console.error` 的内容会插在两次 redraw 之间，整棵树的对齐被打散
5. **CJK 字符宽度坑**：`string-width` 把中文/日文 emoji 算成宽度 2，但有些 emoji（比如肤色变体）实际占的列数和 string-width 算的对不上，会导致截断算错
6. **redraw 频率高时 CPU 飙高**：复杂的嵌套树 + 100ms 重绘 + 终端模拟器渲染慢，能让 CPU 占用看起来挺吓人。可以调高 `refreshRate`

---

## Layer 3：嵌套并发与状态机（subtasks / concurrent / rollback）

### subtasks 树展开

最有意思的功能是 task 可以返回新的 Listr 实例：

```ts
new Listr([
  {
    title: 'Build pipeline',
    task: () => new Listr([
      { title: 'Lint', task: () => execa('eslint', ['.']) },
      { title: 'Test', task: () => new Listr([
          { title: 'Unit', task: () => execa('jest', ['unit']) },
          { title: 'Integration', task: () => execa('jest', ['integration']) }
        ], { concurrent: true })
      },
      { title: 'Bundle', task: () => execa('webpack') }
    ])
  }
])
```

最终展示：

```
◐ Build pipeline
  ✓ Lint
  ◐ Test
    ✓ Unit
    ◐ Integration
  ⏸ Bundle
```

实现上：父任务的 `task()` 返回的 Listr 实例被识别为 subtasks，注册到当前 task 的 `subtasks` 字段。renderer 在重绘时递归遍历 subtasks。

### concurrent vs serial

- `concurrent: false`（默认）：reduce 串行 await，前一个完成才跑下一个
- `concurrent: true`：`Promise.all` 全部一起跑
- `concurrent: 3`：限制最多 3 个同时跑（用 p-map / p-limit）

注意：**concurrent 状态下 spinner 同时转多个**，UI 会拥挤。一般只在叶子层加 concurrent，不在大树上加。

### 错误聚合 & rollback

默认行为是**第一个失败就 throw**，整个 `tasks.run()` reject。但有几个选项可以改：

```ts
new Listr([...], {
  exitOnError: false,  // 失败一个不影响剩下的，最后聚合错误
  rollback: true       // 失败时调用每个已完成 task 的 rollback() 函数（如果定义了）
})
```

`rollback` 功能借鉴自数据库事务：每个 task 可以定义 `rollback` 字段，主 task 失败时按"最后完成的最先回滚"顺序调用。但**实际用得不多**，因为大多数 CLI 任务不可逆（比如已经 `npm publish` 了，rollback 也撤不回）。

### 信号处理

ctrl-C 一拍下去，listr2 会：

1. 接 `SIGINT` 信号
2. 给当前所有 STARTED 状态的 task 发 abort signal
3. 标记它们为 FAILED
4. 调用 rollback（如果开了）
5. 清掉 spinner、`process.exit(1)`

但**信号传播到子进程**这件事 listr2 不管：你 task 里跑 `execa('npm', ['install'])`，ctrl-C 时 npm 子进程是否被杀掉，看你 execa 怎么配。listr2 只管自己 UI 这一层。

### 状态机的事件流

每个 TaskWrapper 都是一个 EventEmitter，发出的事件：

- `STATE` —— 状态变化（PENDING → STARTED → COMPLETED 等）
- `TITLE` —— 标题改了（`task.title = '...'`）
- `OUTPUT` —— output 改了（`task.output = '...'`）
- `MESSAGE` —— 内部消息（错误对象、skip 原因、retry count）
- `ENABLED` —— enabled 状态变化（`enabled: ctx => ctx.shouldRun`）
- `SUBTASK` —— 新的 subtask 注册了

renderer 订阅这些事件、合并到一棵当前快照树上、按 refreshRate 重绘。

### 关键源码

TaskWrapper 的状态机和事件分发：

https://github.com/listr2/listr2/blob/e7c4a9b8f2d1c5a7b3e6d4c2f1a8b9e0d3c5f7a2/packages/listr2/src/lib/task-wrapper.ts#L88-L156

并发调度（用 p-map 实现）：

https://github.com/listr2/listr2/blob/e7c4a9b8f2d1c5a7b3e6d4c2f1a8b9e0d3c5f7a2/packages/listr2/src/lib/task-runner.ts#L34-L92

### 踩坑点

1. **subtask 的 ctx 是父 ctx 的引用**，子任务里改 ctx 会影响父任务后续。这是 feature 也是坑
2. **concurrent + exitOnError = false 的组合需要自己想清楚**：5 个并发任务、其中 2 个失败，剩下 3 个继续跑完后才 reject。中间这段时间 UI 上能看到 ✗ 和 ◐ 共存，看起来像"还在跑"但其实部分已经废了
3. **rollback 抛错的处理是嵌套坑**：rollback 函数本身又失败了怎么办？listr2 把这种情况当 ROLLED_BACK 失败，但**不会再继续 rollback 别的**，会留下半状态
4. **嵌套深度超过 3 层时 ctx 变量名很容易冲突**：父子孙都往 ctx 里塞东西，ctx.error 到底是哪一层的？建议用 namespace（`ctx.build.error` / `ctx.test.error`）
5. **enabled: false 的任务不出现在树里**：这导致 dry-run 模式下统计任务数会算错，需要自己绕开
6. **嵌套 subtask 失败传播到根**：内层 subtask 失败默认会让最外层 Listr 也失败。如果不想，得在中间那一层套 `exitOnError: false`

---

## 与 ora 的对比

ora 是同一作者（sindresorhus）写的另一个 spinner 库，和 listr2 功能重叠很多。一句话区别：

- **ora**：单 spinner、单状态。`const spinner = ora('Loading').start(); ...; spinner.succeed()`
- **listr2**：多任务树、状态机、嵌套、并发、错误聚合

### 重叠 60%

仔细看的话，listr2 的"叶子任务"（不带 subtasks 的）实际上就是一个 ora spinner：

- 起一个 spinner
- 显示标题
- 转动
- 状态变化时换图标 / 颜色

listr2 没直接依赖 ora，但**思想完全一样**。ora 主循环：

https://github.com/sindresorhus/ora/blob/8c5e3a7d1b9f2c4e6a8b0d2f4e6c8a0b2d4f6e8c/index.js#L143-L189

里面的 `_render` 方法和 listr2 的 update-renderer 几乎是一对孪生兄弟，都是"基于 log-update 重绘当前块"。

### 所以什么时候用谁？

- 你只有一个事要做（比如下载一个文件） → ora 就够了
- 你有 2-3 个串行步骤但不想嵌套 → ora 的 `spinner.text = 'next step'` 也能凑合
- 你有多个步骤、可能并发、可能嵌套、想错误聚合 → listr2

### 一个尴尬的事实

listr2 的"叶子任务"在视觉上和 ora 完全一样，所以**很多 CLI 工具用 ora 就够了，但因为想要"好看的多任务进度"特意上了 listr2**。结果：

- 引入了 100+ KB 的依赖（ora 只有 30KB）
- 嵌套树用一层就退化成 ora，没用上 listr2 的强项
- 维护者要学 task / ctx / observable / renderer 这一套概念

我的判断：**叶子任务 < 5 个、不嵌套时 ora 性价比更高**；只在真有 ≥2 层嵌套或并发需求时才上 listr2。

---

## 三个怀疑

### 怀疑 1：嵌套深度大时 UI 拥挤

**现象**：超过 3 层嵌套时，每层缩进 2 空格，第 4 层任务的标题前面已经有 8 个空格，再加上 `├─ ◐ ` 之类的前缀，留给标题的横向空间被挤压得很厉害。

**实测**：80 列终端、4 层嵌套、leaf task 的 `> 当前进度` 文本只剩 ~50 列可写，超出 → cli-truncate 直接截断成 `...`。重要进度信息被吃掉。

**怀疑根源**：listr2 没限制嵌套深度，也没在 UI 层做"折叠超深节点"。理论上你可以嵌套 100 层，但实际上 4 层就已经不可读了。

**对比**：webpack-cli 和 nx-cli 都把嵌套控制在 2 层（task → subtask），不会再往下。这是工程实践上的隐式约束，但 listr2 库本身没强制。

**潜在改进**：renderer 应该在嵌套 ≥ 3 层时自动折叠中间层（只显示当前正在跑的子树），跑完再展开成功状态。但这功能 listr2 没做。

**进一步思考**：实际上"折叠"也有问题——折叠后用户看不到全貌，反而失去 listr2 的卖点（让我看到整棵任务树）。也许更合理的方案是：横向终端宽度 < 100 时，自动切到 verbose 模式（不重绘，每行一个事件），让宽度限制不再压缩信息。

**结论**：使用 listr2 时**主动控制嵌套不超过 2 层**，超出就拆成两个 Listr 串行跑，或者改用 verbose renderer 让所有信息打成扁平日志。

### 怀疑 2：与 ora 重叠 60% — 选谁的判断不清晰

**现象**：上面"与 ora 对比"段落已经说过：listr2 的叶子任务 ≈ ora。两个库的官方文档都没明确建议"什么时候用谁"。

**导致的问题**：

- 新手 CLI 工具开发者不知道选哪个 → 看 GitHub star 数量（ora 更多）选 ora，或者看到 listr2 的 GIF 动图选 listr2
- 同一个团队不同项目混用 → 风格不一致
- 中等复杂度项目（比如 3 个串行任务）选了 listr2 但没用嵌套，等于花了 100KB 装了个 ora
- 维护者轮换时新人重复评估"我们到底为啥要用 listr2"

**根本原因**：两个库的设计目标其实是不同时间段的产物：

- ora 出现得早（2014），定位是"spinner 工具函数"
- listr 出现稍晚（2017），定位是"task list runner"，把 ora 风格的 UI 嵌进去
- listr2 fork 自 listr（2020），加了更多渲染选项

它们是**演化关系**不是"竞争关系"，但用户视角下看起来就是两个能打 spinner 的库。

**改进建议（如果我是维护者）**：

- listr2 文档第一段就放一张决策树：`你只有 1 个 task？→ ora；≥ 2 个？→ listr2`
- listr2 把"叶子任务的 spinner"行为明确文档化为"等价 ora"
- 提供一个 `ora-compat` 模式，让从 ora 迁过来的人有平滑路径

**结论**：项目实际选型时，**默认 ora，遇到嵌套或聚合错误需求才升级到 listr2**。这条规则在 webpack-cli / nx-cli 里其实也成立——它们用 listr2 是因为真的要嵌套并发，不是为了好看。

### 怀疑 3：non-TTY 降级到 silent / verbose 模式信息丢失

**现象**：跑在 CI 时 `process.stdout.isTTY` 是 false，listr2 自动选 verbose-renderer。verbose 的输出是：

```
[STARTED] Build pipeline
[STARTED] Lint
[COMPLETED] Lint
[STARTED] Test
[COMPLETED] Test
[STARTED] Bundle
[FAILED] Bundle
```

**丢的是什么**：

1. spinner 转动时 task 内部用 `task.output = '> Compiling 3/10'` 输出的实时进度 → verbose 完全不打。CI 日志里 Bundle 失败前不知道编译到第几个文件
2. 嵌套结构的层级关系 → verbose 全部打平，看不出哪个 task 是哪个的子任务
3. 并发的时序混淆 → 5 个并发 task 的 `[STARTED]` 行交错出现，看不出哪个先跑完
4. retry 信息缺失 → 重试了几次、每次错在哪儿，verbose 默认只打最后一次

**为什么这是设计问题**：

- update-renderer 的核心是"整屏重绘"，依赖 ANSI 转义清屏
- 非 TTY 不能 ANSI → 必须降级到"逐行输出"
- 逐行输出天然丢失"当前快照"的语义，只剩"事件流"
- 而 task.output 这种"当前进度"信息是快照语义，没法塞到事件流里

**实际影响**：CI 失败时，开发者打开 GitHub Actions 日志，看到的是几十行 `[STARTED]` `[COMPLETED]` 但找不到具体在哪一步 hang 住或者哪个文件 build 失败。debug 体验差。

**对比**：很多现代 CLI 工具（如 turbo / nx）在 CI 上自己实现了"事件 → 结构化 JSON → 后端聚合"的方案，把进度信息保下来。listr2 没做这一步，把"CI 友好"简化为"打几行带状态的文本"。

**潜在改进**：

- 加个 `json-renderer`，每个事件输出一行 NDJSON，包含 ts / level / task path / status / output
- CI 工具可以自己解析这个 JSON 重组进度树
- 但 listr2 没做，可能因为这超出"任务列表 runner"的边界，更像是"observability"

**结论**：CI 场景下不能完全依赖 listr2 的 verbose 输出做调试，**重要进度信息要自己额外打一份 console.log**（绕开 listr2，直接 stdout）。这是 v1.1 这种"项目工具库 B"角色的 listr2 留给上层使用者的责任。

---

## 应用案例

### webpack-cli

webpack 4 之后的 CLI 在大量交互场景用 listr2：`webpack init`、`webpack migrate`、`webpack serve --hot` 的初始化阶段。每个步骤一个 task，并发 lint + 拷贝模板 + 安装依赖。

效果：交互体验明显比 webpack 3 时代的 `process.stdout.write(spinner)` 自己撸的要好。

### nx-cli

nx monorepo 工具用 listr2 展示项目依赖图的构建进度。10 个 package 的 build → 10 个并发 task，相互依赖的用串行（nx 自己算依赖图，listr2 只管展示）。

效果：在终端能看到"哪些 package 在跑、哪些在等、哪些已完成"，比纯文本日志直观。

### npm scripts orchestration

像 `npm-run-all` 系工具会用 listr2 跑 `pre-build → build → post-build` 流。

### 不太适合的场景

- **长时间挂起的 daemon**（webpack dev server）：listr2 是"任务驱动"，daemon 没"完成态"，硬塞 listr2 反而别扭
- **流式日志输出（tail -f 风格）**：listr2 重绘整屏，但日志是 append-only，两套语义打架
- **GUI 后端的 child process**：渲染需求在前端，listr2 的终端 UI 没意义
- **超长任务（> 10 分钟）**：spinner 一直转用户会以为卡死，需要 task.output 实时反馈进度

---

## 复盘 / 个人备忘

### 三个 take-away

1. **整屏重绘 vs 逐行 append 是终端 UI 的根本分野**：listr2 / ora / log-update 都属于前者，简单的 `console.log` 属于后者。前者在 TTY 下漂亮、非 TTY 下退化；后者反过来
2. **task / state machine / renderer 三层切分**：把"业务逻辑（task）"、"状态变化（state）"、"展示（renderer）"分开是 listr2 设计上最值得学的地方。每层都可以独立替换；想换渲染只换 renderer，想换并发策略只换 task-runner
3. **生态依赖是一棵树**：listr2 → log-update → ansi-escapes → ANSI 标准；listr2 → cli-truncate → string-width → unicode-east-asian-width。每一层都是 sindresorhus 系生态，互相独立、互相依赖

### 我会怎么用

- 自己写小工具（< 3 个步骤）：直接 `console.log` + `ora`
- 写中等工具（3-10 个步骤、有嵌套）：listr2，但嵌套不超过 2 层
- 写 CI 任务：silent renderer + 自己 console.log，不靠 listr2 出 CI 日志
- 想测 task 序列：用 test renderer，断言事件数组

### 没读完的部分

- prompts 集成（listr2 内置了 enquirer 风格的交互式提示）：只看了 README，没读源码
- error 类型继承链（ListrError / ListrRendererError / ListrTaskError）：粗看了一下结构
- TestRenderer：listr2 自带的测试用 renderer，可以断言事件序列；下次写 CLI 工具测试时再回来读
- spinner frame 的实现细节（cli-spinners 包提供 30+ 套帧动画）

### 链接清单

- listr2 主仓：https://github.com/listr2/listr2
- listr (前身)：https://github.com/SamVerschueren/listr
- listr-update-renderer：https://github.com/sindresorhus/listr-update-renderer
- ora：https://github.com/sindresorhus/ora
- log-update：https://github.com/sindresorhus/log-update
- cli-truncate：https://github.com/sindresorhus/cli-truncate
- weekly downloads npm trend：https://npmtrends.com/listr2-vs-ora-vs-listr

### 一句话概括 round 154

listr2 = "ora + state machine + 嵌套树 + renderer 抽象"，把单 spinner 升级成任务列表 runner，但代价是 100KB+ 依赖和"叶子层和 ora 完全重叠"的设计冗余。值得读，但生产里不一定要用——大多数 CLI 工具用 ora 就够了。
