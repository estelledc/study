---
title: Ladle — 用同一棵 React 树跑 CSF 风格组件工坊
description: React 组件工坊：Babel 静态发现函数故事，默认与工坊 UI 共用一棵 React 树。
来源: https://github.com/tajo/ladle
日期: 2026-08-27
分类: 测试
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/tajo/ladle
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 780c19e5756db21674db1bdf7ff995d858f4e3e1
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 5.1.1
---

## 是什么

Ladle 是一个只服务 React 的组件工坊。日常类比：不是再搭一套“经理室 + 样板间”双窗口，而是把菜单、控件和组件放进**同一棵 React 树**；只有需要固定宽度或显式 `iframed` 时，才把同一实例 portal 进 iframe。

你写 `src/Button.stories.tsx`：

```tsx
export default { title: "Form/Button" };

export const Primary = (props: { label: string }) => (
  <button>{props.label}</button>
);
Primary.args = { label: "Save" };
```

`npx ladle serve` 默认扫 `src/**/*.stories.{js,jsx,ts,tsx,mdx}`。Babel AST 读出 named export，生成 `form-button--primary`，再通过 `virtual:generated-list` 做 `React.lazy` 加载。固定包名是 `@ladle/react@5.1.1`，不是 npm 上那个无关的 `ladle@0.0.0`。

## 为什么重要

不理解 Ladle 这种“单窗 + 静态发现”的合同，就解释不了：

- 为什么它能读 CSF **风格**文件，却不能把 CSF 3 的 `StoryObj` 当一等故事
- 为什么改 `export const X = Template.bind({})` 会整页 invalidate，而普通函数故事只 HMR
- 为什么 Storybook 那套 Manager/Preview 双 React 版本隔离，在这里默认不存在
- 为什么 a11y / MSW 写在依赖里，却不能假定开箱即用

## 核心要点

固定 `5.1.1` 的主链可以拆成四步：

1. **配置合并**：`.ladle/config.mjs` 用 lodash `merge` 叠到默认值；自定义 `addons.width.options` 会先清空默认档位。Node `>=20`，Vite `^6.0.5`，React peer `>=18`。

2. **静态发现**：`getEntryData` 同步读文件、Babel traverse。named export 只能是 variable / class / function 或 export specifier；名字含 `__` 直接抛错。default export 的 `title` 变成 namespace。

3. **虚拟清单**：每个故事 `lazy(() => import(file).then(m => ({ default: composeEnhancers(m, name) })))`。story 级 decorator 先入数组，default decorator 后入，最后一项包在最外。

4. **同一窗口渲染**：`App` 和 `Story` 共用 context；URL query 保存 theme / mode / story / controls。iframe 只在 `width > 0` 或 `meta.iframed` 时出现，并且 `ReactDOM.createPortal` 进 iframe document。

CLI 是 `serve`/`dev`、`build`、`preview`。serve 把 Vite 挂在 Koa `middlewareMode`，端口从 `61000` 起找空位。

## 实践示例

### 案例 1：用函数故事 + args，而不是 StoryObj

```tsx
import type { StoryDefault, Story } from "@ladle/react";
import { Button } from "./Button";

export default {
  title: "Form/Button",
  args: { disabled: false },
} satisfies StoryDefault<{ label: string; disabled: boolean }>;

export const Primary: Story<{ label: string; disabled: boolean }> = (props) => (
  <Button {...props} />
);
Primary.args = { label: "Save" };
```

`Story` 接口继承 `React.FC`。`ArgsProvider` 最后走 `React.createElement(component, props)`；传一个 CSF 3 对象进去不会当组件用。

### 案例 2：两个 decorator 谁包谁

```tsx
export default {
  decorators: [(Comp) => <section data-meta><Comp /></section>],
};
export const WithPad = () => <button>ok</button>;
WithPad.decorators = [(Comp) => <div data-story><Comp /></div>];
```

`composeEnhancers` 得到 `[storyDecorator, defaultDecorator]`，从末项往回绑。结果是 meta decorator 在外、story decorator 在内。

### 案例 3：程序化起 serve，而不是只靠 CLI

```js
import serve from "@ladle/react/serve";
await serve({ port: 61000, stories: "src/**/*.stories.tsx" });
```

包导出 `serve` / `preview` / `build` / `meta` / `msw-node`。这只说明入口在；本轮未实际监听端口。

## 踩过的坑

1. **把 npm `ladle` 当成这个项目**：`ladle@0.0.0` 的 repository 是别人的空包；可安装对象是 `@ladle/react`。
2. **把 CSF 3 `StoryObj` 当官方格式**：类型与渲染路径都要求函数组件。
3. **以为默认就是 iframe 隔离**：同树渲染；iframe 是宽度/`iframed` 开关。
4. **假定 a11y、MSW 已打开**：`addons.a11y.enabled` 与 `addons.msw.enabled` 默认 `false`。
5. **在 export 名里写 `__`**：解析阶段保留给内部编码，会抛错。

## 适用 vs 不适用场景

**适用**：

- React 18/19 项目，故事就是带 `args` 的函数
- 希望工坊和业务组件共用一个 React，调试不用切 frame
- 需要 Vite 6 开发服务器，而不是再装一套 Webpack manager

**不适用**：

- Vue / Svelte / Angular 组件库——本包没有这些 renderer
- 要把 CSF 3 对象、`play()` 或双版本 React 隔离当成合同
- 需要默认跑 axe 或 MSW：得显式打开 addon
- 把启动耗时、包体积或“比 Storybook 快”写成事实——本轮未测

## 固定版本边界

- 本文绑定 `tajo/ladle@780c19e5...`，annotated tag 与 package 均为 `@ladle/react@5.1.1`。
- 未执行 `serve` / `build` / 上游 vitest；状态保持 `UNVERIFIED`。
- 审查记录：仓库内 `docs/component-workshop-source-review-20260827-dh.md`。

## 学到什么

1. **“能读 CSF 文件”不等于“实现了 CSF 3”**——发现看 AST，渲染看 `React.FC`
2. **隔离是开关，不是默认架构**——单窗是产品选择，iframe 是预览尺寸工具
3. **包名比仓库名更危险**——同名 unscoped package 可以完全不是这个项目
4. **addon 出现在 dependencies 里，不等于默认启用**

## 应用型自测

1. `export const Primary = { args: { label: "A" } }` 在固定 5.1.1 会不会被当成可渲染故事？
2. 不设 `meta.iframed`、宽度为 0 时，故事是否一定在 iframe 里？
3. 刚装好 `@ladle/react@5.1.1`，axe 扫描默认开着吗？

检查点：

1. 不会按组件渲染。`ArgsProvider` 对函数做 `createElement`；对象故事不是这条合同。
2. 不一定，默认就是同树。iframe 要宽度或 `iframed`。
3. 不开。`addons.a11y.enabled` 默认 `false`。

## 延伸阅读

- 官方文档：[ladle.dev](https://ladle.dev)
- 固定源码：[tajo/ladle](https://github.com/tajo/ladle) —— 本文绑定 `780c19e5756db21674db1bdf7ff995d858f4e3e1`
- 审查记录：仓库内 `docs/component-workshop-source-review-20260827-dh.md`
- [[histoire]] —— Vue/Svelte 故事文件 + 执行收集的对照
- [[storybook]] —— 双 window + CSF 3 的对照，不是本页测速对象
- [[vite]] —— Ladle 开发/构建底座

## 关联

- [[histoire]] —— 同赛道，发现模型和框架面不同
- [[storybook]] —— 行业默认工坊；隔离与故事格式都不同
- [[vite]] —— serve/build 都走 Vite
- [[vitest]] —— 测 runner，不是 Ladle 内置 play
- [[msw]] —— 可选 addon，默认关闭

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
