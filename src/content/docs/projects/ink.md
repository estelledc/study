---
title: ink — 用 React 组件树写终端 CLI
description: 用 React reconciler 和 Yoga 在字符网格上画 CLI 的 Node.js 库
来源: https://github.com/vadimdemedes/ink
日期: 2026-05-30
分类: 命令行工具
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/vadimdemedes/ink
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 70af033dbd2b126a16f144164685612b2c1fd554
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 7.1.1
---

## 是什么

ink 是 Vadim Demedes 维护的 Node.js 库，让你用 JSX / React 组件写终端界面。日常类比：浏览器里写 `<div>`，这里写 `<Box>`；状态变了就 diff，diff 完再画字符网格。

```jsx
import {render, Box, Text} from 'ink'
const App = () => <Box><Text color="green">hello</Text></Box>
render(<App />)
```

host 不是 DOM。固定 7.1.1 用 `react-reconciler` 把提交落到自家节点树，布局走 `yoga-layout`，输出再写成 ANSI。README 把 GitHub Copilot CLI、Cloudflare Wrangler、Gatsby、Prisma 列作下游。

## 为什么重要

不理解 ink 的默认合同，下面这些事会对不上：

- 为什么同一套 React hooks 能驱动 CLI，但默认并不是 Concurrent Root
- 为什么 CI 或管道里只在退出时看到最后一帧
- 为什么中文 / emoji 边框会错位——量宽靠最宽行，不是像素
- 为什么第二次 `render()` 同一 `stdout` 会警告：一个流只养一个 live instance

## 核心要点

可以把 7.1.1 拆成四段：

1. **`render()` 先定运行模式**：默认 `maxFps=30`、`incrementalRendering=false`、`concurrent=false`、`alternateScreen=false`、`patchConsole=true`。`concurrent: true` 才改用 `ConcurrentRoot`，Suspense / `useTransition` 才按并发语义工作。
2. **reconciler 提交到 ink 树**：host config 创建 / 更新节点后，root yoga 宽度设成 terminal columns，再 `calculateLayout(..., DIRECTION_LTR)`。
3. **字符网格上的 flex**：`<Box>` 默认 `flexDirection: 'row'`、`flexShrink: 1`。`width`/`height` 可以写百分比；`minWidth`/`maxWidth` 的百分比尚未支持。
4. **输入是离散优先事件**：`useInput` 打开 raw mode，经 `parseKeypress` 分发；`exitOnCtrlC` 为真时 Ctrl+C 不进业务 handler。状态更新走 `reconciler.discreteUpdates`。

## 实践示例

### 案例 1：声明式选择菜单

```jsx
import {useState} from 'react'
import {Box, Text, useInput} from 'ink'
const Menu = ({items}) => {
  const [cursor, setCursor] = useState(0)
  useInput((_, key) => {
    if (key.upArrow) setCursor(c => Math.max(0, c - 1))
    if (key.downArrow) setCursor(c => Math.min(items.length - 1, c + 1))
  })
  return (
    <Box flexDirection="column">
      {items.map((it, i) => (
        <Text key={it} backgroundColor={i === cursor ? 'cyan' : undefined}>
          {i === cursor ? '> ' : '  '}{it}
        </Text>
      ))}
    </Box>
  )
}
```

整个界面是 `cursor` 的纯函数。和 [[blessed]] 的 `list.select()` + `screen.render()` 不同，这里没有命令式“点亮第 i 项”。

### 案例 2：同一 stdout 只能有一个实例

```js
const a = render(<App />)
render(<Other />) // 警告并复用 a；应先 a.unmount()
```

`instances` 按 stdout 缓存。要换 `concurrent` 或 `alternateScreen`，必须先 `unmount()`。

### 案例 3：非交互环境只交最后一帧

CI（`is-in-ci`）或 `stdout.isTTY` 为假时，默认 `interactive=false`：关掉擦屏、光标和 resize，unmount 时才写出最终帧。测进度条动画不能只看管道里的中间输出。

## 踩过的坑

1. **把增量重画当成默认**：`incrementalRendering` 默认是 `false`。相同输出会被跳过，但行级增量要显式打开。
2. **默认不是 Concurrent**：`useTransition` / Suspense 要设 `concurrent: true`；测试可能还要 `act()`。
3. **双宽字符**：`measure-text` 用 `widest-line` 量最宽行。百分比宽度再叠加深嵌套 flex 时，舍入仍可能偏 1-2 列。
4. **`minWidth`/`maxWidth` 百分比无效**：源码注明 Yoga 尚未支持；写成 `'50%'` 不会按你想的夹紧。

## 适用 vs 不适用场景

**适用**：
- 多帧交互 CLI（向导、选择、对话流）
- 团队已用 React，想复用 hooks / 测试心智
- 需要 `renderToString` 或 screen reader 输出做静态验收

**不适用**：
- 一发即走的 `console.log` / [[chalk]] / [[ora]] 就够
- 要全屏 widget / 图表仪表盘——[[blessed]] 或 blessed-contrib 更对口
- 不能升到 Node 22 或 React 19.2
- 需要默认并发渲染或默认行级增量——两者都是 opt-in

## 固定版本边界

- 本文绑定 `vadimdemedes/ink@70af033d...`，package / tag / npm `gitHead` 均为 `7.1.1`。
- ESM，`engines.node` 为 `>=22`；peer 为 `react >=19.2.0`。
- 本文只做源码/测试静态审查，没有安装依赖、跑上游测试或测 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **React 不绑定浏览器**：换一份 host config，就能把同一套 diff 接到字符网格。
2. **默认值比营销句更重要**：并发、增量重画、交替屏都不是默认开。
3. **一个 stdout 一个 renderer**：复用流之前必须拆掉旧实例。
4. **声明式要付账**：reconciler、Yoga、节流和 raw-mode 输入都是真实成本。

## 应用型自测

1. `render(<App />, {concurrent: false})` 时，`useTransition` 会按 Concurrent Root 工作吗？
2. 同一 `stdout` 上第二次 `render()` 且未 `unmount()`，会新建第二个 renderer 吗？
3. `<Box minWidth="50%" />` 会按父宽一半夹紧吗？

检查点：

1. 不会。默认 `LegacyRoot`；要并发必须 `concurrent: true`。
2. 不会。复用旧实例并写 stderr 警告。
3. 不会。`minWidth`/`maxWidth` 百分比尚未支持。

## 延伸阅读

- 仓库：[github.com/vadimdemedes/ink](https://github.com/vadimdemedes/ink)
- 固定源码：本文绑定提交 `70af033dbd2b126a16f144164685612b2c1fd554`
- yoga：[facebook/yoga](https://github.com/facebook/yoga)
- 测试库：[vadimdemedes/ink-testing-library](https://github.com/vadimdemedes/ink-testing-library)

## 关联

- [[blessed]] —— 命令式 widget 树与 terminfo Program，ink 的对照组
- [[react]] —— ink 复用 reconciler / hooks，host 换成字符节点
- [[chalk]] —— 颜色层；ink 在它之上做声明式壳
- [[bubbletea]] —— Go 侧 Elm 架构 TUI，对照“状态 → 视图”
- [[textual]] —— Python + CSS 的终端界面
- [[ratatui]] —— Rust 立即模式 TUI，不管事件循环

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[boxen]] —— boxen — 给终端文本套个边框的事
- [[chalk]] —— chalk — 让 console.log 输出彩色字符串的 Node 库
- [[enquirer]] —— enquirer — 让 CLI 工具会问问题的轻量库
- [[ora]] —— ora — 终端 spinner 用 ANSI 反复擦写同一行
- [[ratatui]] —— ratatui — Rust 的立即模式 TUI 库，tui-rs 弃坑后社区接住
- [[textual]] —— Textual — 用 CSS 写终端界面的 Python 框架
- [[yargs]] —— yargs — Node.js 命令行参数解析的事实标准
