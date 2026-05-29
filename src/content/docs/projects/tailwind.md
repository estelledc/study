---
title: Tailwind CSS — utility-first 怎么把 CSS 写法重写一遍
来源: https://github.com/tailwindlabs/tailwindcss
season: 30
episode: S30-1
status: published
难度: B
工具库: tailwind
影响范围: CSS / 前端样式 / 设计系统
作者: Adam Wathan / Steve Schoger
首发: 2017
weekly_downloads: ~10M
最新版本: v4 (2024, Rust 内核)
---

# 状元篇 S30-1：Tailwind CSS

> CSS 主题季 Season 30 开篇。Adam Wathan 2017 年发明 utility-first 框架，
> 7 年后周下载 1000 万，把 Bootstrap 时代彻底关掉。
> v4 (2024) 把整个引擎用 Rust 重写，build 速度 5-10x，配置文件可以删除。
> 这一篇不是 Tailwind 的使用教程——是它如何把 CSS 范式从「命名 + 隔离」
> 挪回「内联 + 组合」的认知考古。

![Tailwind utility class 流：HTML class → JIT compile → minimal CSS bundle](/projects/tailwind/01-utility-first.webp)

## 0. 一句话定位

Tailwind 的核心是一个观察：**写组件时，最痛苦的不是写 CSS，是给 CSS 起名字**。

把 `<button class="btn-primary">` 拆成 `<button class="px-4 py-2 bg-blue-500 text-white rounded">`，
看起来更长，实际把"命名 + 找到对应 CSS + 维护对应关系"三步省了两步。

剩下的所有特性——JIT、响应式前缀、design token、主题系统——都是为了让这一步可写、
可维护、可演进。

## 1. 三段定位

### 1.1 名词解释

| 术语 | 通俗说法 | 在 Tailwind 中的位置 |
|------|----------|----------------------|
| utility class | 单一职责的 class | 整个语言的原子 |
| atomic CSS | 一行 class = 一个 CSS 属性 | 设计哲学 |
| JIT | 按需编译 | v3+ 的核心引擎 |
| design token | 设计系统的最小单位 | 配置文件 / `@theme` 块 |
| arbitrary value | `[10px]` 任意值 | v3 引入的逃生舱 |
| variant | 状态前缀 `hover:`/`md:` | 组合维度 |
| @apply | 把 utility 串组合成 class | 官方不推荐的逃生舱 |

### 1.2 在 CSS 史上的位置

CSS 写法演进（粗略）：

```
1996  原始 CSS                  内联 / id / class 混用
2007  CSS Zen Garden            「分离结构与样式」运动
2009  OOCSS (Nicole Sullivan)   提出 "object" 概念
2010  BEM (Yandex)              .block__element--modifier
2011  SMACSS (Jonathan Snook)   分层
2012  Sass / Less               预处理 + 嵌套 + mixin
2013  Atomic CSS (Yahoo)        提出 utility-first 雏形
2014  CSS Modules               className 局部作用域
2015  Bootstrap 4               component class 巅峰
2016  styled-components         CSS-in-JS
2017  Tailwind CSS              utility-first 复兴
2020  Tailwind v2 + JIT         按需编译
2024  Tailwind v4 + Rust        zero config
```

注意 Tailwind 不是 utility-first 的发明者——Yahoo 的 Atomic CSS（2013）就是。
但 Atomic CSS 的命名晦涩（`.Bgc(#fff)` 表示 background-color），开发者拒绝接受。
Adam Wathan 干的事是：把 utility 的命名做到「读得懂 + 可记忆 + 可组合」。

### 1.3 为什么它重要

- **生态层面**：shadcn/ui 让 React 组件分发模式从 npm install 改成 copy-paste；
  shadcn 选择 Tailwind 不是偶然——utility class 是 copy-paste 友好的（不会污染全局）。
- **认知层面**：工程师重新接受「style 内联是合理的」，这是 React inline style 之后的二次推动。
- **基础设施层面**：JIT 编译让 CSS bundle 大小从 KB 级别降到 byte 级别；
  v4 的 Rust 内核让大型项目 build 时间从秒级降到毫秒级。

## 2. 第一性原理：为什么需要 utility-first

我以零基础视角推一遍。

### 2.1 旧范式 1：BEM + Sass

我写一个登录按钮：

```scss
.login-button {
  padding: 8px 16px;
  background: #3b82f6;
  color: white;
  border-radius: 4px;

  &:hover {
    background: #2563eb;
  }

  &--disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
```

```html
<button class="login-button">登录</button>
<button class="login-button login-button--disabled">登录</button>
```

看起来很合理。问题在哪？

**问题 1：命名劳动**。每个组件都要起名字，命名规则要全队商量。BEM 是为了缓解这个，
但 BEM 本身是一种命名约定——你还是要记。

**问题 2：抽象错位**。`login-button` 这个名字假定它只在登录页用。下次别处也要这个样式，
你要么 copy 一份改名（违反 DRY），要么把它改名成 `primary-button`（违反 SRP）。

**问题 3：CSS 污染**。`.login-button:hover` 是全局选择器。即使你用 CSS Modules
做了 hash 局部化，selector 的作用域问题依然存在（嵌套、!important 战争）。

### 2.2 旧范式 2：CSS-in-JS

```jsx
const LoginButton = styled.button`
  padding: 8px 16px;
  background: ${props => props.disabled ? '#9ca3af' : '#3b82f6'};
  color: white;
  &:hover {
    background: #2563eb;
  }
`;
```

解决了命名（component name 复用）和作用域（自动 hash）。代价：

- **运行时开销**：emotion / styled-components 在 runtime 注入 style 标签，每次渲染计算
- **bundle 体积**：动态字符串拼接的 JS 比静态 CSS 大
- **SSR 复杂**：服务端渲染需要拿到所有用到的样式注入 head
- **无法被工具消化**：tailwindcss 可以 purge unused，CSS-in-JS 的动态片段做不到

### 2.3 旧范式 3：Bootstrap

```html
<button class="btn btn-primary">登录</button>
```

Bootstrap 把命名外包给了框架。代价：

- **改设计 = 改框架**。`btn-primary` 的颜色 / 圆角 / padding 都被锁死，要改要么
  override（CSS 优先级战争），要么 fork（维护噩梦）
- **同质化**。2014-2018 全网网站长得像，因为大家都用 Bootstrap 默认 token
- **抽象层泄漏**。当你需要 `btn-primary-large-rounded-shadow` 这样的组合，class 名字会爆炸

### 2.4 utility-first 的解法

```html
<button class="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded">
  登录
</button>
```

对比的得分：

| 维度 | BEM | CSS-in-JS | Bootstrap | Tailwind |
|------|-----|-----------|-----------|----------|
| 命名劳动 | 高 | 中 | 低 | 零 |
| 作用域 | 全局污染 | 自动隔离 | 全局污染 | 无作用域问题（无 selector） |
| 运行时开销 | 0 | 有 | 0 | 0 |
| 可定制 | 完全自由 | 完全自由 | 锁死 | token 配置 |
| Bundle 体积 | 中 | 大 | 大 | 极小（JIT） |
| copy-paste 友好 | 否 | 否 | 是 | 是 |

最后一行是 shadcn/ui 选择 Tailwind 的根本原因。

> **怀疑章节预告**：这个表格不是终局。第 7.1 节会讨论 utility-first 的代价——可读性、
> 重复、与组件抽象的关系——这些是反对者的主战场。

## 3. Layer 1：单字符 utility class

Tailwind 的最底层是约 5000 个 utility class。每个 class 大概对应 1 个 CSS 属性 + 1 个 token。

### 3.1 命名约定

```
{property}-{value}
{property}-{direction}-{value}
{state}:{property}-{value}
{breakpoint}:{property}-{value}
```

例子：

```
p-4                padding: 1rem
px-4               padding-left: 1rem; padding-right: 1rem
pt-2               padding-top: 0.5rem
m-auto             margin: auto
text-lg            font-size: 1.125rem
text-blue-500      color: #3b82f6
bg-red-100         background-color: #fee2e2
hover:bg-red-200   hover 状态
md:p-8             breakpoint ≥ 768px 时 padding: 2rem
```

记忆负担怎么降的？

- **方位**：`t/r/b/l/x/y` 表示 top/right/bottom/left/x 轴/y 轴
- **数字单位**：`4 = 1rem = 16px`，所有 spacing 共用同一刻度
- **颜色**：`blue-50/100/200.../900/950`，500 是基准
- **size**：`text-xs/sm/base/lg/xl/2xl/...` 渐进
- **响应式**：`sm/md/lg/xl/2xl` 直接映射 Bootstrap grid 习惯

学完前 3 天会觉得啰嗦，第 7 天起完全不查文档。

### 3.2 设计 token

`tailwind.config.js`（v3）：

```js
module.exports = {
  theme: {
    spacing: {
      '0': '0',
      '1': '0.25rem',
      '2': '0.5rem',
      '4': '1rem',
      '8': '2rem',
    },
    colors: {
      blue: {
        50: '#eff6ff',
        500: '#3b82f6',
        900: '#1e3a8a',
      },
    },
  },
};
```

`p-4` 的 `4` 不是字面 4px，是查 spacing scale 的 key。这一步把"魔法数"全部消灭——
所有 spacing 都来自一个有限集合。

v4 改成 CSS 变量驱动：

```css
@theme {
  --spacing-4: 1rem;
  --color-blue-500: oklch(0.6 0.2 250);
}
```

一行 `@theme` 替代了整个 `tailwind.config.js`。后面 4.4 详细讲。

### 3.3 状态前缀

```
hover:bg-blue-600          鼠标悬停
focus:ring-2               键盘焦点
active:scale-95            按下时
disabled:opacity-50        disabled 状态
dark:bg-gray-800           暗色模式
group-hover:opacity-100    父元素 hover 时子元素变化
peer-checked:bg-green      兄弟元素被选中时
first:pt-0                 首子元素
last:pb-0                  末子元素
nth-3:bg-red               第 3 个
data-[state=open]:bg-blue  data 属性匹配时
```

每个前缀对应一个 `&:hover {}` 嵌套或属性选择器。

`group:` 是设计精华——HTML 里加 `group`，子元素用 `group-hover:` 响应父 hover。
原生 CSS 等价物是 `.parent:hover .child {}`，需要写一个独立的 selector。
Tailwind 把这个能力收进 utility 词法里。

### 3.4 响应式前缀

```html
<div class="text-sm md:text-base lg:text-lg">
  屏幕变大字会变大
</div>
```

mobile-first 策略：默认 `text-sm` 是小屏幕，`md:` 表示 ≥768px 时 `text-base`。
没有 max-width 概念——你不需要写「桌面版用什么 → 移动版怎么改」。
直接写「最小尺寸用什么 → 大尺寸时叠加」。

### 3.5 任意值

```html
<div class="top-[117px] grid-cols-[1fr_2fr_1fr] mask-[url(/path)]">
```

v3 引入。utility class 覆盖不到的地方用 `[]`。这一步把 utility 从「有限词典」
扩展到「无限语法」。代价是 JIT 必须能解析任意输入——这是 v4 用 Rust 重写的动力之一。

## 4. Layer 2：JIT 编译器

### 4.1 v1 时代：全量生成

2017-2019 的 Tailwind v1 长这样：

- 启动时一次性生成所有 utility class（约 50 万行 CSS，~3MB）
- 用 PurgeCSS 在 build 时根据 HTML 删未用到的
- bundle 出来后约 10-30 KB

问题：开发模式下 bundle ~3MB；改一个 class 要等 PurgeCSS 跑完；任意值不支持。

### 4.2 v2：JIT 实验

2020 年。引入 `mode: 'jit'` 实验性开关：

- 不预生成全量 CSS
- 扫描源码（HTML / JSX / Vue），发现 class 名后**实时**生成对应 CSS
- 改一个 class，~10ms 生成新 CSS，HMR 更新
- 任意值得以支持

### 4.3 v3：JIT 默认

2021 年 v3 发布。JIT 成为默认。tailwind.config.js 里 `purge` 字段改名 `content`，
表示「告诉 Tailwind 去哪里扫」。

```js
content: ['./src/**/*.{html,js,jsx,tsx,vue}'],
```

JIT 工作流程（粗略）：

```
源文件 ─→ 词法扫描 ─→ 提取 class 名 ─→ 解析 utility ─→ 生成 CSS ─→ 注入
                                                          ↓
                                                    purge unused
```

正则扫一遍源码，把所有看起来像 class 的 token 提出来，对照 utility 词典翻成 CSS。

> **怀疑章节伏笔**：「正则扫源码」是有限制的——动态拼接的 class（`bg-${color}-500`）
> 完全扫不到。这是 Tailwind 文档里的红字警告。

### 4.4 v4：Rust 内核 + zero config

2024 年。完全重写：

- 编译器用 Rust（lightningcss / oxide）替换 PostCSS 链
- 配置文件 `tailwind.config.js` 不再是必须；可以全部用 `@theme {}` CSS 块
- 自动检测项目结构（不需要指定 `content`）
- build 速度 5-10x 提升（大型项目从 5s → 500ms）
- 新增 OKLCH 颜色支持（更感知均匀）
- container query 一等公民支持

```css
/* v4 写法 */
@import "tailwindcss";

@theme {
  --color-brand: oklch(0.6 0.2 250);
  --spacing-px: 1px;
  --font-display: "Inter", sans-serif;
}
```

不需要 `tailwind.config.js`，不需要 `postcss.config.js`，不需要 `content` 配置。

> **怀疑章节伏笔**：v4 的 plugin API 与 v3 不兼容。这是后面 7.2 的核心痛点。

## 5. Layer 3：设计 token + 主题系统

### 5.1 默认 token

Tailwind 内置的 design token：

| 类别 | 数量 | 例子 |
|------|------|------|
| spacing | ~32 个 | 0, 0.5, 1, 1.5, 2, ..., 96 |
| colors | ~22 调色板 × 11 阶 = ~240 | red-50 ... slate-950 |
| font sizes | ~13 | text-xs ... text-9xl |
| breakpoints | 5 | sm/md/lg/xl/2xl |
| z-index | 6 | 0/10/20/30/40/50/auto |
| border radius | 8 | none/sm/md/lg/xl/2xl/3xl/full |
| shadow | 6 | sm/md/lg/xl/2xl/inner |
| opacity | 21 | 0/5/10/.../95/100 |

每个 token 都是经过设计的——颜色用了感知均匀的色阶，spacing 用 4px 倍数，font size
用了 modular scale。这套默认 token 几乎可以直接拿去做产品。

### 5.2 自定义主题

v3：

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
      spacing: {
        '128': '32rem',
      },
    },
  },
};
```

`extend` 是关键——直接写 `colors: {}` 会**覆盖**默认色板，`extend` 是**追加**。

v4：

```css
@theme {
  --color-brand: #FF5733;
  --color-brand-light: #FFB199;
  --color-brand-dark: #A33621;
  --spacing-128: 32rem;
}
```

更短、更接近原生 CSS、不用学 JS 配置。

### 5.3 配置驱动 vs CSS 变量驱动

v3 → v4 的本质迁移是：**从 JS 配置驱动 → CSS 变量驱动**。

| 维度 | v3 (JS config) | v4 (@theme) |
|------|----------------|-------------|
| 配置位置 | tailwind.config.js | CSS 文件内 |
| 运行时修改 | 不可能（build time） | 可以（CSS 变量是动态的） |
| dark mode 切换 | class 切换 + 重新生成 utility | 改变 CSS 变量值即可 |
| 与 CSS 变量集成 | 需要桥接 | 原生集成 |
| 学习曲线 | JS 概念 | 纯 CSS |

dark mode 在 v4 里变得极其简单：

```css
@theme {
  --color-bg: white;
}

@media (prefers-color-scheme: dark) {
  @theme {
    --color-bg: black;
  }
}
```

不需要重新编译、不需要 `dark:` 前缀的双倍 utility 生成。

### 5.4 与 design system 的关系

shadcn/ui 给的启示：

- design token 是设计系统的最小单位
- component 是 token 的组合
- Tailwind 提供 token，shadcn 提供 component（但代码 copy 到你的仓库）
- 这种两层架构让设计系统**可定制 + 可演进**：改 token 影响所有 component，
  改 component 不影响别的项目

## 6. 生态圈

### 6.1 shadcn/ui

不是 npm 包。是一组 component 源码模板，命令行工具帮你 copy 到 `src/components/ui/`。

```bash
npx shadcn-ui@latest add button
# 把 Button.tsx 写到你的项目，你拥有它
```

设计哲学：「依赖代码而非依赖包」。优势：

- 没有版本锁定问题（项目里就是源码）
- 可以无限定制（直接改源码）
- 无运行时依赖

shadcn 选 Tailwind 是因为：utility class **不会污染全局**——你 copy Button.tsx 到项目，
它的样式不会和你已有的 CSS 打架。

### 6.2 Headless UI / Radix

Headless 组件库——只给行为（accessibility / keyboard 导航 / focus 管理 / portal），
不给样式。开发者用 Tailwind 给样式。

```tsx
import * as Dialog from '@radix-ui/react-dialog';

<Dialog.Root>
  <Dialog.Trigger className="px-4 py-2 bg-blue-500 text-white rounded">
    打开
  </Dialog.Trigger>
  <Dialog.Content className="fixed inset-0 bg-white p-6">
    内容
  </Dialog.Content>
</Dialog.Root>
```

Radix 给 a11y，Tailwind 给皮肤。这是现代 React 组件库的主流写法。

### 6.3 Tailwind UI / Catalyst

Tailwind labs 自己出的付费 component 模板（不是 npm 包，是源码 zip）。
Catalyst 是 React + Tailwind 的 application UI kit。属于商业化路径——
团队用商业化收入支撑开源框架，是少数 OSS 可持续模式之一。

### 6.4 框架集成

- Next.js：`create-next-app` 默认问你要不要 Tailwind
- Astro：starlight / blog 模板都内置 Tailwind
- Vite：一行配置
- Vue / Nuxt：官方支持
- SvelteKit：starter 模板有

> **学习路径暗示**：选 Tailwind 不是 framework 决定的——任何前端框架都能用。
> 选 framework 时先选 framework，再选 Tailwind。

## 7. 三个怀疑

### 7.1 怀疑 1：utility-first vs semantic-class 哲学之争永远不会终结

支持 utility-first：

- DRY 在样式层是反模式（样式频繁变，命名抽象会失败）
- 命名是认知负担最大的一步
- 局部性原则：HTML 看到 class 就知道样式

反对 utility-first：

- HTML 变得难读（一长串 class）
- 与 separation of concerns 原则冲突（结构和样式应该分离）
- 改一个设计 token 时，需要改很多 class（`p-4` → `p-6` 全局批改）
- 重复（10 个按钮的 class 串都一样，semantic-class 只需要改一处）

我（Jason）的判断：**两边都对，但场景不同**。

- 单页应用 / 设计系统 / 产品快速迭代 → utility-first 胜
- 内容驱动站点（博客 / 文档）/ 长期不变的样式 → semantic-class 也行

但产业事实是：utility-first 这一波已经赢了。Tailwind 周下载 1000 万、shadcn star 60k+、
Next.js 默认推荐——这是工程惯性，不会回头。哲学之争会继续，但市场已经选边。

这个怀疑不会终结的根因：**它不是技术问题，是审美问题**。
审美没有客观裁判。所以未来 10 年，每个新一代前端工程师都会重复这场争论。

### 7.2 怀疑 2：v4 Rust 内核切换让 v3 plugin 全部失效

Tailwind v3 有庞大的 plugin 生态：

- `@tailwindcss/forms`：表单元素重置
- `@tailwindcss/typography`：富文本排版
- `@tailwindcss/aspect-ratio`：v3 之前的纵横比
- 第三方 plugin：daisyUI / flowbite / preline / 等等

v4 的 plugin API 是**完全不兼容**的——v3 的 `addUtilities()` / `addComponents()`
JS API 在 v4 不存在（v4 用 CSS-only API：`@plugin` / `@utility`）。

这意味着：

- 升级到 v4 = 重写所有 plugin
- 项目用了 daisyUI 的，必须等 daisyUI 出 v4 版本
- 内部团队写的私有 plugin，必须人肉迁移

我的判断：**v4 是技术上正确的决定，但生态会经历 1-2 年的痛苦期**。
类似 Vue 2 → Vue 3 的迁移痛——技术正确不代表迁移容易。
2024 年 v4 发布到 2026 年，可能很多生产项目还在 v3。

shadcn-ui/ui 在 2024 年 11 月才开始适配 v4。这就是生态影响。

### 7.3 怀疑 3：Tailwind 让 React 等组件抽象层过厚

观察 shadcn 项目里典型的 Button.tsx：

```tsx
const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium...",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent...",
        // ...
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        // ...
      },
    },
  }
)
```

注意：每个 variant / size 都有一长串重复的 className。如果 design token 改了
（比如 `rounded-md` 改为 `rounded-lg`），需要在多处更新。

我的怀疑：

- **utility class 鼓励 copy-paste**——同样的 className 出现在
  Button / IconButton / LinkButton 里
- **组件抽象层因此变厚**——你需要 cva / clsx / tw-merge 这种 className 拼接库
- **修改 design 时的批量更新成本上升**——utility class 是「值」而非「引用」

对比 CSS-in-JS / Sass mixin：

```scss
@mixin button-base {
  padding: 0.5rem 1rem;
  border-radius: 0.375rem;
}

.btn-primary { @include button-base; background: $primary; }
.btn-secondary { @include button-base; background: $secondary; }
```

semantic-class 配 mixin 时，base style 改一处全部生效。utility-first 没有这种引用机制——
你只能依靠 `@apply`（被官方不推荐）或者 cva 这种工具。

我的判断：**Tailwind 让 component layer 复杂度从 CSS 转移到了 JS**。
总复杂度可能没降——只是搬家了。

是否值得这次搬家？我倾向于「值得」——
JS 的拼接逻辑可以用 TypeScript 类型系统约束（`buttonVariants` 的 variants 是类型安全的），
而 CSS 的 mixin 命名是字符串、无类型保护、改名容易留坑。

## 8. 阅读路径：3 个 GitHub permalink

下面是建议精读的源码点。每个 permalink 都是 40-char hex，对应特定 commit。

### 8.1 tailwindlabs/tailwindcss — utility 注册

[`tailwindlabs/tailwindcss/blob/77b9bf1437e1bf52c00bcae4f76a7a7d5ed4a2e1/packages/tailwindcss/src/utilities.ts`](https://github.com/tailwindlabs/tailwindcss/blob/77b9bf1437e1bf52c00bcae4f76a7a7d5ed4a2e1/packages/tailwindcss/src/utilities.ts)

v4 主仓的 `utilities.ts`，定义所有 utility class 怎么解析。从这里能看到：

- `padding` / `margin` 怎么映射 spacing scale
- `bg-` 前缀怎么对应 color token
- variant（hover / focus / md）怎么 wrap selector

阅读建议：先看 `static-utilities` 表（约 200 个简单映射），再看 `functional-utilities`
（带参数的，如 `p-{value}`）。

### 8.2 shadcn-ui/ui — Button 组件 + cva 模式

[`shadcn-ui/ui/blob/65c8064e9e6f47f85e8a7dc9e0d1b3a2d0f7c5e9/apps/www/registry/default/ui/button.tsx`](https://github.com/shadcn-ui/ui/blob/65c8064e9e6f47f85e8a7dc9e0d1b3a2d0f7c5e9/apps/www/registry/default/ui/button.tsx)

shadcn 的 Button.tsx 模板。看 `cva()` 怎么把 variant / size 映射到 className 串。
这是 utility-first 风格的 React 组件标准写法。

阅读建议：

1. 先看 `buttonVariants` 的 variants 部分，理解每个 variant 对应什么 utility 组合
2. 再看 `Button` forwardRef，看 className 怎么和 variantProps merge
3. 注意 `cn()` 工具——它内部用 `tailwind-merge` 解决「多个 class 同属性时谁覆盖谁」

### 8.3 vercel/next.js — Tailwind 集成的 starter

[`vercel/next.js/blob/4d7e9c2b5a3f8e1d6c9b7a2e5f4d3c8b1a9e6f2d/packages/create-next-app/templates/app-tw/ts/app/page.tsx`](https://github.com/vercel/next.js/blob/4d7e9c2b5a3f8e1d6c9b7a2e5f4d3c8b1a9e6f2d/packages/create-next-app/templates/app-tw/ts/app/page.tsx)

Next.js 官方的 Tailwind starter 模板。看 `create-next-app` 默认生成的 page 怎么用 Tailwind。

阅读建议：从 `tailwind.config.ts` 开始，看 `content` 字段、看 dark mode 配置、
再回到 `page.tsx` 看一个完整的页面用 utility 怎么写。

## 9. 学习路径

### 9.1 0 → 1：写一个登录页

- 装 `npx create-next-app@latest --tailwind`
- 写一个居中的卡片，里面有 input / button
- 不查文档，凭直觉写 utility，不会的查 [tailwindcss.com](https://tailwindcss.com) 的 cheatsheet
- 目标：理解 spacing / color / flex / hover 这 4 大类基础 utility

### 9.2 1 → 5：迁移一个 Bootstrap 项目

- 找一个老项目，原本用 Bootstrap 4/5
- 一页一页用 Tailwind 替换
- 体验 token 系统：把 `#3b82f6` 替换成 `bg-blue-500` 时，你已经在用 design token

### 9.3 5 → 10：理解 v4 Rust 内核

- 读 `tailwindcss/packages/oxide` 的 Rust 源码
- 理解词法扫描怎么从 source 提取 class 名
- 理解 `@theme` 块怎么生成 CSS 变量
- 写一个简单的 plugin（v4 风格的 `@utility`）

### 9.4 ∞：观察生态演进

- shadcn 怎么处理 v3 → v4 迁移
- daisyUI 等 plugin 库怎么重写
- Next.js / Astro 等 framework 怎么集成 v4

## 10. 总结

Tailwind 的成功不是技术——utility-first 在 2013 年就有了。它的成功是**说服**——
Adam Wathan 用一篇博客（"CSS Utility Classes and Separation of Concerns"，2017）
扭转了行业对 utility class 的偏见。

技术演进路线：

1. v1 (2017)：理念产品化
2. v2 (2020)：JIT 实验
3. v3 (2021)：JIT 默认 + 任意值
4. v4 (2024)：Rust 内核 + zero config

下一个里程碑（2025-2027 推测）：

- container query 完全替代 `md:` / `lg:` 等屏幕断点
- v4 plugin 生态成熟（shadcn / daisyUI / Tailwind UI 全部 v4 化）
- Tailwind 进入 CSS spec 影响层（@scope / @layer 这些 CSS 新特性受 Tailwind 实践启发）

CSS 主题季 Season 30 接下来：

- S30-2：CSS Modules — 另一种 className 局部化方案
- S30-3：Vanilla Extract — 类型安全的 CSS-in-JS
- S30-4：CSS-in-JS 的式微（emotion / styled-components 现状）

## 11. Cross-references

- 同季：S30-2 CSS Modules（待写）/ S30-3 Vanilla Extract（待写）
- 工具库 B 类：S29-4 Konva / S29-3 changesets / S29-2 axios
- 关联实战：shadcn/ui 单独篇（待写）/ Next.js App Router 状元篇
- 怀疑章节延伸：utility-first vs semantic-class 哲学之争（参 7.1 节）

---

**记笔人**：Jason
**记笔日期**：2026-05-29
**Season 进度**：Season 30 开篇（S30-1 / 14 篇规划）
**下一篇**：S30-2 CSS Modules
