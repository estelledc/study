---
title: "Tailwind CSS 零基础入门笔记"
来源: "https://github.com/tailwindlabs/tailwindcss"
日期: 2026-06-13
分类: 后端 API
子分类: frontend-frameworks
provenance: pipeline-v3
---

# Tailwind CSS 零基础入门笔记

## 一、Tailwind CSS 是什么

Tailwind CSS 是一个「实用优先（utility-first）」的 CSS 框架。

它不给你预搭好的组件（比如 Bootstrap 的 `.btn`、`.navbar`），而是给你一把「乐高积木块」——每一块都很小、很单一，但你可以用它们搭出任何你需要的东西。

## 二、一个日常类比

想象你要粉刷一间屋子：

- **传统 CSS** 像是在买「预制墙板」——你选一个叫 `.客厅墙壁` 的模板，整个房间就刷好了。方便，但你想单独改一面墙的颜色就不行了。
- **Tailwind CSS** 像给你一桶桶「基础颜料」——红、黄、蓝、灰、白……你想让东墙变蓝就涂蓝，想给天花板加白就涂白。每一块颜料只管一件事，但组合起来非常灵活。

在代码里，这对应的就是：

| 传统 CSS | Tailwind CSS |
|---------|-------------|
| 写一个 `.btn-primary { background: blue; ... }` | 直接在 HTML 上写 `bg-blue-500 text-white rounded` |
| 样式在单独的 .css 文件里 | 样式直接在 HTML 标签的 class 属性里 |
| 需要想类名（比如 `.card-header-inner`） | 不需要想类名，直接用 `p-4 text-xl font-bold` |

## 三、核心概念

### 1. 实用类（Utility Classes）

Tailwind 提供了几百个「单功能类」，每个类只控制一个 CSS 属性。

比如：

- `text-red-500` → 把文字变成红色
- `p-4` → 设置 padding 为 1rem（约 16px）
- `flex` → 启用 flex 布局
- `rounded-lg` → 设置大号的圆角
- `hover:bg-blue-600` → 鼠标悬停时背景变蓝

### 2. 响应式前缀

Tailwind 用前缀来控制「在什么屏幕尺寸下生效」：

- `sm:` → 小屏及以上（≥40rem）
- `md:` → 中屏及以上（≥48rem）
- `lg:` → 大屏及以上（≥64rem）
- `xl:` → 超大屏及以上（≥80rem）

### 3. 状态前缀

- `hover:` → 鼠标悬停
- `focus:` → 获得焦点
- `active:` → 点击激活
- `disabled:` → 禁用状态
- `dark:` → 深色模式

### 4. 零运行时（Zero-Runtime）

Tailwind 在编译时扫描你代码里用到了哪些类，然后只生成你真正用到的 CSS。

这意味着：**你写了什么类，就生成什么样式；没写的，编译后的文件里根本没有。** 最终打包出来的 CSS 文件可以非常小。

## 四、代码示例

### 示例 1：一张产品卡片

下面是一个完整的「产品卡片」组件，全部用 Tailwind 的实用类写成：

```html
<div class="mx-auto max-w-sm overflow-hidden rounded-xl bg-white shadow-lg">
  <img class="h-48 w-full object-cover"
       src="https://example.com/coffee.jpg"
       alt="一杯手冲咖啡">
  <div class="p-6">
    <div class="text-xs font-bold text-sky-500 uppercase tracking-wide">
      咖啡专题
    </div>
    <h2 class="mt-2 text-xl font-semibold text-gray-900">
      手冲咖啡入门指南
    </h2>
    <p class="mt-2 text-gray-500">
      从选豆到冲泡，一篇文章教你掌握手冲咖啡的基本技巧。
    </p>
    <div class="mt-4 flex items-center justify-between">
      <button class="rounded-lg bg-sky-500 px-4 py-2 font-medium text-white hover:bg-sky-600">
        阅读全文
      </button>
      <span class="text-sm text-gray-400">5 分钟阅读</span>
    </div>
  </div>
</div>
```

拆解一下用到的类：

| 类名 | 作用 |
|------|------|
| `mx-auto` | 水平居中（左右外边距自动） |
| `max-w-sm` | 最大宽度设为「小」档 |
| `rounded-xl` | 大圆角 |
| `bg-white` | 白色背景 |
| `shadow-lg` | 大阴影 |
| `h-48` | 固定高度 12rem |
| `object-cover` | 图片裁剪填满容器 |
| `p-6` | 内边距 1.5rem |
| `text-xs` / `text-sm` / `text-xl` | 不同字号 |
| `font-bold` / `font-semibold` | 不同字重 |
| `hover:bg-sky-600` | 悬停时背景变色 |
| `flex` / `justify-between` | flex 布局，两端对齐 |
| `mt-2` / `mt-4` | 上外边距（margin-top） |

### 示例 2：响应式导航栏

下面展示响应式 + 悬停状态 + 深色模式的前缀用法：

```html
<nav class="bg-white dark:bg-gray-900 shadow-sm">
  <div class="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
    <!-- Logo -->
    <div class="text-xl font-bold text-gray-900 dark:text-white">
      MyApp
    </div>
    <!-- 导航链接 -->
    <div class="hidden sm:flex sm:items-center sm:space-x-4">
      <a class="rounded-md px-3 py-2 font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
         href="/">
        首页
      </a>
      <a class="rounded-md px-3 py-2 font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
         href="/about">
        关于
      </a>
      <a class="rounded-md bg-sky-500 px-3 py-2 font-medium text-white hover:bg-sky-600"
         href="/contact">
        联系我们
      </a>
    </div>
  </div>
</nav>
```

拆解前缀用法：

| 类名 | 含义 |
|------|------|
| `hidden sm:flex` | 默认隐藏，`sm` 及以上屏幕显示为 flex |
| `sm:space-x-4` | `sm` 屏幕起，子元素之间加水平间距 |
| `sm:px-6` / `lg:px-8` | 不同屏幕尺寸用不同内边距 |
| `dark:bg-gray-900` | 深色模式下背景变为深灰 |
| `dark:text-white` | 深色模式下文字变为白色 |
| `hover:bg-gray-100` | 鼠标悬停时背景变浅灰 |
| `dark:hover:bg-gray-800` | 深色模式下悬停变深灰 |

## 五、为什么用 Tailwind？

### 优点

1. **开发速度快** —— 不用想类名，不用在 HTML 和 CSS 文件之间来回切换
2. **改动安全** —— 改一个类只影响当前元素，不会意外影响别处
3. **维护简单** —— 想改样式？直接改 HTML 里的 class 就行
4. **CSS 文件体积小** —— 编译时只保留你实际用到的样式
5. **设计一致性** —— 所有颜色、间距、字号都来自同一个设计系统，不会「随手写」导致风格混乱

### 常见疑问

**问：HTML 里堆这么多类，不丑吗？**

答：刚开始确实看起来「臃肿」。但好处是结构（HTML）和样式（class）在同一处，一眼就能看出这个元素长什么样。而且大多数现代框架都支持用变量或组件来抽象重复的 class 组合。

**问：这跟内联样式（inline style）有什么区别？**

答：关键区别在于：
- Tailwind 用的是预设计计系统里的值（颜色、间距都有标准档），不是「魔法数字」
- Tailwind 支持 hover、focus、响应式等内联样式做不到的状态
- Tailwind 生成的 CSS 文件很小；内联样式会让每个元素都带一遍完整 CSS

## 六、快速参考速查表

| 类别 | 常用类 |
|------|--------|
| 颜色 | `text-red-500`、`bg-blue-100`、`border-gray-300` |
| 字号 | `text-xs`、`text-sm`、`text-base`、`text-lg`、`text-xl`、`text-2xl` |
| 字重 | `font-normal`、`font-medium`、`font-semibold`、`font-bold` |
| 间距 | `p-2/4/6/8`（内边距）、`m-2/4/6/8`（外边距）、`space-x-4`（子元素间距） |
| 布局 | `flex`、`grid`、`items-center`、`justify-between`、`gap-4` |
| 圆角 | `rounded`、`rounded-md`、`rounded-lg`、`rounded-full` |
| 阴影 | `shadow`、`shadow-md`、`shadow-lg`、`shadow-xl` |
| 响应式 | `sm:`、`md:`、`lg:`、`xl:` 前缀 |
| 状态 | `hover:`、`focus:`、`active:`、`disabled:`、`dark:` |

## 七、学习资源

- 官方文档：https://tailwindcss.com/docs
- 在线 Playground：https://play.tailwindcss.com
- 官方 GitHub：https://github.com/tailwindlabs/tailwindcss
