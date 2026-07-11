---
title: listr2 — 把 CLI 任务跑成一棵会自己画进度的树
来源: 'https://github.com/listr2/listr2'
日期: 2026-05-30
分类: 工具库
难度: 中级
---

## 是什么

listr2 是一个 **Node.js 终端任务运行器**：你声明一棵"要做的事"的树，它替你跑、替你画进度、替你聚合错误。日常类比：做菜时贴在冰箱上的菜单——每道菜拆成"切菜→炒→装盘"，有的可以同时炒，有的必须串着来；listr2 就是替你管这张菜单的厨师助理。

最小例子：

```ts
import { Listr } from 'listr2'

await new Listr([
  { title: '安装依赖', task: () => execa('npm', ['install']) },
  { title: '编译代码', task: () => execa('tsc') },
  { title: '跑测试',   task: () => execa('jest') },
]).run()
```

跑起来你会看到三行任务，每一行带 spinner，跑完之后变 ✓ 或 ✗。它的前身是 Sam Verschueren 2017 年的 `listr`（已停维），现在 cenk1cenk2 fork 出 listr2 接管，月下载量约 5M。webpack-cli、nx 这些工具的进度条都建在它上面。

## 为什么重要

不理解 listr2，下面这些事都没法解释：

- 为什么 `npm install` 卡 30 秒还能让你"知道它在干嘛"——背后就是 spinner + 实时输出这套东西
- 为什么同一个 CLI 工具在你机器上是漂亮的树形 UI、在 CI 日志里却变成逐行文本
- 为什么 webpack-cli 改个 build pipeline 不用自己写 spinner / 不用自己处理 ctrl-C
- 为什么"并发跑 5 个任务，1 个失败、剩下 4 个继续跑完"这种逻辑能 1 行配置搞定

## 核心要点

listr2 的设计可以拆成 **三层**：

1. **任务即数据**：你写的 `{ title, task }` 配置只是描述，不是执行。Listr 类把它包成 `TaskWrapper` 后才跑。类比：菜谱写在纸上不会让锅热起来，得有人照着做。

2. **状态机 + 事件流**：每个任务有 PENDING / STARTED / COMPLETED / FAILED / SKIPPED / ROLLING_BACK 等状态，状态变化会发事件，renderer 订阅事件后决定怎么画。类比：任务是演员的"心情卡"，renderer 是观众席的字幕组。

3. **多 renderer + 自动降级**：TTY 下用 `default`（每 100ms 整棵树重绘一次），CI 下自动切 `verbose`（每个状态变化打一行）。还有 `silent` / `simple` / `test` 几种。类比：同一场演出，剧场版有灯光特效，转播版只有解说词。

## 实践案例

### 案例 1：嵌套子树（webpack-cli 风格的 build 流水线）

```ts
new Listr([
  {
    title: 'build',
    task: (_, task) => task.newListr([
      { title: 'lint',   task: () => execa('eslint', ['.']) },
      { title: 'bundle', task: () => execa('rollup', ['-c']) },
      { title: 'types',  task: () => execa('tsc', ['--emitDeclarationOnly']) },
    ], { concurrent: true }),
  },
])
```

`task.newListr` 在运行时**动态生成**子树，外层那行变成可展开的"父任务"，里面三个子任务并发跑。终端上你看到的就是一棵带缩进的树，每个节点自己一个 spinner。

### 案例 2：并发 + 容错跑完

```ts
await new Listr(
  servers.map((s) => ({
    title: `部署 ${s}`,
    task: () => deploy(s),
  })),
  { concurrent: 4, exitOnError: false },
).run()
```

`concurrent: 4` 表示同时最多跑 4 个；`exitOnError: false` 让某个部署失败时其他继续跑完，最后把失败聚合到 `tasks.err` 里。比"一个挂了全停"友好得多。

### 案例 3：实时进度文本（subprocess 输出 → 任务标题下一行）

```ts
{
  title: '下载模型权重',
  task: async (_, task) => {
    for await (const chunk of stream) {
      task.output = `${(chunk.percent * 100).toFixed(1)}%`
    }
  },
}
```

`task.output = '...'` 会在标题下面打 `> 33.5%`，下一帧 renderer 重绘时自然出现。这就是为什么你看到 `npm install` 能动态显示"resolving dependencies / fetching X / linking Y"。

## 踩过的坑

1. **task 必须返回 Promise / Observable / Stream / Listr**——返回普通值（如 `42`）不会报错，但 UI 会瞬间标 ✓ 而真实逻辑根本没等
2. **强制 `renderer: 'default'` 跑在 CI**：log-update 在非 TTY 下会变成"每帧打一遍整棵树"，5 分钟 build 能产生几万行日志，永远让它自动降级
3. **CJK / emoji 宽度坑**：内部用 `string-width` 算列宽，但有些 emoji（肤色变体）实际显示宽度和算的对不上，重绘时会出现残影或截断错位
4. **stdout / stderr 混着用会乱**：listr2 只接管 stdout，task 函数里 `console.error` 的内容会插在两次 redraw 之间，整棵树的对齐被打散

## 适用 vs 不适用场景

**适用**：

- CLI 工具的多步流水线（install / build / test / deploy）
- 需要并发执行 + 错误聚合的批量任务（一组独立子任务里挂一两个不影响其他）
- 想给用户看到"进度条 + 实时输出"的体验工具
- TTY 和 CI 都要跑、希望同一份代码自动适配两种环境

**不适用**：

- 长寿命服务（listr2 是"跑一组任务然后退出"的批处理模型，不是 daemon）
- 需要可断点恢复 / 分布式调度的工作流——用 Inngest / Temporal / Step Functions
- 纯日志输出场景——直接 `console.log` 即可，不需要 renderer
- 跨进程任务编排——listr2 只在单进程内编排，跨进程要自己加 IPC

## 历史小故事（可跳过）

- **2017**：Sam Verschueren 发 `listr` 1.0，给 ESLint / nuxt 这类工具用，spinner 树是 sindresorhus 那一脉的审美
- **2018-2019**：listr 维护停滞，issue 堆积，社区开始抱怨 TS 类型不全 + 错误处理弱
- **2020**：cenk1cenk2 fork 出 `listr2`，TypeScript 重写，加自定义 renderer / rollback / enquirer prompt
- **2022 起**：webpack-cli / nx / 多个 CI 工具迁过来，listr2 成为社区事实标准
- **现在**：月下载量 ~5M，主要用作 CLI 工具内部进度引擎而非直接面向终端用户的库

## 学到什么

1. **任务即数据 + 状态机 + 事件流**是终端 UI 库的通用三件套，CLI / TUI / 进度条几乎都长这个形状
2. **TTY 检测 + 自动降级**是给"同一份代码两个环境跑"省事的最关键一招——别让用户传 flag
3. **每帧重绘 vs diff 重绘**：listr2 选了简单的"每帧整棵树重打"，靠 log-update 的"上移 + 清屏"实现；够用、易维护
4. **fork 接管开源项目**靠的不是技术多炫，而是有人把维护那条苦活儿真的捡起来跑下去

## 延伸阅读

- 仓库：[listr2/listr2](https://github.com/listr2/listr2)（README 给的例子最直观）
- 原始 listr：[SamVerschueren/listr](https://github.com/SamVerschueren/listr)（看 fork 之前的 API 长啥样）
- log-update 源码：[sindresorhus/log-update](https://github.com/sindresorhus/log-update)（listr2 重绘的底层）
- string-width / cli-truncate：listr2 处理 CJK 和窄终端的依赖
- [[ora]] —— 单个 spinner 的极简版，listr2 像它的"树形升级版"
- [[chalk]] —— listr2 状态颜色靠它

## 关联

- [[ora]] —— 单任务版 spinner，listr2 的"原子组件"思路同源
- [[chalk]] —— 终端颜色基础库，listr2 的状态高亮直接用
- [[commander]] —— 解析参数的 CLI 框架，常和 listr2 搭配做 CLI 工具
- [[yargs]] —— 另一种 CLI 参数解析风格，与 listr2 任务编排互补
- [[webpack]] —— webpack-cli 用 listr2 画 build 流水线的进度
- [[nx]] —— monorepo 任务编排器，进度展示走的是 listr2 风格

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[boxen]] —— boxen — 给终端文本套个边框的事
- [[ink]] —— ink — 用 React 组件树写终端 CLI
- [[ora]] —— ora — 终端 spinner 用 ANSI 反复擦写同一行
