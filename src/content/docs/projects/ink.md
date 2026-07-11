---
title: ink — 用 React 组件树写终端 CLI
来源: 'https://github.com/vadimdemedes/ink'
日期: 2026-05-30
分类: 命令行工具
难度: 中级
---

## 是什么

ink 是 **Vadim Demedes 2017 年起维护的 Node.js 库**，让你用 JSX / React 组件写终端 CLI 界面。日常类比：以前在浏览器里写 `<div>`，现在在黑屏 terminal 里写 `<Box>`，背后由同一套"状态变了就 diff、diff 完更新视图"的 React 心智驱动。

你写：

```jsx
import {render, Box, Text} from 'ink';
const App = () => <Box><Text color="green">hello</Text></Box>;
render(<App />);
```

terminal 里就出现绿色 hello。这不是一个 polyfill：ink 自己写了一份 **React reconciler**，host 不是 DOM 而是它自己的 ElementNode 树，布局靠 **yoga**（Facebook 给 React Native 写的 C++ flexbox 引擎），最后输出靠 **ANSI escape codes** 写进 stdout。Gatsby CLI、GitHub Copilot CLI、Cloudflare Wrangler、Prisma CLI 都用它做交互界面。

## 为什么重要

不理解 ink，下面这些事都没法解释：

- 为什么 GitHub Copilot CLI 在 terminal 里能像网页一样有"上下箭头选项 + 实时高亮"，而不是命令式 `console.log` 一行一行刷
- 为什么 React 不只是浏览器框架——同一套心智能搬到 terminal、PDF、Three.js、Figma 插件
- 为什么 ink 大版本常跟 React / Node 升级绑在一起——它依赖 react-reconciler，主线节奏一错位就要等
- 为什么写中文 / emoji 的 ink 应用边框总错位——yoga 默认按一格量宽，双宽字符要额外处理

## 核心要点

ink 的工作可以拆成 **三段流水线**：

1. **reconciler 把 JSX 翻成自家节点树**：用 react-reconciler 写一份 host config（createInstance / appendChild / commitUpdate 等），React 跑 diff 后把变化提交到 ink 内部 ElementNode 树。类比：浏览器 React 提交到 DOM，ink 提交到自家 in-memory 树。

2. **yoga 在字符网格上算坐标**：每次提交跑一次 `YGNodeCalculateLayout`，给每个节点算出 `(x, y, width, height)`。单位不是像素是字符列。类比：浏览器 flexbox 是浏览器送你的，terminal 啥都不送，ink 主动调 C++ 引擎补上。

3. **log-update 行级 diff 输出 ANSI**：把布局结果序列化成带颜色 / 光标位置的字符串，跟上一帧比对，**只重画变化的行**。类比：React 不重渲整个 DOM，ink 也不重画整个 terminal。

三段串起来 = 把"DOM 渲染到浏览器"那套心智搬到"字符网格渲染到 stdout"。

关键认知翻转（零基础最容易卡住的三点）：

- **terminal 没有 DOM**：stdout 只是字节流，要在屏幕第 5 行第 12 列写字得手动写 `\x1b[5;12H` 把光标挪过去再 `process.stdout.write('hello')`。
- **terminal 没有 layout 引擎**：浏览器 flexbox 是浏览器送的，terminal 啥都不送，box A 宽 10、box B 宽 20 要左右排得自己算坐标。
- **terminal 是字符网格不是像素**：一格就是一格没有半格，中文 / emoji 占两格——这是 ink 双宽字符 bug 的根源。

## 实践案例

### 案例 1：声明式选择菜单

```jsx
import {useState} from 'react';
import {Box, Text, useInput} from 'ink';
const Menu = ({items}) => {
  const [cursor, setCursor] = useState(0);
  useInput((_, key) => {
    if (key.upArrow) setCursor(c => Math.max(0, c - 1));
    if (key.downArrow) setCursor(c => Math.min(items.length - 1, c + 1));
  });
  return <Box flexDirection="column">{items.map((it, i) =>
    <Text key={it} backgroundColor={i === cursor ? 'cyan' : undefined}>{i === cursor ? '> ' : '  '}{it}</Text>
  )}</Box>;
};
```

整个 UI 是 `cursor` 状态的纯函数。没有命令式 "highlightItem(i)"，对比 blessed 风格 `list.on('keypress', ...)` 手维护焦点要清爽很多。

### 案例 2：用 ink-testing-library 做 snapshot

```jsx
import {render} from 'ink-testing-library';
test('counter increments', () => {
  const {lastFrame, stdin} = render(<Counter />);
  expect(lastFrame()).toContain('Value: 0');
  stdin.write('\x1B[A'); // 上箭头 ANSI 序列
  expect(lastFrame()).toContain('Value: 1');
});
```

`lastFrame()` 拿到当前帧的字符串（含 ANSI），心智和 React Testing Library 一致：render → 触发输入 → 断言输出帧。这是 ink 比 blessed 显著好的工程化能力。

### 案例 3：与 blessed 的范式对比

| 维度 | ink | blessed |
|---|---|---|
| 范式 | 声明式（React） | 命令式（OOP，jQuery 风） |
| 布局 | yoga flexbox | 手写百分比 + 绝对定位 |
| 状态 | hooks / context | 实例属性 + emit/on |
| 学习成本 | 会 React 即可 ~30 分钟 | 自创 API ~2 天 |
| 图表 | 弱（ink-chart 不成熟） | 强（blessed-contrib 折线/仪表盘） |
| Bundle | ~120KB（含 React+yoga） | ~50KB |

类比：blessed 是 jQuery 时代的 terminal UI，ink 是 React 时代的 terminal UI。

## 踩过的坑

1. **双宽字符错位**：中文 / emoji 占两个字符列，yoga 默认按一格算。ink 用 string-width 库在 measure-text 里兜底，但百分比宽度 + 深嵌套 flex 时舍入误差累计 2-3 列。
2. **被 React 主版本绑架**：ink v3 跟 React 16/17；v4（2023）起要求 React 18；v5 主要抬高 Node 版本。react-reconciler 是独立 npm 包，版本号经常对不上 React 主线，每次 React 加新 hook（useTransition / useDeferredValue）都要评估 stub 还是真做。
3. **bundle 重不适合一发即走**：hello world 级 ink ~120KB，chalk + 手撸 ~5KB；写 `echo` 替代品别上 ink，多帧交互再上。
4. **图表生态空**：折线图 / 仪表盘 / 地图至今没 ink 等价物；想画 dashboard 仍得回 blessed-contrib，ink 不是 terminal UI 银弹。

## 适用 vs 不适用场景

**适用**：
- 交互式 CLI（向导式 prompt / 多步骤选择 / 实时编辑器，例如 GitHub Copilot CLI 的对话流）
- 多帧更新的进度面板（Wrangler 部署进度 / Prisma 迁移状态）
- 团队已重度使用 React，CLI 想复用心智模型

**不适用**：
- 一发即走的命令式输出（用 chalk + ora 即可，别上整套 React）
- 终端仪表盘 / 全屏 TUI / 重图表（用 blessed-contrib，ink 在这块弱）
- 多任务并行进度聚合（用 listr2 更简单，比手写 ink 省事）
- 不打算让 CLI 跟 React 升级节奏的团队

## 历史小故事（可跳过）

- **2017 年**：Vadim Demedes 在 sindresorhus 开源系生态里发起 ink，最初动机是 Gatsby CLI 想要更优雅的进度展示。
- **2018 年**：Facebook 把 yoga 从 React Native 抽出来做独立 C++ 库 + JS binding（yoga-layout），ink 立刻挂上去复用 flexbox。
- **2019 年**：ink v2 引入 hooks（useState / useInput / useApp）跟上 React 16.8。
- **2022 年前后**：官方做出 ink-testing-library，让 CLI 有了 snapshot 测试。
- **2023 年**：ink v4 发布，要求 React 18 + 纯 ESM；react-reconciler 与 React 主线节奏错位仍是升级痛点。
- **2024 年**：ink v5 发布，主要要求 Node.js 18+（并非「再适配一次 React 18」）。

## 学到什么

1. **React 不绑定浏览器**：reconciler 模式让任何「树状 + diff」场景都能复用 React 状态管理 / hooks 心智。
2. **声明式不是免费午餐**：要付出 reconciler 维护成本 + 布局引擎集成成本 + 增量渲染调优成本，bundle size 也是真实代价。
3. **生态共存而非替代**：成熟领域出新框架时永远是「优雅子集 + 漏网场景」，ink 没杀死 blessed，blessed 也没法吃下 ink 的人群。
4. **元能力可迁移**：学完 ink 再看 react-pdf / react-three-fiber / react-figma 心智一致，"写一个 host config" 是值得专门内化的能力。

## 延伸阅读

- 官方仓库：[vadimdemedes/ink](https://github.com/vadimdemedes/ink)（README + examples 是最佳起点）
- 视频：[Vadim Demedes — Building CLIs with React](https://www.youtube.com/results?search_query=ink+react+cli+vadim)（作者本人讲设计思路）
- yoga 引擎：[facebook/yoga](https://github.com/facebook/yoga)（C++ flexbox，看 measure function 这个 callback）
- 对照工具：[chalk-js/chalk](https://github.com/chalk/chalk) 与 [yaronn/blessed-contrib](https://github.com/yaronn/blessed-contrib)（一个简单一个全屏强）
- 测试库：[vadimdemedes/ink-testing-library](https://github.com/vadimdemedes/ink-testing-library)

## 关联

- [[react]] —— ink 复用 React 全套心智，区别只在 host 不是 DOM 而是 ElementNode 树；ink 经 react-reconciler 挂上同一套 diff 调度
- [[chalk]] —— ink 内部依赖它做颜色处理，可以理解为 ink 是 chalk 之上的声明式壳
- [[listr2]] —— 多任务并行进度的轻量替代，不交互的场景比 ink 简单
- [[storybook]] —— 同样是组件化心智的工具，宿主在浏览器侧而非 terminal
- [[dnd-kit]] —— 同期 React 生态里的另一个"用组件抽象低层能力"案例
- [[fastify]] —— 同样体现"插件 / 组合 = 声明式范式"的 Node.js 项目

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[boxen]] —— boxen — 给终端文本套个边框的事
- [[chalk]] —— chalk — 让 console.log 输出彩色字符串的 Node 库
- [[cosmwasm]] —— CosmWasm — Cosmos 上的 wasm 智能合约
- [[enquirer]] —— enquirer — 让 CLI 工具会问问题的轻量库
- [[jimp]] —— jimp — 哪都能跑的纯 JS 图像处理库
- [[koa]] —— Koa — async/await + ctx 对象 + 洋葱模型 的极简 Node.js web 框架
- [[ora]] —— ora — 终端 spinner 用 ANSI 反复擦写同一行
- [[ratatui]] —— ratatui — Rust 的立即模式 TUI 库，tui-rs 弃坑后社区接住
- [[textual]] —— Textual — 用 CSS 写终端界面的 Python 框架
- [[yargs]] —— yargs — Node.js 命令行参数解析的事实标准
