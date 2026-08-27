---
title: shadcn/ui — 把 React 组件从 npm 包变成"源码 + CLI 协议"
来源: 'https://github.com/shadcn-ui/ui'
日期: 2026-05-30
分类: 前端 / 组件库
难度: 初级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/shadcn-ui/ui
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 1773ecfeeb4a04366978d353e69b5c7ded78dcb2
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 4.19.0
---

## 是什么

shadcn/ui 不是一个 React 组件运行时包，而是一份**把 registry JSON 写成你仓库源码的 CLI 协议**。日常类比：传统 npm 组件库像外卖，盒子你拆不了；shadcn 像菜谱——`npx shadcn add button` 把 `button.tsx` 写进 `components/ui/`，之后 diff、改样式、review 都发生在你自己的 Git 里。

固定 `4.19.0` 的可发布包是 `packages/shadcn` 里的 `shadcn` CLI（`engines.node >=20.18.1`）。组件模板在 `apps/v4/registry/`。没有“升级 shadcn 组件包版本号”这回事：升级等于再跑一次 `add`，由你决定是否覆盖本地改动。

## 为什么重要

不理解这层协议，下面这些事都不好解释：

- 为什么同一套 CLI 能吐出 [[radix-ui]]、Base UI 或 React Aria 三套行为内核
- 为什么 `@acme/button` 这种第三方 registry 必须先写进 `components.json`
- 为什么改品牌色常常只动 CSS 变量，而不是 fork 一份 theme provider
- 为什么“拥有源码”的代价是你要自己同步上游模板

## 核心要点

可以把一次 `add` 看成六步流水线：

1. **读地址**：本地文件、HTTPS JSON、GitHub 地址，或 `@namespace/name`。`registries` 的 key 必须以 `@` 开头。

2. **Zod 验形**：`registryItemSchema` 按 `type` 分支（`registry:ui` / `file` / `page` / `theme` / `base` / `font` 等）。字段包括 `files`、`dependencies`、`registryDependencies`、`tailwind`、`cssVars`、`css`、`envVars`。

3. **展开依赖并拓扑排序**：`resolveRegistryTree` 递归拉 `registryDependencies`，再用 Kahn 算法排序，让被依赖项先落地。发现环时**不抛错**，只把剩下的项追加到末尾。

4. **写外围配置**：`updateDependencies` 装 npm 依赖，再补 Tailwind / env / fonts。

5. **写文件**：`updateFiles` 把 `*.tsx` 写进 alias 目录。已有文件默认询问；`--overwrite` 跳过确认直接覆盖。

6. **最后写 CSS**：注释写明要等组件和依赖就位后，才让文件监视器触发重建。

行为内核不是写死 Radix。`PRESET_BASES` 是 `radix` / `base` / `aria`。官方 `new-york-v4` 的 Dialog/Button 从 umbrella `"radix-ui"` 进口；`base-` 风格会把 `asChild` 改写成 Base UI 的 render 形态。`init` 在没给 style 时仍可能回落到 `"new-york"`，同时还有 nova / vega / maia 等 named preset。

CLI 还能探测 npm / yarn / pnpm / bun / deno 来装依赖，但可执行文件本身仍是 Node。另有 `init`、`diff`、`search`、`build`、`preset`、`registry`、`mcp` 等子命令，都不改变“源码归你”这条合同。

## 实践示例

### 案例 1：初始化后再加一个 Button

```bash
npx shadcn@4.19.0 init
npx shadcn@4.19.0 add button
```

`add` 会按 registry 项装 `class-variance-authority` 一类声明依赖，并写入 `button.tsx`。固定模板里 Button 已经是函数组件 + `Slot.Root`，不再包一层 `forwardRef`：

```tsx
import { Slot } from "radix-ui";
const Comp = asChild ? Slot.Root : "button";
```

类名走 `cva` 的 `bg-primary` / `text-primary-foreground`，颜色来自 CSS 变量，不写死 `bg-blue-500`。

### 案例 2：换品牌色只改变量

```css
:root {
  --primary: 222 47% 11%;
  --primary-foreground: 210 40% 98%;
}
```

组件类名可以不动。这是模板选择 CSS variables 时的合同；`cssVariables: false` 的项目不走这条路。

### 案例 3：第三方 registry 必须先登记

```json
{
  "registries": {
    "@acme": "https://example.com/r/{name}.json"
  }
}
```

```bash
npx shadcn@4.19.0 add @acme/my-tag
```

`@acme` 没写进 `registries` 时抛 `RegistryNotConfiguredError`，不会静默回落到默认 registry。`{name}` 占位符是 schema 硬要求。

## 踩过的坑

1. **`--overwrite` 会冲掉本地魔改**：交互确认或该旗标一旦生效，上游模板覆盖现有 `button.tsx`。先 `diff` 再决定。
2. **把 bun / deno 理解成“CLI 换运行时”**：探测器会用 bun/deno 装依赖，但 `shadcn` bin 仍要求 Node `>=20.18.1`。
3. **`base-` 风格继续写 `asChild`**：transform 会改写成 Base UI render API；Radix 模板才把 `asChild` 交给 `Slot.Root`。
4. **环状 `registryDependencies` 不会让 add 失败**：Kahn 排序不完整时剩下的项被追加，落地顺序不再有保证。
5. **跨 namespace 隐式引用**：`@v0/x` 必须在 `registries` 里有对应项。

## 适用 vs 不适用场景

**适用**：

- React + Tailwind，视觉是产品差异，愿意 own 源码
- 团队要一份可复制的起跑线，再各自演化
- 需要私有 / 第三方 registry，并接受升级 = 再跑 `add`

**不适用**：

- 已有大型 MUI / Antd 主题体系，两套 token 会打架
- 不写 React、不用 utility CSS 的栈
- 期望改一个 npm 版本号就全局升级所有按钮
- 需要本文证明 CLI 在某套脚手架上“一定一次成功”——未实际执行

## 固定版本边界

- 本文绑定 `shadcn-ui/ui@1773ecfe...`，即 annotated tag `shadcn@4.19.0` 的解引用提交；`packages/shadcn/package.json` 版本一致。
- 官方 `new-york-v4` 模板依赖 umbrella `radix-ui`，不是旧的 `@radix-ui/react-*` 分包路径。Base UI / React Aria 是并列 preset base，不是“以后也许会有”。
- CLI 引擎声明为 Node `>=20.18.1`。包管理器探测含 bun/deno，不等于 CLI 改用那些运行时启动。
- 本文未运行 `init`/`add`、未装依赖、未跑 vitest，状态保持 `UNVERIFIED`。

## 学到什么

1. **分发协议和组件库不是一层**：shadcn 卖的是“如何把 JSON 变成你仓库里的文件”
2. **schema + 递归依赖 + 拓扑排序** 是任何包管理系统的最小三件套；这里的包是组件源码
3. **own 源码换来的是分叉自由，也换来同步成本**
4. **行为内核可替换**——同一套 registry 协议能接 Radix、Base UI 或 Aria，样式层仍然是你的文件

## 应用型自测

1. `npx shadcn add @acme/button` 在 `components.json` 没有 `@acme` 时会怎样？
2. 两个 registry 项互相写在 `registryDependencies` 里，`add` 会因为环而失败吗？
3. 固定 `new-york-v4` 的 Dialog 是 `import * as Dialog from "@radix-ui/react-dialog"` 还是另一条路径？

检查点：

1. 抛 `RegistryNotConfiguredError`，不会默默去默认 registry 找。
2. 不会因此失败；未排进 Kahn 序列的项会被追加到末尾。
3. `import { Dialog as DialogPrimitive } from "radix-ui"`，走 umbrella 包。

## 延伸阅读

- 官方文档：[ui.shadcn.com](https://ui.shadcn.com)
- 自建 registry：[Build your own registry](https://ui.shadcn.com/docs/registry)
- 固定源码：[shadcn-ui/ui](https://github.com/shadcn-ui/ui) —— 本文绑定提交 `1773ecfeeb4a04366978d353e69b5c7ded78dcb2`
- [[radix-ui]] —— 默认 new-york-v4 模板的行为内核

## 关联

- [[radix-ui]] —— 官方 v4 模板从 umbrella `radix-ui` 进口 Dialog / Slot
- [[tailwind]] —— `bg-primary` 与 CSS 变量是默认视觉合同
- [[react]] —— CLI 和模板都按 React 组件树编写
- [[next-js]] —— 最常见的脚手架之一，不是唯一目标
- [[vite]] —— 同样在官方 templates 里
- [[astro]] —— 前提是项目已接 React integration

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
