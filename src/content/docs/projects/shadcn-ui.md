---
title: shadcn/ui — 把 React 组件从 npm 包变成"源码 + CLI 协议"
来源: 'https://github.com/shadcn-ui/ui'
日期: 2026-05-30
分类: 前端 / 组件库
难度: 初级
---

## 是什么

shadcn/ui 不是一个 React 组件库，是一份**代码分发协议**。日常类比：传统 npm 包像外卖，你只能开盒就吃；shadcn 像菜谱——CLI 把整段源码逐字复制到你项目里，从此组件归你，怎么改都行。

你跑这一行：

```bash
npx shadcn add button
```

CLI 去 registry 拉一段 JSON、过 Zod schema（校验 JSON 形状的规则）校验，再把 `button.tsx` **直接写进**你项目的 `components/ui/`。没有 node_modules 里的 shadcn **组件运行时**，也就没有“升级组件包版本”的冲突——CLI 本身仍是 npm 上的 `shadcn` 工具包，但组件源码不走依赖树。

v4 把这个协议向第三方开放：任何 HTTPS JSON 满足 schema，都能成为合法 registry。

## 为什么重要

不理解 shadcn，下面这些事都不好解释：

- 为什么 v0、Tremor、Origin UI、Magic UI 都跟进了同一套 registry 协议——它在事实上成了 React + Tailwind 组件分发的新默认
- 为什么"组件库"和"代码分发"是两个不同的范畴——前者是包，后者是协议
- 为什么 MUI / Antd 改样式那么费劲——因为你不拥有那些组件，只能在 theme override 里和它博弈
- 为什么前端团队从"复制粘贴别人 button"过渡到了"team registry 一行 add"

## 核心要点

shadcn 的协议可以拆成 **三层**：

1. **Schema 是法律**：`registry-item.json` 描述每个组件长什么样——`name` / `type` / `files[].path` / `dependencies` / `registryDependencies` / `tailwind` / `cssVars` / `css` / `envVars` 是九大字段。CLI 拉到 JSON 第一件事就是 `registryItemSchema.parse(data)`，形状不对直接抛错退出。schema 有了边界，第三方才敢做兼容 registry。

2. **CLI 是 runtime**：`npx shadcn add` 内部跑 9 步——fetch JSON、Zod 校验形状、解析 `registryDependencies`、Kahn 拓扑排序（给依赖排队：utils 先于 button 落地）、deepmerge `tailwind` / `cssVars` 字段、ts-morph（用 AST 改配置文件）改 `tailwind.config`、写 `components/ui/<name>.tsx`、装 npm 依赖、跑 format。每一步都绑定一个心脏文件，可单独排错。

3. **src/ 是产物**：写完即"你 own"——`git diff` 看得到、PR 能 review、改样式直接动源文件。**没有"运行时升级"概念**——升级 = 重新跑 add 把上游新版本拉一遍。这是 shadcn 与传统 npm 包最关键的分水岭。

## 实践案例

### 案例 1：30 分钟从 0 到一个有 button 的项目

```bash
npx create-next-app@latest demo --typescript --tailwind --app
cd demo
npx shadcn@latest init      # 选 New York 风格、Slate 主色、CSS variables=yes
npx shadcn@latest add button
```

跑完会看到：`components/ui/button.tsx` 多了 64 行、`package.json` 多了 `class-variance-authority` / `clsx` / `tailwind-merge`、`globals.css` 多了 50 行 CSS 变量。这时 `<Button>测试</Button>` 已经能渲染。

### 案例 2：把品牌色集中到 globals.css

shadcn 的 button 不写 `bg-blue-500`，写的是 `bg-primary`——这是 Tailwind 引用的 CSS 变量 `--primary`。换主题等于改 `globals.css` 里这一行，**组件类名一行不动**：

```css
:root {
  --primary: 222 47% 11%;
  --primary-foreground: 210 40% 98%;
}
```

业务组件可以照抄这个套路：把 `cva` variant 命名改成业务术语（`rare` / `common` / `limited`），而不是默认的 `default` / `destructive`，复用率会跟着抽象层级上升。

### 案例 3：自建团队 registry

v4 起任何 HTTPS JSON 都是合法 registry。在 `public/r/my-tag.json` 写一份满足 schema 的 JSON：

```json
{
  "$schema": "https://ui.shadcn.com/schema/registry-item.json",
  "name": "my-tag",
  "type": "registry:ui",
  "dependencies": ["class-variance-authority"],
  "registryDependencies": ["utils"],
  "files": [{ "path": "ui/my-tag.tsx", "type": "registry:ui", "content": "..." }]
}
```

跑 dev server 后用 CLI 装：

```bash
npx shadcn@latest add http://localhost:3000/r/my-tag.json
```

CLI 会写入 `components/ui/my-tag.tsx`、装 npm 依赖、还会因为你声明了 `registryDependencies: ["utils"]` 而**回头从默认 shadcn registry 拉 utils**。整套递归解析在你眼前跑了一遍——你刚做了一个微型私有 registry。

## 踩过的坑

1. **asChild + ref 在 React 18 项目下静默丢 ref**——v4 假设 React 19 的"ref-as-prop"，老项目 `<Button ref={...}>` 不会报错但 ref 不生效。升 v4 前先确认 React 版本。

2. **tailwind.config 用 `theme: extend({...})` 写法时 patch 可能落错位置**——AST 注入只看顶层 `ObjectLiteralExpression` 上的 `content` 字段，会跳过 extend 的内层对象，base theme 可能被覆盖。

3. **`registryDependencies` 不能跨 namespace 隐式引用**——依赖 `@v0/x` 必须在 `components.json` 显式声明对应 registry，否则抛 `RegistryNotConfiguredError`，不会静默跳过。

4. **已有文件时 CLI 会提示是否覆盖；加 `--overwrite` 则跳过确认强制覆盖**——一旦确认或强制，本地魔改过的 `button.tsx` 会被上游模板冲掉，是新人最常见的 PR 灾难。

## 适用 vs 不适用场景

**适用**：

- React + Tailwind 项目，想 own 组件源码、视觉是产品差异化点
- 团队需要"组件起跑线"——同一份 button.tsx 模板出发，再各自演化
- 想搭跨仓库的 team registry，用 SSO Bearer token 鉴权；接受升级 = 重跑 `add` 手动同步上游

**不适用**：

- 已有大型 MUI / Antd 项目——cva + theme provider 双套体系会打架
- 不写 React / 不用 Tailwind 的栈
- 强动效 / 高定制业务组件（抽奖转盘类）——shadcn 强在原子组件，复杂业务交互仍要自己写
- bun / Deno only 的项目——CLI 当前仍是 Node.js only
- 期望“改 package.json 版本号就全局升级组件”的团队——源码分发没有这种一键升级

## 历史小故事（可跳过）

- **2023-04**：作者 [@shadcn](https://github.com/shadcn) 在 Hacker News 发出 shadcn/ui，洞见是"高水平 React 团队最终都会写出几乎一样的 button.tsx，不如把模板交付出来"
- **2023 下半年**：GitHub Star 从 5k 飙到 50k，整个 React + Tailwind 圈子开始照抄它的写法
- **2024**：v0、Tremor、Origin UI、Magic UI 都跟进 registry 协议
- **2025 v4**：把 registry 开放给第三方——从"shadcn 自家组件集"升级成"通用代码分发协议"
- **2026-05**：v4.8.x 稳定迭代中，仓库 115k+ Star，事实标准

## 学到什么

1. **"分发"和"组件库"是两个不同的层次**——shadcn 在更下一层（协议），所以才能成为 v0、Tremor 等的共同基座
2. **schema + 递归依赖 + 拓扑排序** 是任何"包管"系统的最小三件套——shadcn 是组件版，npm/Cargo 是模块版，本质同构
3. **代码 own 比包 own 自由**——但代价是你要承担"上游有新写法时手动同步"的迁移成本
4. **AST codemod 是 codemod 工具的真正难点**——deepmerge + ts-morph + spread 占位 hack 这些细节决定鲁棒性

## 延伸阅读

- 官方文档：[ui.shadcn.com](https://ui.shadcn.com)（含 registry 协议规范、组件示例、theme 编辑器）
- HN 原贴：[Show HN: shadcn/ui](https://news.ycombinator.com/item?id=35324296)（理解作者的初始想法）
- 自建 registry：[Build your own registry](https://ui.shadcn.com/docs/registry)（v4 的 protocol 文档）
- Radix UI 文档：[radix-ui.com](https://www.radix-ui.com)（shadcn 默认依赖的 headless 行为层）
- [[radix-ui]] —— shadcn 组件的"行为内核"——a11y、键盘、焦点管理都委托给它
- [[tailwind]] —— shadcn 的视觉表达层，CSS variables + utility 双管齐下

## 关联

- [[radix-ui]] —— shadcn 把 Radix 的行为层 + Tailwind 的样式层组合，自己只负责"模板"
- [[tailwind]] —— `bg-primary` / `[&_svg]:size-4` 这些类名是 shadcn 视觉的全部表达
- [[react]] —— shadcn 是 React-only 协议；v4 利用 React 19 的 ref-as-prop 拿掉 forwardRef
- [[next-js]] —— 最常见的脚手架场景；Next.js 也常被用作团队 registry 的 server 侧
- [[vite]] —— Vite 项目同样支持 shadcn init，无 framework lock-in
- [[astro]] —— shadcn 也能装到 Astro 项目，前提是开了 React integration
- [[biome]] —— shadcn 写完代码顺手跑 format，可以直接用 Biome 替 Prettier

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[clerk]] —— Clerk — 把登录注册组织 MFA 整套外包给云的 SaaS 认证 SDK
- [[docusaurus]] —— Docusaurus — 一组 plugin 协作出来的文档站框架
- [[next-js]] —— Next.js — React 全栈框架
- [[radix-ui]] —— Radix UI — unstyled accessible 的 React 组件原语库
- [[projects/react]] —— React — 用组件描述界面的 JavaScript 库
- [[remix]] —— Remix — 拥抱 Web 标准的 React 全栈框架
- [[storybook]] —— Storybook — 给 UI 组件的独立工作台
- [[styled-components]] —— styled-components — 用标签模板把 CSS 写进 React 组件的 CSS-in-JS 库
