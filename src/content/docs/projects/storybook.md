---
title: Storybook — 给 UI 组件的独立工作台
来源: https://github.com/storybookjs/storybook
日期: 2026-05-30
分类: 前端工具
难度: 中级
---

## 是什么

Storybook 是一个**让 UI 组件脱离整个 App 单独运行的工作台**。日常类比：装修样板间——你不会让客户从大门口走完两房一厅才看一把椅子，你直接搭一个白底房间，把椅子摆中间，灯光打好让人 360 度转着看。

你写一个文件 `Button.stories.ts`：

```ts
export default { component: Button }

export const Primary = { args: { label: 'Click', primary: true } }
export const Disabled = { args: { label: 'Click', disabled: true } }
```

跑 `npm run storybook`，浏览器开一个左侧菜单 + 中间预览窗：每个 export 是菜单一项，点哪一项中间就渲染哪个状态。**不用启动整个 App、不用造测试数据、不用造路由**——组件被孤立到一个 iframe 里。

这种"一份文件、孤立预览、顺带文档+测试"的模式，让它成了过去 8 年前端 design system 的事实标准。

## 为什么重要

不理解 Storybook 的"工作台"定位，下面这些事都解释不通：

- 为什么 Material UI / Chakra / shadcn / Ant Design 这些组件库官网**长得几乎一样**——都用 Storybook 渲染
- 为什么 Storybook 不是 test runner、不是 dev server、不是 docs site，但**这三件事它都能做一点**
- 为什么 Manager UI 跑 React 18，Preview 里能跑用户的 React 16/17/19——同一个浏览器标签页里**有两个不同版本的 React**
- 为什么 Storybook 9 (2025) 把 Vitest 做成一等公民测试体验——一份 `play()` 函数既渲染又测试，不再两套断言

## 核心要点

Storybook 的设计可以拆成 **三层物理隔离**：

1. **Manager UI**：顶层 React app（左侧菜单/工具栏/Addon 面板）。它跑 Storybook 自己的 React 18，**和你的项目无关**。换句话说，Manager 自己是一个独立 SPA。
2. **Preview iframe**：浏览器里嵌一个 `<iframe>`，里面跑**你项目的 React** + 你的组件。Manager 看不见 Preview 的 DOM，反之亦然——CSS reset、全局 polyfill、错误边界都互不污染。
3. **postMessage Channel**：Manager 改 props（如 controls panel 拨开关）→ 通过 `window.postMessage` 把消息丢给 Preview iframe；Preview 报告 play 测试结果 → 也走这条通道回 Manager。消息体走 `telejson`（跨 iframe 的序列化库）双向序列化，能传函数引用和循环结构。

加起来叫 "**双 window + 一根通道**"。这种隔离让 Storybook 可以同时支持任意框架（React、Vue、Svelte、Angular）和任意版本，代价是跨 frame 调试困难（要切 DevTools frame context）。

## 实践案例

### 案例 1：CSF 3.0 写 story

```ts
// Button.stories.ts
import type { Meta, StoryObj } from '@storybook/react'
import { Button } from './Button'

const meta: Meta<typeof Button> = { component: Button }
export default meta

export const Primary: StoryObj<typeof Button> = {
  args: { label: 'Click me', primary: true },
}

export const Disabled: StoryObj<typeof Button> = {
  args: { label: 'No', disabled: true },
}
```

`default export` 是 Meta（这个文件描述哪个组件），`named export` 是一个个 Story（每个 export 是一种状态）。**没有自定义 DSL**——就是 ES Module，TypeScript / lint / IDE 全部"免费"工作。两个 export 在 Storybook 左侧菜单里就是两个子项："Primary" 和 "Disabled"。

### 案例 2：play() 让 story 同时是测试

```ts
import { userEvent, expect } from '@storybook/test'

export const Clicked: StoryObj<typeof Button> = {
  args: { label: 'Click' },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole('button'))
    await expect(canvas.getByText('Clicked!')).toBeInTheDocument()
  },
}
```

打开 Storybook，进 Clicked 这个 story，**自动模拟点击 → 断言 DOM**。同一段 `play()` 在 Vitest 里也能跑（v9 起通过 `@storybook/addon-vitest` 集成）——浏览器里调试、CI 里跑测试，**只写一次**。

### 案例 3：addon = preview 端 + manager 端

写一个 a11y addon：
- **preview 端**：注册 decorator，每次渲染完调 `axe-core` 检查 ARIA 属性
- **manager 端**：注册一个 panel（右下 Tab），把 axe 的违规列表渲染出来
- **通道**：preview 检完发 `event:'a11y-result'` 给 channel；manager 监听这个事件刷新 panel

整个 200+ 官方/社区 addon 都是这个模型——controls / actions / docs / interactions / vitest / chromatic 同套路。理解了 "preview 注册 decorator + manager 注册 panel + 用 channel 配对" 这一句话，**就懂了 Storybook 整个扩展系统**。

## 踩过的坑

1. **冷启动慢**：Manager 和 Preview **两套 build pipeline**（webpack 或 vite 各跑一次）。10s+ 启动很常见，比 Vite playground 的 2s 慢 5 倍。开发环境按需懒加载缓解。

2. **iframe 调试不友好**：你在 Manager 控制台 `console.log` 看不到 Preview 里组件的日志，要先在 DevTools 顶部切 frame context 到 `iframe.html`。新人常以为代码没跑。

3. **大 args 卡顿**：Controls panel 的滑块每动一下都跨 channel 序列化（用 `telejson`）。如果 args 是个 100KB 的对象，每次拨都掉帧。**args 尽量保持轻量**。

4. **CSF 必须 static export**：你不能在循环里 `for (let i...) export const ...`——CSF 是 ES Module，export 必须能被静态解析。要批量生成 story？只能写脚本生成文件。

5. **Monorepo 配置复杂**：多个 framework + 多个 builder + 多个 preset 组合时，Storybook 的 `main.ts` 经常出 `Cannot resolve framework` 类错误。社区共识：**先单包跑通，再做 monorepo**。

6. **addon 文档分散**：官方 addon、社区 addon、版本兼容矩阵分布在三处（官网 / GitHub / npm），新人挑包要花 30 分钟做版本核对。建议用 `npx storybook upgrade` 让脚本算依赖。

## 适用 vs 不适用场景

**适用**：
- Design system 团队（5+ 人、组件 30+ 个）——addon 生态值
- 公司级组件库要做文档站（自动生成 props 表 + 代码示例）
- 已经用 Vitest 做单测，想顺手加 visual + interaction 测试
- 多角色协作 review UI 状态（PM 看预览、设计师审 a11y、QA 跑 play）

**不适用**：
- 个人 side project、组件少于 20 个 → 用 [Ladle](https://github.com/tajo/ladle)，Vite 原生、单 window、启动 2s
- Vite + Vue/Svelte 单一栈、不要文档 → 用 Histoire
- RSC（React Server Components）为主 → "在 iframe 里渲染单个 client 组件" 的前提还没收敛
- 想"组件即可发布的包" → 用 Bit（Storybook 不做发布管线）
- 已用 Storybook 又想做视觉回归 → 加 Chromatic（互补，不是替换）

## 历史小故事（可跳过）

- **2016 年**：Arunoda Susiripala 在 Kadira 公司给 Meteor 项目造了 React Storybook，只能渲染 React 组件、没 Manager UI、没 addon——就是个 "iframe 里挂组件" 的工具。
- **2017 年**：项目改名 Storybook（去掉 React 前缀），扩到 Vue/Angular。这一步让它从"React 工具"变成"前端通用工具"。
- **约 2019–2020**：CSF 2（随 Storybook 5.2/6）把 story 收成可移植的 ES Module 格式，Ladle / Histoire / Vitest 都能读。**CSF 实质成了行业标准**。
- **2021 / 2023**：CSF 3 实验版约 2021 推出（`args` 对象代替 `.bind()`，story 从"函数"变成"数据"）；**Storybook 7（2023）起 CSF 3 成为默认**。
- **2025-06**：Storybook 9 把 Vitest 测试体验做成一等公民（`@storybook/addon-vitest`）——`play()` 既能在浏览器跑、也能在测试 runner 里跑。
- **2026-05**：v10.4.x 发布，Vitest 集成稳定 + a11y addon 默认开启。

10 年里，Storybook 从"React 单一工具"变成"任意 framework 工作台"，再变成"组件级 dev + docs + test 一体台"——靠的是双 window 隔离 + CSF 标准化两个稳定支柱。中间引入过的功能（docs site、interactions、a11y、Vitest）都是新长上去的枝叶，**主干 8 年没改**。

## 学到什么

1. **隔离是设计第一原则**——Manager / Preview 物理隔离让 Storybook 能跨框架、跨版本，代价是冷启动慢 + 调试切 frame。这种"先付代价换通用性"的取舍是 framework 设计的常见模式
2. **不发明 DSL**——CSF = ESM，让 TypeScript / lint / IDE 自动工作，被 Ladle / Vitest 复用，最后变成行业标准。**和宿主语法对齐 > 自创 DSL** 是工具设计的胜利
3. **一份文件多个用途**——同一份 stories 文件被渲染、文档化、测试。这种"复用 fixture" 的能力是 Storybook 最大的工程杠杆
4. **addon 双面通信** = framework 心脏物——preview decorator + manager panel + channel 通信，几百个 addon 全套用同一模式
5. **dev-time framework 是一个独立类目**——它不是 library（你 import 它的函数），不是 service（你连它的端口），它是个跑在你机器上、控制开发环境的 framework。理解这一类目能帮你看懂 Vite / Webpack / Storybook / Nx 都属于同一种东西

## 延伸阅读

- 官方文档：[storybook.js.org](https://storybook.js.org/docs)（"Why Storybook" 是入口好文章）
- v9 变更：[Storybook 9 blog](https://storybook.js.org/blog/storybook-9/)（Vitest 集成的来龙去脉）
- 替代方案：[Ladle](https://github.com/tajo/ladle)（Vite 原生轻量版）
- CSF 标准：[CSF 3.0 docs](https://storybook.js.org/docs/api/csf)
- 仓库 README：[storybookjs/storybook](https://github.com/storybookjs/storybook)（看 monorepo 包结构感受 framework 的规模）

## 关联

- [[vitest]] —— Storybook 9 把 Vitest 做成一等公民测试体验（addon-vitest）跑 play
- [[playwright]] —— 视觉/交互回归备选方案，与 Storybook play 互补
- [[shadcn-ui]] —— 用 Storybook 做组件文档与示例的代表项目
- [[radix-ui]] —— 同样用 Storybook 展示无样式 headless 组件状态

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[apexcharts]] —— ApexCharts — 自带响应式与注解的 SVG 图表库
- [[echarts]] —— Apache ECharts — 给一个 JSON 就能画图的可视化库
- [[fabric-js]] —— Fabric.js — 给 Canvas 加一层"对象模型"，让画布图形可以拖
- [[ink]] —— ink — 用 React 组件树写终端 CLI
- [[jest]] —— Jest — 一个包就能跑 JS 测试的全家桶
- [[konva]] —— Konva — 给 HTML5 Canvas 装一棵会响应的节点树
- [[msw]] —— MSW — 让 mock 不改业务代码，在网络层透明拦截
- [[radix-ui]] —— Radix UI — unstyled accessible 的 React 组件原语库
- [[testing-library]] —— Testing Library — 像用户一样测前端，重构不再挂测试
