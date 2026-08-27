---
title: Storybook — 给 UI 组件的独立工作台
来源: https://github.com/storybookjs/storybook
日期: 2026-05-30
分类: 前端工具
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/storybookjs/storybook
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: a2db7526e1538a48bfa0529a881822e8074b2009
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 10.5.10
---

## 是什么

Storybook 是一个**把单个 UI 组件从完整应用里拆出来开发和验收的工作台**。日常类比：装修样板间——不必从大门走完整套房才看一把椅子，而是单独搭一间白底房间，把椅子摆中间。

你写一份 CSF 文件：

```ts
const meta = { component: Button, title: 'Button' }
export default meta

export const Primary = { args: { label: 'Click', primary: true } }
export const Disabled = { args: { label: 'Click', disabled: true } }
```

跑 Storybook 后，浏览器里是 Manager（侧栏/工具条）+ Preview（`iframe.html` 里的组件）。每个 named export 是侧栏一项。固定 10.5.10 不要求自造 DSL：`processCSFFile` 读的就是 ES Module 的 default + named export。

## 为什么重要

不理解固定版本的隔离合同，下面这些事都解释不通：

- 为什么 Controls 改 args 不必和组件 DOM 处在同一个 window
- 为什么同一份 `play` 既能在 Preview 里自动跑，也能被 `@storybook/addon-vitest` 收成 Vitest 用例
- 为什么 `play` 里用了 `mount` 却没从参数解构它，会直接抛错
- 为什么 `storybook/test` 的 `canvas` 其实是 [[testing-library]] 的 `within(canvasElement)`

## 核心要点

固定 10.5.10 可以拆成四段：

1. **双 window**：Manager 在顶层窗口跑自己的 UI；Preview 默认挂在 `iframe.html`。`Preview.tsx` 的 `baseUrl` 就是这个地址。组件 CSS、运行时和用户框架都停在 iframe 里。

2. **通道**：`createBrowserChannel` 默认挂 `PostMessageTransport`；开发模式再加 `WebsocketTransport`。消息用 `telejson` 序列化，信封是 `{ key: 'storybook-channel', event, refId }`，默认 `maxDepth: 25`。Manager 按 `iframe[data-is-storybook][data-is-loaded]` 找目标窗，本地预览框 id 是 `#storybook-preview-iframe`。

3. **CSF → 可渲染 story**：`processCSFFile` 走两条路——CSF3 的 default meta + named export，或 CSF factory（`definePreview` / `isStory`）。`isExportStory` 会丢掉 `__esModule`，并执行 `includeStories` / `excludeStories`。`prepareStory` 叠 loaders、beforeEach、decorators、`play` 和 `mount`。

4. **play 相位**：`StoryRender` 在 `autoplay && forceRemount` 时跑 `playFunction`。默认先 `mount()`（`renderToCanvas`），再进入 `playing`。若 `play.toString()` 显示它解构了 `mount`，渲染会推迟到 play 自己调用 `mount`；未解构却再调 `context.mount`，抛 `MountMustBeDestructuredError`。

## 实践案例

### 案例 1：CSF3 一份文件两种状态

```ts
const meta = { component: Button, title: 'Button' }
export default meta

export const Primary = { args: { label: 'Click me', primary: true } }
export const Disabled = { args: { label: 'No', disabled: true } }
```

`default` 是组件级 meta，named export 是 story。没有自定义语法，TypeScript / lint 按普通模块工作。侧栏标题来自 export 名（`storyNameFromExport` 会转成可读形式）。

### 案例 2：play 用 canvas 查询，而不是 screen

```ts
import { expect } from 'storybook/test'

export const Clicked = {
  args: { label: 'Click' },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button'))
    await expect(canvas.getByText('Clicked!')).toBeInTheDocument()
  },
}
```

`storybook/test` 的 `enhanceContext` loader 把 `canvas` 设成 `within(canvasElement)`，并在存在 `navigator.clipboard` 时执行 `userEvent.setup()`。docs 模式里用全局 `screen` 会跨多个 story 找节点，源码对此有显式警告。

### 案例 3：play 里自挂 mount 必须解构

```ts
export const DeferredMount = {
  play: async ({ mount, canvas }) => {
    await mount()
    await canvas.findByRole('button')
  },
}
```

`mountDestructured` 用函数源码判断参数里有没有 `mount`。解构了才会把 `playing` 相位推迟到 `mount()` 之后；没解构时，运行时会把 `context.mount` 换成抛错函数。

## 踩过的坑

1. **把通道想成只有 postMessage**：开发模式还会挂 websocket。只拦 iframe message 时，热更新和部分服务同步仍可能走另一条运输。

2. **play 里调用 `mount` 却写成 `play: async (ctx) => ctx.mount()`**：源码看的是解构列表，不是“函数体里有没有调用”。这样会触发 `MountMustBeDestructuredError`。

3. **在 docs 页用 `screen`**：同一页会挂多个 canvas。`storybook/test` 会警告改用 story context 的 `canvas`。

4. **以为 CSF factory 取代了 CSF3**：`processCSFFile` 先找 factory story，找不到再走 default export。两种写法并存。

5. **把 addon-vitest 当成核心包**：Vitest 集成在 `@storybook/addon-vitest`，peer 是 `vitest` / `@vitest/runner` `^3 || ^4`。核心包只提供 CSF、通道和 `storybook/test`。

## 适用 vs 不适用场景

**适用**：

- 需要把组件状态从整站路由/数据里拆出来给多人看
- 已有或准备写 `play`，并希望同一份故事进 Vitest（`@storybook/addon-vitest`）
- 满足文档声明的 Node.js 20.19+ 或 22.12+（`require(esm)`）

**不适用**：

- 只要一个 Vite playground、不要 Manager / iframe / 通道——隔离成本不值得
- 以 RSC 服务端树为主、客户端 canvas 还不稳的项目——Preview 合同仍以客户端挂载为前提
- 把视觉回归托管服务当成开源核心——Chromatic 是互补产品，本仓库没有独立页面，本文未读它的源码

## 固定版本边界

- 本文绑定 `storybookjs/storybook@a2db7526...`，tag 与 npm 包均为 `10.5.10`。
- 源码树里 `code/core/package.json` 的 `gitHead` 不是合法 SHA，以 tag / npm `gitHead` 为准。
- 核心运行时依赖 `@testing-library/dom ^10.4.1` 与 `@testing-library/user-event ^14.6.1`；`storybook/test` 再导出它们。
- `MIGRATION.md` 要求 Node.js 20.19+ 或 22.12+。本文未安装依赖、未跑上游测试或视觉回归，状态保持 `UNVERIFIED`。

## 学到什么

1. **物理隔离换来框架无关**——Manager 和 Preview 不共享 DOM，组件才能带自己的运行时；代价是跨 frame 调试和消息序列化
2. **一份 ESM 多种消费**——同一 named export 被侧栏、docs、play 和 Vitest plugin 复用
3. **相位必须写进 API**——`mount` 能不能推迟渲染，取决于 play 的参数解构，而不是注释或文档习惯
4. **测试查询应限定画布**——`canvas = within(canvasElement)` 比全局 `screen` 更符合 iframe / docs 多实例现实

## 应用型自测

1. 开发模式下，Manager 和 Preview 之间是否只有 `postMessage` 一条运输？
2. `play: async (ctx) => { await ctx.mount() }` 在固定 10.5.10 会怎样？
3. `storybook/test` 的 `canvas` 是什么对象？

检查点：

1. 不是。`createBrowserChannel` 在 `CONFIG_TYPE === 'DEVELOPMENT'` 时还会加 `WebsocketTransport`。
2. 会抛 `MountMustBeDestructuredError`。`mountDestructured` 只认参数解构。
3. `within(context.canvasElement)`，由 `enhanceContext` loader 写入。

## 延伸阅读

- 官方文档：[storybook.js.org](https://storybook.js.org/docs)
- 固定源码：[storybookjs/storybook](https://github.com/storybookjs/storybook) —— 本文绑定提交 `a2db7526e1538a48bfa0529a881822e8074b2009`
- [[testing-library]] —— 核心 `storybook/test` 直接包装的查询层
- CSF 与 Vitest addon 说明见官方 Writing tests

## 关联

- [[testing-library]] —— `canvas` / `within` / `getByRole` 的实现来源
- [[vitest]] —— `@storybook/addon-vitest` 的 runner peer，本页未绑定其源码
- [[playwright]] —— addon-vitest 可选的 `@vitest/browser-playwright` 浏览器后端
- [[shadcn-ui]] —— 常用 Storybook 展示组件状态的设计系统代表
- [[radix-ui]] —— 同样用 stories 展示 headless 状态

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
