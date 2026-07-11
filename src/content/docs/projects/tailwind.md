---
title: Tailwind CSS — 工具类优先样式框架
来源: https://github.com/tailwindlabs/tailwindcss
日期: 2026-05-29
分类: CSS
难度: 中级
---

## 是什么

Tailwind 是一套**让你直接在 HTML 里写样式工具类**的 CSS 框架。日常类比：以前盖房先做模子再倒水泥（自定义 CSS class），现在直接把每块砖一块块往墙上贴（utility class）。

你写：

```html
<button class="px-4 py-2 bg-blue-500 text-white rounded">登录</button>
```

不需要再写一段 `.login-button { padding: 8px 16px; ... }`。每个 class 只做一件事——`px-4` 设左右 padding 16px，`bg-blue-500` 设背景色，`rounded` 设圆角。组合即组件。

## 为什么重要

不理解 Tailwind 的设计哲学，下面这些事都没法解释：

- 为什么 shadcn/ui / Catalyst / DaisyUI 全部以 Tailwind 为底——utility class 不会污染全局，copy-paste 友好
- 为什么 Tailwind 周下载 1000 万、Bootstrap 时代被关掉——它把"给 class 起名字"这个最痛苦的步骤直接省了
- 为什么 Tailwind 的 CSS bundle 能从 100KB 砍到 10KB——JIT（just-in-time）编译时只生成你用过的 class
- 为什么 v4（2025）启动比 v3 快约 5–10 倍——性能关键路径用 Rust（Oxide）重写

## 核心要点

Tailwind 的核心是 **三个思想**：

1. **Utility-first（工具类优先）**：每个 class 只做一件事，组合即组件。`p-4` 只设 padding，`bg-blue-500` 只设背景。类比：乐高积木——单块功能简单，组合千变万化。

2. **JIT 编译（按需生成）**：Tailwind 启动时不预先生成几十万行 utility CSS，而是扫源码看你用了哪些 class，**只生成用过的**。开发时改一个 class 后约 10ms 出新 CSS，热更新无感。

3. **设计系统约束**：`p-4` 的 `4` 不是字面 4px，是查 spacing scale 的 key（4 = 1rem = 16px）。所有间距 / 字号 / 颜色都来自一个有限集合——魔法数被消灭，设计一致性自动出现。

## 实践案例

### 案例 1：Hello world 一行

```html
<button class="bg-blue-500 hover:bg-blue-700 text-white px-4 py-2 rounded">
  Click
</button>
```

**逐部分解释**：

- `bg-blue-500`：背景色 = 蓝色第 5 阶（500 是基准，越小越浅、越大越深）
- `hover:bg-blue-700`：鼠标悬停时换更深的蓝——`hover:` 是状态前缀
- `text-white`：文字白色
- `px-4 py-2`：水平 padding 16px、垂直 padding 8px（`x = 左右`、`y = 上下`、`4 = 1rem = 16px`）
- `rounded`：`border-radius: 0.25rem`，轻微圆角

整个按钮无需写任何 CSS 文件。

### 案例 2：自定义品牌色

`tailwind.config.js`（v3）：

```js
module.exports = {
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#FF5733',
          light: '#FFB199',
          dark: '#A33621',
        },
      },
    },
  },
};
```

之后可以写 `bg-brand`、`text-brand-light`、`hover:bg-brand-dark`。`extend` 是关键——直接写 `colors:` 会**覆盖**默认色板，`extend` 是**追加**。

### 案例 3：响应式 + 暗色模式

```html
<div class="text-sm md:text-base lg:text-lg dark:text-gray-200">
  屏幕变大字会变大；暗色模式自动换色
</div>
```

- `md:` 表示屏幕宽度 ≥ 768px 时生效；`lg:` 是 ≥ 1024px
- mobile-first 策略：默认值给小屏幕，大屏幕"叠加"覆盖
- `dark:` 在暗色模式下生效，省掉手写 media query

## 踩过的坑

1. **class 字符串过长**：一个复杂按钮可能 30+ 个 class。用 `clsx` 拼接条件 class、用 `tailwind-merge` 解决"多个同属性 class 谁覆盖谁"的问题。shadcn 的 `cn()` 工具就是这两个的封装。

2. **与已有 CSS 冲突**：Tailwind 的 preflight（重置样式）很激进——`<h1>` 默认无字号、`<ul>` 无 bullet。迁移老项目时容易"原本好的样式没了"。要么禁 preflight，要么逐页补样式。

3. **content 配置漏路径丢样式**：v3 必须告诉 Tailwind 去哪扫源码（`content: ['./src/**/*.{html,js,jsx,tsx}']`）。漏写一个目录，那里的 class 不会被生成 CSS——开发模式正常，生产构建后样式消失。v4 自动检测项目结构，少踩这个坑。

4. **动态拼接 class 扫不到**：`bg-${color}-500` 这种动态字符串 Tailwind 的正则扫描器看不见。必须写完整字面量，或在 safelist 里手动登记。

5. **自定义工具类的位置**：想加一个 `.glow` class，必须放进 `@layer utilities {}` 块里，不能直接写在 CSS 顶层——否则不参与 Tailwind 的优先级管理，hover/responsive 前缀也无法叠加。

## 适用 vs 不适用场景

**适用**：

- 单页应用 / 设计系统 / 产品快速迭代——utility-first 让设计改动只是改 class 字符串
- 团队需要一套共享的 design token（spacing / color / size scale 全统一）
- 用 React / Vue / Svelte 做 component-based 开发——utility 不污染全局，copy-paste 友好
- 关心生产 CSS 体积：JIT 后常用页面往往落在十余 KB 量级（随用到的 utility 增减）

**不适用**：

- 内容驱动的纯静态站点（博客 / 文档），样式一年不改一次——semantic class 的可读性更高
- 老项目大规模迁移成本超过收益时——utility class 让 HTML 变长，diff 难读
- 团队对"HTML 不应混样式"有强信念——这是审美问题，没标准答案

## 历史小故事（可跳过）

- **2013 年**：Yahoo 提出 Atomic CSS（如 `.Bgc(#fff)` 表示 background-color），是 utility-first 的雏形，但命名晦涩，没人接受
- **2017 年**：Adam Wathan 写博客 "CSS Utility Classes and Separation of Concerns"；同年 11 月发布 Tailwind v0.1.0
- **2019 年 5 月**：稳定版 Tailwind v1.0
- **2021 年**：3 月推出独立 JIT 包，随后进 v2.1；12 月 v3 默认 JIT，支持任意值 `top-[117px]`
- **2025 年 1 月**：v4.0 稳定，Oxide（Rust）加速编译，CSS-first 配置可弱化 `tailwind.config.js`

## 学到什么

1. **命名是抽象的最大成本**——`login-button` 这个名字假定它只在登录页用，下次复用就要么改名要么 copy。Tailwind 直接绕开这一步。

2. **JIT 是「按需生成」的胜利**——v1 时期全量生成 50 万行 CSS，3MB；v3 之后只生成用到的，bundle 降到 KB 级。

3. **设计 token 是设计系统的最小单位**——shadcn/ui 选 Tailwind 是因为：utility class 不污染全局、token 统一、改 token 影响所有 component。

4. **审美问题没标准答案**——utility-first vs semantic-class 哲学之争还会持续 10 年。但市场已经选边：Next.js 默认推荐 Tailwind，Bootstrap 时代被关掉。

## 延伸阅读

- [Tailwind 官方文档](https://tailwindcss.com)（cheatsheet 必备，写代码时常开）
- [Adam Wathan 2017 博客](https://adamwathan.me/css-utility-classes-and-separation-of-concerns/)（utility-first 的原始辩护）
- [shadcn/ui](https://ui.shadcn.com)（utility-first React component 标杆）
- [tailwind-merge](https://github.com/dcastil/tailwind-merge)（解决多 class 同属性冲突的工具库）

## 关联

- [[react]] —— shadcn/ui 把 Tailwind 推到 utility-first 的 React 组件标杆
- [[nextjs]] —— Next.js `create-next-app` 默认问你要不要 Tailwind，是它最大的入口
- [[vite]] —— Tailwind 在 Vite 里一行配置，开发体验流畅

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[cal-com]] —— cal.com — 自己能托管的开源 Calendly
- [[emotion]] —— Emotion — 在 JS 里写样式，让浏览器拿到一张唯一的 className
- [[next-js]] —— Next.js — React 全栈框架
- [[radix-ui]] —— Radix UI — unstyled accessible 的 React 组件原语库
- [[shadcn-ui]] —— shadcn/ui — 把 React 组件从 npm 包变成"源码 + CLI 协议"
- [[styled-components]] —— styled-components — 用标签模板把 CSS 写进 React 组件的 CSS-in-JS 库
- [[stylex]] —— StyleX — 编译期把样式拍扁成原子 className 的 CSS-in-JS
- [[vanilla-extract]] —— vanilla-extract — 把 CSS 写成 TypeScript，浏览器看到的却是零字节运行时
- [[vue]] —— Vue.js — 渐进式 UI 框架
